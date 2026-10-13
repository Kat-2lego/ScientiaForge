"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { run, parseVideoId, parseArgs } = require("../scripts/videoAdmin");
const { loadVideoConfig } = require("../services/video/config");
const { createYouTubeProvider } = require("../services/video/youtubeProvider");
const { createVideoDiscovery } = require("../services/video/discovery");
const { createMemoryVideoRepo } = require("./fakeVideoRepo");
const { createFakeYouTube } = require("./fakeYouTube");
const { CHANNELS, vid } = require("./videoFixtures");

function setup() {
  const cfg = loadVideoConfig();
  const repo = createMemoryVideoRepo();
  const yt = createFakeYouTube();
  const provider = createYouTubeProvider({ apiKey: yt.apiKey, fetch: yt.fetch, config: cfg, quota: { charge: (c) => repo.chargeQuota(c, cfg.quota) } });
  const discovery = createVideoDiscovery({ repo, provider, config: cfg, log: { warn() {}, error() {} } });
  const lines = [];
  return { repo, discovery, provider, lines, go: (argv) => run(argv, { repo, discovery, provider, out: (l) => lines.push(l) }) };
}

test("video ids from ids and every common URL form", () => {
  const id = vid("trigIdNSC01");
  for (const s of [id, `https://www.youtube.com/watch?v=${id}&t=30s`, `https://youtu.be/${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://m.youtube.com/watch?v=${id}`]) {
    assert.equal(parseVideoId(s), id, s);
  }
  assert.equal(parseVideoId("https://example.com/watch?v=abc"), null);
  assert.deepEqual(parseArgs(["sync", "@x", "--max", "50", "--no-live"]), { _: ["sync", "@x"], max: "50", "no-live": true });
});

test("add a channel by @handle, sync it, preview the ranking", async () => {
  const s = setup();
  await s.go(["add-channel", "@demo-sa-maths", "--subjects", "mathematics", "--curricula", "NSC", "--trust", "2"]);
  const [c] = await s.repo.listChannels();
  assert.equal(c.provider_channel_id, CHANNELS[0].provider_channel_id);
  assert.deepEqual([c.trust_level, c.subjects, c.curricula], [2, ["mathematics"], ["NSC"]]);
  await s.go(["sync", "@demo-sa-maths"]);
  assert.ok(s.lines.some((l) => /Demo SA Maths: \d+ uploads/.test(l)), s.lines.join("\n"));
  const r = await s.go(["preview", "--subject", "mathematics", "--grade", "12", "--curriculum", "NSC", "--topic", "trigonometry", "--no-live"]);
  assert.equal(r.source, "library");
  assert.ok(r.results.length > 0);
});

test("clear errors for bad input", async () => {
  const s = setup();
  await assert.rejects(s.go(["add-channel", "@demo-sa-maths", "--subjects", "maths"]), /Unknown subject/);
  await assert.rejects(s.go(["add-channel", "@nobody-here"]), /no channel/);
  await assert.rejects(s.go(["verify", "not a video"]), /video id or URL/);
  await assert.rejects(s.go(["verify", vid("trigIdGen02")]), /--subject/);
  await assert.rejects(s.go(["set-trust", "@missing", "2"]), /No curated channel/);
});

test("verify, block, unflag, trust changes and quota", async () => {
  const s = setup();
  await s.go(["verify", `https://youtu.be/${vid("trigIdGen02")}`, "--subject", "mathematics", "--topic", "trigonometry"]);
  assert.equal(s.repo.db.flags.get(vid("trigIdGen02")).status, "verified");
  await s.go(["block", vid("trigCbse003"), "--note", "wrong curriculum"]);
  assert.equal(s.repo.db.flags.get(vid("trigCbse003")).status, "blocked");
  await s.go(["unflag", vid("trigCbse003")]);
  assert.ok(!s.repo.db.flags.has(vid("trigCbse003")));
  await s.go(["add-channel", "@demo-bio", "--subjects", "life-sciences"]);
  await s.go(["set-trust", "@demo-bio", "0"]);
  assert.equal((await s.repo.listChannels())[0].trust_level, 0);
  await s.go(["quota"]);
  assert.ok(s.lines.some((l) => /searches/.test(l)));
});
