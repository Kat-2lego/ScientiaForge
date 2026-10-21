/* =========================================================
   SPEECH ANALYSIS
   Pure functions (no network, no database) that turn a Whisper
   "verbose_json" transcription into delivery numbers, and compare
   what someone said with a target sentence.

   Everything here is a transparent heuristic, not a clinical
   measurement — the thresholds are exported so they can be tuned
   and are covered by tests.
========================================================= */

/* ---------- thresholds ---------- */

export const PACE = { slowBelow: 115, sweetLow: 130, sweetHigh: 160, fastAbove: 175 };
export const LONG_PAUSE_SECONDS = 1.5;
export const MIN_SPEAKING_SECONDS_FOR_PACE = 3;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

/* ---------- text helpers ---------- */

export function normalizeToken(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9']/g, "")
    .replace(/^'+|'+$/g, "");
}

/** Splits free text into comparable lowercase words (hyphens split words). */
export function tokenizeText(text) {
  return String(text ?? "")
    .replace(/[-\u2013\u2014]/g, " ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

/* ---------- reading Whisper's response ---------- */

/**
 * Returns { words: [{text,start,end}], timed }.
 * `timed` is false when the response had no word timestamps and the timings
 * were spread evenly across each segment — pauses can't be measured then.
 */
export function extractWords(resp) {
  const raw = Array.isArray(resp?.words) ? resp.words : [];
  const timed = raw
    .map((w) => ({
      text: String(w.word ?? w.text ?? "").trim(),
      start: Number(w.start),
      end: Number(w.end),
    }))
    .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);

  if (timed.length) return { words: timed, timed: true };

  const spread = [];
  for (const seg of Array.isArray(resp?.segments) ? resp.segments : []) {
    const parts = String(seg.text ?? "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const start = Number(seg.start) || 0;
    const end = Number.isFinite(Number(seg.end)) ? Number(seg.end) : start;
    const step = (end - start) / parts.length;
    parts.forEach((text, i) => spread.push({ text, start: start + i * step, end: start + (i + 1) * step }));
  }
  if (spread.length) return { words: spread, timed: false };

  const parts = String(resp?.text ?? "").trim().split(/\s+/).filter(Boolean);
  const step = parts.length ? (Number(resp?.duration) || 0) / parts.length : 0;
  return {
    words: parts.map((text, i) => ({ text, start: i * step, end: (i + 1) * step })),
    timed: false,
  };
}

/* ---------- fillers ---------- */

// um, umm, uh, uhh, uhm, er, erm, ah, hmm, mm, mmm, eh ...
const FILLER_RE = /^(?:u+h+m*|u+m+|e+r+m*|a+h+|h+m+|m{2,}|eh+)$/;

export function isFillerToken(token) {
  return FILLER_RE.test(token);
}

// Real words that become a habit when overused. Reported separately and only
// when they repeat, because using one of them once is perfectly normal.
const CRUTCH_PHRASES = [
  { key: "you know", tokens: ["you", "know"] },
  { key: "i mean", tokens: ["i", "mean"] },
  { key: "kind of", tokens: ["kind", "of"] },
  { key: "sort of", tokens: ["sort", "of"] },
  { key: "basically", tokens: ["basically"] },
  { key: "literally", tokens: ["literally"] },
  { key: "actually", tokens: ["actually"] },
  { key: "honestly", tokens: ["honestly"] },
];

export function findCrutchWords(tokens, minRepeats = 2) {
  const counts = {};
  for (let i = 0; i < tokens.length; i += 1) {
    for (const phrase of CRUTCH_PHRASES) {
      const n = phrase.tokens.length;
      if (phrase.tokens.every((t, k) => tokens[i + k] === t)) {
        counts[phrase.key] = (counts[phrase.key] || 0) + 1;
        i += n - 1;
        break;
      }
    }
  }
  return Object.fromEntries(Object.entries(counts).filter(([, c]) => c >= minRepeats));
}

/* ---------- clarity (how easily the transcriber followed you) ---------- */

export function clarityBand(value) {
  if (value >= 85) return "very clear";
  if (value >= 70) return "mostly clear";
  if (value >= 50) return "unclear in places";
  return "hard to follow";
}

/**
 * Maps Whisper's average log-probability per segment (duration-weighted) onto
 * 0-100: -0.15 or better = 100, -1.0 or worse = 0. A proxy for "how easily could
 * the machine follow this", so it is shown as guidance, never as a grade.
 */
export function clarityFromSegments(segments) {
  let weighted = 0;
  let duration = 0;
  for (const s of Array.isArray(segments) ? segments : []) {
    const logprob = Number(s.avg_logprob);
    const d = Number(s.end) - Number(s.start);
    if (!Number.isFinite(logprob) || !(d > 0)) continue;
    weighted += logprob * d;
    duration += d;
  }
  if (!duration) return null;
  const avg = weighted / duration;
  const value = Math.round(clamp((avg + 1) / 0.85, 0, 1) * 100);
  return { value, band: clarityBand(value) };
}

/* ---------- pace ---------- */

export function paceBandFor(wpm) {
  if (wpm == null) return null;
  if (wpm < PACE.slowBelow) return { code: "slow", label: "Too slow" };
  if (wpm < PACE.sweetLow) return { code: "slightly_slow", label: "A little slow" };
  if (wpm <= PACE.sweetHigh) return { code: "sweet", label: "In the sweet spot" };
  if (wpm <= PACE.fastAbove) return { code: "slightly_fast", label: "A little fast" };
  return { code: "fast", label: "Too fast" };
}

/* ---------- delivery metrics ---------- */

export function computeDelivery({ words, timed = true, segments = [] }) {
  const items = (words || [])
    .map((w) => ({ ...w, token: normalizeToken(w.text) }))
    .filter((w) => w.token);

  const wordCount = items.length;
  if (!wordCount) {
    return {
      wordCount: 0,
      speakingSeconds: 0,
      wpm: null,
      paceBand: null,
      pauses: { measured: false, count: 0, longest: 0, total: 0 },
      fillers: { total: 0, byWord: {}, perMinute: 0 },
      crutchWords: {},
      clarity: null,
      annotated: [],
    };
  }

  const speakingSeconds = Math.max(0, items[wordCount - 1].end - items[0].start);
  const wpm =
    speakingSeconds >= MIN_SPEAKING_SECONDS_FOR_PACE
      ? Math.round(wordCount / (speakingSeconds / 60))
      : null;

  const pauses = { measured: timed, count: 0, longest: 0, total: 0 };
  const annotated = items.map((item, i) => {
    let gap = 0;
    if (timed && i > 0) {
      const g = item.start - items[i - 1].end;
      if (g >= LONG_PAUSE_SECONDS) {
        gap = round1(g);
        pauses.count += 1;
        pauses.total += g;
        pauses.longest = Math.max(pauses.longest, g);
      }
    }
    return { w: item.text, filler: isFillerToken(item.token), gap };
  });
  pauses.longest = round1(pauses.longest);
  pauses.total = round1(pauses.total);

  const byWord = {};
  let fillerTotal = 0;
  for (const item of items) {
    if (isFillerToken(item.token)) {
      fillerTotal += 1;
      byWord[item.token] = (byWord[item.token] || 0) + 1;
    }
  }
  // Floor of 10 seconds so a 4-second answer with one "um" doesn't read as 15 per minute.
  const perMinute = round1(fillerTotal / (Math.max(speakingSeconds, 10) / 60));

  return {
    wordCount,
    speakingSeconds: round1(speakingSeconds),
    wpm,
    paceBand: paceBandFor(wpm),
    pauses,
    fillers: { total: fillerTotal, byWord, perMinute },
    crutchWords: findCrutchWords(items.map((i) => i.token)),
    clarity: clarityFromSegments(segments),
    annotated,
  };
}

/**
 * True when the recording was silence/noise. With a disfluency "primer" prompt,
 * Whisper can echo the primer back on silent audio, so that is checked too.
 */
export function looksLikeNoSpeech(resp, wordCount, primeText = "") {
  if (!wordCount) return true;

  const segments = Array.isArray(resp?.segments) ? resp.segments : [];
  const avgNoSpeech = segments.length
    ? segments.reduce((sum, s) => sum + (Number(s.no_speech_prob) || 0), 0) / segments.length
    : 0;

  if (avgNoSpeech > 0.8 && wordCount < 6) return true;

  if (primeText) {
    const prime = new Set(tokenizeText(primeText));
    const heard = tokenizeText(resp?.text);
    if (heard.length && heard.length <= 14 && avgNoSpeech > 0.4) {
      const overlap = heard.filter((t) => prime.has(t)).length / heard.length;
      if (overlap >= 0.8) return true;
    }
  }
  return false;
}

/* ---------- scores ---------- */

export function paceScore(wpm) {
  if (wpm == null) return null;
  if (wpm >= PACE.sweetLow && wpm <= PACE.sweetHigh) return 100;
  if (wpm >= PACE.slowBelow && wpm < PACE.sweetLow) return 85;
  if (wpm > PACE.sweetHigh && wpm <= PACE.fastAbove) return 85;
  if (wpm < PACE.slowBelow) return Math.max(30, Math.round(85 - (PACE.slowBelow - wpm) * 1.2));
  return Math.max(30, Math.round(85 - (wpm - PACE.fastAbove)));
}

export function fillerScore(fillers) {
  return Math.round(clamp(100 - fillers.perMinute * 10, 20, 100));
}

export function pauseScore(pauses) {
  if (!pauses.measured) return null;
  return Math.round(clamp(100 - pauses.count * 8 - Math.max(0, pauses.longest - 3) * 5, 30, 100));
}

/** Weighted blend of whichever delivery parts could be measured. */
export function deliveryScore(delivery) {
  const parts = [
    { v: paceScore(delivery.wpm), w: 0.3 },
    { v: fillerScore(delivery.fillers), w: 0.3 },
    { v: pauseScore(delivery.pauses), w: 0.2 },
    { v: delivery.clarity ? delivery.clarity.value : null, w: 0.2 },
  ].filter((p) => p.v != null);
  const totalWeight = parts.reduce((s, p) => s + p.w, 0);
  if (!totalWeight) return null;
  return Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / totalWeight);
}

export function scoreExplain({ delivery, structure }) {
  if (delivery == null && structure == null) return null;
  if (structure == null) return delivery;
  if (delivery == null) return structure;
  return Math.round(0.5 * delivery + 0.5 * structure);
}

export function scoreRepeat({ accuracy, clarity }) {
  return clarity == null ? accuracy : Math.round(0.75 * accuracy + 0.25 * clarity);
}

/* ---------- "say it clearly": compare target with what was heard ---------- */

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1
      );
    }
  }
  return dp[a.length][b.length];
}

function mismatchHint(expected, heard) {
  if (heard.length < expected.length && expected.startsWith(heard) && expected.length - heard.length <= 3) {
    return "dropped_ending";
  }
  if (expected.length < heard.length && heard.startsWith(expected) && heard.length - expected.length <= 3) {
    return "extra_ending";
  }
  if (expected[0] === heard[0] && editDistance(expected, heard) <= 2) return "sounded_close";
  return "different_word";
}

/**
 * Word-by-word comparison (edit-distance alignment).
 * Returns each target word with a status — ok / missed / misheard — plus any
 * extra words that were heard and the overall accuracy.
 */
export function alignWords(targetText, heardText) {
  const displayWords = String(targetText ?? "").trim().split(/\s+/).filter(Boolean);
  const t = displayWords.map(normalizeToken);
  const h = tokenizeText(heardText);
  const n = t.length;
  const m = h.length;

  const dp = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)]);
  for (let j = 1; j <= m; j += 1) dp[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (t[i - 1] === h[j - 1] ? 0 : 1),
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1
      );
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (t[i - 1] === h[j - 1] ? 0 : 1)) {
      ops.push({ type: t[i - 1] === h[j - 1] ? "match" : "sub", i: i - 1, j: j - 1 });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: "del", i: i - 1 });
      i -= 1;
    } else {
      ops.push({ type: "ins", j: j - 1 });
      j -= 1;
    }
  }
  ops.reverse();

  const words = displayWords.map((word) => ({ word, status: "ok" }));
  const extra = [];
  for (const op of ops) {
    if (op.type === "del") {
      words[op.i].status = "missed";
    } else if (op.type === "sub") {
      words[op.i].status = "misheard";
      words[op.i].heard = h[op.j];
      words[op.i].hint = mismatchHint(t[op.i], h[op.j]);
    } else if (op.type === "ins") {
      extra.push(h[op.j]);
    }
  }

  const matches = words.filter((w) => w.status === "ok").length;
  return { accuracy: n ? Math.round((matches / n) * 100) : 0, words, extra };
}

/* ---------- reading the model's JSON reply ---------- */

/** Pulls the first {...} object out of a model reply (tolerates code fences / chatter). */
export function parseJsonObject(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
