/* =========================================================
   ADMIN API ROUTER
   Mounted at /api/admin in server.mjs. Every route in this file
   requires an admin account (see requireAdmin below) — enforced
   both here (via the service-role key) and again at the database
   level (set_user_role() + the trg_prevent_direct_role_change
   trigger from database/admin_panel_migration.sql).

   NOTE ON THE AUDIT LOG: audit events live in public.audit_logs
   (audit_log_id, user_id, action, entity_name, entity_id, description,
   ip_address, user_agent, created_at). `action` is a Postgres ENUM, so
   only labels that exist in that enum can be written or filtered on —
   anything else raises "invalid input value for enum". The admin
   actions this file records (admin_promote, admin_demote,
   admin_settings_update) are added to the enum by
   database/audit_admin_actions.sql; until that has been run those
   entries are skipped with a warning and nothing else is affected.
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
   AUDIT LOG HELPER (write side — reuses the insert_audit_log RPC
   that already exists in the database)
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

// Every chart endpoint accepts EITHER ?days=N (last N days ending today,
// the original behaviour) OR ?from=YYYY-MM-DD&to=YYYY-MM-DD (an explicit
// range — pass the same date for both to look at a single day). `until`
// is an EXCLUSIVE upper bound so callers can use it directly in .lt().
function resolveDateRange(query, fallbackDays, maxDays) {
  const isValidDay = (s) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

  const fromRaw = typeof query.from === "string" ? query.from.trim() : "";
  const toRaw = typeof query.to === "string" ? query.to.trim() : "";

  let since;
  let days;

  if (isValidDay(fromRaw) && isValidDay(toRaw)) {
    const a = new Date(`${fromRaw}T00:00:00Z`);
    const b = new Date(`${toRaw}T00:00:00Z`);
    since = a < b ? a : b;
    const later = a < b ? b : a;
    const rawDays = Math.round((later - since) / (24 * 60 * 60 * 1000)) + 1;
    days = Math.min(maxDays, Math.max(1, rawDays));
  } else if (isValidDay(fromRaw)) {
    // A single date with no "to" — just that one day.
    since = new Date(`${fromRaw}T00:00:00Z`);
    days = 1;
  } else {
    days = clampInt(query.days, fallbackDays, 1, maxDays);
    since = new Date();
    since.setUTCDate(since.getUTCDate() - (days - 1));
    since.setUTCHours(0, 0, 0, 0);
  }

  const until = new Date(since);
  until.setUTCDate(until.getUTCDate() + days);

  return { since, until, days };
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
  const { since, until, days } = resolveDateRange(req.query, 30, 180);

  try {
    const [{ data, error }, { count: totalBefore, error: beforeErr }] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("created_at")
        .gte("created_at", since.toISOString())
        .lt("created_at", until.toISOString())
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
  const { since, until, days } = resolveDateRange(req.query, 14, 180);

  try {
    const { data, error } = await supabaseAdmin
      .from("user_sessions")
      .select("user_id, started_at")
      .gte("started_at", since.toISOString())
      .lt("started_at", until.toISOString())
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
  const { since, until } = resolveDateRange(req.query, 30, 365);

  try {
    const { data, error } = await supabaseAdmin
      .from("user_sessions")
      .select("started_at")
      .gte("started_at", since.toISOString())
      .lt("started_at", until.toISOString())
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
    safeCount(warnings, "interviewsStarted", supabaseAdmin.from("audit_logs").select("*", { count: "exact", head: true }).eq("action", "interview_started")),
    safeCount(warnings, "interviewsCompleted", supabaseAdmin.from("audit_logs").select("*", { count: "exact", head: true }).eq("action", "interview_completed")),
    // Counted from feature_events (written by the /api/skillgap route) so it
    // matches the "Feature Usage Over Time" chart.
    safeCount(warnings, "skillGapRuns", supabaseAdmin.from("feature_events").select("*", { count: "exact", head: true }).eq("feature", "skill_gap").eq("event_type", "completed")),
  ]);

  res.json({ cvAnalyses, interviewsStarted, interviewsCompleted, skillGapRuns, warnings });
});

/* =========================================================
   GET /api/admin/stats/feature-timeline?days=30 (or ?from=&to=)
   Daily "completed" counts per feature, from public.feature_events
   (written by server.mjs and cvRoutes.js through logFeatureEvent).
   Powers the date-range-filterable feature usage chart.
========================================================= */

const TRACKED_FEATURES = ["interview_simulator", "cv_analyzer", "skill_gap", "career_discovery", "articulation", "english_coach"];

router.get("/stats/feature-timeline", async (req, res) => {
  const { since, until, days } = resolveDateRange(req.query, 30, 365);

  try {
    const { data, error } = await supabaseAdmin
      .from("feature_events")
      .select("feature, created_at")
      .eq("event_type", "completed")
      .gte("created_at", since.toISOString())
      .lt("created_at", until.toISOString())
      .limit(50000);

    if (error) throw error;

    const dayList = [...buildDayBuckets(since, days).keys()];
    const countsByFeature = Object.fromEntries(
      TRACKED_FEATURES.map((f) => [f, new Map(dayList.map((d) => [d, 0]))])
    );

    (data || []).forEach((row) => {
      const map = countsByFeature[row.feature];
      if (!map) return; // an untracked/unknown feature value — ignore rather than crash
      const key = dayKey(new Date(row.created_at));
      if (map.has(key)) map.set(key, map.get(key) + 1);
    });

    const series = TRACKED_FEATURES.map((feature) => ({
      feature,
      counts: dayList.map((d) => countsByFeature[feature].get(d)),
    }));

    res.json({ days: dayList, series });
  } catch (err) {
    console.error("GET /admin/stats/feature-timeline error:", err.message);
    res.status(500).json({ error: "Could not load feature usage timeline.", days: [], series: [] });
  }
});

/* =========================================================
   GET /api/admin/stats/interview-usage?days=30 (or ?from=&to=)
   Interview Simulator specifically, called out by name: completed
   sessions per day and average duration per day, plus totals for
   the selected range — from public.feature_events.
========================================================= */

router.get("/stats/interview-usage", async (req, res) => {
  const { since, until, days } = resolveDateRange(req.query, 30, 365);

  try {
    const { data, error } = await supabaseAdmin
      .from("feature_events")
      .select("created_at, duration_seconds")
      .eq("feature", "interview_simulator")
      .eq("event_type", "completed")
      .gte("created_at", since.toISOString())
      .lt("created_at", until.toISOString())
      .limit(50000);

    if (error) throw error;

    const dayList = [...buildDayBuckets(since, days).keys()];
    const countByDay = new Map(dayList.map((d) => [d, 0]));
    const durationSumByDay = new Map(dayList.map((d) => [d, 0]));

    (data || []).forEach((row) => {
      const key = dayKey(new Date(row.created_at));
      if (!countByDay.has(key)) return;
      countByDay.set(key, countByDay.get(key) + 1);
      durationSumByDay.set(key, durationSumByDay.get(key) + (row.duration_seconds || 0));
    });

    const series = dayList.map((day) => {
      const completed = countByDay.get(day);
      const avgDurationMinutes = completed > 0
        ? Math.round((durationSumByDay.get(day) / completed / 60) * 10) / 10
        : 0;
      return { day, completed, avgDurationMinutes };
    });

    const totalCompleted = (data || []).length;
    const totalDurationSeconds = (data || []).reduce((sum, r) => sum + (r.duration_seconds || 0), 0);
    const overallAvgMinutes = totalCompleted > 0
      ? Math.round((totalDurationSeconds / totalCompleted / 60) * 10) / 10
      : 0;

    res.json({ days: series, totalCompleted, overallAvgMinutes });
  } catch (err) {
    console.error("GET /admin/stats/interview-usage error:", err.message);
    res.status(500).json({ error: "Could not load interview usage stats.", days: [], totalCompleted: 0, overallAvgMinutes: 0 });
  }
});

/* =========================================================
   GET /api/admin/stats/demographics
   Age-bracket and gender breakdown, from public.user_profiles.
   Aggregate counts only — never a per-user list of who is what
   age/gender beyond the individual account view in /users/:id.
========================================================= */

const AGE_BRACKET_ORDER = ["Under 18", "18-24", "25-34", "35-44", "45+"];

router.get("/stats/demographics", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select("age_bracket, gender")
      .limit(50000);

    if (error) throw error;

    const ageCounts = {};
    const genderCounts = {};
    (data || []).forEach((row) => {
      if (row.age_bracket) ageCounts[row.age_bracket] = (ageCounts[row.age_bracket] || 0) + 1;
      if (row.gender) genderCounts[row.gender] = (genderCounts[row.gender] || 0) + 1;
    });

    const ageBrackets = AGE_BRACKET_ORDER.map((label) => ({ label, count: ageCounts[label] || 0 }));
    Object.keys(ageCounts).forEach((label) => {
      if (!AGE_BRACKET_ORDER.includes(label)) ageBrackets.push({ label, count: ageCounts[label] });
    });

    const genders = Object.entries(genderCounts).map(([label, count]) => ({ label, count }));

    const totalWithAge = ageBrackets.reduce((sum, b) => sum + b.count, 0);
    const totalWithGender = genders.reduce((sum, g) => sum + g.count, 0);
    const mostCommonAgeBracket = ageBrackets.reduce(
      (best, b) => (b.count > (best?.count || 0) ? b : best),
      null
    )?.label || null;

    res.json({ ageBrackets, genders, totalWithAge, totalWithGender, mostCommonAgeBracket });
  } catch (err) {
    console.error("GET /admin/stats/demographics error:", err.message);
    res.status(500).json({ error: "Could not load demographics.", ageBrackets: [], genders: [] });
  }
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
      .select("first_name, last_name, target_industry, career_experience_level, target_roles, phone, location, referral_source, linkedin_url, age_bracket, gender")
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
      phone: profile?.phone || null,
      location: profile?.location || null,
      referralSource: profile?.referral_source || null,
      linkedinUrl: profile?.linkedin_url || null,
      ageBracket: profile?.age_bracket || null,
      gender: profile?.gender || null,
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
   Paged list from public.audit_logs, newest first. `action` is an enum
   column, so filtering on a value that isn't in the enum returns an
   empty page rather than an error.
========================================================= */

router.get("/audit-log", async (req, res) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const pageSize = clampInt(req.query.pageSize, 25, 1, 100);
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const emptyPage = { entries: [], total: 0, page, pageSize, unavailable: false };

  try {
    let query = supabaseAdmin
      .from("audit_logs")
      .select("audit_log_id, user_id, action, entity_name, entity_id, description, created_at", { count: "exact" });

    if (action) query = query.eq("action", action);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    // 22P02 = "invalid input value for enum": the requested action isn't a
    // label this database knows about, so there are simply no such entries.
    if (error && error.code === "22P02") return res.json(emptyPage);
    if (error) throw error;

    const userIds = [...new Set((data || []).map((r) => r.user_id).filter(Boolean))];
    let emailsById = {};
    if (userIds.length) {
      const { data: users } = await supabaseAdmin.from("users").select("id, email").in("id", userIds);
      emailsById = Object.fromEntries((users || []).map((u) => [u.id, u.email]));
    }

    res.json({
      entries: (data || []).map((r) => ({
        id: r.audit_log_id,
        userId: r.user_id,
        userEmail: emailsById[r.user_id] || null,
        action: r.action,
        entity: r.entity_name,
        entityId: r.entity_id,
        description: r.description,
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
      ...emptyPage,
      unavailable: true,
      note: "Couldn't read the audit log — check the server terminal for the reason.",
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