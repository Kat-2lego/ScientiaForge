/**
 * Video Discovery settings. Every weight, gate and limit lives here so the
 * ranking can be tuned without touching the algorithm.
 *
 * Override any value with a JSON file: VIDEO_CONFIG_FILE=./video.config.json
 * (only the keys you want to change, e.g. {"weights": {"freshness": 0.03}}).
 */
"use strict";

const fs = require("node:fs");

const DEFAULTS = {
  // SkillForge Match = weighted average of the components that are available for a video.
  weights: {
    relevance: 0.35,
    curriculum: 0.2,
    channel: 0.2,
    engagement: 0.15,
    feedback: 0.05, // grows toward feedback.maxWeight as learner votes arrive
    freshness: 0.05,
  },
  // How much each part of the request counts inside the relevance score.
  relevanceFacets: { subtopic: 30, topic: 25, subject: 12, type: 15, query: 25, level: 8 },
  // Where a match is found matters: title beats tags beats description.
  fieldStrength: { title: 1, tags: 0.8, description: 0.5 },
  gates: {
    minRelevance: 35,          // below this a video never reaches the learner
    minViews: 300,             // uncurated videos below this are too unproven (curated/verified exempt)
    minDurationSeconds: 60,    // Shorts are out
    maxDurationSeconds: 4 * 3600,
    studyTimeTolerance: 1.1,   // "I have 20 minutes" allows up to 22
  },
  engagement: {
    likeRatePrior: 0.02,       // smoothing: a 50-view video can't win on a lucky like rate
    likeRatePriorViews: 2000,
    likeRateScale: 0.02,
    commentRateScale: 0.002,
    reachLog10Floor: 3,        // 1 000 views
    reachLog10Ceiling: 6.5,    // ~3 million views
    mix: { likeRate: 0.55, reach: 0.25, commentRate: 0.2 },
  },
  feedback: { maxWeight: 0.15, fullWeightAtVotes: 30, priorMean: 0.7, priorVotes: 8, minVotesToShow: 5 },
  freshness: { halfLifeDays: 1095, stableSubjectFactor: 0.2 },
  channel: { verified: 100, trusted: 85, listed: 70, uncurated: 45, specialistBonusMax: 15 },
  curriculum: { base: 50, curriculumMatch: 25, gradeMatch: 15, curatedForCurriculum: 10, conflict: -40, wrongGrade: -30 },
  bonuses: { verifiedVideo: 5 },
  // languageUnconfirmed only applies when a non-English language was asked for and nothing
  // (YouTube's language field or words like "graad", "wiskunde") shows the video is in it
  penalties: { languageMismatch: 0.5, languageUnconfirmed: 0.7, outsideLengthRange: 0.75, muchShorterThanStudyTime: 0.95 },
  diversity: { maxPerChannel: 2, window: 10 },
  results: { pageSize: 12, maxPageSize: 30, minToShow: 6, topMatches: 6, groupSize: 6, maxCuratedCandidates: 400 },
  cache: { searchTtlHours: 72, refreshAfterDays: 25, maxAgeDays: 30 },
  quota: { maxSearchCallsPerDay: 90, maxUnitsPerDay: 9000, searchUnits: 100, readUnits: 1 },
  // 50 is the most search.list returns; it costs the same 100 units as 5, and a bigger pool
  // gives the local ranking more to choose from
  youtube: { regionCode: "ZA", safeSearch: "strict", maxResults: 50 },
};

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = isObject(v) && isObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function validateConfig(cfg) {
  const total = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 0.001) throw new Error(`video config: weights must add up to 1 (they add up to ${total.toFixed(3)})`);
  for (const [k, v] of Object.entries(cfg.weights)) {
    if (!(v >= 0)) throw new Error(`video config: weight ${k} must be 0 or more`);
  }
  if (cfg.cache.maxAgeDays > 30) throw new Error("video config: YouTube data may not be kept longer than 30 days");
  if (cfg.cache.refreshAfterDays >= cfg.cache.maxAgeDays) throw new Error("video config: refreshAfterDays must be below maxAgeDays");
  return cfg;
}

function loadVideoConfig({ overrides, file = process.env.VIDEO_CONFIG_FILE } = {}) {
  let cfg = deepMerge(DEFAULTS, {});
  if (file) cfg = deepMerge(cfg, JSON.parse(fs.readFileSync(file, "utf8")));
  if (overrides) cfg = deepMerge(cfg, overrides);
  return validateConfig(cfg);
}

module.exports = { DEFAULTS, loadVideoConfig, validateConfig, deepMerge };
