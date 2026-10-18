"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadVideoConfig } = require("../services/video/config");
const { buildRequest, rankPool, groupResults } = require("../services/video/ranking");
const { scoreVideo, calculateLearnerFeedback, calculateEngagement } = require("../services/video/scoring");
const { VIDEOS, CHANNELS, vid, days } = require("./videoFixtures");

const cfg = loadVideoConfig();
const NOW = new Date(Date.UTC(2026, 8, 29));
const ctx = (extra = {}) => ({
  channels: new Map(CHANNELS.map((c) => [c.provider_channel_id, c])),
  flags: new Map(), feedback: new Map(), ...extra,
});
const rank = (filters, extra, opts) => rankPool(VIDEOS, buildRequest(filters), ctx(extra), cfg, { now: NOW, ...opts });
const ids = (r) => r.items.map((s) => s.video.provider_video_id);
const TRIG_ID = { subject: "mathematics", grade: 12, curriculum: "NSC", topic: "trigonometry", subtopic: "identities" };

test("a Grade 12 NSC video beats a far more popular generic or foreign one", () => {
  const r = rank(TRIG_ID);
  const list = ids(r);
  assert.equal(list[0], vid("trigIdNSC01"));
  assert.ok(list.indexOf(vid("trigIdNSC01")) < list.indexOf(vid("trigIdGen02")), "NSC before the 800k-view generic video");
  assert.ok(!list.includes(vid("trigCbse003")), "10M-view CBSE/JEE video is gated out for an NSC request");
});

test("gates: Shorts, non-embeddable, unproven uncurated and wrong-grade videos never appear", () => {
  const all = scoreAll(TRIG_ID);
  assert.equal(all.get(vid("trigShort05")), "short");
  assert.equal(all.get(vid("trigNoEmb06")), "not_embeddable");
  assert.equal(all.get(vid("trigLowV014")), "unproven");
  assert.equal(all.get(vid("trigCbse003")), "other_curriculum");
});

function scoreAll(filters) {
  const req = buildRequest(filters);
  const c = ctx({ idf: () => 1 });
  return new Map(VIDEOS.map((v) => [v.provider_video_id, scoreVideo(v, req, c, cfg, { now: NOW }).excluded]));
}

test("wrong grade is excluded while grade 12 videos are enough", () => {
  const r = rank({ subject: "mathematics", grade: 12, curriculum: "NSC", topic: "trigonometry" });
  assert.ok(!ids(r).includes(vid("trigGr10_08")));
  assert.deepEqual(r.relaxed, []);
});

test("hidden likes are 'unavailable', not zero, and weights still add up", () => {
  const req = buildRequest(TRIG_ID);
  const hidden = VIDEOS.find((v) => v.provider_video_id === vid("trigHidden7"));
  const s = scoreVideo(hidden, req, ctx({ idf: () => 1 }), cfg, { now: NOW });
  assert.equal(s.excluded, null);
  assert.ok(s.breakdown.engagement > 0, "reach still counts");
  assert.equal(s.parts.engagement.parts.likeRate, undefined);
  const noViews = scoreVideo({ ...hidden, view_count: null }, req, ctx({ idf: () => 1 }), cfg, { now: NOW });
  assert.equal(noViews.breakdown.engagement, null);
  const sum = Object.values(noViews.breakdown.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) <= 2, `weights ${sum}`);
  assert.ok(noViews.cautions.includes("YouTube statistics unavailable"));
});

test("one channel can't flood the first page when other channels have good videos", () => {
  const { ch } = require("./videoFixtures");
  const base = VIDEOS.find((v) => v.provider_video_id === vid("trigIdNSC01"));
  const pool = [];
  for (let i = 0; i < 6; i++) pool.push({ ...base, provider_video_id: vid(`floodA${i}`), title: `${base.title} part ${i}` });
  for (let i = 0; i < 10; i++) pool.push({ ...base, provider_video_id: vid(`otherB${i}`), channel_id: ch(`other${i}`), channel_title: `Other ${i}`, view_count: 20000, like_count: 500 });
  const r = rankPool(pool, buildRequest(TRIG_ID), ctx(), cfg, { now: NOW });
  const top = r.items.slice(0, cfg.diversity.window).map((s) => s.video.channel_id);
  assert.equal(top.filter((c) => c === base.channel_id).length, cfg.diversity.maxPerChannel);
  assert.equal(r.items.length, 16, "the capped videos move down; they are not thrown away");
});

test("when alternatives run out, the extra videos follow instead of disappearing", () => {
  const r = rank({ subject: "mathematics", grade: 12, curriculum: "NSC", topic: "trigonometry" });
  const firstRepeat = r.items.findIndex((s, i) => r.items.slice(0, i).filter((x) => x.video.channel_id === s.video.channel_id).length >= cfg.diversity.maxPerChannel);
  const later = r.items.slice(firstRepeat);
  const capped = new Set(r.items.slice(0, firstRepeat).map((s) => s.video.channel_id));
  assert.ok(later.every((s) => capped.has(s.video.channel_id)), "a capped channel only gets more slots once no other channel is waiting");
});

test("'I have 20 minutes' keeps videos that fit, and says so", () => {
  const r = rank({ ...TRIG_ID, subtopic: undefined, minutes: 20 });
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every((s) => s.video.duration_seconds <= 20 * 60 * cfg.gates.studyTimeTolerance));
  assert.ok(r.items.some((s) => s.reasons.some((x) => /^Fits your 20 minutes/.test(x))));
  assert.ok(!ids(r).includes(vid("trigLesn010")));
});

test("filters relax one at a time, and each relaxation is announced", () => {
  const r = rank({ subject: "mathematics", grade: 12, curriculum: "NSC", topic: "trigonometry", subtopic: "compound-angles" });
  assert.ok(r.items.length > 0);
  assert.equal(r.relaxed[0].id, "subtopic");
  assert.match(r.relaxed[0].message, /compound and double angles.*other trigonometry videos/i);
});

test("learner feedback is smoothed and its weight grows with votes", () => {
  const one = calculateLearnerFeedback({ up: 1, down: 0 }, cfg);
  assert.ok(one.score < 80 && one.score > 70, `one vote: ${one.score}`);
  assert.ok(one.weight < 0.06);
  const many = calculateLearnerFeedback({ up: 30, down: 0 }, cfg);
  assert.ok(many.score > 90);
  assert.equal(many.weight, cfg.feedback.maxWeight);
  assert.equal(calculateLearnerFeedback({ up: 0, down: 0 }, cfg), null);
});

test("popularity can't win on a lucky like rate from a handful of views", () => {
  const tiny = calculateEngagement({ view_count: 50, like_count: 10, comment_count: 5 }, cfg);
  const solid = calculateEngagement({ view_count: 100000, like_count: 4000, comment_count: 300 }, cfg);
  assert.ok(solid.score > tiny.score);
});

test("freshness matters for programming, barely for stable maths", () => {
  const r = rank({ subject: "programming", level: "beginner", topic: "python", subtopic: "apis" });
  const list = ids(r);
  assert.ok(list.indexOf(vid("pyApiNew18")) < list.indexOf(vid("pyApiOld19")));
  const newer = r.items.find((s) => s.video.provider_video_id === vid("pyApiNew18"));
  const older = r.items.find((s) => s.video.provider_video_id === vid("pyApiOld19"));
  assert.ok(newer.match - older.match >= 2);
  assert.ok(older.cautions.includes("Older video: details may be out of date"));
});

test("language is a preference: a confirmed match ranks first", () => {
  const r = rank({ subject: "mathematics", grade: 12, topic: "trigonometry", subtopic: "identities", language: "af" });
  assert.equal(ids(r)[0], vid("trigAfr0015"));
  const english = r.items.find((s) => s.video.provider_video_id === vid("trigIdNSC01"));
  assert.ok(english.cautions.includes("Language not confirmed"));
  // asking for English changes nothing for videos that don't declare a language
  const en = rank({ subject: "mathematics", grade: 12, topic: "trigonometry", subtopic: "identities", language: "en" });
  assert.equal(ids(en)[0], vid("trigIdNSC01"));
});

test("reasons are only claimed when the data supports them", () => {
  const r = rank(TRIG_ID);
  const nsc = r.items.find((s) => s.video.provider_video_id === vid("trigIdNSC01"));
  assert.ok(nsc.reasons.includes("Made for the NSC (CAPS)"));
  assert.ok(nsc.reasons.includes("Aimed at Grade 12"));
  assert.ok(nsc.reasons.includes("From an educator ScientiaForge trusts"));
  const generic = r.items.find((s) => s.video.provider_video_id === vid("trigIdGen02"));
  if (generic) {
    assert.ok(!generic.reasons.some((x) => /NSC|Grade 12|trusts/.test(x)), generic.reasons.join("; "));
    assert.ok(generic.cautions.includes("Doesn't say it follows the NSC"));
  }
  assert.equal(nsc.confidence, "high");
});

test("verified videos get the badge and a small boost; blocked ones vanish", () => {
  const flags = new Map([[vid("trigIdGen02"), { status: "verified" }], [vid("trigIdNSC01"), { status: "blocked" }]]);
  const r = rank(TRIG_ID, { flags });
  assert.ok(!ids(r).includes(vid("trigIdNSC01")));
  const verified = r.items.find((s) => s.video.provider_video_id === vid("trigIdGen02"));
  assert.ok(verified.badges.some((b) => b.kind === "verified"));
  assert.ok(verified.reasons.includes("Checked by the ScientiaForge team"));
});

test("groups: top matches first, no video repeated across groups", () => {
  const r = rank({ subject: "mathematics", grade: 12, curriculum: "NSC", topic: "trigonometry" });
  const groups = groupResults(r.items, cfg);
  assert.equal(groups[0].id, "top");
  const seen = groups.flatMap((g) => g.items.map((s) => s.video.provider_video_id));
  assert.equal(new Set(seen).size, seen.length);
});

test("other sort orders still respect the gates", () => {
  const r = rank({ subject: "mathematics", grade: 12, curriculum: "NSC", topic: "trigonometry" }, {}, { sort: "views" });
  assert.ok(!ids(r).includes(vid("trigCbse003")), "most-viewed never brings back a gated video");
  const views = r.items.map((s) => s.video.view_count || 0);
  assert.deepEqual(views, [...views].sort((a, b) => b - a));
});

test("bad filters are rejected with a plain message", () => {
  assert.throws(() => buildRequest({}), /Choose a subject/);
  assert.throws(() => buildRequest({ subject: "mathematics", topic: "photosynthesis" }), /isn't part of this subject/);
  assert.throws(() => buildRequest({ subject: "mathematics", grade: 13 }), /Grade must be/);
  const r = buildRequest({ subject: "programming", grade: 12, curriculum: "NSC", level: "beginner" });
  assert.equal(r.grade, null, "grades don't apply to non-school subjects");
  assert.equal(r.level, "beginner");
});

test("subject with no topic: a video on any of the subject's topics counts, a vague word doesn't", () => {
  const list = ids(rank({ subject: "mathematics", grade: 12, curriculum: "NSC" }));
  assert.ok(list.includes(vid("trigEqNSC04")), "'Trig Equations' is maths even without the word 'maths'");
  assert.ok(list.includes(vid("calcRules16")), "so is calculus");
  assert.ok(!list.includes(vid("lsMeiosi20")) && !list.includes(vid("pyApiNew18")), "other subjects stay out");
  // the vague-word guard: 'power' is in maths vocabulary only as a vague word, so Power BI isn't maths
  const powerBi = { ...VIDEOS.find((v) => v.provider_video_id === vid("pyApiNew18")), provider_video_id: vid("powerBI0099"), title: "Power BI dashboards for beginners", tags: [], description: "" };
  const excluded = scoreVideo(powerBi, buildRequest({ subject: "mathematics" }), ctx({ idf: () => 1 }), cfg, { now: NOW }).excluded;
  assert.equal(excluded, "low_relevance");
});
