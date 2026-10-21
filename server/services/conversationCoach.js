/* =========================================================
   CONVERSATION COACH
   Everything about *what the coach says*:
     - how a chat opens ("How was your day?")
     - the rules the model follows while chatting
     - the safety reply when someone is in distress
     - the end-of-session level assessment, and the checks that stop
       the model inventing quotes or flattering a thin sample

   No network calls here: the route passes the model client in, so all
   of this is tested without one.
========================================================= */

import { parseJsonObject, tokenizeText } from "./speechAnalysis.js";
import { LEVELS, SKILLS, LEVEL_INFO, isLevel, levelToScore } from "./englishLevels.js";

export const CHAT_MODEL = "openai/gpt-oss-120b";
export const FALLBACK_MODEL = "openai/gpt-oss-20b";
export const COACH_NAME = "Sipho";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ---------- text cleaning ---------- */

export function cleanText(value, max) {
  const text = String(value ?? "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/[*_`#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

function cutAtSentence(text, max) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const stop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (stop > 30) return slice.slice(0, stop + 1);
  return `${slice.replace(/\s+\S*$/, "").replace(/[,;:]$/, "")}.`;
}

const safeName = (name) => String(name ?? "").replace(/[^\p{L}' -]/gu, "").trim().slice(0, 24);

/* ---------- safety ---------- */

const SELF_HARM = [
  /\bsuicid(?:e|al)\b/i,
  /\b(?:kill|hurt|harm|cut)(?:ing)?\s+my\s?self\b/i,
  /\bself[\s-]?harm/i,
  /\bend(?:ing)?\s+my\s+life\b/i,
  /\bwant(?:ed)?\s+to\s+die\b/i,
  /\b(?:do not|don't|dont)\s+want\s+to\s+(?:live|be\s+alive|be\s+here)\b/i,
  /\bbetter\s+off\s+(?:dead|without\s+me)\b/i,
  /\bno\s+reason\s+to\s+(?:live|go\s+on)\b/i,
];

const ABUSE = [
  /\b(?:he|she|they|someone|somebody|my\s+\w+)\s+(?:is\s+|keeps\s+)?(?:hit(?:s|ting)?|beat(?:s|ing)?|abus(?:es|ing)|touch(?:es|ing))\s+me\b/i,
  /\bi\s+(?:was|am|got|have\s+been|had\s+been)\s+(?:raped|abused|molested|sexually\s+assaulted)\b/i,
];

export function detectCrisis(text) {
  const t = String(text ?? "");
  if (SELF_HARM.some((re) => re.test(t))) return "self_harm";
  if (ABUSE.some((re) => re.test(t))) return "abuse";
  return null;
}

/** Fixed, human-written replies (never model-generated). `spoken` spells numbers out digit by digit. */
export function crisisReply(kind, { minor = false } = {}) {
  if (kind === "abuse") {
    return {
      text: "I'm so sorry that happened, and I'm really glad you told me. It is not your fault. Please tell an adult you trust. You can also call Childline for free, any time, on 116. If you are in danger right now, call 10111.",
      spoken: "I'm so sorry that happened, and I'm really glad you told me. It is not your fault. Please tell an adult you trust. You can also call Childline for free, any time, on 1 1 6. If you are in danger right now, call 1 0 1 1 1.",
      kind,
    };
  }
  const child = minor ? " You can also call Childline on 116." : "";
  const childSpoken = minor ? " You can also call Childline on 1 1 6." : "";
  return {
    text: `I'm really glad you told me. What you are feeling matters, and you don't have to carry it alone. Please talk to someone you trust right now, like a parent, a teacher or a friend. You can also call the SADAG suicide crisis line for free, any time, on 0800 567 567.${child} If you are in danger, call 10111. We can pause our practice. I'm here whenever you want to chat.`,
    spoken: `I'm really glad you told me. What you are feeling matters, and you don't have to carry it alone. Please talk to someone you trust right now, like a parent, a teacher or a friend. You can also call the SADAG suicide crisis line for free, any time, on 0 8 0 0, 5 6 7, 5 6 7.${childSpoken} If you are in danger, call 1 0 1 1 1. We can pause our practice. I'm here whenever you want to chat.`,
    kind: "self_harm",
  };
}

/* ---------- opening a conversation ---------- */

function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i += 1) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOpener({ name, hour = 12, firstTime = false, lastTopics = [], level = null, seed = "x" }) {
  const n = safeName(name);
  const hello = n ? `, ${n}` : "";
  const hi = n ? `${n}` : "there";
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const random = rng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const simple = level === "A1" || level === "A2";
  const topic = cleanText(lastTopics?.[0] ?? "", 30).toLowerCase();

  if (firstTime) {
    return simple
      ? `Hello ${hi}! I'm ${COACH_NAME}. Let's talk in English. How are you today?`
      : `Hi ${hi}! I'm ${COACH_NAME}, your English practice partner. There are no wrong answers here, I just like to chat. So, how was your day?`;
  }
  if (simple) {
    return pick([`Hello ${hi}! How are you today?`, `Hi ${hi}! How was your day?`, `${greet}${hello}! How are you?`]);
  }
  const options = [
    `${greet}${hello}! How's your day going so far?`,
    `Hey ${hi}, welcome back! How was your day?`,
    `${greet}${hello}! It's nice to talk again. How are you feeling today?`,
  ];
  if (topic) options.push(`Welcome back${hello}! Last time we talked about ${topic}. Anything new with that? Or tell me about your day first.`);
  return pick(options);
}

/* ---------- chatting ---------- */

const LEVEL_STYLE = {
  A1: "Use very simple, common words and very short sentences (under 10 words). Mostly present tense. Ask yes/no or either/or questions.",
  A2: "Use simple, common words and short sentences (under 14 words). Mostly present and simple past. Ask easy open questions.",
  B1: "Use everyday language and clear sentences. Mix tenses naturally. Ask open questions that invite two or three sentences.",
  B2: "Speak naturally, with the occasional idiom or phrasal verb. Ask questions that invite opinions and reasons.",
  C1: "Speak fluently and precisely with a rich vocabulary and some idiom. Ask questions that invite nuance, comparison and justification.",
  C2: "Speak like an educated native speaker, with idiom, light humour and nuance. Challenge their ideas politely.",
};

export function buildChatSystem({ name, level, target, interests = [], minor = false, lastTopics = [] }) {
  const n = safeName(name);
  const lines = [
    `You are ${COACH_NAME}, a warm, curious English conversation partner. You are chatting by voice with ${n || "a learner"} who is practising spoken English. You are a conversation partner first and a teacher second.`,
    "You are an AI. If they ask, say so plainly. Do not invent a family, a body or real-life experiences. You can share opinions and general knowledge.",
    "",
    "HOW YOU TALK",
    "- Write exactly what you would say out loud: plain sentences, contractions, no lists, no markdown, no emojis, no stage directions.",
    "- Keep it short: 1 to 3 sentences, about 15 to 40 words (shorter at A1 and A2).",
    "- React first with one short, natural reaction, then add a thought or ask ONE question. Never ask two questions.",
    "- Follow their lead. If their answer is short, ask a gentle follow-up about the same thing instead of changing topic.",
    "- Vary your questions. Do not start every reply with the same word.",
    "",
    "LEVEL",
    isLevel(level)
      ? `Their level is ${level} (${LEVEL_INFO[level].title}). ${LEVEL_STYLE[level]}`
      : "You do not know their level yet. Start at a simple B1 and adjust within a few turns to match how they speak.",
    isLevel(target) && target !== level
      ? `Their goal is ${target}. Gently use a few words or phrases slightly above their level, in ways the context makes clear, so they pick them up naturally.`
      : "",
    "",
    "CORRECTIONS",
    "- When they make a mistake that does not block meaning, do NOT point it out. Use the correct form naturally in your own reply (for example, if they say 'I go yesterday', you might say 'Oh, you went there yesterday? How was it?').",
    "- Only give an explicit tip if they ask 'is this correct?' or ask for help, and keep it to one short sentence.",
    "- The text you receive is a speech-to-text transcript, so ignore spelling, capital letters and punctuation. Never comment on accent or pronunciation.",
    "- If their message looks like a transcription glitch or is too unclear to understand, kindly ask them to say it again instead of guessing.",
    "",
    "STAY ON TRACK",
    "- This is English conversation practice. If they ask for homework answers, code or anything unrelated, say kindly that you are here to practise English with them and bring the chat back.",
    "- If they speak another language, answer kindly in English and help them say it in English.",
    interests.length ? `- Things they like talking about: ${interests.join(", ")}. Bring these in naturally, but let them lead.` : "",
    lastTopics.length ? `- Last time you talked about: ${lastTopics.join(", ")}. You may mention it once, if it feels natural.` : "",
    "",
    "SAFETY",
    "- Never ask for personal identifying details such as their surname, address, school name, phone number, ID number or social media accounts.",
    minor
      ? "- This learner is under 18. Keep every topic suitable for a school-age learner. Steer away from romance, sex, violence, drugs, alcohol and gambling, kindly and without a lecture."
      : "- Keep topics respectful. Steer away from sexual or violent content.",
    "- If they sound upset, respond with warmth first. Do not try to counsel them. Encourage them to talk to someone they trust, and if they mention harming themselves, tell them about the SADAG helpline on 0800 567 567 (or Childline on 116 if they are under 18).",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

const MAX_HISTORY = 12;

export function normaliseHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === "coach" || m.role === "learner") && typeof m.text === "string")
    .map((m) => ({ role: m.role, text: cleanText(m.text, 600) }))
    .filter((m) => m.text)
    .slice(-MAX_HISTORY);
}

export function buildChatMessages({ system, history, userText }) {
  const past = normaliseHistory(history).map((m) => ({
    role: m.role === "coach" ? "assistant" : "user",
    content: m.text,
  }));
  return [{ role: "system", content: system }, ...past, { role: "user", content: cleanText(userText, 800) }];
}

/** Turns a model reply into something safe to show and speak. */
export function cleanSpokenReply(raw) {
  let text = cleanText(raw, 1200)
    .replace(/^(?:sipho|coach)\s*[:\-]\s*/i, "")
    .replace(/\([^)]{0,60}\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = cutAtSentence(text, 420);
  return text;
}

const FALLBACK_REPLIES = [
  "That sounds interesting. Can you tell me a bit more about it?",
  "I see. And how did that make you feel?",
  "Nice. What happened next?",
  "Okay, I'd like to hear more. What do you enjoy most about it?",
  "Thanks for sharing that. Is that something you do often?",
];

export function fallbackReply(seed = "x") {
  return FALLBACK_REPLIES[Math.floor(rng(seed)() * FALLBACK_REPLIES.length)];
}

/* ---------- "give me an idea" hints ---------- */

const HINT_STARTERS = {
  A1: ["I am fine.", "I like it.", "Yes, I do."],
  A2: ["I think it is good because...", "Yesterday I...", "I like it because..."],
  B1: ["To be honest, I...", "The reason is that...", "One thing I really like is..."],
  B2: ["In my opinion,...", "What I find interesting is...", "On the one hand,... but on the other hand,..."],
  C1: ["I'd argue that...", "It largely depends on...", "What strikes me most is..."],
  C2: ["If I'm being candid,...", "It's a double-edged sword, really...", "That's a nuanced question,..."],
};

export function fallbackHints(level) {
  return HINT_STARTERS[isLevel(level) ? level : "B1"];
}

export function buildHintMessages({ level, lastCoachLine }) {
  const system = [
    "You help an English learner who is stuck and does not know how to answer.",
    `Their level is ${isLevel(level) ? level : "B1"}. Write three different short answers they could say, in the first person, at exactly that level, so they can pick one and say it in their own words.`,
    "Each answer must be natural spoken English, under 25 words, with no placeholders in brackets.",
    'Reply with ONE JSON object only: {"ideas": ["...", "...", "..."]}',
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: `The coach just said: "${cleanText(lastCoachLine, 300)}"` },
  ];
}

export function sanitizeHints(raw, level) {
  const ideas = (Array.isArray(raw?.ideas) ? raw.ideas : [])
    .map((i) => cleanText(i, 160))
    .filter((i) => i.length >= 3)
    .slice(0, 3);
  return ideas.length ? ideas : fallbackHints(level);
}

/* ---------- summarising what the learner said ---------- */

export function summariseTurns(turns) {
  const learner = (Array.isArray(turns) ? turns : []).filter((t) => t?.role === "learner" && typeof t.text === "string");
  const texts = learner.map((t) => cleanText(t.text, 800)).filter(Boolean);
  const tokens = texts.flatMap((t) => tokenizeText(t));
  const unique = new Set(tokens);

  const seconds = clamp(learner.reduce((s, t) => s + (Number(t.seconds) > 0 ? Number(t.seconds) : 0), 0), 0, 3600);
  const wordsSpoken = learner.reduce((s, t) => s + (Number(t.seconds) > 0 ? tokenizeText(t.text).length : 0), 0);
  const fillers = clamp(learner.reduce((s, t) => s + (Number(t.fillers) > 0 ? Number(t.fillers) : 0), 0), 0, 500);

  return {
    turns: texts.length,
    learnerWords: tokens.length,
    uniqueWords: unique.size,
    avgWordsPerTurn: texts.length ? Math.round((tokens.length / texts.length) * 10) / 10 : 0,
    speakingSeconds: Math.round(seconds),
    wpm: seconds >= 10 ? clamp(Math.round(wordsSpoken / (seconds / 60)), 20, 260) : null,
    fillersPerMinute: seconds >= 10 ? Math.round((fillers / (seconds / 60)) * 10) / 10 : null,
    learnerText: texts.join(" "),
  };
}

/* ---------- the end-of-session assessment ---------- */

const RUBRIC = `Rate each skill on the CEFR scale (A1, A2, B1, B2, C1, C2):
- fluency: A1 single words and long pauses; A2 short phrases with many pauses; B1 keeps going despite pauses and rephrasing; B2 steady pace with few hesitations; C1 effortless and natural; C2 smooth with varied rhythm.
- vocabulary: A1 basic words; A2 everyday words; B1 enough for familiar topics but repeats words; B2 good range with some idiom; C1 broad and precise; C2 very broad, idiomatic and nuanced.
- grammar: A1 mostly memorised chunks; A2 simple structures with frequent basic mistakes; B1 reasonable accuracy in familiar situations, errors with complex ones; B2 good control and few errors; C1 consistent control, rare slips; C2 consistently accurate.
- coherence: A1 isolated phrases; A2 links ideas with and, but, because; B1 connects ideas in a simple sequence; B2 clear and well structured; C1 well organised with varied linking; C2 highly cohesive.
- interaction: A1 relies on the coach; A2 answers simple questions; B1 responds and sometimes asks back; B2 engages actively and develops points; C1 natural turn-taking, builds on what was said; C2 leads and shades the conversation.`;

export function buildAssessmentMessages({ profile, metrics, turns }) {
  const system = [
    "You are an experienced CEFR speaking examiner and a kind English coach.",
    "Judge ONLY the lines marked Learner. Lines marked Coach are context.",
    "The text is a speech-to-text transcript: ignore spelling, capitalisation and punctuation, and do not penalise anything that may be a transcription slip. Never comment on accent or pronunciation.",
    "Be conservative and honest. Most learners are between A2 and B2. Only give C1 or C2 with clear evidence of range, accuracy and flexibility across the whole conversation.",
    "",
    RUBRIC,
    "",
    "Reply with ONE JSON object only, with exactly these keys:",
    `{
  "skills": { "fluency": "B1", "vocabulary": "B1", "grammar": "A2", "coherence": "B1", "interaction": "B2" },
  "summary": "two warm, specific sentences about how they did today",
  "strengths": ["one or two specific strengths, each referring to something they actually said or did"],
  "improvements": [
    { "focus": "short name of the habit, e.g. past tense verbs",
      "youSaid": "an EXACT short quote from a Learner line that shows it",
      "tryInstead": "the same idea said more correctly or more naturally",
      "why": "one short, kind sentence explaining it" }
  ],
  "vocabulary": [ { "word": "a useful word or phrase for their level and goal", "meaning": "simple meaning", "example": "a short example sentence" } ],
  "nextTime": "one concrete thing to try in the next conversation",
  "topics": ["one to four short topic tags such as football or school"]
}`,
    "Give at most 3 improvements and 4 vocabulary items. If the learner made no mistakes worth fixing, give fewer improvements rather than inventing some.",
  ].join("\n");

  const transcript = (Array.isArray(turns) ? turns : [])
    .map((t) => `${t.role === "learner" ? "Learner" : "Coach"}: ${cleanText(t.text, 600)}`)
    .join("\n")
    .slice(0, 9000);

  const facts = [
    `Their own estimate: ${isLevel(profile?.currentLevel) ? profile.currentLevel : "not sure"}. Their goal: ${isLevel(profile?.targetLevel) ? profile.targetLevel : "not set"}.`,
    `Learner words: ${metrics.learnerWords}, unique words: ${metrics.uniqueWords}, turns: ${metrics.turns}, average words per turn: ${metrics.avgWordsPerTurn}.`,
    metrics.wpm ? `Speaking rate: ${metrics.wpm} words per minute. Filler sounds per minute: ${metrics.fillersPerMinute ?? "unknown"}.` : "Speaking rate was not measured.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `${facts}\n\n<conversation>\n${transcript}\n</conversation>` },
  ];
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();

/**
 * Validates the model's assessment. Returns null if it isn't usable.
 * A quote only survives if it genuinely appears in what the learner said.
 */
export function sanitizeAssessment(raw, { learnerText }) {
  if (!raw || typeof raw !== "object") return null;

  const given = SKILLS.filter((k) => isLevel(raw.skills?.[k]));
  if (given.length < 3) return null;
  const median = (() => {
    const scores = given.map((k) => levelToScore(raw.skills[k])).sort((a, b) => a - b);
    return LEVELS[scores[Math.floor(scores.length / 2)] - 1];
  })();
  const skills = Object.fromEntries(SKILLS.map((k) => [k, isLevel(raw.skills?.[k]) ? raw.skills[k] : median]));

  const haystack = norm(learnerText);
  const improvements = (Array.isArray(raw.improvements) ? raw.improvements : [])
    .map((i) => ({
      focus: cleanText(i?.focus, 40),
      youSaid: cleanText(i?.youSaid, 140),
      tryInstead: cleanText(i?.tryInstead, 160),
      why: cleanText(i?.why, 160),
    }))
    .filter((i) => i.focus && i.youSaid && i.tryInstead && norm(i.youSaid).length >= 3 && haystack.includes(norm(i.youSaid)) && norm(i.youSaid) !== norm(i.tryInstead))
    .slice(0, 3);

  const list = (value, n, max) => (Array.isArray(value) ? value : []).map((v) => cleanText(v, max)).filter(Boolean).slice(0, n);

  return {
    skills,
    summary: cleanText(raw.summary, 260),
    strengths: list(raw.strengths, 2, 160),
    improvements,
    vocabulary: (Array.isArray(raw.vocabulary) ? raw.vocabulary : [])
      .map((v) => ({ word: cleanText(v?.word, 30), meaning: cleanText(v?.meaning, 90), example: cleanText(v?.example, 130) }))
      .filter((v) => v.word && v.meaning)
      .slice(0, 4),
    nextTime: cleanText(raw.nextTime, 180),
    topics: list(raw.topics, 4, 24).map((t) => t.toLowerCase().replace(/[^a-z\s]/g, "").trim()).filter(Boolean),
  };
}

/* ---------- calling the model ---------- */

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("model timeout")), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Tries each model in turn. Returns the reply text, or throws the last error. */
export async function chat({ groq, models, messages, effort = "low", maxTokens = 600, temperature = 0.7, timeoutMs = 20000 }) {
  let lastError;
  for (const model of models) {
    try {
      const completion = await withTimeout(
        // maxRetries: 0. The SDK would otherwise retry a failing model 2 more times with
        // back-off, which is seconds of silence in a voice chat. Our own backup model is faster.
        groq.chat.completions.create(
          {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            reasoning_effort: effort,
            include_reasoning: false,
          },
          { maxRetries: 0 }
        ),
        timeoutMs
      );
      const text = completion?.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) return { text, model };
      lastError = new Error("empty reply");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("no model available");
}

export { parseJsonObject };
