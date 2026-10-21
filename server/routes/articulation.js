/* =========================================================
   ARTICULATION COACH API
   Mounted at /api/articulation in server.mjs.

     GET  /prompts   practice material
     GET  /history   the learner's recent sessions
     POST /analyze   raw audio in (the recording itself as the request
                     body), analysis + coaching out

   Privacy: recordings and transcripts are processed in memory and
   discarded. Only scores (mode, score, pace, filler count, clarity)
   are kept, in feature_events, so progress can be shown.
========================================================= */

import express from "express";
import Groq, { toFile } from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

import { logFeatureEvent } from "../services/featureEvents.js";
import { EXPLAIN_PROMPTS, REPEAT_PROMPTS, findPrompt } from "../services/articulationPrompts.js";
import {
  extractWords, computeDelivery, looksLikeNoSpeech, deliveryScore,
  scoreExplain, scoreRepeat, alignWords,
} from "../services/speechAnalysis.js";
import {
  runExplainCoach, buildRepeatCoach, NO_SPEECH_REPLY, tooShortReply,
} from "../services/articulationCoach.js";

const router = express.Router();

/* ---------- configuration ---------- */

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1500;
const DAILY_LIMIT = Number(process.env.ARTICULATION_DAILY_LIMIT) || 30;
const MIN_GAP_MS =
  process.env.ARTICULATION_MIN_GAP_MS !== undefined ? Number(process.env.ARTICULATION_MIN_GAP_MS) : 3000;
const WHISPER_MODEL = process.env.ARTICULATION_WHISPER_MODEL || "whisper-large-v3-turbo";
const MIN_WORDS_EXPLAIN = 6;
const FEATURE = "articulation";

// Whisper tidies "um" and "uh" away unless the prompt shows it that they are wanted.
const DISFLUENCY_PRIME = "Umm, so, uh, I think, you know, hmm... okay, let me think. Uh, yes.";

/* ---------- clients ---------- */

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

/* ---------- login check ---------- */

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Log in to use the Articulation Coach." });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Your session has expired. Log in again." });
    }
    req.user = { id: data.user.id, email: data.user.email };
    next();
  } catch (err) {
    console.error("Articulation auth check failed:", err.message);
    res.status(500).json({ error: "Could not check your login. Try again in a moment." });
  }
}

/* ---------- limits ---------- */

const lastCallAt = new Map();

function tooSoon(userId) {
  const now = Date.now();
  const last = lastCallAt.get(userId) || 0;
  if (now - last < MIN_GAP_MS) return true;
  lastCallAt.set(userId, now);
  if (lastCallAt.size > 5000) {
    for (const [id, t] of lastCallAt) if (now - t > 60_000) lastCallAt.delete(id);
  }
  return false;
}

async function countSessionsSince(userId, sinceIso) {
  const { count, error } = await supabaseAdmin
    .from("feature_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", FEATURE)
    .eq("event_type", "completed")
    .gte("created_at", sinceIso);
  if (error) throw error;
  return count || 0;
}

const hoursAgoIso = (h) => new Date(Date.now() - h * 3600_000).toISOString();

/* ---------- helpers ---------- */

function audioFileInfo(contentType = "") {
  const t = contentType.toLowerCase();
  if (t.includes("webm")) return { name: "recording.webm", type: "audio/webm" };
  if (t.includes("ogg")) return { name: "recording.ogg", type: "audio/ogg" };
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return { name: "recording.m4a", type: "audio/mp4" };
  if (t.includes("wav")) return { name: "recording.wav", type: "audio/wav" };
  if (t.includes("mpeg") || t.includes("mp3")) return { name: "recording.mp3", type: "audio/mpeg" };
  return { name: "recording.webm", type: "audio/webm" };
}

async function transcribe(buffer, mode, contentType) {
  const { name, type } = audioFileInfo(contentType);
  return groq.audio.transcriptions.create({
    file: await toFile(buffer, name, { type }),
    model: WHISPER_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    language: "en",
    temperature: 0,
    // "Say it clearly" is judged on what was actually said, so it gets no hint of the target.
    ...(mode === "explain" ? { prompt: DISFLUENCY_PRIME } : {}),
  });
}

const failedAttempt = (reason, headline, spokenReply, improve) => ({
  ok: false,
  reason,
  coach: { headline, strengths: [], improve, spokenReply, followUp: null, retry: true, source: "rules" },
});

/* =========================================================
   GET /prompts
========================================================= */

router.get("/prompts", requireUser, (req, res) => {
  res.json({ explain: EXPLAIN_PROMPTS, repeat: REPEAT_PROMPTS, dailyLimit: DAILY_LIMIT });
});

/* =========================================================
   GET /history
========================================================= */

router.get("/history", requireUser, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("feature_events")
      .select("created_at, duration_seconds, metadata")
      .eq("user_id", req.user.id)
      .eq("feature", FEATURE)
      .eq("event_type", "completed")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;

    const rows = data || [];
    const weekAgo = Date.parse(hoursAgoIso(24 * 7));
    const dayAgo = Date.parse(hoursAgoIso(24));
    const scores = rows.map((r) => Number(r.metadata?.score)).filter(Number.isFinite);

    res.json({
      sessions: rows.slice(0, 8).map((r) => ({
        at: r.created_at,
        mode: r.metadata?.mode ?? null,
        score: r.metadata?.score ?? null,
        wpm: r.metadata?.wpm ?? null,
        fillers: r.metadata?.fillers ?? null,
        accuracy: r.metadata?.accuracy ?? null,
      })),
      last7Days: rows.filter((r) => Date.parse(r.created_at) >= weekAgo).length,
      bestScore: scores.length ? Math.max(...scores) : null,
      usedToday: rows.filter((r) => Date.parse(r.created_at) >= dayAgo).length,
      dailyLimit: DAILY_LIMIT,
    });
  } catch (err) {
    console.error("Articulation history failed:", err.message);
    res.status(500).json({ error: "Could not load your recent sessions." });
  }
});

/* =========================================================
   POST /analyze?mode=explain|repeat&promptId=...&durationSeconds=...
   Body: the audio recording itself (audio/webm, audio/ogg, audio/mp4 ...)
========================================================= */

const rawAudio = express.raw({
  type: ["audio/*", "video/webm", "application/octet-stream"],
  limit: MAX_AUDIO_BYTES,
});

router.post("/analyze", requireUser, rawAudio, async (req, res) => {
  const userId = req.user.id;

  if (!groq) {
    return res.status(503).json({ error: "Speech coaching is not set up on this server yet." });
  }
  if (tooSoon(userId)) {
    return res.status(429).json({ error: "Give it a few seconds between recordings." });
  }

  const mode = String(req.query.mode || "");
  const prompt = findPrompt(mode, String(req.query.promptId || ""));
  if (!prompt) return res.status(400).json({ error: "Pick a prompt and try again." });

  const audio = req.body;
  if (!Buffer.isBuffer(audio) || audio.length < MIN_AUDIO_BYTES) {
    return res.status(400).json({ error: "That recording was too short to analyse. Try again." });
  }

  try {
    const usedBefore = await countSessionsSince(userId, hoursAgoIso(24)).catch((err) => {
      console.warn("Articulation daily-limit check skipped:", err.message);
      return 0; // a database hiccup should not lock people out
    });
    if (usedBefore >= DAILY_LIMIT) {
      return res.status(429).json({
        error: `You have used all ${DAILY_LIMIT} practice sessions for today. Come back tomorrow.`,
      });
    }

    /* ----- 1. speech to text, with word timings ----- */
    let transcription;
    try {
      transcription = await transcribe(audio, mode, req.headers["content-type"]);
    } catch (err) {
      console.error("Articulation transcription failed:", err?.status || "", err?.message);
      const busy = err?.status === 429 || err?.status === 503;
      return res.status(busy ? 503 : 502).json({
        error: busy
          ? "The speech service is busy. Try again in a minute."
          : "Could not analyse that recording. Try again.",
      });
    }

    const { words, timed } = extractWords(transcription);
    const { annotated, ...delivery } = computeDelivery({
      words,
      timed,
      segments: transcription.segments,
    });

    const clientSeconds = Math.min(600, Math.max(0, Number.parseFloat(req.query.durationSeconds) || 0));
    const durationSeconds = Math.round((Number(transcription.duration) || clientSeconds) * 10) / 10;

    /* ----- 2. nothing usable? ----- */
    if (looksLikeNoSpeech(transcription, delivery.wordCount, mode === "explain" ? DISFLUENCY_PRIME : "")) {
      return res.json(
        failedAttempt("no_speech", "I could not hear you", NO_SPEECH_REPLY, [
          "Allow microphone access for this site.",
          "Move closer and speak at a normal volume.",
        ])
      );
    }
    if (mode === "explain" && delivery.wordCount < MIN_WORDS_EXPLAIN) {
      return res.json(
        failedAttempt("too_short", "That was very short", tooShortReply(15), [
          `Aim for about ${prompt.targetSeconds} seconds.`,
        ])
      );
    }

    /* ----- 3. coaching ----- */
    const transcript = String(transcription.text || "").trim();
    let coach;
    let repeat = null;
    let scores;

    if (mode === "explain") {
      coach = await runExplainCoach({
        groq,
        promptText: prompt.text,
        transcript,
        delivery,
        targetSeconds: prompt.targetSeconds,
        durationSeconds,
      });
      const delivScore = deliveryScore(delivery);
      scores = {
        overall: scoreExplain({ delivery: delivScore, structure: coach.structureScore }),
        delivery: delivScore,
        structure: coach.structureScore,
        accuracy: null,
      };
    } else {
      const alignment = alignWords(prompt.text, transcript);
      repeat = { accuracy: alignment.accuracy, words: alignment.words, extra: alignment.extra };
      coach = buildRepeatCoach(alignment);
      scores = {
        overall: scoreRepeat({ accuracy: alignment.accuracy, clarity: delivery.clarity?.value ?? null }),
        delivery: null,
        structure: null,
        accuracy: alignment.accuracy,
      };
    }

    /* ----- 4. keep the scores (not the audio, not the words) ----- */
    await logFeatureEvent(userId, FEATURE, "completed", {
      durationSeconds: Math.round(durationSeconds),
      metadata: {
        mode,
        promptId: prompt.id,
        score: scores.overall,
        wpm: delivery.wpm,
        fillers: delivery.fillers.total,
        accuracy: scores.accuracy,
        clarity: delivery.clarity?.value ?? null,
      },
    });

    res.json({
      ok: true,
      mode,
      promptId: prompt.id,
      transcript,
      durationSeconds,
      delivery,
      annotated: mode === "explain" ? annotated : null,
      repeat,
      scores,
      coach,
      limits: { usedToday: usedBefore + 1, dailyLimit: DAILY_LIMIT },
    });
  } catch (err) {
    console.error("Articulation analyze failed:", err.message);
    res.status(500).json({ error: "Something went wrong analysing that recording. Try again." });
  }
});

/* ---------- errors from the audio body parser (e.g. file too large) ---------- */

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "That recording is too long. Keep it under two minutes." });
  }
  console.error("Articulation route error:", err?.message);
  res.status(500).json({ error: "Something went wrong. Try again." });
});

export default router;
