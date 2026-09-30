"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadVideoConfig } = require("../services/video/config");
const { createYouTubeProvider } = require("../services/video/youtubeProvider");
const { createVideoDiscovery } = require("../services/video/discovery");
const { createMemoryVideoRepo } = require("./fakeVideoRepo");
const { createFakeYouTube } = require("./fakeYouTube");
const { CHANNELS, VIDEOS, vid } = require("./videoFixtures");

const NOW = new Date(Date.UTC(2026, 8, 29));
const quiet = { warn() {}, error() {} };

function setup({ provider = true, clock = () => NOW, config } = {}) {
  const cfg = config || loadVideoConfig();
  const repo = createMemoryVideoRepo({ channels: CHANNELS, now: clock });
  const yt = createFakeYouTube();
  const p = provider
    ? createYouTubeProvider({ apiKey: yt.apiKey, fetch: yt.fetch, now: clock, config: cfg, quota: { charge: (c) => repo.chargeQuota(c, cfg.quota) } })
    : null;
  const d = createVideoDiscovery({ repo, provider: p, config: cfg, now: clock, log: quiet });
  return { d, repo, yt, cfg };
}

const TRIG = { subject: "mathematics", grade: 12, curriculum: "NSC", topic: "trigonometry", subtopic: "identities" };

test("first search goes live; the same search again is served from cache (no quota)", async () => {
  const { d, yt, repo } = setup();
  const first = await d.search(TRIG);
  assert.equal(first.source, "live");
  assert.ok(first.results.length > 0);
  assert.equal(yt.count("search"), 1);
  const units = repo.db.usage.units;
  const second = await d.search({ ...TRIG, sort: "newest" });
  assert.equal(second.source, "cache");
  assert.equal(yt.count("search"), 1, "no second search call");
  assert.equal(repo.db.usage.units, units, "no quota spent on a cached search");
  assert.ok(first.results.every((r) => r.youtube_stats && r.url.startsWith("https://www.youtube.com/watch?v=") && r.embed_url.startsWith("https://www.youtube-nocookie.com/embed/")));
});

test("the top result is the NSC video, with honest reasons and a breakdown", async () => {
  const { d } = setup();
  const r = await d.search(TRIG);
  const top = r.results[0];
  assert.equal(top.id, vid("trigIdNSC01"));
  assert.ok(top.match >= 80 && top.match <= 100);
  assert.ok(top.reasons.includes("Made for the NSC (CAPS)"));
  assert.equal(typeof top.breakdown.relevance, "number");
  assert.ok(!r.results.some((x) => x.id === vid("trigCbse003")));
});

test("when the daily budget is used up, the library still answers and says so", async () => {
  const cfg = loadVideoConfig({ overrides: { quota: { maxSearchCallsPerDay: 0 } } });
  const { d, yt, repo } = setup({ config: cfg });
  await repo.upsertVideos(VIDEOS.filter((v) => CHANNELS.some((c) => c.provider_channel_id === v.channel_id)));
  const r = await d.search(TRIG);
  assert.equal(yt.count("search"), 0);
  assert.equal(r.source, "library");
  assert.ok(r.notices.some((n) => n.kind === "quota" && /today's limit/.test(n.message)));
  assert.ok(r.results.length > 0, "curated channels' synced videos still show");
});

test("YouTube down: a plain notice, no technical details", async () => {
  const { d, yt } = setup();
  yt.state.down = true;
  const r = await d.search(TRIG);
  assert.ok(r.notices.some((n) => n.kind === "unavailable" && !/ENOTFOUND|googleapis|key/i.test(n.message)));
});

test("free text: a confident topic is applied and reported; no_detect turns it off", async () => {
  const { d } = setup();
  const r = await d.search({ subject: "mathematics", grade: 12, q: "how do I solve sin x equations" });
  assert.deepEqual([r.detected.topic, r.detected.subtopic], ["trigonometry", "equations"]);
  assert.equal(r.request.subtopic, "equations");
  assert.equal(r.results[0].id, vid("trigEqNSC04"));
  const off = await d.search({ subject: "mathematics", grade: 12, q: "how do I solve sin x equations", no_detect: true });
  assert.equal(off.detected, null);
  assert.equal(off.request.topic, null);
});

test("free text with no subject: the subject is worked out too, and marked as detected", async () => {
  const { d } = setup();
  const r = await d.search({ grade: 12, curriculum: "NSC", q: "how do I solve sin x equations" });
  assert.equal(r.detected.subject, "mathematics");
  assert.equal(r.detected.subject_name, "Mathematics");
  assert.equal(r.detected.subject_detected, true);
  assert.deepEqual([r.request.subject, r.request.topic, r.request.subtopic, r.request.grade], ["mathematics", "trigonometry", "equations", 12]);
  assert.equal(r.results[0].id, vid("trigEqNSC04"));
  // a chosen subject is never overridden, and says it wasn't detected
  const chosen = await d.search({ subject: "mathematics", q: "sin x equations" });
  assert.equal(chosen.detected.subject_detected, false);
});

test("free text with no subject that we can't place asks for a subject, in plain words", async () => {
  const { d, yt } = setup();
  await assert.rejects(d.search({ q: "hello there" }), (e) => e.status === 400 && /couldn't tell which subject/.test(e.message));
  await assert.rejects(d.search({ q: "graph" }), (e) => e.status === 400, "a vague word alone never picks a subject");
  await assert.rejects(d.search({ q: "photosynthesis", no_detect: true }), (e) => e.status === 400);
  await assert.rejects(d.search({}), (e) => e.status === 400 && /Choose a subject, or type what you want to learn/.test(e.message));
  assert.equal(yt.count("search"), 0, "no quota spent on a request we couldn't place");
});

test("changing video type, study time or sort re-ranks the cache: no new YouTube search", async () => {
  const { d, yt } = setup();
  await d.search(TRIG);
  const units = yt.calls.length;
  const exam = await d.search({ ...TRIG, types: "exam", minutes: 20, sort: "shortest", length: "10_20" });
  assert.equal(exam.source, "cache");
  assert.equal(yt.count("search"), 1);
  assert.equal(yt.calls.length, units, "not even a metadata call");
  const other = await d.search({ ...TRIG, topic: "calculus", subtopic: undefined });
  assert.equal(other.source, "live", "a different topic is a different question");
  assert.equal(yt.count("search"), 2);
});

test("stale cached metadata is refreshed from YouTube; older than 30 days is never used", async () => {
  let clock = NOW;
  const { d, repo, yt } = setup({ clock: () => clock });
  await d.search(TRIG);
  const before = yt.count("videos");
  clock = new Date(NOW.getTime() + 26 * 86400000); // past refreshAfterDays (25)
  await d.search({ ...TRIG, sort: "views" });
  assert.ok(yt.count("videos") > before, "refreshed");
  const row = repo.db.videos.get(vid("trigIdNSC01"));
  assert.equal(new Date(row.fetched_at).getTime(), clock.getTime());
});

test("save, list saved (grouped), unsave", async () => {
  const { d } = setup();
  await d.search(TRIG);
  await d.save("u1", vid("trigIdNSC01"), { subject: "mathematics", topic: "trigonometry", grade: 12 });
  await d.save("u1", vid("lsMeiosi20"), { subject: "life-sciences", topic: "meiosis" });
  const saved = await d.listSaved("u1");
  assert.equal(saved.total, 2);
  assert.deepEqual(saved.groups.map((g) => `${g.subject} / ${g.topic}`).sort(), ["Life Sciences / Meiosis", "Mathematics / Trigonometry"]);
  const again = await d.search({ ...TRIG, sort: "newest" }, { userId: "u1" });
  assert.equal(again.results.find((x) => x.id === vid("trigIdNSC01")).saved, true);
  await d.unsave("u1", vid("trigIdNSC01"));
  assert.equal((await d.listSaved("u1")).total, 1);
  await assert.rejects(d.save("u1", "not-an-id"), /Video not found/);
});

test("feedback: reasons must match the answer; votes reach the ranking", async () => {
  const { d, repo } = setup();
  await assert.rejects(d.feedback("u1", vid("trigIdGen02"), { useful: true, reason: "too_long" }), /doesn't match/);
  await assert.rejects(d.feedback("u1", vid("trigIdGen02"), {}), /useful/);
  for (let i = 0; i < 12; i++) await d.feedback(`learner${i}`, vid("trigIdGen02"), { useful: true, reason: "clear" });
  const stats = await repo.feedbackStats([vid("trigIdGen02")]);
  assert.deepEqual(stats.get(vid("trigIdGen02")), { up: 12, down: 0 });
  const r = await d.search({ subject: "mathematics", topic: "trigonometry", subtopic: "identities" });
  const gen = r.results.find((x) => x.id === vid("trigIdGen02"));
  assert.ok(gen.reasons.includes("Rated useful by 12 of 12 SkillForge learners"));
  assert.ok(gen.breakdown.learner_feedback > 80);
});

test("history, clear one, clear all; continue learning uses no search quota", async () => {
  const { d, yt } = setup();
  await d.search(TRIG);
  await d.watched("u1", vid("trigIdNSC01"), { subject: "mathematics", topic: "trigonometry", subtopic: "identities", grade: 12 });
  const searches = yt.count("search");
  const c = await d.continueLearning("u1");
  assert.deepEqual(c.continue.label, ["Grade 12", "Mathematics", "Trigonometry", "Trigonometric identities"]);
  assert.ok(c.continue.next.length > 0);
  assert.ok(!c.continue.next.some((x) => x.id === vid("trigIdNSC01")), "doesn't suggest what they already watched");
  assert.equal(yt.count("search"), searches, "no search quota spent on the page load");
  await d.watched("u1", vid("trigEqNSC04"), { subject: "mathematics" });
  assert.equal((await d.history("u1")).items.length, 2);
  await d.clearHistory("u1", vid("trigEqNSC04"));
  assert.equal((await d.history("u1")).items.length, 1);
  await d.clearHistory("u1");
  assert.equal((await d.history("u1")).items.length, 0);
  assert.equal((await d.continueLearning("u1")).continue, null);
});

test("syncing curated channels fills the library cheaply", async () => {
  const { d, repo, yt } = setup();
  const report = await d.syncChannels();
  assert.equal(report.length, CHANNELS.length);
  assert.ok(report.every((r) => !r.error), JSON.stringify(report));
  assert.equal(yt.count("search"), 0, "sync never uses the expensive search");
  assert.ok(repo.db.usage.units < 20);
  const curatedVideos = VIDEOS.filter((v) => CHANNELS.some((c) => c.provider_channel_id === v.channel_id)).length;
  assert.equal(repo.db.videos.size, curatedVideos);
});

test("the 30-day rule: referenced videos are refreshed, the rest purged", async () => {
  let clock = NOW;
  const { d, repo } = setup({ clock: () => clock });
  await d.search(TRIG);
  await d.save("u1", vid("trigIdGen02"), { subject: "mathematics" });
  clock = new Date(NOW.getTime() + 27 * 86400000);
  const r = await d.refreshAndPurge();
  assert.ok(r.refreshed >= 1);
  clock = new Date(NOW.getTime() + 31 * 86400000);
  await d.refreshAndPurge();
  assert.ok(repo.db.videos.has(vid("trigIdGen02")), "saved video kept fresh");
  assert.ok(!repo.db.videos.has(vid("trigGraph22")), "unreferenced, uncurated video purged");
});

test("bad requests get plain messages", async () => {
  const { d } = setup();
  await assert.rejects(d.search({}), (e) => e.status === 400 && /Choose a subject/.test(e.message));
  await assert.rejects(d.search({ subject: "mathematics", types: "dance" }), (e) => e.status === 400);
});

test("no API key: the library answers without errors", async () => {
  const { d, repo } = setup({ provider: false });
  await repo.upsertVideos(VIDEOS.filter((v) => CHANNELS.some((c) => c.provider_channel_id === v.channel_id)));
  const r = await d.search(TRIG);
  assert.equal(r.source, "library");
  assert.ok(r.results.length > 0);
  assert.equal((await d.status()).live_search, false);
});
