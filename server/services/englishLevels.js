/* =========================================================
   ENGLISH LEVELS (CEFR)
   The six Common European Framework levels, a 1.0-6.0 score scale,
   and the maths for "where are you today" and "where are you
   really, across days".

   Everything here is a transparent heuristic and is covered by tests:
   one short chat can only ever give a rough estimate, so the numbers
   are capped by how much evidence there is, and the level shown as
   "yours" is smoothed over recent sessions instead of jumping around.
========================================================= */

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const LEVEL_INFO = {
  A1: { title: "Beginner", can: "I know some words and short phrases. I can say who I am and ask very simple questions." },
  A2: { title: "Elementary", can: "I can talk about simple, everyday things in short sentences." },
  B1: { title: "Intermediate", can: "I can chat about familiar topics, but I often stop to find words." },
  B2: { title: "Upper intermediate", can: "I can talk fairly fluently about many topics and explain my opinions." },
  C1: { title: "Advanced", can: "I speak fluently and precisely, even on complex topics." },
  C2: { title: "Near-native", can: "I can say almost anything with ease and nuance." },
};

export const GOAL_HINTS = {
  A1: "Get started",
  A2: "Handle simple everyday situations",
  B1: "Chat comfortably about everyday life",
  B2: "Work and study with confidence",
  C1: "Professional and university level",
  C2: "Near-native fluency",
};

export const INTEREST_OPTIONS = [
  "Football and sport", "Music", "Movies and series", "Technology", "Gaming", "Food and cooking",
  "Travel", "School and studies", "Careers and jobs", "Business and money", "Fashion",
  "Health and fitness", "Family and friends", "News and current affairs", "Science", "Art and creativity",
];

export const SKILLS = ["fluency", "vocabulary", "grammar", "coherence", "interaction"];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

/* ---------- levels <-> scores ---------- */

export const isLevel = (x) => LEVELS.includes(x);
export const levelIndex = (level) => LEVELS.indexOf(level);
export const levelToScore = (level) => (isLevel(level) ? levelIndex(level) + 1 : null);

// Score bands: A1 [1.0,1.5) A2 [1.5,2.5) B1 [2.5,3.5) B2 [3.5,4.5) C1 [4.5,5.5) C2 [5.5,6.0]
const BAND_LOW = { A1: 1.0, A2: 1.5, B1: 2.5, B2: 3.5, C1: 4.5, C2: 5.5 };
const BAND_HIGH = { A1: 1.5, A2: 2.5, B1: 3.5, B2: 4.5, C1: 5.5, C2: 6.0 };

export function scoreToLevel(score) {
  const s = clamp(Number(score) || 1, 1, 6);
  if (s < 1.5) return "A1";
  if (s < 2.5) return "A2";
  if (s < 3.5) return "B1";
  if (s < 4.5) return "B2";
  if (s < 5.5) return "C1";
  return "C2";
}

/** { level, progress } where progress (0-1) is how far through that level the score sits. */
export function levelPosition(score) {
  const s = clamp(Number(score) || 1, 1, 6);
  const level = scoreToLevel(s);
  const progress = (s - BAND_LOW[level]) / (BAND_HIGH[level] - BAND_LOW[level]);
  return { level, progress: Math.round(clamp(progress, 0, 1) * 100) / 100 };
}

/** The lowest score that counts as having reached `level`. */
export const bandStart = (level) => BAND_LOW[level];

/* ---------- onboarding validation ---------- */

export function validateProfileInput(input) {
  const current = input?.currentLevel ?? null;
  const target = input?.targetLevel;
  const errors = [];

  if (current !== null && !isLevel(current)) errors.push("Pick your current level from the list, or choose 'Not sure yet'.");
  if (!isLevel(target)) errors.push("Pick the level you want to reach.");
  if (isLevel(current) && isLevel(target) && levelIndex(target) < levelIndex(current)) {
    errors.push("Your goal should be the same as, or higher than, your current level.");
  }

  const minutes = Number(input?.dailyMinutes ?? 10);
  if (![5, 10, 15, 20].includes(minutes)) errors.push("Pick a daily practice time of 5, 10, 15 or 20 minutes.");

  const interests = Array.isArray(input?.interests) ? input.interests : [];
  const cleaned = [...new Set(
    interests.map((i) => String(i ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40)).filter(Boolean)
  )].slice(0, 6);

  return { errors, value: errors.length ? null : { currentLevel: current, targetLevel: target, dailyMinutes: minutes, interests: cleaned } };
}

/* ---------- how much evidence is there? ---------- */

export const MIN_WORDS_FOR_ESTIMATE = 25;

export function confidenceFor({ learnerWords, turns }) {
  if (learnerWords >= 250 && turns >= 6) return "high";
  if (learnerWords >= 100 && turns >= 4) return "medium";
  return "low";
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };
export const minConfidence = (a, b) => (CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b);

/**
 * The highest level a sample can honestly support. A model can be tempted to
 * rate a few confident sentences as C1; this keeps thin evidence from
 * producing a flattering number.
 */
export function levelCapFor({ uniqueWords }) {
  if (uniqueWords < 35) return "B1";
  if (uniqueWords < 70) return "B2";
  if (uniqueWords < 120) return "C1";
  return "C2";
}

/** Average of the skills the model rated, on the 1-6 scale, capped by the evidence. */
export function scoreFromSkills(skills, { uniqueWords }) {
  const values = SKILLS.map((k) => levelToScore(skills?.[k])).filter((v) => v != null);
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Cap AFTER rounding, and stay clear of the next band's edge (3.49 would round up into B2).
  const capLevel = levelCapFor({ uniqueWords });
  const cap = capLevel === "C2" ? 6 : round1(BAND_HIGH[capLevel] - 0.1);
  return Math.min(round1(mean), cap);
}

/* ---------- across sessions ---------- */

const CONFIDENCE_WEIGHT = { low: 0.4, medium: 0.75, high: 1 };

/**
 * The learner's "level" over the last few sessions: recent sessions count more,
 * low-confidence ones count less. `sessions` need { est_score, confidence }, newest first.
 */
export function trackedLevel(sessions) {
  const recent = (sessions || []).filter((s) => Number.isFinite(Number(s.est_score))).slice(0, 6);
  if (!recent.length) return null;

  let weighted = 0;
  let total = 0;
  recent.forEach((s, i) => {
    const w = (CONFIDENCE_WEIGHT[s.confidence] ?? 0.4) * 0.75 ** i;
    weighted += Number(s.est_score) * w;
    total += w;
  });
  const score = round1(weighted / total);

  let trend = "steady";
  if (recent.length >= 4) {
    const avg = (arr) => arr.reduce((a, s) => a + Number(s.est_score), 0) / arr.length;
    const diff = avg(recent.slice(0, 2)) - avg(recent.slice(2, 4));
    if (diff >= 0.15) trend = "up";
    else if (diff <= -0.15) trend = "down";
  } else if (recent.length >= 2) {
    trend = "new";
  }

  return { score, ...levelPosition(score), trend, basedOn: recent.length };
}

/** "How far from my goal?" */
export function gapToTarget(trackedScore, target) {
  if (!isLevel(target) || trackedScore == null) return null;
  const needed = bandStart(target);
  const remaining = Math.max(0, round1(needed - trackedScore));
  return { target, reached: trackedScore >= needed, remaining };
}

/* ---------- days and streaks (South Africa: UTC+2, no daylight saving) ---------- */

const SAST_MINUTES = 120;

export function localDay(iso, offsetMinutes = SAST_MINUTES) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function dailySeries(sessions, offsetMinutes = SAST_MINUTES) {
  const days = new Map();
  for (const s of sessions || []) {
    const day = localDay(s.started_at, offsetMinutes);
    if (!day) continue;
    const entry = days.get(day) || { date: day, weighted: 0, words: 0, minutes: 0, sessions: 0 };
    const words = Math.max(1, Number(s.learner_words) || 1);
    entry.weighted += Number(s.est_score) * words;
    entry.words += words;
    entry.minutes += (Number(s.duration_seconds) || 0) / 60;
    entry.sessions += 1;
    days.set(day, entry);
  }
  return [...days.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => {
      const score = round1(d.weighted / d.words);
      return { date: d.date, score, level: scoreToLevel(score), minutes: Math.round(d.minutes * 10) / 10, sessions: d.sessions };
    });
}

export function computeStreak(days, now = new Date(), offsetMinutes = SAST_MINUTES) {
  const set = new Set(days || []);
  const today = localDay(now.toISOString(), offsetMinutes);
  const shift = (day, delta) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

  const practisedToday = set.has(today);
  let cursor = practisedToday ? today : shift(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = shift(cursor, -1);
  }
  return { days: streak, practisedToday };
}