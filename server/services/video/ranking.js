/**
 * From a pool of candidate videos to the list a learner sees:
 *   build request -> score every candidate -> drop gated ones -> rank -> channel diversity
 *   -> optional re-sort -> groups (Top matches, Understand the concept, ...).
 * If too few pass, filters are relaxed one at a time, and each relaxation is announced.
 */
"use strict";

const tx = require("./taxonomy");
const { tokens } = require("./text");
const { scoreVideo, prepare, STRICT } = require("./scoring");

class RequestError extends Error {}

const GRADES = new Set([8, 9, 10, 11, 12]);
const CURRICULA = new Set(tx.CURRICULA.map((c) => c.id));

/** Validate and resolve the learner's filters against the taxonomy. */
function buildRequest(input = {}) {
  const subjectNode = tx.getSubject(String(input.subject || ""));
  if (!subjectNode) throw new RequestError("Choose a subject.");
  const topicNode = input.topic ? tx.getTopic(subjectNode.id, String(input.topic)) : null;
  if (input.topic && !topicNode) throw new RequestError("That topic isn't part of this subject.");
  const subtopicNode = input.subtopic && topicNode ? tx.getSubtopic(subjectNode.id, topicNode.id, String(input.subtopic)) : null;
  if (input.subtopic && !subtopicNode) throw new RequestError("That subtopic isn't part of this topic.");

  const grade = input.grade ? Number(input.grade) : null;
  if (grade !== null && !GRADES.has(grade)) throw new RequestError("Grade must be between 8 and 12.");
  const curriculum = input.curriculum ? String(input.curriculum) : null;
  if (curriculum && !CURRICULA.has(curriculum)) throw new RequestError("Unknown curriculum.");
  const level = input.level ? String(input.level) : null;
  if (level && !tx.LEVEL_MAP.has(level)) throw new RequestError("Unknown level.");
  const types = [...new Set([].concat(input.types || []).flatMap((x) => String(x).split(",")).filter(Boolean))];
  if (types.some((x) => !tx.TYPE_MAP.has(x))) throw new RequestError("Unknown video type.");
  const length = input.length && input.length !== "any" ? String(input.length) : null;
  if (length && !tx.LENGTH_MAP.has(length)) throw new RequestError("Unknown length.");
  const minutes = input.minutes ? Number(input.minutes) : null;
  if (minutes !== null && !(minutes >= 1 && minutes <= 600)) throw new RequestError("Study time must be between 1 and 600 minutes.");
  const language = input.language && input.language !== "any" ? String(input.language) : null;
  if (language && !tx.LANGUAGE_MAP.has(language)) throw new RequestError("Unknown language.");
  const query = String(input.q || "").trim().slice(0, 200);

  return {
    subject: subjectNode.id, subjectNode,
    topic: topicNode ? topicNode.id : null, topicNode,
    subtopic: subtopicNode ? subtopicNode.id : null, subtopicNode,
    grade: subjectNode.school ? grade : null,
    curriculum: subjectNode.school ? curriculum : null,
    level: subjectNode.school ? null : level,
    types, length, minutes, language, query,
    queryTokens: [...new Set(tokens(query))].slice(0, 12),
  };
}

/**
 * The YouTube query built from the filters (one search per request, cached).
 * Only WHAT the learner studies goes into it (subject, grade, curriculum, topic, level, words,
 * language). HOW they want it (video type, time, length, sort) re-ranks the cached results
 * locally, so changing those costs no quota.
 */
function providerQuery(req) {
  const parts = [];
  if (req.grade) parts.push(`grade ${req.grade}`);
  if (req.curriculum === "NSC") parts.push("NSC");
  else if (req.curriculum && req.curriculum !== "University") parts.push(req.curriculum);
  if (req.subtopicNode) parts.push(req.subtopicNode.name);
  else if (req.topicNode) parts.push(req.topicNode.name);
  if (!req.subtopicNode && !req.topicNode) parts.push(req.subjectNode.name);
  else if (req.subjectNode.school) parts.push(req.subjectNode.name);
  if (req.level === "beginner") parts.push("for beginners");
  if (req.query) parts.push(req.query);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  // cache key: order-insensitive, case-insensitive, plus the language hint
  const key = `yt:${req.language || "any"}:${[...new Set(tokens(text, { dropStopwords: false }))].sort().join(" ")}`;
  return { text, key, relevanceLanguage: req.language || undefined };
}

/** Inverse document frequency over the candidate pool: rare words discriminate, common ones don't. */
function buildIdf(videos) {
  const df = new Map();
  for (const v of videos) for (const tok of prepare(v).tokens) df.set(tok, (df.get(tok) || 0) + 1);
  const n = videos.length;
  return (token) => Math.log((n + 1) / ((df.get(token) || 0) + 1)) + 1;
}

function compareScored(a, b) {
  return (
    b.match - a.match ||
    b.parts.relevance.score - a.parts.relevance.score ||
    (b.video.view_count || 0) - (a.video.view_count || 0) ||
    a.video.provider_video_id.localeCompare(b.video.provider_video_id)
  );
}

function scoreAll(videos, req, ctx, cfg, { now, strict }) {
  const idf = buildIdf(videos);
  const base = { ...ctx, idf };
  // pass 1: which channels specialise in this request (for uncurated channel trust)
  const channelCounts = new Map();
  for (const v of videos) {
    const s = scoreVideo(v, req, base, cfg, { now, strict: { ...STRICT, types: false, time: false } });
    if (!s.excluded) channelCounts.set(v.channel_id, (channelCounts.get(v.channel_id) || 0) + 1);
  }
  const full = { ...base, channelCounts };
  return videos.map((v) => scoreVideo(v, req, full, cfg, { now, strict }));
}

/** At most N videos per channel in the first `window` results (unless the learner named the channel). */
function diversify(list, cfg, req) {
  const { maxPerChannel, window } = cfg.diversity;
  const named = (id, title) => req.query && title && req.query.toLowerCase().includes(String(title).toLowerCase());
  const head = [];
  const deferred = [];
  const counts = new Map();
  for (const item of list) {
    if (head.length >= window) {
      deferred.push(item);
      continue;
    }
    const ch = item.video.channel_id;
    const n = counts.get(ch) || 0;
    if (n >= maxPerChannel && !named(ch, item.video.channel_title)) deferred.push(item);
    else {
      head.push(item);
      counts.set(ch, n + 1);
    }
  }
  return [...head, ...deferred];
}

const SORTERS = {
  relevance: (a, b) => b.parts.relevance.score - a.parts.relevance.score || compareScored(a, b),
  views: (a, b) => (b.video.view_count ?? -1) - (a.video.view_count ?? -1) || compareScored(a, b),
  engagement: (a, b) => ((b.parts.engagement && b.parts.engagement.score) ?? -1) - ((a.parts.engagement && a.parts.engagement.score) ?? -1) || compareScored(a, b),
  newest: (a, b) => String(b.video.published_at || "").localeCompare(String(a.video.published_at || "")) || compareScored(a, b),
  shortest: (a, b) => (a.video.duration_seconds ?? Infinity) - (b.video.duration_seconds ?? Infinity) || compareScored(a, b),
  longest: (a, b) => (b.video.duration_seconds ?? -1) - (a.video.duration_seconds ?? -1) || compareScored(a, b),
};

const GROUPS = [
  { id: "concept", name: "Understand the concept", test: (s) => (s.types.includes("concept") || s.types.includes("lesson")) && (s.video.duration_seconds || 0) <= 2400 },
  { id: "examples", name: "Worked examples", test: (s) => s.types.includes("worked_examples") },
  { id: "exam", name: "Exam preparation", test: (s) => s.types.includes("exam") },
  { id: "quick", name: "Quick revision", test: (s) => s.types.includes("revision") || ((s.video.duration_seconds || Infinity) <= 600) },
  { id: "deep", name: "Deep dive", test: (s) => (s.video.duration_seconds || 0) >= 2400 || s.types.includes("lesson") },
];

/** Top matches first, then the other groups without repeating a video. Groups with <2 videos are skipped. */
function groupResults(list, cfg) {
  const top = list.slice(0, cfg.results.topMatches);
  const used = new Set(top.map((s) => s.video.provider_video_id));
  const groups = [{ id: "top", name: "Top matches", items: top }];
  for (const g of GROUPS) {
    const items = list.filter((s) => !used.has(s.video.provider_video_id) && g.test(s)).slice(0, cfg.results.groupSize);
    if (items.length >= 2) {
      items.forEach((s) => used.add(s.video.provider_video_id));
      groups.push({ id: g.id, name: g.name, items });
    }
  }
  return groups;
}

/** Relaxation steps, from the most to the least specific filter. Each one is announced. */
function relaxationSteps(req) {
  const steps = [];
  const topicName = req.topicNode && req.topicNode.name.toLowerCase();
  if (req.subtopic) steps.push({ id: "subtopic", strict: { subtopic: false }, message: `We couldn't find enough videos on ${req.subtopicNode.name.toLowerCase()}, so we've included other ${topicName} videos.` });
  if (req.types.length) steps.push({ id: "types", strict: { types: false }, message: "We've included other kinds of videos on this topic, not only the type you chose." });
  if (req.minutes) steps.push({ id: "time", strict: { time: false }, message: `Few videos fit ${req.minutes} minutes, so we've included some that are a little longer.` });
  if (req.curriculum || req.grade) {
    const what = [req.curriculum === "NSC" ? "NSC" : req.curriculum, req.grade ? `Grade ${req.grade}` : null].filter(Boolean).join(" ");
    steps.push({ id: "curriculum", strict: { curriculum: false }, message: `We couldn't find enough ${what} videos, so we've included closely related ones made for other curricula or grades.` });
  }
  if (req.topic) steps.push({ id: "topic", strict: { topic: false, subtopic: false }, message: `We've included related ${req.subjectNode.name} videos beyond ${topicName}.` });
  return steps;
}

/**
 * Rank a candidate pool for a request. Returns ranked items (strictest filters that give
 * enough results) plus the relaxations that were needed.
 */
function rankPool(videos, req, ctx, cfg, { now = new Date(), sort = "recommended" } = {}) {
  let strict = { ...STRICT };
  let scored = scoreAll(videos, req, ctx, cfg, { now, strict });
  let kept = scored.filter((s) => !s.excluded);
  const relaxed = [];
  for (const step of relaxationSteps(req)) {
    if (kept.length >= cfg.results.minToShow) break;
    strict = { ...strict, ...step.strict };
    const before = kept.length;
    scored = scoreAll(videos, req, ctx, cfg, { now, strict });
    kept = scored.filter((s) => !s.excluded);
    if (kept.length > before) relaxed.push({ id: step.id, message: step.message });
  }
  kept.sort(compareScored);
  let ordered = diversify(kept, cfg, req);
  if (sort !== "recommended" && SORTERS[sort]) ordered = [...ordered].sort(SORTERS[sort]);
  const excludedCounts = {};
  for (const s of scored) if (s.excluded) excludedCounts[s.excluded] = (excludedCounts[s.excluded] || 0) + 1;
  return { items: ordered, relaxed, excludedCounts };
}

module.exports = { buildRequest, providerQuery, buildIdf, diversify, groupResults, rankPool, relaxationSteps, RequestError, SORTERS };
