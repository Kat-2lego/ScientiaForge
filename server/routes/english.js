/* =========================================================
   ENGLISH COACH API
   Mounted at /api/english in server.mjs.

     GET    /profile              the learner's goals + today's snapshot
     PUT    /profile              save level, goal, interests, daily minutes
     DELETE /data                 delete their English practice data
     POST   /session/start        open a conversation (the coach speaks first)
     POST   /turn/transcribe      the learner's recording -> text (raw audio body)
     POST   /turn/reply           the coach's next line
     POST   /hint                 "give me an idea" for a stuck learner
     POST   /speak                the coach's voice (premium, with free fallback)
     POST   /session/finish       estimate today's level + how to improve
     GET    /progress             level over time, streak, recent sessions

   Privacy: recordings and transcripts are processed and discarded. Only
   scores and short themes are saved (see database/english_coach_migration.sql).
========================================================= */

import crypto from "node:crypto";
import express from "express";
import Groq, { toFile } from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

import { logFeatureEvent } from "../services/featureEvents.js";
import { extractWords, computeDelivery, looksLikeNoSpeech, parseJsonObject } from "../services/speechAnalysis.js";
import {
  LEVELS, LEVEL_INFO, GOAL_HINTS, INTEREST_OPTIONS, isLevel, levelIndex, validateProfileInput,
  MIN_WORDS_FOR_ESTIMATE, confidenceFor, scoreFromSkills, scoreToLevel, levelPosition,
  trackedLevel, gapToTarget, dailySeries, computeStreak, localDay,
} from "../services/englishLevels.js";
import {
  CHAT_MODEL, FALLBACK_MODEL, detectCrisis, crisisReply, pickOpener, buildChatSystem, buildChatMessages,
  cleanSpokenReply, fallbackReply, buildHintMessages, sanitizeHints, fallbackHints, summariseTurns,
  buildAssessmentMessages, sanitizeAssessment, normaliseHistory, chat, cleanText,
} from "../services/conversationCoach.js";
import { createSynthesizer } from "../services/ttsProviders.js";

const router = express.Router();

/* ---------- configuration ---------- */

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1500;
const MAX_TURNS = 40;
const SESSIONS_PER_DAY = Number(process.env.ENGLISH_SESSIONS_PER_DAY) || 8;
const MIN_GAP_MS = process.env.ENGLISH_MIN_GAP_MS !== undefined ? Number(process.env.ENGLISH_MIN_GAP_MS) : 1200;
const WHISPER_MODEL = process.env.ARTICULATION_WHISPER_MODEL || "whisper-large-v3-turbo";
const MODELS = [...new Set([process.env.ENGLISH_COACH_MODEL || CHAT_MODEL, FALLBACK_MODEL])];
const FEATURE = "english_coach";
const DISFLUENCY_PRIME = "Umm, so, uh, I think, you know, hmm... okay, let me think. Uh, yes.";
const CTX_TTL_MS = 3 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const synth = createSynthesizer();

/* ---------- login ---------- */

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Log in to use the English Coach." });
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Your session has expired. Log in again." });
    req.user = { id: data.user.id, email: data.user.email };
    next();
  } catch (err) {
    console.error("English coach auth check failed:", err.message);
    res.status(500).json({ error: "Could not check your login. Try again in a moment." });
  }
}

/* ---------- small helpers ---------- */

const lastCallAt = new Map();
function tooSoon(userId, key) {
  const now = Date.now();
  const id = `${userId}:${key}`;
  if (now - (lastCallAt.get(id) || 0) < MIN_GAP_MS) return true;
  lastCallAt.set(id, now);
  if (lastCallAt.size > 5000) for (const [k, t] of lastCallAt) if (now - t > 60_000) lastCallAt.delete(k);
  return false;
}

function dbFailure(res, err, what) {
  const missingTable = err?.code === "PGRST205" || err?.code === "42P01" || /schema cache|does not exist/i.test(err?.message || "");
  if (missingTable) {
    return res.status(503).json({
      error: "The English Coach tables are not set up yet. Run database/english_coach_migration.sql in the Supabase SQL editor, then try again.",
      setup: true,
    });
  }
  console.error(`English coach ${what} failed:`, err?.message);
  return res.status(500).json({ error: "Something went wrong saving that. Try again." });
}

const mapProfile = (row) => row && ({
  currentLevel: row.current_level,
  targetLevel: row.target_level,
  interests: row.interests || [],
  dailyMinutes: row.daily_minutes,
});

async function loadProfile(userId) {
  const { data, error } = await supabaseAdmin.from("english_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadBasics(userId) {
  try {
    const { data } = await supabaseAdmin.from("user_profiles").select("first_name, age_bracket").eq("user_id", userId).maybeSingle();
    return { firstName: data?.first_name || "", minor: data?.age_bracket === "Under 18" };
  } catch {
    return { firstName: "", minor: false };
  }
}

const SESSION_COLUMNS = "started_at, duration_seconds, turns, learner_words, est_level, est_score, confidence, skills, wpm, filler_rate, focus, vocabulary, topics";

async function loadSessions(userId, limit = 120) {
  const { data, error } = await supabaseAdmin
    .from("english_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

function snapshot(sessions, profile, now = new Date()) {
  const tracked = trackedLevel(sessions);
  const gap = tracked ? gapToTarget(tracked.score, profile?.target_level) : null;
  const days = [...new Set(sessions.map((s) => localDay(s.started_at)).filter(Boolean))];
  const streak = computeStreak(days, now);
  const today = localDay(now.toISOString());
  const todayMinutes = Math.round(
    sessions.filter((s) => localDay(s.started_at) === today).reduce((m, s) => m + (Number(s.duration_seconds) || 0), 0) / 60
  );
  return { tracked, gap, streak, todayMinutes };
}

/** What the coach remembers between replies, so each turn doesn't hit the database. */
const contexts = new Map();
async function getContext(userId, sessionId) {
  const key = `${userId}:${sessionId}`;
  const cached = contexts.get(key);
  if (cached && cached.expires > Date.now()) return cached;

  const [profile, basics, sessions] = await Promise.all([loadProfile(userId), loadBasics(userId), loadSessions(userId, 6)]);
  if (!profile) return null;
  const tracked = trackedLevel(sessions);
  const ctx = {
    profile, basics, turns: 0,
    lastTopics: sessions[0]?.topics?.slice(0, 2) || [],
    level: tracked?.level || profile.current_level || null,
    expires: Date.now() + CTX_TTL_MS,
  };
  contexts.set(key, ctx);
  if (contexts.size > 2000) for (const [k, v] of contexts) if (v.expires < Date.now()) contexts.delete(k);
  return ctx;
}

const needGroq = (res) => res.status(503).json({ error: "The English Coach is not set up on this server yet (missing GROQ_API_KEY)." });

/* =========================================================
   Profile
========================================================= */

router.get("/profile", requireUser, async (req, res) => {
  try {
    const [row, basics, sessions] = await Promise.all([loadProfile(req.user.id), loadBasics(req.user.id), loadSessions(req.user.id)]);
    res.json({
      profile: mapProfile(row),
      firstName: basics.firstName,
      minor: basics.minor,
      levels: LEVELS.map((level) => ({ level, ...LEVEL_INFO[level], goal: GOAL_HINTS[level] })),
      interestOptions: INTEREST_OPTIONS,
      ...snapshot(sessions, row),
      sessionsToday: sessions.filter((s) => localDay(s.started_at) === localDay(new Date().toISOString())).length,
      limits: { sessionsPerDay: SESSIONS_PER_DAY, maxTurns: MAX_TURNS },
      voice: { provider: synth.config.provider, premium: synth.config.provider !== "edge" && synth.config.configured },
    });
  } catch (err) {
    dbFailure(res, err, "profile load");
  }
});

router.put("/profile", requireUser, async (req, res) => {
  const { errors, value } = validateProfileInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  try {
    const { data, error } = await supabaseAdmin
      .from("english_profiles")
      .upsert(
        { user_id: req.user.id, current_level: value.currentLevel, target_level: value.targetLevel, interests: value.interests, daily_minutes: value.dailyMinutes, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select()
      .single();
    if (error) throw error;
    for (const k of contexts.keys()) if (k.startsWith(`${req.user.id}:`)) contexts.delete(k);
    res.json({ profile: mapProfile(data) });
  } catch (err) {
    dbFailure(res, err, "profile save");
  }
});

router.delete("/data", requireUser, async (req, res) => {
  try {
    const a = await supabaseAdmin.from("english_sessions").delete().eq("user_id", req.user.id);
    if (a.error) throw a.error;
    const b = await supabaseAdmin.from("english_profiles").delete().eq("user_id", req.user.id);
    if (b.error) throw b.error;
    for (const k of contexts.keys()) if (k.startsWith(`${req.user.id}:`)) contexts.delete(k);
    res.json({ ok: true });
  } catch (err) {
    dbFailure(res, err, "data delete");
  }
});

/* =========================================================
   A conversation
========================================================= */

router.post("/session/start", requireUser, async (req, res) => {
  try {
    const [profile, basics, sessions] = await Promise.all([loadProfile(req.user.id), loadBasics(req.user.id), loadSessions(req.user.id, 30)]);
    if (!profile) return res.status(409).json({ error: "Set your English level and goal first.", needsProfile: true });

    const today = localDay(new Date().toISOString());
    if (sessions.filter((s) => localDay(s.started_at) === today).length >= SESSIONS_PER_DAY) {
      return res.status(429).json({ error: `You have had ${SESSIONS_PER_DAY} conversations today. That is a great effort. Rest your voice and come back tomorrow.` });
    }

    const sessionId = crypto.randomUUID();
    const tracked = trackedLevel(sessions);
    const level = tracked?.level || profile.current_level || null;
    const hourParam = Number.parseInt(req.body?.hour, 10);
    const hour = Number.isInteger(hourParam) && hourParam >= 0 && hourParam <= 23 ? hourParam : (new Date().getUTCHours() + 2) % 24;
    const lastTopics = sessions[0]?.topics?.slice(0, 2) || [];

    contexts.set(`${req.user.id}:${sessionId}`, {
      profile, basics, turns: 0, lastTopics, level, expires: Date.now() + CTX_TTL_MS,
    });

    res.json({
      sessionId,
      startedAt: new Date().toISOString(),
      opener: pickOpener({ name: basics.firstName, hour, firstTime: sessions.length === 0, lastTopics, level, seed: sessionId }),
      level,
    });
  } catch (err) {
    dbFailure(res, err, "session start");
  }
});

const rawAudio = express.raw({ type: ["audio/*", "video/webm", "application/octet-stream"], limit: MAX_AUDIO_BYTES });

router.post("/turn/transcribe", requireUser, rawAudio, async (req, res) => {
  if (!groq) return needGroq(res);
  if (tooSoon(req.user.id, "transcribe")) return res.status(429).json({ error: "One moment. Let the coach finish, then speak." });

  const audio = req.body;
  if (!Buffer.isBuffer(audio) || audio.length < MIN_AUDIO_BYTES) {
    return res.status(400).json({ error: "That recording was too short. Try again." });
  }

  const type = String(req.headers["content-type"] || "").toLowerCase();
  const file = type.includes("mp4") || type.includes("m4a") ? { name: "turn.m4a", type: "audio/mp4" }
    : type.includes("ogg") ? { name: "turn.ogg", type: "audio/ogg" }
    : type.includes("wav") ? { name: "turn.wav", type: "audio/wav" }
    : { name: "turn.webm", type: "audio/webm" };

  let transcription;
  try {
    transcription = await groq.audio.transcriptions.create({
      file: await toFile(audio, file.name, { type: file.type }),
      model: WHISPER_MODEL,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
      language: "en",
      temperature: 0,
      prompt: DISFLUENCY_PRIME,
    });
  } catch (err) {
    console.error("English coach transcription failed:", err?.status || "", err?.message);
    const busy = err?.status === 429 || err?.status === 503;
    return res.status(busy ? 503 : 502).json({ error: busy ? "The speech service is busy. Try again in a moment." : "Could not hear that recording. Try again." });
  }

  const { words, timed } = extractWords(transcription);
  const { annotated, ...delivery } = computeDelivery({ words, timed, segments: transcription.segments });
  if (looksLikeNoSpeech(transcription, delivery.wordCount, DISFLUENCY_PRIME)) {
    return res.json({ ok: false, reason: "no_speech", message: "I could not hear anything. Check your microphone and try again." });
  }

  const text = cleanText(transcription.text, 600);
  res.json({
    ok: true,
    text,
    durationSeconds: Math.round((Number(transcription.duration) || 0) * 10) / 10,
    metrics: {
      words: delivery.wordCount,
      seconds: delivery.speakingSeconds || Number(transcription.duration) || 0,
      wpm: delivery.wpm,
      fillers: delivery.fillers.total,
      longPauses: delivery.pauses.measured ? delivery.pauses.count : null,
    },
  });
});

router.post("/turn/reply", requireUser, async (req, res) => {
  const { sessionId, history } = req.body || {};
  const userText = cleanText(req.body?.userText, 600);
  if (!UUID.test(String(sessionId))) return res.status(400).json({ error: "Start a conversation first." });
  if (!userText) return res.status(400).json({ error: "Say or type something first." });

  // Distress never reaches the model: a fixed, human-written reply goes back instead.
  const crisis = detectCrisis(userText);
  if (crisis) {
    let minor = false;
    try { minor = (await loadBasics(req.user.id)).minor; } catch { /* default */ }
    const reply = crisisReply(crisis, { minor });
    return res.json({ ok: true, reply: reply.text, spoken: reply.spoken, crisis: reply.kind, source: "safety" });
  }

  if (!groq) return needGroq(res);
  if (tooSoon(req.user.id, "reply")) return res.status(429).json({ error: "One moment, then try again." });

  try {
    const ctx = await getContext(req.user.id, sessionId);
    if (!ctx) return res.status(409).json({ error: "Set your English level and goal first.", needsProfile: true });
    ctx.turns += 1;
    if (ctx.turns > MAX_TURNS) {
      return res.status(429).json({ error: "This conversation has been going a long time. Finish it to see your level.", tooLong: true });
    }

    const system = buildChatSystem({
      name: ctx.basics.firstName,
      level: ctx.level,
      target: ctx.profile.target_level,
      interests: ctx.profile.interests || [],
      minor: ctx.basics.minor,
      lastTopics: ctx.lastTopics,
    });
    const messages = buildChatMessages({ system, history, userText });

    let reply = "";
    let source = "model";
    try {
      const out = await chat({ groq, models: MODELS, messages, effort: "low", maxTokens: 600, temperature: 0.8 });
      reply = cleanSpokenReply(out.text);
    } catch (err) {
      console.warn("English coach reply model unavailable:", err?.message);
    }
    if (!reply) { reply = fallbackReply(`${sessionId}${ctx.turns}`); source = "fallback"; }

    res.json({ ok: true, reply, spoken: reply, source });
  } catch (err) {
    dbFailure(res, err, "reply");
  }
});

router.post("/hint", requireUser, async (req, res) => {
  const history = normaliseHistory(req.body?.history);
  const lastCoach = [...history].reverse().find((m) => m.role === "coach");
  let level = null;
  try { level = (await loadProfile(req.user.id))?.current_level || null; } catch { /* default */ }

  if (!lastCoach) return res.json({ ideas: fallbackHints(level) });
  if (!groq) return res.json({ ideas: fallbackHints(level) });
  if (tooSoon(req.user.id, "hint")) return res.status(429).json({ error: "One moment, then try again." });

  try {
    const out = await chat({ groq, models: MODELS, messages: buildHintMessages({ level, lastCoachLine: lastCoach.text }), effort: "low", maxTokens: 500, temperature: 0.8, timeoutMs: 12000 });
    res.json({ ideas: sanitizeHints(parseJsonObject(out.text), level) });
  } catch (err) {
    console.warn("English coach hint model unavailable:", err?.message);
    res.json({ ideas: fallbackHints(level) });
  }
});

router.post("/speak", requireUser, async (req, res) => {
  const text = cleanText(req.body?.text, synth.config.maxChars);
  if (!text) return res.status(400).json({ error: "Nothing to say." });
  try {
    const out = await synth.synthesize(text, { userId: req.user.id });
    res.set({ "Content-Type": out.contentType, "Cache-Control": "no-store", "X-TTS-Provider": out.provider, "X-TTS-Premium": String(out.premium) });
    res.send(out.audio);
  } catch (err) {
    console.error("English coach voice failed:", err?.code || "", err?.message);
    res.status(502).json({ error: "The coach's voice is unavailable right now." });
  }
});

/* =========================================================
   Finishing: today's level
========================================================= */

const TURN_ROLES = new Set(["coach", "learner"]);

router.post("/session/finish", requireUser, async (req, res) => {
  const { sessionId } = req.body || {};
  if (!UUID.test(String(sessionId))) return res.status(400).json({ error: "Start a conversation first." });
  if (!groq) return needGroq(res);

  const turns = (Array.isArray(req.body?.turns) ? req.body.turns : [])
    .slice(0, 100)
    .filter((t) => t && TURN_ROLES.has(t.role) && typeof t.text === "string")
    .map((t) => ({ role: t.role, text: cleanText(t.text, 600), seconds: Number(t.seconds) || 0, fillers: Number(t.fillers) || 0 }))
    .filter((t) => t.text);

  const metrics = summariseTurns(turns);
  if (metrics.learnerWords < MIN_WORDS_FOR_ESTIMATE) {
    return res.json({
      ok: false,
      reason: "too_short",
      message: `That was too short for me to estimate your level (I need at least ${MIN_WORDS_FOR_ESTIMATE} words from you). Chat a little longer next time.`,
    });
  }

  try {
    const profile = await loadProfile(req.user.id);
    if (!profile) return res.status(409).json({ error: "Set your English level and goal first.", needsProfile: true });

    let assessment = null;
    try {
      const out = await chat({
        groq, models: MODELS, effort: "medium", maxTokens: 3500, temperature: 0.2, timeoutMs: 45000,
        messages: buildAssessmentMessages({ profile: { currentLevel: profile.current_level, targetLevel: profile.target_level }, metrics, turns }),
      });
      assessment = sanitizeAssessment(parseJsonObject(out.text), { learnerText: metrics.learnerText });
    } catch (err) {
      console.warn("English coach assessment model unavailable:", err?.message);
    }
    if (!assessment) {
      return res.status(502).json({
        ok: false,
        reason: "assessment_unavailable",
        error: "I could not work out your level just now. Your conversation is still here. Press Try again.",
      });
    }

    const score = scoreFromSkills(assessment.skills, { uniqueWords: metrics.uniqueWords });
    const level = scoreToLevel(score);
    const confidence = confidenceFor({ learnerWords: metrics.learnerWords, turns: metrics.turns });

    const now = new Date();
    const started = new Date(req.body?.startedAt);
    const startedAt = Number.isFinite(started.getTime()) && started <= now && now - started < 4 * 3600_000 ? started : new Date(now - (Number(req.body?.durationSeconds) || 0) * 1000);
    const durationSeconds = Math.max(0, Math.min(4 * 3600, Math.round((now - startedAt) / 1000)));

    const row = {
      user_id: req.user.id,
      started_at: startedAt.toISOString(),
      ended_at: now.toISOString(),
      duration_seconds: durationSeconds,
      turns: metrics.turns,
      learner_words: metrics.learnerWords,
      est_level: level,
      est_score: score,
      confidence,
      skills: assessment.skills,
      wpm: metrics.wpm,
      filler_rate: metrics.fillersPerMinute,
      focus: assessment.improvements.map((i) => i.focus).slice(0, 3),
      vocabulary: assessment.vocabulary.map((v) => v.word).slice(0, 4),
      topics: assessment.topics,
    };
    const { error: saveError } = await supabaseAdmin.from("english_sessions").insert(row);
    if (saveError) throw saveError;

    // "Not sure yet" learners get their starting level from their first conversation.
    let profileUpdate = null;
    if (!profile.current_level) {
      const target = levelIndex(profile.target_level) < levelIndex(level) ? level : profile.target_level;
      const { error } = await supabaseAdmin.from("english_profiles").update({ current_level: level, target_level: target, updated_at: now.toISOString() }).eq("user_id", req.user.id);
      if (!error) profileUpdate = { currentLevel: level, targetLevel: target };
    }

    await logFeatureEvent(req.user.id, FEATURE, "completed", {
      durationSeconds,
      metadata: { level, score, confidence, turns: metrics.turns },
    });

    const sessions = await loadSessions(req.user.id);
    const snap = snapshot(sessions, { ...profile, ...(profileUpdate ? { target_level: profileUpdate.targetLevel } : {}) }, now);

    res.json({
      ok: true,
      assessment: {
        level,
        score,
        progress: levelPosition(score).progress,
        confidence,
        skills: assessment.skills,
        summary: assessment.summary,
        strengths: assessment.strengths,
        improvements: assessment.improvements,
        vocabulary: assessment.vocabulary,
        nextTime: assessment.nextTime,
        topics: assessment.topics,
        stats: { minutes: Math.round(durationSeconds / 60), learnerWords: metrics.learnerWords, turns: metrics.turns, wpm: metrics.wpm, fillersPerMinute: metrics.fillersPerMinute },
      },
      progress: { ...snap, dailyMinutes: profile.daily_minutes, target: profileUpdate?.targetLevel || profile.target_level },
      profileUpdate,
    });
  } catch (err) {
    dbFailure(res, err, "session finish");
  }
});

/* =========================================================
   Progress
========================================================= */

router.get("/progress", requireUser, async (req, res) => {
  try {
    const [profile, sessions] = await Promise.all([loadProfile(req.user.id), loadSessions(req.user.id)]);
    const snap = snapshot(sessions, profile);
    const cutoff = Date.now() - 30 * 86_400_000;

    res.json({
      profile: mapProfile(profile),
      ...snap,
      dailyMinutes: profile?.daily_minutes ?? 10,
      days: dailySeries(sessions.filter((s) => Date.parse(s.started_at) >= cutoff)),
      totals: {
        sessions: sessions.length,
        minutes: Math.round(sessions.reduce((m, s) => m + (Number(s.duration_seconds) || 0), 0) / 60),
        words: sessions.reduce((w, s) => w + (Number(s.learner_words) || 0), 0),
      },
      recent: sessions.slice(0, 8).map((s) => ({
        at: s.started_at, level: s.est_level, score: Number(s.est_score), confidence: s.confidence,
        minutes: Math.round((Number(s.duration_seconds) || 0) / 60), focus: s.focus || [], vocabulary: s.vocabulary || [], topics: s.topics || [],
      })),
    });
  } catch (err) {
    dbFailure(res, err, "progress");
  }
});

/* ---------- errors from the audio body parser ---------- */

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "That recording is too long. Keep each answer under two minutes." });
  }
  console.error("English coach route error:", err?.message);
  res.status(500).json({ error: "Something went wrong. Try again." });
});

export default router;
