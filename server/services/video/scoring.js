/**
 * SkillForge Match: how well a video fits THIS learner's request, from measurable signals.
 * It is not a verdict on teaching quality, and it is never shown as a YouTube number.
 *
 * Pipeline per video:  gates  ->  component scores (0-100)  ->  weighted average of the
 * components that exist  ->  time/language adjustments  ->  reasons built from the numbers.
 * Missing data (hidden likes, unknown language...) is "unavailable", never zero.
 */
"use strict";

const { stemmedText, hasPhrase } = require("./text");
const tx = require("./taxonomy");

const prepCache = new WeakMap();

/** Stemmed text fields of a video, computed once. */
function prepare(video) {
  let prep = prepCache.get(video);
  if (!prep) {
    const title = stemmedText(video.title);
    const tags = stemmedText((video.tags || []).join(" "));
    const description = stemmedText(String(video.description || "").slice(0, 1200));
    prep = { title, tags, description, all: `${title} ${tags} ${description}` };
    prep.tokens = new Set(prep.all.split(" ").filter(Boolean));
    prepCache.set(video, prep);
  }
  return prep;
}

/** Strongest field in which any phrase appears: title > tags > description. */
function fieldHit(prep, phrases, strength) {
  for (const field of ["title", "tags", "description"]) {
    for (const phrase of phrases) {
      if (phrase && hasPhrase(prep[field], phrase)) return { score: strength[field], field, phrase };
    }
  }
  return { score: 0, field: null, phrase: null };
}

const GRADE_RE = /(?:^|\s)(?:grade|gr|graad)\s?(8|9|10|11|12)(?=\s|$)/g;

function detectGrades(prep) {
  const grades = new Set();
  for (const m of prep.all.matchAll(GRADE_RE)) grades.add(Number(m[1]));
  if (/(?:^|\s)matric(?=\s|$)/.test(prep.all)) grades.add(12);
  return grades;
}

/** Which video types the video itself signals, and how strongly (title/tags beat description). */
function detectTypes(video, cfg) {
  const prep = prepare(video);
  const found = {};
  for (const type of tx.VIDEO_TYPES) {
    const hit = fieldHit(prep, type.keywords, cfg.fieldStrength);
    if (hit.score > 0) found[type.id] = hit;
  }
  return found;
}

/* ================================================================== components */

/** Relevance: how much of the request the video's own words cover (TF-IDF for free text). */
function calculateRelevance(video, req, ctx, cfg) {
  const prep = prepare(video);
  const w = cfg.relevanceFacets;
  const strength = cfg.fieldStrength;
  const facets = {};

  const subtopicHit = req.subtopicNode ? fieldHit(prep, tx.phrasesOf(req.subtopicNode), strength) : null;
  const topicHit = req.topicNode ? fieldHit(prep, tx.phrasesOf(req.topicNode), strength) : null;
  // a subtopic match also counts as matching its topic, and any topic match implies the subject
  const topicScore = Math.max(topicHit ? topicHit.score : 0, subtopicHit ? subtopicHit.score : 0);
  const namedHit = fieldHit(prep, tx.phrasesOf(req.subjectNode), strength);
  // No topic chosen: a video on any of the subject's topics is about the subject
  // ("Trig equations | Grade 12" is maths even though it never says "maths").
  const impliedHit = !req.topicNode && namedHit.score < strength.title ? fieldHit(prep, tx.subjectVocabulary(req.subject), strength) : null;
  const subjectHit = impliedHit && impliedHit.score > namedHit.score ? { ...impliedHit, implied: true } : namedHit;

  facets.subject = { weight: w.subject, ...subjectHit, score: Math.max(subjectHit.score, topicScore) };
  if (req.topicNode) facets.topic = { weight: w.topic, ...(topicHit || {}), score: topicScore };
  if (req.subtopicNode) facets.subtopic = { weight: w.subtopic, ...subtopicHit };
  if (req.types.length) {
    let best = { score: 0, field: null, phrase: null, type: null };
    for (const id of req.types) {
      const type = tx.TYPE_MAP.get(id);
      const hit = type ? fieldHit(prep, type.keywords, strength) : { score: 0 };
      if (hit.score > best.score) best = { ...hit, type: id };
    }
    facets.type = { weight: w.type, ...best };
  }
  if (req.level) {
    const level = tx.LEVEL_MAP.get(req.level);
    facets.level = { weight: w.level, ...(level ? fieldHit(prep, level.keywords, strength) : { score: 0 }) };
  }
  if (req.queryTokens.length) {
    // TF-IDF-style coverage: words that are rare across the candidates count more.
    let got = 0;
    let total = 0;
    for (const token of req.queryTokens) {
      const idf = ctx.idf ? ctx.idf(token) : 1;
      total += idf;
      const inTitle = hasPhrase(prep.title, token);
      const inTags = !inTitle && hasPhrase(prep.tags, token);
      const inDesc = !inTitle && !inTags && hasPhrase(prep.description, token);
      got += idf * (inTitle ? strength.title : inTags ? strength.tags : inDesc ? strength.description : 0);
    }
    facets.query = { weight: w.query, score: total ? got / total : 0 };
  }

  let sum = 0;
  let weights = 0;
  for (const f of Object.values(facets)) {
    sum += f.weight * f.score;
    weights += f.weight;
  }
  return { score: weights ? (100 * sum) / weights : 0, facets, topicScore, subtopicScore: subtopicHit ? subtopicHit.score : null };
}

/** Curriculum and level fit: NSC/CAPS/grade signals up, clear signs of another system down. */
function calculateCurriculumFit(video, req, ctx, cfg) {
  if (!req.curriculum && !req.grade) return null; // not asked for: weight goes to the other parts
  const c = cfg.curriculum;
  const prep = prepare(video);
  const signals = { curriculumMatch: false, conflict: null, gradeMatch: false, wrongGrade: false, curated: false };
  let score = c.base;
  const curriculum = req.curriculum && tx.CURRICULUM_MAP.get(req.curriculum);
  if (curriculum) {
    signals.curriculumMatch = curriculum.keywords.some((k) => hasPhrase(prep.all, k));
    signals.conflict = curriculum.conflicts.find((k) => hasPhrase(prep.all, k)) || null;
    const channel = ctx.channels && ctx.channels.get(video.channel_id);
    signals.curated = Boolean(channel && channel.trust_level > 0 && (channel.curricula || []).includes(curriculum.id));
    if (signals.curriculumMatch) score += c.curriculumMatch;
    if (signals.curated) score += c.curatedForCurriculum;
    if (signals.conflict) score += c.conflict;
  }
  if (req.grade) {
    const grades = detectGrades(prep);
    signals.gradeMatch = grades.has(req.grade);
    signals.wrongGrade = grades.size > 0 && !signals.gradeMatch;
    if (signals.gradeMatch) score += c.gradeMatch;
    if (signals.wrongGrade) score += c.wrongGrade;
  }
  return { score: Math.max(0, Math.min(100, score)), signals };
}

/** Channel trust: SkillForge's curated list first; otherwise specialisation in this subject. */
function calculateChannelTrust(video, req, ctx, cfg) {
  const c = cfg.channel;
  const flag = ctx.flags && ctx.flags.get(video.provider_video_id);
  if (flag && flag.status === "verified") return { score: c.verified, level: "video_verified" };
  const channel = ctx.channels && ctx.channels.get(video.channel_id);
  if (channel && channel.trust_level > 0) {
    let score = channel.trust_level >= 3 ? c.verified : channel.trust_level === 2 ? c.trusted : c.listed;
    const subjects = channel.subjects || [];
    if (subjects.length && !subjects.includes(req.subject)) score -= 10;
    return { score, level: channel.trust_level >= 3 ? "channel_verified" : channel.trust_level === 2 ? "trusted" : "listed" };
  }
  const relevantFromChannel = (ctx.channelCounts && ctx.channelCounts.get(video.channel_id)) || 1;
  return { score: c.uncurated + Math.min(c.specialistBonusMax, 5 * (relevantFromChannel - 1)), level: "uncurated" };
}

/** Engagement: smoothed like and comment rates plus log-scaled reach, so views never dominate. */
function calculateEngagement(video, cfg) {
  const e = cfg.engagement;
  const views = video.view_count;
  if (views === null || views === undefined) return null;
  const parts = {};
  const logViews = Math.log10(views + 1);
  parts.reach = Math.max(0, Math.min(1, (logViews - e.reachLog10Floor) / (e.reachLog10Ceiling - e.reachLog10Floor))) * 100;
  let likeRate = null;
  if (video.like_count !== null && video.like_count !== undefined) {
    likeRate = (video.like_count + e.likeRatePrior * e.likeRatePriorViews) / (views + e.likeRatePriorViews);
    parts.likeRate = 100 * (1 - Math.exp(-likeRate / e.likeRateScale));
  }
  if (video.comment_count !== null && video.comment_count !== undefined) {
    const commentRate = (video.comment_count + 0.001 * e.likeRatePriorViews) / (views + e.likeRatePriorViews);
    parts.commentRate = 100 * (1 - Math.exp(-commentRate / e.commentRateScale));
  }
  let sum = 0;
  let weights = 0;
  for (const [k, v] of Object.entries(parts)) {
    sum += v * e.mix[k];
    weights += e.mix[k];
  }
  const rawLikeRate = video.like_count !== null && video.like_count !== undefined && views > 0 ? video.like_count / views : null;
  return { score: sum / weights, parts, rawLikeRate };
}

/** SkillForge learners' own votes, smoothed so a handful of votes can't swing a ranking. */
function calculateLearnerFeedback(stats, cfg) {
  const f = cfg.feedback;
  const up = (stats && stats.up) || 0;
  const down = (stats && stats.down) || 0;
  const votes = up + down;
  if (!votes) return null;
  const mean = (up + f.priorMean * f.priorVotes) / (votes + f.priorVotes);
  const weight = cfg.weights.feedback + (f.maxWeight - cfg.weights.feedback) * Math.min(1, votes / f.fullWeightAtVotes);
  return { score: 100 * mean, votes, up, weight };
}

/** Freshness barely matters for stable subjects (algebra), more for fast-moving ones (programming). */
function calculateFreshness(video, req, cfg, now) {
  if (!video.published_at) return null;
  const ageDays = Math.max(0, (now - new Date(video.published_at)) / 86400000);
  const score = 100 * Math.pow(0.5, ageDays / cfg.freshness.halfLifeDays);
  const factor = req.subjectNode && req.subjectNode.stable ? cfg.freshness.stableSubjectFactor : 1;
  return { score, factor, ageDays };
}

/** "I have 20 minutes" / length choice: a fit adjustment, or a gate in strict mode. */
function timeFit(video, req, cfg) {
  const d = video.duration_seconds;
  if (d === null || d === undefined) return { factor: 1, unknown: true };
  if (req.minutes) {
    const limit = req.minutes * 60;
    if (d > limit * cfg.gates.studyTimeTolerance) return { factor: 1, tooLong: true };
    return { factor: d < limit / 4 ? cfg.penalties.muchShorterThanStudyTime : 1, fits: true };
  }
  if (req.length) {
    const range = tx.LENGTH_MAP.get(req.length);
    const inRange = range && d >= range.min && d < range.max;
    return { factor: inRange ? 1 : cfg.penalties.outsideLengthRange, inRange: Boolean(inRange) };
  }
  return { factor: 1 };
}

/** Language is a preference: a confirmed mismatch is penalised, an unknown language is not. */
function languageFit(video, req, cfg) {
  if (!req.language) return { factor: 1 };
  const reported = String(video.default_audio_language || video.default_language || "").slice(0, 2).toLowerCase();
  if (reported) {
    return reported === req.language.slice(0, 2)
      ? { factor: 1, confirmed: true }
      : { factor: cfg.penalties.languageMismatch, mismatch: true, reported };
  }
  const lang = tx.LANGUAGE_MAP.get(req.language);
  const prep = prepare(video);
  if (lang && lang.hints.some((h) => hasPhrase(prep.all, h))) return { factor: 1, likely: true };
  // Most videos don't declare a language. For English that's neutral; for another language,
  // a learner who asked for it should see confirmed videos first.
  return { factor: req.language === "en" ? 1 : cfg.penalties.languageUnconfirmed, unknown: true };
}

/* ================================================================== gates */

const STRICT = Object.freeze({ subtopic: true, time: true, curriculum: true, types: true, topic: true });

/** Why a video must not be shown (null if it may). Applied before any ranking. */
function gateReason(video, req, parts, ctx, cfg, strict = STRICT) {
  const g = cfg.gates;
  const flag = ctx.flags && ctx.flags.get(video.provider_video_id);
  const channel = ctx.channels && ctx.channels.get(video.channel_id);
  if ((flag && flag.status === "blocked") || (channel && channel.trust_level === 0)) return "blocked";
  if (!video.embeddable) return "not_embeddable";
  if (video.privacy_status && video.privacy_status !== "public") return "not_public";
  if (video.live_broadcast_content && video.live_broadcast_content !== "none") return "live";
  const d = video.duration_seconds;
  const known = d !== null && d !== undefined;
  if (known && d < g.minDurationSeconds) return "short"; // YouTube Shorts and clips
  if (/#shorts?\b/i.test(`${video.title} ${video.description}`)) return "short";
  if (known && d > g.maxDurationSeconds) return "too_long";
  const vouched = (flag && flag.status === "verified") || (channel && channel.trust_level > 0);
  if (!vouched && video.view_count !== null && video.view_count !== undefined && video.view_count < g.minViews) return "unproven";
  const rel = parts.relevance;
  if (req.topicNode && strict.topic && rel.topicScore < 0.5) return "off_topic";
  if (req.subtopicNode && strict.subtopic && (rel.subtopicScore || 0) < 0.5) return "off_subtopic";
  if (req.types.length && strict.types && !(rel.facets.type && rel.facets.type.score > 0)) return "other_type";
  if (strict.curriculum && parts.curriculum) {
    if (parts.curriculum.signals.conflict) return "other_curriculum";
    if (parts.curriculum.signals.wrongGrade) return "other_grade";
  }
  if (strict.time && parts.time.tooLong) return "longer_than_your_time";
  if (rel.score < g.minRelevance) return "low_relevance";
  return null;
}

/* ================================================================== final score */

function calculateFinalScore(parts, cfg) {
  const w = { ...cfg.weights };
  if (parts.feedback) {
    const scale = (1 - parts.feedback.weight) / (1 - cfg.weights.feedback);
    for (const k of Object.keys(w)) if (k !== "feedback") w[k] *= scale;
    w.feedback = parts.feedback.weight;
  }
  if (parts.freshness) w.freshness *= parts.freshness.factor;
  const available = {
    relevance: parts.relevance.score,
    curriculum: parts.curriculum && parts.curriculum.score,
    channel: parts.channel.score,
    engagement: parts.engagement && parts.engagement.score,
    feedback: parts.feedback && parts.feedback.score,
    freshness: parts.freshness && parts.freshness.score,
  };
  let sum = 0;
  let total = 0;
  const used = {};
  for (const [k, v] of Object.entries(available)) {
    if (v === null || v === undefined) continue; // unavailable: its weight is shared by the others
    sum += v * w[k];
    total += w[k];
    used[k] = w[k];
  }
  let score = total ? sum / total : 0;
  score *= parts.time.factor * parts.language.factor;
  if (parts.verified) score += cfg.bonuses.verifiedVideo;
  const weightsUsed = Object.fromEntries(Object.entries(used).map(([k, v]) => [k, Math.round((100 * v) / total)]));
  return { score: Math.max(0, Math.min(100, Math.round(score))), weightsUsed };
}

/* ================================================================== explanations */

const TYPE_REASON = {
  exam: "Exam-focused",
  worked_examples: "Shows worked examples",
  concept: "Explains the concept",
  revision: "Made for quick revision",
  lesson: "A full lesson",
  tutorial: "A practical tutorial",
};

function formatMinutes(seconds) {
  const m = Math.round(seconds / 60);
  return m < 1 ? "under a minute" : `${m} min`;
}

/** Reasons come only from values that were measured for this video. Never invented. */
function explain(video, req, parts, cfg) {
  const reasons = [];
  const cautions = [];
  const rel = parts.relevance.facets;
  const strongField = (f) => f && (f.field === "title" || f.field === "tags");
  if (req.subtopicNode && rel.subtopic && rel.subtopic.score > 0) {
    reasons.push(strongField(rel.subtopic) ? `About ${req.subtopicNode.name.toLowerCase()}` : `Mentions ${req.subtopicNode.name.toLowerCase()} in its description`);
  } else if (req.topicNode && rel.topic && rel.topic.score > 0) {
    reasons.push(parts.relevance.topicScore >= 0.8 ? `Covers ${req.topicNode.name.toLowerCase()}` : `Mentions ${req.topicNode.name.toLowerCase()} in its description`);
  }
  const cur = parts.curriculum && parts.curriculum.signals;
  if (cur && cur.curriculumMatch) reasons.push(`Made for ${req.curriculum === "NSC" ? "the NSC (CAPS)" : req.curriculum}`);
  if (cur && cur.gradeMatch) reasons.push(`Aimed at Grade ${req.grade}`);
  if (rel.type && rel.type.score >= 0.8 && TYPE_REASON[rel.type.type]) reasons.push(TYPE_REASON[rel.type.type]);
  if (parts.verified) reasons.push("Checked by the SkillForge team");
  else if (parts.channel.level === "channel_verified") reasons.push("From an educator verified by SkillForge");
  else if (parts.channel.level === "trusted") reasons.push("From an educator SkillForge trusts");
  if (parts.time.fits && video.duration_seconds) reasons.push(`Fits your ${req.minutes} minutes (${formatMinutes(video.duration_seconds)})`);
  else if (parts.time.inRange) reasons.push("Matches the length you chose");
  const eng = parts.engagement;
  if (eng && eng.rawLikeRate !== null && eng.rawLikeRate >= 0.03 && video.view_count >= 1000) reasons.push("High like-to-view ratio on YouTube");
  if (parts.feedback && parts.feedback.votes >= cfg.feedback.minVotesToShow && parts.feedback.up / parts.feedback.votes >= 0.7) {
    reasons.push(`Rated useful by ${parts.feedback.up} of ${parts.feedback.votes} SkillForge learners`);
  }
  if (req.subjectNode && !req.subjectNode.stable && parts.freshness && parts.freshness.ageDays < 365) reasons.push("Published in the last year");

  if (parts.language.mismatch) cautions.push("May not be in your chosen language");
  else if (req.language && req.language !== "en" && parts.language.unknown) cautions.push("Language not confirmed");
  if (req.curriculum && cur && !cur.curriculumMatch && !cur.curated && !cur.conflict) cautions.push(`Doesn't say it follows the ${req.curriculum === "NSC" ? "NSC" : req.curriculum}`);
  if (cur && cur.conflict) cautions.push("Made for a different curriculum");
  if (cur && cur.wrongGrade) cautions.push(`Made for a different grade than Grade ${req.grade}`);
  if (parts.time.tooLong) cautions.push(`Longer than your ${req.minutes} minutes`);
  if (req.subjectNode && !req.subjectNode.stable && parts.freshness && parts.freshness.ageDays > 4 * 365) cautions.push("Older video: details may be out of date");
  if (!eng) cautions.push("YouTube statistics unavailable");
  return { reasons, cautions };
}

function confidenceOf(parts) {
  const rel = parts.relevance.score;
  const cur = parts.curriculum ? parts.curriculum.score : null;
  if (rel >= 70 && (cur === null || cur >= 65)) return "high";
  if (rel >= 50) return "moderate";
  return "low";
}

function badgesOf(video, req, parts, types) {
  const badges = [];
  const cur = parts.curriculum && parts.curriculum.signals;
  if (parts.verified) badges.push({ kind: "verified", label: "SkillForge verified" });
  if (cur && cur.curriculumMatch) badges.push({ kind: "curriculum", label: req.curriculum });
  if (cur && cur.gradeMatch) badges.push({ kind: "grade", label: `Grade ${req.grade}` });
  if (req.subtopicNode && parts.relevance.subtopicScore >= 0.8) badges.push({ kind: "topic", label: req.subtopicNode.name });
  else if (req.topicNode && parts.relevance.topicScore >= 0.8) badges.push({ kind: "topic", label: req.topicNode.name });
  const mainType = ["exam", "worked_examples", "concept", "revision", "lesson", "tutorial"].find((id) => types[id] && types[id].score >= 0.8);
  if (mainType) badges.push({ kind: "type", label: tx.TYPE_MAP.get(mainType).name });
  if (parts.time.fits) badges.push({ kind: "time", label: `Fits ${req.minutes} min` });
  return badges;
}

/* ================================================================== one video */

function scoreVideo(video, req, ctx, cfg, { now = new Date(), strict = STRICT } = {}) {
  const flag = ctx.flags && ctx.flags.get(video.provider_video_id);
  const parts = {
    relevance: calculateRelevance(video, req, ctx, cfg),
    curriculum: calculateCurriculumFit(video, req, ctx, cfg),
    channel: calculateChannelTrust(video, req, ctx, cfg),
    engagement: calculateEngagement(video, cfg),
    feedback: calculateLearnerFeedback(ctx.feedback && ctx.feedback.get(video.provider_video_id), cfg),
    freshness: calculateFreshness(video, req, cfg, now),
    time: timeFit(video, req, cfg),
    language: languageFit(video, req, cfg),
    verified: Boolean(flag && flag.status === "verified"),
  };
  const excluded = gateReason(video, req, parts, ctx, cfg, strict);
  const { score, weightsUsed } = calculateFinalScore(parts, cfg);
  const types = detectTypes(video, cfg);
  const { reasons, cautions } = explain(video, req, parts, cfg);
  return {
    video,
    excluded,
    match: score,
    confidence: confidenceOf(parts),
    reasons,
    cautions,
    badges: badgesOf(video, req, parts, types),
    types: Object.keys(types),
    breakdown: {
      relevance: Math.round(parts.relevance.score),
      curriculum: parts.curriculum ? Math.round(parts.curriculum.score) : null,
      channel: Math.round(parts.channel.score),
      engagement: parts.engagement ? Math.round(parts.engagement.score) : null,
      learner_feedback: parts.feedback ? Math.round(parts.feedback.score) : null,
      freshness: parts.freshness ? Math.round(parts.freshness.score) : null,
      weights: weightsUsed,
    },
    parts,
  };
}

module.exports = {
  STRICT, prepare, fieldHit, detectGrades, detectTypes,
  calculateRelevance, calculateCurriculumFit, calculateChannelTrust, calculateEngagement,
  calculateLearnerFeedback, calculateFreshness, timeFit, languageFit, gateReason,
  calculateFinalScore, explain, confidenceOf, scoreVideo,
};
