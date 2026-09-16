/* =========================================================
   ADMIN API ROUTER
   Mounted at /api/admin in server.mjs. Every route in this file
   requires an admin account (see requireAdmin below) — enforced
   both here (via the service-role key) and again at the database
   level (set_user_role() + the trg_prevent_direct_role_change
   trigger from database/admin_panel_migration.sql).

   NOTE ON THE AUDIT LOG: server.mjs already calls an
   insert_audit_log(p_user_id, p_action, p_entity, p_entity_id,
   p_desc, p_ip, p_ua) function that exists in your database, but
   since it wasn't created from a .sql file in this repo, we can't
   see the exact table/column names it writes to from here. The
   /audit-log route below guesses `public.audit_log` with columns
   (id, user_id, action, entity, entity_id, desc, created_at) — the
   natural read-side of that function signature. If your table is
   named differently, this route degrades gracefully (returns
   `unavailable: true` instead of crashing) — update the
   `.from("audit_log")` call below once you know the real name.
   Everything else in this file does not depend on that guess.
========================================================= */

import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

/* =========================================================
   SUPABASE CLIENTS
   Same pattern as server/cv-analyzer/services/supabaseClient.js:
   this module manages its own client rather than reaching into
   server.mjs's internals.
========================================================= */

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

// Used only for resetPasswordForEmail on promotion, mirroring exactly how
// POST /api/auth/forgot-password already sends that same email in server.mjs.
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
const ONLINE_WINDOW_MS = 2 * 60 * 1000; // "online now" = a heartbeat in the last 2 minutes

/* =========================================================
   AUDIT LOG HELPER (write side — reuses the RPC that already
   exists in the database, so unlike the read side above, this
   part is on solid ground)
========================================================= */

async function logAdminAudit(userId, action, { entity = "admin", entityId = null, desc = null } = {}) {
  try {
    const { error } = await supabaseAdmin.rpc("insert_audit_log", {
      p_user_id: userId,
      p_action: action,
      p_entity: entity,
      p_entity_id: entityId,
      p_desc: desc,
      p_ip: null,
      p_ua: null,
    });
    if (error) console.warn("Admin audit log skipped:", error.message);
  } catch (err) {
    console.warn("Admin audit log skipped:", err.message);
  }
}

/* =========================================================
   SMALL HELPERS for the stats endpoints
========================================================= */

function clampInt(raw, fallback, min, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function dayKey(date) {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC
}

function buildDayBuckets(since, days) {
  const map = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    map.set(dayKey(d), 0);
  }
  return map;
}

async function safeCount(warnings, label, query) {
  try {
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  } catch (err) {
    warnings.push(`${label}: ${err.message}`);
    return 0;
  }
}

/* =========================================================
   AUTH GUARD — every route below requires an admin account
========================================================= */

async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "The session is invalid or has expired." });
    }

    const { data: row, error: roleError } = await supabaseAdmin
      .from("users")
      .select("role, email")
      .eq("id", user.id)
      .maybeSingle();

    if (roleError) {
      console.error("requireAdmin role lookup failed:", roleError.message);
      return res.status(500).json({ error: "Could not verify admin access." });
    }

    if (!row || row.role !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }

    req.adminUser = { id: user.id, email: user.email || row.email };
    next();
  } catch (err) {
    console.error("requireAdmin error:", err.message);
    res.status(500).json({ error: "An internal server error occurred." });
  }
}

router.use(requireAdmin);

/* =========================================================
   GET /api/admin/stats/overview
   Headline numbers for the top of the dashboard.
========================================================= */

router.get("/stats/overview", async (req, res) => {
  const warnings = [];
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalUsers, onlineNow, newToday, newThisWeek, newLastWeek, totalAdmins, sessionsToday] = await Promise.all([
    safeCount(warnings, "totalUsers", supabaseAdmin.from("users").select("*", { count: "exact", head: true })),
    safeCount(warnings, "onlineNow", supabaseAdmin.from("users").select("*", { count: "exact", head: true }).gt("last_seen_at", onlineSince.toISOString())),
    safeCount(warnings, "newToday", supabaseAdmin.from("users").select("*", { count: "exact", head: true }).gte("created_at", startOfToday.toISOString())),
    safeCount(warnings, "newThisWeek", supabaseAdmin.from("users").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo.toISOString())),
    safeCount(warnings, "newLastWeek", supabaseAdmin.from("users").select("*", { count: "exact", head: true }).gte("created_at", fourteenDaysAgo.toISOString()).lt("created_at", sevenDaysAgo.toISOString())),
    safeCount(warnings, "totalAdmins", supabaseAdmin.from("users").select("*", { count: "exact", head: true }).eq("role", "admin")),
    safeCount(warnings, "sessionsToday", supabaseAdmin.from("user_sessions").select("*", { count: "exact", head: true }).gte("started_at", startOfToday.toISOString())),
  ]);

  let avgSessionMinutes = 0;
  try {
    const { data, error } = await supabaseAdmin
      .from("user_sessions")
      .select("started_at, last_seen_at, ended_at")
      .gte("started_at", thirtyDaysAgo.toISOString())
      .limit(5000);
    if (error) throw error;

    const durations = (data || [])
      .map((s) => (new Date(s.ended_at || s.last_seen_at) - new Date(s.started_at)) / 60000)
      .filter((mins) => mins > 0 && mins < 24 * 60); // drop zero/negative or > 1 day outliers

    if (durations.length) {
      avgSessionMinutes = Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
    }
  } catch (err) {
    warnings.push(`avgSessionMinutes: ${err.message}`);
  }

  res.json({
    totalUsers,
    onlineNow,
    newToday,
    newThisWeek,
    newLastWeek,
    totalAdmins,
    sessionsToday,
    avgSessionMinutes,
    warnings,
  });
});

/* =========================================================
   GET /api/admin/stats/growth?days=30
   Daily new signups + running cumulative total (growth chart).
========================================================= */

router.get("/stats/growth", async (req, res) => {
  const days = clampInt(req.query.days, 30, 1, 180);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  try {
    const [{ data, error }, { count: totalBefore, error: beforeErr }] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("created_at")
        .gte("created_at", since.toISOString())
        .limit(20000),
      supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true })
        .lt("created_at", since.toISOString()),
    ]);

    if (error) throw error;
    if (beforeErr) throw beforeErr;

    const buckets = buildDayBuckets(since, days);
    (data || []).forEach((row) => {
      const key = dayKey(new Date(row.created_at));
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
    });

    let cumulative = totalBefore || 0;
    const series = [...buckets.entries()].map(([day, newUsers]) => {
      cumulative += newUsers;
      return { day, newUsers, cumulativeUsers: cumulative };
    });

    res.json({ days: series });
  } catch (err) {
    console.error("GET /admin/stats/growth error:", err.message);
    res.status(500).json({ error: "Could not load growth stats.", days: [] });
  }
});

/* =========================================================
   GET /api/admin/stats/activity?days=14
   Daily active users + session count (activity chart).
========================================================= */

router.get("/stats/activity", async (req, res) => {
  const days = clampInt(req.query.days, 14, 1, 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  try {
    const { data, error } = await supabaseAdmin
      .from("user_sessions")
      .select("user_id, started_at")
      .gte("started_at", since.toISOString())
      .limit(50000);

    if (error) throw error;

    const dayList = [...buildDayBuckets(since, days).keys()];
    const usersByDay = new Map(dayList.map((k) => [k, new Set()]));
    const sessionsByDay = new Map(dayList.map((k) => [k, 0]));

    (data || []).forEach((row) => {
      const key = dayKey(new Date(row.started_at));
      if (!usersByDay.has(key)) return;
      sessionsByDay.set(key, sessionsByDay.get(key) + 1);
      usersByDay.get(key).add(row.user_id);
    });

    const series = dayList.map((day) => ({
      day,
      activeUsers: usersByDay.get(day).size,
      sessions: sessionsByDay.get(day),
    }));

    res.json({ days: series });
  } catch (err) {
    console.error("GET /admin/stats/activity error:", err.message);
    res.status(500).json({ error: "Could not load activity stats.", days: [] });
  }
});

/* =========================================================
   GET /api/admin/stats/peak-hours
   Sessions bucketed by hour-of-day, last 30 days, in SAST
   (UTC+2 — South Africa has no daylight saving) since that's
   this app's target market.
========================================================= */

router.get("/stats/peak-hours", async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const { data, error } = await supabaseAdmin
      .from("user_sessions")
      .select("started_at")
      .gte("started_at", thirtyDaysAgo.toISOString())
      .limit(50000);

    if (error) throw error;

    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0 }));
    (data || []).forEach((row) => {
      const utcHour = new Date(row.started_at).getUTCHours();
      const sastHour = (utcHour + 2) % 24;
      hours[sastHour].sessions += 1;
    });

    res.json({ hours, timezone: "SAST (UTC+2)" });
  } catch (err) {
    console.error("GET /admin/stats/peak-hours error:", err.message);
    res.status(500).json({ error: "Could not load peak-hour stats.", hours: [] });
  }
});

/* =========================================================
   GET /api/admin/stats/feature-usage
   How much each tool in the app is actually being used.
========================================================= */

router.get("/stats/feature-usage", async (req, res) => {
  const warnings = [];

  const [cvAnalyses, interviewsStarted, interviewsCompleted, skillGapRuns] = await Promise.all([
    safeCount(warnings, "cvAnalyses", supabaseAdmin.from("cv_analyses").select("*", { count: "exact", head: true })),
    safeCount(warnings, "interviewsStarted", supabaseAdmin.from("audit_log").select("*", { count: "exact", head: true }).eq("action", "interview_started")),
    safeCount(warnings, "interviewsCompleted", supabaseAdmin.from("audit_log").select("*", { count: "exact", head: true }).eq("action", "interview_completed")),
    safeCount(warnings, "skillGapRuns", supabaseAdmin.from("audit_log").select("*", { count: "exact", head: true }).eq("action", "skillgap_run")),
  ]);

  res.json({ cvAnalyses, interviewsStarted, interviewsCompleted, skillGapRuns, warnings });
});

/* =========================================================
   GET /api/admin/users
   Paginated, searchable user list for the Users page.
========================================================= */

router.get("/users", async (req, res) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const pageSize = clampInt(req.query.pageSize, 20, 1, 100);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const roleFilter = req.query.role === "admin" || req.query.role === "user" ? req.query.role : null;
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();

  try {
    let query = supabaseAdmin
      .from("users")
      .select("id, email, role, created_at, last_seen_at, role_updated_at", { count: "exact" });

    if (roleFilter === "admin") query = query.eq("role", "admin");
    if (roleFilter === "user") query = query.neq("role", "admin");
    if (search) query = query.ilike("email", `%${search}%`);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const ids = (data || []).map((row) => row.id);
    let profilesById = {};
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", ids);
      profilesById = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
    }

    const users = (data || []).map((row) => ({
      id: row.id,
      email: row.email,
      firstName: profilesById[row.id]?.first_name || null,
      lastName: profilesById[row.id]?.last_name || null,
      role: row.role,
      roleUpdatedAt: row.role_updated_at,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      online: !!(row.last_seen_at && row.last_seen_at > onlineSince),
    }));

    res.json({ users, total: count || 0, page, pageSize });
  } catch (err) {
    console.error("GET /admin/users error:", err.message);
    res.status(500).json({ error: "Could not load users. Have you run database/admin_panel_migration.sql yet?" });
  }
});

/* =========================================================
   GET /api/admin/users/:id
   Full detail for one user, used by the detail drawer.
========================================================= */

router.get("/users/:id", async (req, res) => {
  const userId = req.params.id;
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();

  try {
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, email, role, created_at, last_seen_at, role_updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (userErr) throw userErr;
    if (!userRow) return res.status(404).json({ error: "User not found." });

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("first_name, last_name, target_industry, career_experience_level, target_roles")
      .eq("user_id", userId)
      .maybeSingle();

    let cvCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from("cv_analyses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      cvCount = count || 0;
    } catch (_err) {
      // leave at 0
    }

    let sessions = [];
    try {
      const { data } = await supabaseAdmin
        .from("user_sessions")
        .select("session_id, started_at, last_seen_at, ended_at")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(10);
      sessions = data || [];
    } catch (_err) {
      // leave empty
    }

    const durations = sessions
      .map((s) => (new Date(s.ended_at || s.last_seen_at) - new Date(s.started_at)) / 60000)
      .filter((mins) => mins > 0 && mins < 24 * 60);
    const avgSessionMinutes = durations.length
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : 0;

    res.json({
      id: userRow.id,
      email: userRow.email,
      firstName: profile?.first_name || null,
      lastName: profile?.last_name || null,
      targetIndustry: profile?.target_industry || null,
      careerExperienceLevel: profile?.career_experience_level || null,
      targetRoles: profile?.target_roles || [],
      role: userRow.role,
      roleUpdatedAt: userRow.role_updated_at,
      createdAt: userRow.created_at,
      lastSeenAt: userRow.last_seen_at,
      online: !!(userRow.last_seen_at && userRow.last_seen_at > onlineSince),
      stats: { cvAnalyses: cvCount, sessionsCount: sessions.length, avgSessionMinutes },
      recentSessions: sessions.map((s) => ({
        startedAt: s.started_at,
        endedAt: s.ended_at,
        lastSeenAt: s.last_seen_at,
      })),
    });
  } catch (err) {
    console.error("GET /admin/users/:id error:", err.message);
    res.status(500).json({ error: "Could not load this user." });
  }
});

/* =========================================================
   POST /api/admin/users/:id/promote
   Grants admin access and emails the user a secure link to set
   their admin password — the same resetPasswordForEmail flow
   already used by "Forgot password", so no raw password is ever
   generated, stored, or emailed.
========================================================= */

router.post("/users/:id/promote", async (req, res) => {
  const targetId = req.params.id;

  try {
    const { data: target, error: targetErr } = await supabaseAdmin
      .from("users")
      .select("id, email, role")
      .eq("id", targetId)
      .maybeSingle();

    if (targetErr) throw targetErr;
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "admin") {
      return res.status(400).json({ error: "This user is already an admin." });
    }

    const { error: rpcError } = await supabaseAdmin.rpc("set_user_role", {
      target_user_id: targetId,
      new_role: "admin",
    });
    if (rpcError) throw rpcError;

    let emailSent = false;
    try {
      const { error: emailError } = await supabasePublic.auth.resetPasswordForEmail(target.email, {
        redirectTo: `${APP_URL}/pages/ResetPassword.html`,
      });
      emailSent = !emailError;
      if (emailError) console.warn("Admin-promotion email failed:", emailError.message);
    } catch (emailErr) {
      console.warn("Admin-promotion email failed:", emailErr.message);
    }

    await logAdminAudit(req.adminUser.id, "admin_promote", {
      entityId: targetId,
      desc: `${req.adminUser.email} promoted ${target.email} to admin`,
    });

    res.json({
      success: true,
      message: emailSent
        ? `${target.email} is now an admin. A secure link to set their admin password has been emailed to them.`
        : `${target.email} is now an admin, but the notification email could not be sent — let them know directly.`,
    });
  } catch (err) {
    console.error("POST /admin/users/:id/promote error:", err.message);
    res.status(400).json({ error: err.message || "Could not promote this user." });
  }
});

/* =========================================================
   POST /api/admin/users/:id/demote
   Revokes admin access. set_user_role() itself refuses to
   remove the very last admin — that error message is passed
   straight through to the UI.
========================================================= */

router.post("/users/:id/demote", async (req, res) => {
  const targetId = req.params.id;

  try {
    const { data: target, error: targetErr } = await supabaseAdmin
      .from("users")
      .select("id, email, role")
      .eq("id", targetId)
      .maybeSingle();

    if (targetErr) throw targetErr;
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role !== "admin") {
      return res.status(400).json({ error: "This user is not an admin." });
    }

    const { error: rpcError } = await supabaseAdmin.rpc("set_user_role", {
      target_user_id: targetId,
      new_role: "job_seeker",
    });
    if (rpcError) {
      return res.status(400).json({ error: rpcError.message });
    }

    await logAdminAudit(req.adminUser.id, "admin_demote", {
      entityId: targetId,
      desc: `${req.adminUser.email} revoked admin access from ${target.email}`,
    });

    res.json({ success: true, message: `${target.email} is no longer an admin.` });
  } catch (err) {
    console.error("POST /admin/users/:id/demote error:", err.message);
    res.status(400).json({ error: err.message || "Could not update this user's role." });
  }
});

/* =========================================================
   GET /api/admin/audit-log
   See the file-level note at the top about the table-name guess.
========================================================= */

router.get("/audit-log", async (req, res) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const pageSize = clampInt(req.query.pageSize, 25, 1, 100);
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabaseAdmin
      .from("audit_log")
      .select("id, user_id, action, entity, entity_id, desc, created_at", { count: "exact" });

    if (action) query = query.eq("action", action);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const userIds = [...new Set((data || []).map((r) => r.user_id).filter(Boolean))];
    let emailsById = {};
    if (userIds.length) {
      const { data: users } = await supabaseAdmin.from("users").select("id, email").in("id", userIds);
      emailsById = Object.fromEntries((users || []).map((u) => [u.id, u.email]));
    }

    res.json({
      entries: (data || []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        userEmail: emailsById[r.user_id] || null,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        description: r.desc,
        createdAt: r.created_at,
      })),
      total: count || 0,
      page,
      pageSize,
      unavailable: false,
    });
  } catch (err) {
    console.warn("GET /admin/audit-log unavailable:", err.message);
    res.json({
      entries: [],
      total: 0,
      page,
      pageSize,
      unavailable: true,
      note: "Couldn't read the audit log table — see the note at the top of server/routes/admin.js.",
    });
  }
});

/* =========================================================
   GET /api/admin/settings + PUT /api/admin/settings
========================================================= */

router.get("/settings", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from("app_settings").select("key, value");
    if (error) throw error;

    const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    res.json({
      maintenanceMode: map.maintenance_mode === true || map.maintenance_mode === "true",
      allowNewSignups: map.allow_new_signups !== false && map.allow_new_signups !== "false",
    });
  } catch (err) {
    console.error("GET /admin/settings error:", err.message);
    res.status(500).json({ error: "Could not load settings." });
  }
});

router.put("/settings", async (req, res) => {
  const updates = [];
  if (typeof req.body.maintenanceMode === "boolean") {
    updates.push({ key: "maintenance_mode", value: req.body.maintenanceMode });
  }
  if (typeof req.body.allowNewSignups === "boolean") {
    updates.push({ key: "allow_new_signups", value: req.body.allowNewSignups });
  }

  if (!updates.length) {
    return res.status(400).json({ error: "No valid settings were provided." });
  }

  try {
    for (const update of updates) {
      const { error } = await supabaseAdmin.from("app_settings").upsert(
        {
          key: update.key,
          value: update.value,
          updated_at: new Date().toISOString(),
          updated_by: req.adminUser.id,
        },
        { onConflict: "key" }
      );
      if (error) throw error;
    }

    await logAdminAudit(req.adminUser.id, "admin_settings_update", {
      entity: "app_settings",
      desc: `${req.adminUser.email} updated: ${updates.map((u) => u.key).join(", ")}`,
    });

    const { data } = await supabaseAdmin.from("app_settings").select("key, value");
    const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    res.json({
      maintenanceMode: map.maintenance_mode === true || map.maintenance_mode === "true",
      allowNewSignups: map.allow_new_signups !== false && map.allow_new_signups !== "false",
    });
  } catch (err) {
    console.error("PUT /admin/settings error:", err.message);
    res.status(500).json({ error: "Could not save settings." });
  }
});

export default router;