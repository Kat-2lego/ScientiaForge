"use strict";
/* The real data layer (videoRepo + supabase-js) against a fake PostgREST whose tables come
   from the migration itself: catches column typos, wrong on_conflict keys and shape mistakes. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { loadVideoConfig } = require("../services/video/config");
const { createVideoRepo } = require("../services/video/videoRepo");
const { createYouTubeProvider } = require("../services/video/youtubeProvider");
const { createVideoDiscovery } = require("../services/video/discovery");
const { createFakeVideoPostgrest } = require("./fakePostgrestVideo");
const { createFakeYouTube } = require("./fakeYouTube");
const { CHANNELS, vid } = require("./videoFixtures");

const NOW = new Date(Date.UTC(2026, 8, 29, 12));
const U1 = "11111111-1111-4111-8111-111111111111";

async function setup(clock = () => NOW) {
  const pg = createFakeVideoPostgrest({ now: clock });
  const url = await pg.listen();
  const supabase = createClient(url, "service-role-test-key", { auth: { persistSession: false, autoRefreshToken: false } });
  const cfg = loadVideoConfig();
  const repo = createVideoRepo(supabase, { now: clock });
  for (const c of CHANNELS) await repo.upsertChannel({ provider: "youtube", provider_channel_id: c.provider_channel_id, handle: c.handle, trust_level: c.trust_level, subjects: c.subjects, curricula: c.curricula });
  const yt = createFakeYouTube();
  const provider = createYouTubeProvider({ apiKey: yt.apiKey, fetch: yt.fetch, now: clock, config: cfg, quota: { charge: (c) => repo.chargeQuota(c, cfg.quota) } });
  const d = createVideoDiscovery({ repo, provider, config: cfg, now: clock, log: { warn() {}, error() {} } });
  return { pg, repo, d, yt };
}

const TRIG = { subject: "mathematics", grade: 12, curriculum: "NSC", topic: "trigonometry", subtopic: "identities" };

test("full flow through supabase-js: search, cache, save, feedback, history, continue", async (t) => {
  const { pg, d, yt } = await setup();
  t.after(pg.close);
  const first = await d.search(TRIG);
  assert.equal(first.source, "live");
  assert.equal(first.results[0].id, vid("trigIdNSC01"));
  assert.equal(pg.data.vd_search_cache.length, 1);
  assert.ok(pg.data.vd_videos.length > 5);
  assert.equal(pg.data.vd_api_usage[0].search_calls, 1);
  assert.ok(pg.data.vd_api_usage[0].units >= 101);

  const again = await d.search({ ...TRIG, sort: "shortest" });
  assert.equal(again.source, "cache");
  assert.equal(yt.count("search"), 1);

  await d.save(U1, vid("trigIdNSC01"), { subject: "mathematics", topic: "trigonometry", grade: 12, collection: "Paper 2 prep" });
  await d.save(U1, vid("trigIdNSC01"), { subject: "mathematics", topic: "trigonometry", grade: 12, collection: "Renamed" });
  assert.equal(pg.data.vd_saved.length, 1, "saving twice updates, doesn't duplicate");
  assert.equal(pg.data.vd_saved[0].collection, "Renamed");
  const saved = await d.listSaved(U1);
  assert.equal(saved.total, 1);
  assert.equal(saved.groups[0].topic, "Trigonometry");

  await d.feedback(U1, vid("trigIdNSC01"), { useful: false, reason: "too_long" });
  await d.feedback(U1, vid("trigIdNSC01"), { useful: true, reason: "exam_prep" });
  assert.equal(pg.data.vd_feedback.length, 1, "one vote per learner per video");
  const mine = await d.search({ ...TRIG, sort: "newest" }, { userId: U1 });
  const row = mine.results.find((x) => x.id === vid("trigIdNSC01"));
  assert.deepEqual([row.saved, row.my_feedback], [true, { useful: true, reason: "exam_prep" }]);

  await d.watched(U1, vid("trigIdNSC01"), { subject: "mathematics", topic: "trigonometry", subtopic: "identities", grade: 12 });
  const cont = await d.continueLearning(U1);
  assert.ok(cont.continue.next.length > 0);
  await d.clearHistory(U1, vid("trigIdNSC01"));
  assert.equal(pg.data.vd_history.length, 0);
  await d.unsave(U1, vid("trigIdNSC01"));
  assert.equal(pg.data.vd_saved.length, 0);

  const status = await d.status();
  assert.equal(status.quota.search_calls, 1);
});

test("admin paths: sync channels, flags, 30-day refresh and purge", async (t) => {
  let clock = NOW;
  const { pg, d, repo } = await setup(() => clock);
  t.after(pg.close);
  const report = await d.syncChannels();
  assert.ok(report.every((r) => !r.error), JSON.stringify(report));
  assert.ok(pg.data.vd_channels.every((c) => c.uploads_playlist_id && c.last_synced_at));
  await repo.setFlag({ provider_video_id: vid("trigIdGen02"), status: "verified", subject: "mathematics", topic: "trigonometry" });
  await repo.setFlag({ provider_video_id: vid("trigIdGen02"), status: "verified", subject: "mathematics", note: "checked" });
  assert.equal(pg.data.vd_video_flags.length, 1);
  const r = await d.search(TRIG);
  assert.ok(r.results.find((x) => x.id === vid("trigIdGen02")).badges.some((b) => b.kind === "verified"));
  await repo.removeFlag(vid("trigIdGen02"));
  assert.equal(pg.data.vd_video_flags.length, 0);

  clock = new Date(NOW.getTime() + 26 * 86400000);
  const refreshed = await d.refreshAndPurge();
  assert.ok(refreshed.refreshed > 0, "curated channels' videos are kept fresh");
  assert.ok(refreshed.purged && typeof refreshed.purged.videos === "number");
});

test("the database rejects what the schema rejects", async (t) => {
  const { pg, repo } = await setup();
  t.after(pg.close);
  await assert.rejects(repo.upsertVideos([{ provider_video_id: "bad", channel_id: "UCx", title: "x" }]), /check constraint/);
  await assert.rejects(repo.upsertFeedback({ user_id: U1, provider_video_id: vid("trigIdNSC01"), useful: true, reason: "because" }), /check constraint/);
  await assert.rejects(repo.saveVideo({ user_id: U1, provider_video_id: vid("trigIdNSC01"), colection: "typo" }), /colection/);
});
