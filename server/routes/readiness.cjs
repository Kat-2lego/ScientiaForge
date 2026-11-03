/* ScientiaForge · /api/readiness   (server/routes/readiness.cjs)
   Saves and loads Exam Arena data in Supabase (see readiness.sql).

   In server/server.mjs add these two lines:
     import readinessRoutes from "./routes/readiness.cjs";                (with the other imports)
     app.use("/api/readiness", readinessRoutes);                          (after app.use("/api/applications", ...))

   It reads SUPABASE_URL and SUPABASE_ANON_KEY, which your .env already has.

   HOW IT STAYS SAFE
     Every request builds a Supabase client that carries the learner's own access token, so
     Postgres Row Level Security decides what they can see. Even a bug in this file cannot
     show one learner another learner's exams. The service-role key is never used here. */
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();
router.use(express.json({ limit: "1mb" }));

const MAX_LOG = 300;

/* ------------------------------------------------------------ helpers */
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("[readiness]", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

const isId = (v) => /^\d{1,15}$/.test(String(v));

/* the shape the front end already uses for an exam entry */
const toEntry = (r) => ({
  id: r.id,
  paperId: r.paper_id,
  subject: r.subject,
  paperNumber: r.paper_number,
  session: r.session_label,
  marks: r.marks,
  score: Number(r.score),
  pct: r.pct,
  level: r.level,
  usedMin: r.used_minutes == null ? null : Number(r.used_minutes),
  duration: r.duration_minutes,
  target: r.target_level,
  leaves: r.tab_leaves,
  badges: r.badges || [],
  at: r.completed_at,
  ref: r.client_ref || r.completed_at,
});

/* ------------------------------------------------------------ auth */
async function auth(req, res, next) {
  try {
    /* read at request time: with ES-module imports this file loads before dotenv has run */
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("[readiness] SUPABASE_URL and SUPABASE_ANON_KEY must be set");
      return res.status(500).json({ error: "Server is not configured." });
    }
    const m = /^Bearer (.+)$/i.exec(req.headers.authorization || "");
    if (!m) return res.status(401).json({ error: "Sign in to continue." });
    const token = m[1];
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user) return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    req.sb = sb;
    req.user = data.user;
    next();
  } catch (err) {
    console.error("[readiness] auth", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
router.use(auth);

/* ------------------------------------------------------------ dashboard (server-side numbers) */
// GET /api/readiness   ->  summary, streak, subjects, heatmap, recent
router.get("/", wrap(async (req, res) => {
  const { data, error } = await req.sb.rpc("get_my_readiness");
  if (error) throw error;
  res.json(data);
}));

/* ------------------------------------------------------------ attempts */
// GET /api/readiness/attempts?paper_id=12&limit=300
router.get("/attempts", wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || MAX_LOG, 1), MAX_LOG);
  let q = req.sb
    .from("exam_attempts")
    .select("id,paper_id,subject,paper_number,session_label,marks,score,pct,level,used_minutes,duration_minutes,target_level,tab_leaves,badges,completed_at,client_ref")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (req.query.paper_id !== undefined) {
    if (!isId(req.query.paper_id)) return res.status(400).json({ error: "paper_id must be a number." });
    q = q.eq("paper_id", req.query.paper_id);
  }
  const { data, error } = await q;
  if (error) throw error;
  res.json({ attempts: data.map(toEntry).reverse() }); // oldest first, like the front-end log
}));

// GET /api/readiness/attempts/:id/questions
router.get("/attempts/:id/questions", wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid attempt id." });
  const { data, error } = await req.sb
    .from("exam_attempt_questions")
    .select("position,label,marks,scored,status,done_at")
    .eq("attempt_id", req.params.id)
    .order("position");
  if (error) throw error;
  res.json({ questions: data });
}));

// POST /api/readiness/import   { log: [entry, ...] }
// Used for: every new exam, the outbox when the learner was offline,
// and the one-time move of old browser history. Duplicates are ignored.
router.post("/import", wrap(async (req, res) => {
  const log = req.body && req.body.log;
  if (!Array.isArray(log)) return res.status(400).json({ error: "Send { log: [...] }." });
  if (log.length > MAX_LOG) return res.status(400).json({ error: `At most ${MAX_LOG} exams per request.` });
  if (!log.length) return res.json({ added: 0 });
  const { data, error } = await req.sb.rpc("import_local_exam_log", { p_log: log });
  if (error) throw error;
  /* 0 is normal when the exams were already stored, but if you see it for a brand-new exam,
     the database refused it: check the entry's fields against readiness.sql */
  if (data === 0) console.warn(`[readiness] import stored 0 of ${log.length} entries for user ${req.user.id}`);
  res.json({ added: data, received: log.length });
}));

// DELETE /api/readiness/attempts   (clear my history)
router.delete("/attempts", wrap(async (req, res) => {
  const { error } = await req.sb.from("exam_attempts").delete().gte("created_at", "1970-01-01");
  if (error) throw error;
  res.status(204).end();
}));

/* ------------------------------------------------------------ running exam (resume on any device) */
router.get("/active/:paperId", wrap(async (req, res) => {
  if (!isId(req.params.paperId)) return res.status(400).json({ error: "Invalid paper id." });
  const { data, error } = await req.sb
    .from("exam_active_sessions")
    .select("state,updated_at")
    .eq("paper_id", req.params.paperId)
    .maybeSingle();
  if (error) throw error;
  res.json({ state: data ? data.state : null, updatedAt: data ? data.updated_at : null });
}));

router.put("/active/:paperId", wrap(async (req, res) => {
  if (!isId(req.params.paperId)) return res.status(400).json({ error: "Invalid paper id." });
  const state = req.body && req.body.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return res.status(400).json({ error: "Send { state: {...} }." });
  if (JSON.stringify(state).length > 100000) return res.status(413).json({ error: "State is too large." });
  const endsAt = Number.isFinite(Number(state.endsAt)) ? new Date(Number(state.endsAt)).toISOString() : null;
  const { error } = await req.sb.from("exam_active_sessions").upsert(
    { user_id: req.user.id, paper_id: req.params.paperId, state, ends_at: endsAt },
    { onConflict: "user_id,paper_id" }
  );
  if (error) throw error;
  res.status(204).end();
}));

router.delete("/active/:paperId", wrap(async (req, res) => {
  if (!isId(req.params.paperId)) return res.status(400).json({ error: "Invalid paper id." });
  const { error } = await req.sb.from("exam_active_sessions").delete().eq("paper_id", req.params.paperId);
  if (error) throw error;
  res.status(204).end();
}));

/* ------------------------------------------------------------ preferences */
router.get("/preferences", wrap(async (req, res) => {
  const { data, error } = await req.sb.from("exam_preferences").select("reading_time,voice,sound,extra_time,target_level").maybeSingle();
  if (error) throw error;
  res.json({
    preferences: data && {
      reading: data.reading_time,
      voice: data.voice,
      sound: data.sound,
      extra: data.extra_time,
      target: data.target_level,
    },
  });
}));

router.put("/preferences", wrap(async (req, res) => {
  const p = (req.body && req.body.preferences) || {};
  const target = Number(p.target);
  if (!Number.isInteger(target) || target < 1 || target > 7) return res.status(400).json({ error: "target must be 1 to 7." });
  const { error } = await req.sb.from("exam_preferences").upsert(
    {
      user_id: req.user.id,
      reading_time: p.reading !== false,
      voice: p.voice !== false,
      sound: p.sound === true,
      extra_time: p.extra === true,
      target_level: target,
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
  res.status(204).end();
}));

module.exports = router;
