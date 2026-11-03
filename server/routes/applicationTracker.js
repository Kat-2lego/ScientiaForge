/* =========================================================
   APPLICATION COMMAND CENTRE API
   Mounted at /api/applications in server.mjs.

     POST   /                add a job (the one Gemini call in this
                              feature - quota-enforced, saved so it is
                              never re-analysed)
     GET    /                list the user's applications, for the board
     PATCH  /:id/status      move a card between Saved/Applied/Interview/
                              Offer/Rejected - plain DB update, no AI
     PATCH  /:id/notes       edit a card's notes - plain DB update, no AI
     DELETE /:id             remove a card
     GET    /insights        totals, response rate, avg match score per
                              role category, most common missing skill -
                              computed from the user's own rows, no AI
     GET    /quota            this month's AI job-analysis usage/limit

   generateApplicationNotifications() is exported for server.mjs's existing
   /api/planner/notifications/sync handler to call - deadline and follow-up
   reminders land in the same bell/notifications list the planner already
   uses, rather than a second notification system.

   Follows the same shape as routes/articulation.js: its own router, its
   own service-role Supabase client, its own login check.
========================================================= */

import express from "express";
import { createClient } from "@supabase/supabase-js";

import { logFeatureEvent } from "../services/featureEvents.js";
import { enforceApplicationQuota, getApplicationPlanAndUsage } from "../services/applicationQuotaService.js";
import { analyzeJobMatchWithGemini } from "../cv-analyzer/services/geminiService.js";
import { fetchJobPostingText, JobLinkError } from "../services/jobPostingFetcher.js";

const router = express.Router();

const FEATURE = "application_tracker";
const STATUSES = ["saved", "applied", "interview", "offer", "rejected"];

/* ---------- client ---------- */

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

/* ---------- login check ---------- */

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Log in to use the Application Command Centre." });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Your session has expired. Log in again." });
    }
    req.user = { id: data.user.id, email: data.user.email };
    next();
  } catch (err) {
    console.error("Application tracker auth check failed:", err.message);
    res.status(500).json({ error: "Could not check your login. Try again in a moment." });
  }
}

/* ---------- helpers ---------- */

function toListColumn(value) {
  return Array.isArray(value) ? value : [];
}

function serialiseApplication(row) {
  return {
    id: row.id,
    jobTitle: row.job_title,
    company: row.company,
    jobUrl: row.job_url,
    deadline: row.deadline,
    roleCategory: row.role_category,
    requiredSkills: toListColumn(row.required_skills),
    matchScore: row.match_score,
    missingSkills: toListColumn(row.missing_skills),
    tailoringTips: toListColumn(row.tailoring_tips),
    status: row.status,
    appliedAt: row.applied_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getLatestCv(userId) {
  const { data, error } = await supabaseAdmin
    .from("cv_documents")
    .select("raw_text, file_name")
    .eq("user_id", userId)
    .eq("is_latest", true)
    .maybeSingle();

  if (error) {
    console.error("Application tracker: latest CV lookup failed:", error.message);
    throw Object.assign(new Error("Could not check your CV."), { status: 500 });
  }

  return data;
}

/* ---------- POST / : add a job (the one AI call) ---------- */

router.post("/", requireUser, async (req, res) => {
  const userId = req.user.id;
  const jobDescription = typeof req.body?.jobDescription === "string" ? req.body.jobDescription.trim() : "";
  const jobUrl = typeof req.body?.jobUrl === "string" ? req.body.jobUrl.trim() : "";

  if (!jobDescription && !jobUrl) {
    return res.status(400).json({ error: "Paste a job description or a job link." });
  }

  try {
    const cv = await getLatestCv(userId);
    if (!cv?.raw_text) {
      return res.status(400).json({
        error: "Upload your CV first so jobs can be matched against it.",
        code: "NO_CV",
      });
    }

    await enforceApplicationQuota(userId);

    let jobText = jobDescription;
    let sourceUrl = jobUrl || null;

    if (!jobText) {
      try {
        const fetched = await fetchJobPostingText(jobUrl);
        jobText = fetched.text;
      } catch (error) {
        if (error instanceof JobLinkError) {
          return res.status(422).json({
            error: "We couldn't read that link, please paste the job description instead.",
            code: "LINK_UNREADABLE",
          });
        }
        throw error;
      }
    }

    const analysis = await analyzeJobMatchWithGemini(jobText, cv.raw_text);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("applications")
      .insert({
        user_id: userId,
        job_title: analysis.jobTitle || "Untitled role",
        company: analysis.company || null,
        job_url: sourceUrl,
        job_description: jobText,
        deadline: analysis.closingDate || null,
        role_category: analysis.roleCategory || "Other",
        required_skills: analysis.requiredSkills,
        match_score: analysis.matchScore,
        missing_skills: analysis.missingSkills,
        tailoring_tips: analysis.tailoringTips,
        status: "saved",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Application insert error:", insertError.message);
      return res.status(500).json({ error: "Could not save that job. Please try again." });
    }

    logFeatureEvent(userId, FEATURE, "completed", {
      metadata: { matchScore: analysis.matchScore, roleCategory: analysis.roleCategory },
    });

    return res.status(201).json({ application: serialiseApplication(inserted) });
  } catch (error) {
    if (error.code === "APPLICATION_LIMIT_REACHED") {
      return res.status(403).json({ error: error.message, code: error.code });
    }
    if (error.code === "AI_UNAVAILABLE" || error.code === "JOB_TEXT_TOO_SHORT") {
      return res.status(error.status || 503).json({ error: error.message, code: error.code });
    }
    console.error("Add job error:", error);
    return res.status(error.status || 500).json({ error: "Could not add that job. Please try again." });
  }
});

/* ---------- GET / : list applications ---------- */

router.get("/", requireUser, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Application list error:", error.message);
    return res.status(500).json({ error: "Could not load your applications." });
  }

  return res.status(200).json({ applications: (data || []).map(serialiseApplication) });
});

/* ---------- PATCH /:id/status ---------- */

router.patch("/:id/status", requireUser, async (req, res) => {
  const status = req.body?.status;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: "That's not a valid status." });
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("applications")
    .select("id, status, applied_at")
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Application status fetch error:", fetchError.message);
    return res.status(500).json({ error: "Could not update that card." });
  }
  if (!existing) {
    return res.status(404).json({ error: "That application wasn't found." });
  }

  const update = { status, updated_at: new Date().toISOString() };
  if (status === "applied" && !existing.applied_at) {
    update.applied_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("applications")
    .update(update)
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .select()
    .single();

  if (updateError) {
    console.error("Application status update error:", updateError.message);
    return res.status(500).json({ error: "Could not update that card." });
  }

  return res.status(200).json({ application: serialiseApplication(updated) });
});

/* ---------- PATCH /:id/notes ---------- */

router.patch("/:id/notes", requireUser, async (req, res) => {
  const notes = typeof req.body?.notes === "string" ? req.body.notes.slice(0, 4000) : "";

  const { data: updated, error } = await supabaseAdmin
    .from("applications")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .select()
    .single();

  if (error) {
    console.error("Application notes update error:", error.message);
    return res.status(500).json({ error: "Could not save that note." });
  }
  if (!updated) {
    return res.status(404).json({ error: "That application wasn't found." });
  }

  return res.status(200).json({ application: serialiseApplication(updated) });
});

/* ---------- DELETE /:id ---------- */

router.delete("/:id", requireUser, async (req, res) => {
  const { error, count } = await supabaseAdmin
    .from("applications")
    .delete({ count: "exact" })
    .eq("id", req.params.id)
    .eq("user_id", req.user.id);

  if (error) {
    console.error("Application delete error:", error.message);
    return res.status(500).json({ error: "Could not remove that card." });
  }
  if (!count) {
    return res.status(404).json({ error: "That application wasn't found." });
  }

  return res.status(200).json({ deleted: true });
});

/* ---------- GET /quota ---------- */

router.get("/quota", requireUser, async (req, res) => {
  try {
    const usage = await getApplicationPlanAndUsage(req.user.id);
    return res.status(200).json(usage);
  } catch (error) {
    console.error("Application quota error:", error.message);
    return res.status(500).json({ error: "Could not check your usage." });
  }
});

/* ---------- GET /insights ---------- */
/* Plain SQL (a single select) + in-process aggregation, same pattern
   routes/admin.js already uses for its feature-usage charts - no RPC/
   GROUP BY function needed for a personal list this size, and no AI calls. */

router.get("/insights", requireUser, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("status, role_category, match_score, missing_skills, applied_at")
    .eq("user_id", req.user.id);

  if (error) {
    console.error("Application insights error:", error.message);
    return res.status(500).json({ error: "Could not load your insights." });
  }

  const rows = data || [];
  const total = rows.length;

  if (total < 3) {
    return res.status(200).json({ ready: false, total });
  }

  const interviews = rows.filter((r) => ["interview", "offer", "rejected"].includes(r.status)).length;
  const offers = rows.filter((r) => r.status === "offer").length;
  const appliedOrBeyond = rows.filter((r) =>
    ["applied", "interview", "offer", "rejected"].includes(r.status)
  ).length;
  const responseRate = appliedOrBeyond
    ? Math.round((interviews / appliedOrBeyond) * 100)
    : null;

  const byCategory = new Map();
  rows.forEach((row) => {
    if (typeof row.match_score !== "number") return;
    const key = row.role_category || "Other";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(row.match_score);
  });

  const matchByCategory = Array.from(byCategory.entries())
    .map(([category, scores]) => ({
      category,
      averageMatch: Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
      count: scores.length,
    }))
    .sort((a, b) => b.averageMatch - a.averageMatch);

  const skillCounts = new Map();
  rows.forEach((row) => {
    toListColumn(row.missing_skills).forEach((skill) => {
      const key = String(skill).trim();
      if (!key) return;
      skillCounts.set(key, (skillCounts.get(key) || 0) + 1);
    });
  });
  const topMissingSkill = Array.from(skillCounts.entries()).sort((a, b) => b[1] - a[1])[0] || null;

  return res.status(200).json({
    ready: true,
    total,
    applied: appliedOrBeyond,
    interviews,
    offers,
    responseRate,
    matchByCategory,
    topMissingSkill: topMissingSkill ? { skill: topMissingSkill[0], count: topMissingSkill[1] } : null,
  });
});

/* =========================================================
   Notification generation - called from server.mjs's existing
   /api/planner/notifications/sync, not a route of its own.
========================================================= */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(n) {
  const d = new Date(Date.now() + n * DAY_MS);
  return d.toISOString().slice(0, 10); // date-only, matches the `deadline` column
}

async function notificationExists(userId, referenceId, type) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("reference_id", referenceId)
    .eq("type", type)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Application notification dedup check failed:", error.message);
    return true; // fail safe: skip rather than risk a duplicate
  }
  return !!data;
}

async function createNotificationOnce(userId, referenceId, type, title, body) {
  if (await notificationExists(userId, referenceId, type)) return;

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    reference_id: referenceId,
    type,
    title,
    body,
    is_read: false,
  });

  if (error) {
    console.warn(`Application notification insert failed (${type}):`, error.message);
  }
}

/**
 * Deadline and follow-up reminders for one user's job applications.
 * Dedup is a plain existence check per (user, application, notification
 * kind) rather than the notifications table's own unique index, so this
 * doesn't depend on - or need to change - that table's existing schema.
 */
export async function generateApplicationNotifications(userId) {
  const { data: rows, error } = await supabaseAdmin
    .from("applications")
    .select("id, job_title, company, status, deadline, applied_at")
    .eq("user_id", userId)
    .in("status", ["saved", "applied"]);

  if (error) {
    console.warn("Application notification sync: could not load applications:", error.message);
    return;
  }

  const today = daysFromNow(0);
  const in3Days = daysFromNow(3);
  const in1Day = daysFromNow(1);
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();

  for (const row of rows || []) {
    const label = row.company ? `${row.job_title} at ${row.company}` : row.job_title;

    if (row.status === "saved" && row.deadline) {
      if (row.deadline === in3Days) {
        await createNotificationOnce(
          userId,
          row.id,
          "app_deadline_3d",
          "Deadline in 3 days",
          `${label} closes in 3 days. Apply soon so it doesn't slip past.`
        );
      } else if (row.deadline === in1Day) {
        await createNotificationOnce(
          userId,
          row.id,
          "app_deadline_1d",
          "Deadline tomorrow",
          `${label} closes tomorrow.`
        );
      } else if (row.deadline < today) {
        await createNotificationOnce(
          userId,
          row.id,
          "app_deadline_passed",
          "Deadline passed",
          `The deadline for ${label} has passed with no status change. Move it to Applied or Rejected to keep your board current.`
        );
      }
    }

    if (row.status === "applied" && row.applied_at && row.applied_at <= sevenDaysAgo) {
      await createNotificationOnce(
        userId,
        row.id,
        "app_followup_7d",
        "Any update?",
        `You applied to ${label} 7 days ago. Any update?`
      );
    }
  }
}

export default router;
