// server/routes/support.js
// Support inbox (user <-> admin chat), rating prompts and rating stats.
// Mounted in server.js at /api/support. Every route needs a logged-in user;
// the /admin/* routes also need users.role = 'admin'.

import express from "express";

export const CATEGORIES = {
  general_inquiry: "General Inquiry",
  technical_support: "Technical Support",
  partnership_business: "Partnership/Business",
  feature_suggestion: "Feature Suggestion",
  feedback: "Feedback",
};

// Keys the front end may send when it asks to show a rating prompt.
export const RATING_FEATURES = {
  general: "ScientiaForge",
  dashboard: "Dashboard",
  career_discovery: "Career Discovery",
  application_tracker: "Job Tracker",
  cv_analyzer: "CV Analyzer",
  interview_simulator: "Interview Simulator",
  articulation: "Articulation Coach",
  english_coach: "English Coach",
  skill_gap: "Skill Gap Analysis",
  career_pathfinder: "Career Pathfinder",
  study_hub: "Study Hub",
};

/* ---- Rating prompt policy: tweak these to ask more or less often ---- */
const GLOBAL_COOLDOWN_HOURS = 24; // at most one prompt per user per day
const FEATURE_COOLDOWN_DAYS = 14; // the same feature at most every 2 weeks
const AFTER_USE_CHANCE = 0.6; // chance of asking right after a key feature is used
const RANDOM_CHANCE = 0.15; // chance of asking on a random page visit

/* ---- Abuse limits ---- */
const MAX_BODY = 4000;
const MAX_NEW_THREADS_PER_HOUR = 5;
const MAX_MESSAGES_PER_10_MIN = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREAD_COLUMNS =
  "id, user_id, category, subject, status, last_message_at, last_message_preview, last_sender_role, user_unread_count, admin_unread_count, created_at";
const MESSAGE_COLUMNS = "id, sender_role, body, created_at, read_at";

const isCategory = (v) => typeof v === "string" && Object.hasOwn(CATEGORIES, v);
const isFeature = (v) => typeof v === "string" && Object.hasOwn(RATING_FEATURES, v);
const fail = (res, status, message) => res.status(status).json({ error: message });

const ok = ({ data, error }) => {
  if (error) throw error;
  return data;
};

function readBody(value) {
  if (typeof value !== "string") return { error: "Please write a message." };
  const body = value.replace(/\r\n/g, "\n").trim();
  if (!body) return { error: "Please write a message." };
  if (body.length > MAX_BODY) return { error: `Messages can be up to ${MAX_BODY} characters.` };
  return { body };
}

function deriveSubject(body) {
  const line = body.split("\n").find((l) => l.trim()) || body;
  const flat = line.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 77)}…` : flat;
}

const threadDto = (t, side) => ({
  id: t.id,
  category: t.category,
  categoryLabel: CATEGORIES[t.category] || t.category,
  subject: t.subject,
  status: t.status,
  preview: t.last_message_preview,
  lastSender: t.last_sender_role,
  lastMessageAt: t.last_message_at,
  createdAt: t.created_at,
  unread: side === "admin" ? t.admin_unread_count : t.user_unread_count,
});

const messageDto = (m) => ({
  id: m.id,
  sender: m.sender_role,
  body: m.body,
  createdAt: m.created_at,
  readAt: m.read_at,
});

export default function createSupportRouter({ db, requireAuth }) {
  const router = express.Router();
  router.use(requireAuth);

  const handle = (label, fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error(`❌ Support (${label}):`, error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Something went wrong. Please try again." });
      }
    }
  };

  async function requireAdmin(req, res, next) {
    try {
      const { data, error } = await db.from("users").select("role").eq("id", req.userId).maybeSingle();
      if (error) throw error;
      if (data?.role !== "admin") return fail(res, 403, "Admin access required.");
      next();
    } catch (error) {
      console.error("❌ Support (admin check):", error?.message || error);
      fail(res, 500, "Could not verify admin access.");
    }
  }

  // Marks the other side's messages as read and fixes the unread counter.
  async function markRead(threadId, readerRole) {
    const senderRole = readerRole === "admin" ? "user" : "admin";
    const column = readerRole === "admin" ? "admin_unread_count" : "user_unread_count";

    await db
      .from("support_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("sender_role", senderRole)
      .is("read_at", null);

    const { count } = await db
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", threadId)
      .eq("sender_role", senderRole)
      .is("read_at", null);

    await db.from("support_threads").update({ [column]: count ?? 0 }).eq("id", threadId);
  }

  async function loadPeople(ids) {
    const unique = [...new Set(ids)].filter(Boolean);
    const people = new Map();
    if (!unique.length) return people;

    const [users, profiles] = await Promise.all([
      db.from("users").select("id, email, plan_type").in("id", unique),
      db.from("user_profiles").select("user_id, first_name, last_name").in("user_id", unique),
    ]);

    (users.data || []).forEach((u) =>
      people.set(u.id, { id: u.id, email: u.email, plan: u.plan_type, name: "" })
    );
    (profiles.data || []).forEach((p) => {
      const person = people.get(p.user_id);
      if (person) person.name = [p.first_name, p.last_name].filter(Boolean).join(" ");
    });
    return people;
  }

  async function insertMessage(threadId, senderId, role, body) {
    return ok(
      await db
        .from("support_messages")
        .insert({ thread_id: threadId, sender_id: senderId, sender_role: role, body })
        .select(MESSAGE_COLUMNS)
        .single()
    );
  }

  /* =====================================================
     USER: INBOX
  ===================================================== */

  router.get(
    "/unread",
    handle("unread", async (req, res) => {
      const rows =
        ok(
          await db
            .from("support_threads")
            .select("user_unread_count")
            .eq("user_id", req.userId)
            .gt("user_unread_count", 0)
            .limit(200)
        ) || [];
      res.json({
        unread: rows.reduce((sum, r) => sum + r.user_unread_count, 0),
        threads: rows.length,
      });
    })
  );

  router.get(
    "/threads",
    handle("list threads", async (req, res) => {
      const rows =
        ok(
          await db
            .from("support_threads")
            .select(THREAD_COLUMNS)
            .eq("user_id", req.userId)
            .order("last_message_at", { ascending: false })
            .limit(50)
        ) || [];
      res.json({ threads: rows.map((t) => threadDto(t, "user")) });
    })
  );

  router.post(
    "/threads",
    handle("create thread", async (req, res) => {
      const category = req.body?.category;
      if (!isCategory(category)) return fail(res, 400, "Please choose a category.");

      const parsed = readBody(req.body?.message);
      if (parsed.error) return fail(res, 400, parsed.error);

      const since = new Date(Date.now() - 3600000).toISOString();
      const { count } = await db
        .from("support_threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", req.userId)
        .gte("created_at", since);

      if ((count ?? 0) >= MAX_NEW_THREADS_PER_HOUR) {
        return fail(res, 429, "You've started several conversations in the last hour. Please wait a little before sending another.");
      }

      const thread = ok(
        await db
          .from("support_threads")
          .insert({ user_id: req.userId, category, subject: deriveSubject(parsed.body) })
          .select(THREAD_COLUMNS)
          .single()
      );

      const { error } = await db.from("support_messages").insert({
        thread_id: thread.id,
        sender_id: req.userId,
        sender_role: "user",
        body: parsed.body,
      });

      if (error) {
        await db.from("support_threads").delete().eq("id", thread.id);
        throw error;
      }

      res.status(201).json({ thread: threadDto(thread, "user") });
    })
  );

  router.get(
    "/threads/:id",
    handle("get thread", async (req, res) => {
      if (!UUID_RE.test(req.params.id)) return fail(res, 400, "Invalid conversation.");

      const thread = ok(
        await db
          .from("support_threads")
          .select(THREAD_COLUMNS)
          .eq("id", req.params.id)
          .eq("user_id", req.userId)
          .maybeSingle()
      );
      if (!thread) return fail(res, 404, "Conversation not found.");

      const messages =
        ok(
          await db
            .from("support_messages")
            .select(MESSAGE_COLUMNS)
            .eq("thread_id", thread.id)
            .order("created_at", { ascending: true })
            .limit(500)
        ) || [];

      if (thread.user_unread_count > 0) {
        await markRead(thread.id, "user");
        thread.user_unread_count = 0;
      }

      res.json({ thread: threadDto(thread, "user"), messages: messages.map(messageDto) });
    })
  );

  router.post(
    "/threads/:id/messages",
    handle("user reply", async (req, res) => {
      if (!UUID_RE.test(req.params.id)) return fail(res, 400, "Invalid conversation.");

      const parsed = readBody(req.body?.body);
      if (parsed.error) return fail(res, 400, parsed.error);

      const thread = ok(
        await db
          .from("support_threads")
          .select("id")
          .eq("id", req.params.id)
          .eq("user_id", req.userId)
          .maybeSingle()
      );
      if (!thread) return fail(res, 404, "Conversation not found.");

      const since = new Date(Date.now() - 600000).toISOString();
      const { count } = await db
        .from("support_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", req.userId)
        .eq("sender_role", "user")
        .gte("created_at", since);

      if ((count ?? 0) >= MAX_MESSAGES_PER_10_MIN) {
        return fail(res, 429, "You're sending messages very quickly. Please wait a few minutes.");
      }

      const message = await insertMessage(thread.id, req.userId, "user", parsed.body);
      res.status(201).json({ message: messageDto(message) });
    })
  );

  /* =====================================================
     USER: RATING PROMPTS
  ===================================================== */

  // The page asks "should I show a rating card now?". The answer (and the
  // history behind it) lives in feedback_prompt_log, never in the browser.
  router.post(
    "/ratings/check",
    handle("rating check", async (req, res) => {
      const feature = req.body?.feature ?? "general";
      const trigger = req.body?.trigger === "random" ? "random" : "after_use";
      if (!isFeature(feature)) return fail(res, 400, "Unknown feature.");

      const globalSince = new Date(Date.now() - GLOBAL_COOLDOWN_HOURS * 3600000).toISOString();
      const featureSince = new Date(Date.now() - FEATURE_COOLDOWN_DAYS * 86400000).toISOString();

      const [recentAny, recentFeature] = await Promise.all([
        db
          .from("feedback_prompt_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", req.userId)
          .gte("created_at", globalSince),
        db
          .from("feedback_prompt_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", req.userId)
          .eq("feature", feature)
          .gte("created_at", featureSince),
      ]);
      if (recentAny.error) throw recentAny.error;
      if (recentFeature.error) throw recentFeature.error;

      if ((recentAny.count ?? 0) > 0 || (recentFeature.count ?? 0) > 0) {
        return res.json({ show: false });
      }

      const chance = trigger === "random" ? RANDOM_CHANCE : AFTER_USE_CHANCE;
      if (Math.random() > chance) return res.json({ show: false });

      const row = ok(
        await db
          .from("feedback_prompt_log")
          .insert({ user_id: req.userId, feature, trigger_type: trigger })
          .select("id")
          .single()
      );

      res.json({
        show: true,
        promptId: row.id,
        feature,
        featureLabel: RATING_FEATURES[feature],
        trigger,
      });
    })
  );

  router.post(
    "/ratings",
    handle("submit rating", async (req, res) => {
      const feature = req.body?.feature ?? "general";
      if (!isFeature(feature)) return fail(res, 400, "Unknown feature.");

      const rating = Number(req.body?.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return fail(res, 400, "Choose a rating from 1 to 5.");
      }

      const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
      if (comment.length > 1000) return fail(res, 400, "Comments can be up to 1000 characters.");

      const trigger = req.body?.trigger === "random" ? "random" : "after_use";
      const page = typeof req.body?.page === "string" ? req.body.page.slice(0, 100) : null;

      ok(
        await db.from("feedback_ratings").insert({
          user_id: req.userId,
          feature,
          rating,
          comment: comment || null,
          trigger_type: trigger,
          page,
        })
      );

      const promptId = req.body?.prompt_id;
      if (typeof promptId === "string" && UUID_RE.test(promptId)) {
        await db
          .from("feedback_prompt_log")
          .update({ outcome: "submitted", responded_at: new Date().toISOString() })
          .eq("id", promptId)
          .eq("user_id", req.userId);
      }

      res.status(201).json({ success: true });
    })
  );

  router.post(
    "/ratings/dismiss",
    handle("dismiss rating", async (req, res) => {
      const promptId = req.body?.prompt_id;
      if (typeof promptId === "string" && UUID_RE.test(promptId)) {
        await db
          .from("feedback_prompt_log")
          .update({ outcome: "dismissed", responded_at: new Date().toISOString() })
          .eq("id", promptId)
          .eq("user_id", req.userId)
          .eq("outcome", "shown");
      }
      res.json({ success: true });
    })
  );

  /* =====================================================
     ADMIN: INBOX
  ===================================================== */

  router.get(
    "/admin/unread",
    requireAdmin,
    handle("admin unread", async (req, res) => {
      const rows = ok(await db.rpc("support_category_stats")) || [];
      res.json({ unread: rows.reduce((sum, r) => sum + Number(r.unread || 0), 0) });
    })
  );

  router.get(
    "/admin/categories",
    requireAdmin,
    handle("admin categories", async (req, res) => {
      const rows = ok(await db.rpc("support_category_stats")) || [];
      const byKey = new Map(rows.map((r) => [r.cat, r]));

      const categories = Object.entries(CATEGORIES).map(([key, label]) => {
        const r = byKey.get(key) || {};
        return {
          key,
          label,
          total: Number(r.total || 0),
          open: Number(r.open_count || 0),
          answered: Number(r.answered_count || 0),
          closed: Number(r.closed_count || 0),
          unread: Number(r.unread || 0),
        };
      });

      const totals = categories.reduce(
        (sum, c) => ({
          total: sum.total + c.total,
          open: sum.open + c.open,
          unread: sum.unread + c.unread,
        }),
        { total: 0, open: 0, unread: 0 }
      );

      res.json({ categories, totals });
    })
  );

  router.get(
    "/admin/threads",
    requireAdmin,
    handle("admin threads", async (req, res) => {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

      let query = db.from("support_threads").select(THREAD_COLUMNS, { count: "exact" });

      if (isCategory(req.query.category)) query = query.eq("category", req.query.category);
      if (["open", "answered", "closed"].includes(req.query.status)) {
        query = query.eq("status", req.query.status);
      }

      const search =
        typeof req.query.search === "string"
          ? req.query.search.replace(/[,()%*\\"'`]/g, " ").trim().slice(0, 80)
          : "";

      if (search) {
        const matches =
          ok(await db.from("users").select("id").ilike("email", `%${search}%`).limit(100)) || [];
        const ids = matches.map((m) => m.id);
        query = ids.length
          ? query.or(`subject.ilike.%${search}%,user_id.in.(${ids.join(",")})`)
          : query.ilike("subject", `%${search}%`);
      }

      const { data, error, count } = await query
        .order("last_message_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw error;

      const people = await loadPeople((data || []).map((t) => t.user_id));

      res.json({
        threads: (data || []).map((t) => ({
          ...threadDto(t, "admin"),
          user: people.get(t.user_id) || { id: t.user_id, email: null, name: "" },
        })),
        total: count ?? 0,
        page,
        pageSize,
      });
    })
  );

  router.get(
    "/admin/threads/:id",
    requireAdmin,
    handle("admin get thread", async (req, res) => {
      if (!UUID_RE.test(req.params.id)) return fail(res, 400, "Invalid conversation.");

      const thread = ok(
        await db.from("support_threads").select(THREAD_COLUMNS).eq("id", req.params.id).maybeSingle()
      );
      if (!thread) return fail(res, 404, "Conversation not found.");

      const messages =
        ok(
          await db
            .from("support_messages")
            .select(MESSAGE_COLUMNS)
            .eq("thread_id", thread.id)
            .order("created_at", { ascending: true })
            .limit(500)
        ) || [];

      const people = await loadPeople([thread.user_id]);

      if (thread.admin_unread_count > 0) {
        await markRead(thread.id, "admin");
        thread.admin_unread_count = 0;
      }

      res.json({
        thread: {
          ...threadDto(thread, "admin"),
          user: people.get(thread.user_id) || { id: thread.user_id, email: null, name: "" },
        },
        messages: messages.map(messageDto),
      });
    })
  );

  router.post(
    "/admin/threads/:id/messages",
    requireAdmin,
    handle("admin reply", async (req, res) => {
      if (!UUID_RE.test(req.params.id)) return fail(res, 400, "Invalid conversation.");

      const parsed = readBody(req.body?.body);
      if (parsed.error) return fail(res, 400, parsed.error);

      const thread = ok(
        await db.from("support_threads").select("id").eq("id", req.params.id).maybeSingle()
      );
      if (!thread) return fail(res, 404, "Conversation not found.");

      const message = await insertMessage(thread.id, req.userId, "admin", parsed.body);
      res.status(201).json({ message: messageDto(message) });
    })
  );

  router.post(
    "/admin/threads/:id/status",
    requireAdmin,
    handle("admin status", async (req, res) => {
      if (!UUID_RE.test(req.params.id)) return fail(res, 400, "Invalid conversation.");

      const next = req.body?.status;
      if (!["open", "closed"].includes(next)) return fail(res, 400, "Choose open or closed.");

      const thread = ok(
        await db
          .from("support_threads")
          .select("id, last_sender_role")
          .eq("id", req.params.id)
          .maybeSingle()
      );
      if (!thread) return fail(res, 404, "Conversation not found.");

      const patch =
        next === "closed"
          ? { status: "closed", closed_at: new Date().toISOString() }
          : { status: thread.last_sender_role === "admin" ? "answered" : "open", closed_at: null };

      ok(
        await db
          .from("support_threads")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", thread.id)
      );

      res.json({ success: true, status: patch.status });
    })
  );

  /* =====================================================
     ADMIN: RATINGS
  ===================================================== */

  router.get(
    "/admin/ratings/stats",
    requireAdmin,
    handle("rating stats", async (req, res) => {
      const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
      const stats = ok(await db.rpc("feedback_rating_stats", { p_days: days }));
      res.json(stats);
    })
  );

  router.get(
    "/admin/ratings",
    requireAdmin,
    handle("rating list", async (req, res) => {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));

      let query = db
        .from("feedback_ratings")
        .select("id, user_id, feature, rating, comment, trigger_type, created_at", { count: "exact" });

      if (isFeature(req.query.feature)) query = query.eq("feature", req.query.feature);

      const ratingFilter = Number(req.query.rating);
      if (Number.isInteger(ratingFilter) && ratingFilter >= 1 && ratingFilter <= 5) {
        query = query.eq("rating", ratingFilter);
      }
      if (req.query.commentsOnly === "1") query = query.not("comment", "is", null);

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw error;

      const people = await loadPeople((data || []).map((r) => r.user_id));

      res.json({
        ratings: (data || []).map((r) => ({
          id: r.id,
          feature: r.feature,
          featureLabel: RATING_FEATURES[r.feature] || r.feature,
          rating: r.rating,
          comment: r.comment,
          trigger: r.trigger_type,
          createdAt: r.created_at,
          user: people.get(r.user_id) || { email: null, name: "" },
        })),
        total: count ?? 0,
        page,
        pageSize,
      });
    })
  );

  return router;
}
