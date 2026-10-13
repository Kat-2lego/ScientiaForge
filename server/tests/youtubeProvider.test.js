"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createYouTubeProvider, parseDuration, QuotaExceededError } = require("../services/video/youtubeProvider");
const { createFakeYouTube } = require("./fakeYouTube");
const { VIDEOS, CHANNELS, vid } = require("./videoFixtures");

function setup({ allow = () => true } = {}) {
  const yt = createFakeYouTube();
  const charges = [];
  const provider = createYouTubeProvider({
    apiKey: yt.apiKey, fetch: yt.fetch,
    quota: { charge: async (c) => { charges.push(c); return allow(c); } },
  });
  return { yt, provider, charges };
}

test("ISO 8601 durations", () => {
  assert.equal(parseDuration("PT24M"), 1440);
  assert.equal(parseDuration("PT1H2M3S"), 3723);
  assert.equal(parseDuration("PT45S"), 45);
  assert.equal(parseDuration("P1DT1H"), 90000);
  assert.equal(parseDuration("P0D"), 0);
  assert.equal(parseDuration("garbage"), null);
});

test("search asks only for safe, embeddable videos in South Africa and charges 100 units", async () => {
  const { yt, provider, charges } = setup();
  const ids = await provider.search({ q: "grade 12 trigonometric identities", relevanceLanguage: "en", videoDuration: "medium" });
  assert.ok(ids.length > 0 && ids.every((id) => /^[A-Za-z0-9_-]{11}$/.test(id)));
  const p = yt.calls[0].params;
  assert.equal(yt.calls[0].resource, "search");
  assert.deepEqual(
    { type: p.type, videoEmbeddable: p.videoEmbeddable, safeSearch: p.safeSearch, regionCode: p.regionCode, relevanceLanguage: p.relevanceLanguage, videoDuration: p.videoDuration },
    { type: "video", videoEmbeddable: "true", safeSearch: "strict", regionCode: "ZA", relevanceLanguage: "en", videoDuration: "medium" }
  );
  assert.deepEqual(charges[0], { searchCalls: 1, units: 100 });
  assert.ok(!ids.includes(vid("trigNoEmb06")), "not embeddable never comes back");
});

test("videos.list: batches of 50 at 1 unit each; hidden likes stay null", async () => {
  const { yt, provider, charges } = setup();
  const many = [...VIDEOS.map((v) => v.provider_video_id), ...Array.from({ length: 80 }, (_, i) => vid(`missing${i}`))];
  const got = await provider.getVideos(many);
  assert.equal(yt.count("videos"), Math.ceil(many.length / 50));
  assert.ok(charges.every((c) => c.units === 1 && !c.searchCalls));
  const hidden = got.find((v) => v.provider_video_id === vid("trigHidden7"));
  assert.equal(hidden.like_count, null);
  assert.equal(hidden.comment_count, null);
  assert.equal(hidden.view_count, 30000);
  const nsc = got.find((v) => v.provider_video_id === vid("trigIdNSC01"));
  assert.equal(nsc.duration_seconds, 1440);
  assert.equal(nsc.thumbnail_url, `https://i.ytimg.com/vi/${vid("trigIdNSC01")}/mqdefault.jpg`);
  assert.equal(got.find((v) => v.provider_video_id === vid("trigAfr0015")).default_audio_language, "af");
});

test("our own budget stops a call before it is made", async () => {
  const { yt, provider } = setup({ allow: () => false });
  await assert.rejects(provider.search({ q: "trig" }), QuotaExceededError);
  assert.equal(yt.calls.length, 0);
});

test("YouTube's quotaExceeded becomes a QuotaExceededError; errors never contain the key", async () => {
  const { yt, provider } = setup();
  yt.state.quotaExceeded = true;
  await assert.rejects(provider.search({ q: "trig" }), (err) => err instanceof QuotaExceededError && !err.message.includes(yt.apiKey));
  yt.state.quotaExceeded = false;
  yt.state.down = true;
  await assert.rejects(provider.getVideos([vid("trigIdNSC01")]), (err) => err.code === "unavailable" && !err.message.includes(yt.apiKey));
  const bad = createYouTubeProvider({ apiKey: "wrong-key", fetch: yt.fetch, quota: { charge: async () => true } });
  yt.state.down = false;
  await assert.rejects(bad.search({ q: "trig" }), (err) => err.code === "not_configured" && !err.message.includes("wrong-key"));
});

test("channels by @handle and their uploads playlist, paged", async () => {
  const { provider } = setup();
  const c = await provider.getChannel({ handle: "@demo-sa-maths" });
  assert.equal(c.provider_channel_id, CHANNELS[0].provider_channel_id);
  const ids = await provider.listUploads(c.uploads_playlist_id);
  assert.equal(ids.length, VIDEOS.filter((v) => v.channel_id === c.provider_channel_id).length);
});

test("no key, no provider", () => {
  assert.throws(() => createYouTubeProvider({ quota: { charge: async () => true } }), /YOUTUBE_API_KEY/);
});
