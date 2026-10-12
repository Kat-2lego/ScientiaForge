"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const createVideoDiscoveryRouter = require("../routes/videoDiscovery.cjs");
const { loadVideoConfig } = require("../services/video/config");
const { createYouTubeProvider } = require("../services/video/youtubeProvider");
const { createMemoryVideoRepo } = require("./fakeVideoRepo");
const { createFakeYouTube } = require("./fakeYouTube");
const { CHANNELS, vid } = require("./videoFixtures");

// Behaves like a typical SkillForge requireAuth: 401 JSON when there's no valid token.
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  req.user = { id: token };
  next();
}

async function start(opts = {}) {
  const cfg = loadVideoConfig();
  const repo = opts.repo || createMemoryVideoRepo({ channels: CHANNELS });
  const yt = createFakeYouTube();
  const provider = createYouTubeProvider({ apiKey: yt.apiKey, fetch: yt.fetch, config: cfg, quota: { charge: (c) => repo.chargeQuota(c, cfg.quota) } });
  const app = express();
  app.use("/api/video-discovery", createVideoDiscoveryRouter({ repo, provider, requireAuth, config: cfg, log: { warn() {}, error() {} } }));
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/video-discovery`;
  const call = async (method, path, { user, body, raw } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), ...(body || raw ? { "Content-Type": "application/json" } : {}) },
      body: raw || (body ? JSON.stringify(body) : undefined),
    });
    return { status: res.status, body: await res.json() };
  };
  return { call, close: () => new Promise((r) => server.close(r)), repo };
}

const Q = "/search?subject=mathematics&grade=12&curriculum=NSC&topic=trigonometry&subtopic=identities";

test("anyone can search; the taxonomy is public", async (t) => {
  const s = await start();
  t.after(s.close);
  const tax = await s.call("GET", "/taxonomy");
  assert.equal(tax.status, 200);
  assert.equal(tax.body.subjects.length, 15);
  const r = await s.call("GET", Q);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.results[0].id, vid("trigIdNSC01"));
  assert.equal(r.body.results[0].saved, false);
});

test("saving needs sign-in; signed-in saves show up in search and in Saved", async (t) => {
  const s = await start();
  t.after(s.close);
  const id = vid("trigIdNSC01");
  assert.equal((await s.call("POST", `/videos/${id}/save`, { body: {} })).status, 401);
  const ok = await s.call("POST", `/videos/${id}/save`, { user: "u1", body: { subject: "mathematics", topic: "trigonometry", grade: 12 } });
  assert.equal(ok.status, 200);
  const r = await s.call("GET", Q, { user: "u1" });
  assert.equal(r.body.results.find((x) => x.id === id).saved, true);
  const other = await s.call("GET", Q, { user: "u2" });
  assert.equal(other.body.results.find((x) => x.id === id).saved, false, "one learner's saves are private");
  const saved = await s.call("GET", "/saved", { user: "u1" });
  assert.equal(saved.body.total, 1);
  assert.equal((await s.call("DELETE", `/videos/${id}/save`, { user: "u1" })).body.saved, false);
});

test("feedback, watched, history and continue learning over HTTP", async (t) => {
  const s = await start();
  t.after(s.close);
  const id = vid("trigIdNSC01");
  await s.call("GET", Q);
  assert.equal((await s.call("POST", `/videos/${id}/feedback`, { user: "u1", body: { useful: false, reason: "too_long" } })).status, 200);
  assert.equal((await s.call("POST", `/videos/${id}/feedback`, { user: "u1", body: { useful: "yes" } })).status, 400);
  assert.equal((await s.call("POST", `/videos/${id}/watched`, { user: "u1", body: { subject: "mathematics", topic: "trigonometry", grade: 12 } })).status, 200);
  const h = await s.call("GET", "/history", { user: "u1" });
  assert.equal(h.body.items[0].id, id);
  const c = await s.call("GET", "/continue", { user: "u1" });
  assert.equal(c.status, 200);
  assert.ok(c.body.continue.next.length > 0);
  assert.equal((await s.call("DELETE", "/history", { user: "u1" })).status, 200);
  assert.equal((await s.call("GET", "/history", { user: "u1" })).body.items.length, 0);
  assert.equal((await s.call("GET", "/history")).status, 401);
});

test("bad input gets a plain 400/404, and failures never leak details", async (t) => {
  const failing = createMemoryVideoRepo({ channels: CHANNELS });
  failing.listChannels = async () => { throw new Error("relation vd_channels does not exist (secret detail)"); };
  const s = await start({ repo: failing });
  t.after(s.close);
  assert.deepEqual(await s.call("GET", "/search"), { status: 400, body: { error: "Choose a subject, or type what you want to learn." } });
  assert.equal((await s.call("GET", "/search?subject=mathematics&grade=15")).status, 400);
  assert.equal((await s.call("GET", "/videos/not-a-video")).status, 404);
  assert.equal((await s.call("POST", `/videos/${vid("trigIdNSC01")}/feedback`, { user: "u1", raw: "{bad json" })).status, 400);
  const boom = await s.call("GET", Q);
  assert.equal(boom.status, 500);
  assert.equal(boom.body.error, "Video search is temporarily unavailable. Please try again.");
});

test("status reports live search and quota, never the key", async (t) => {
  const s = await start();
  t.after(s.close);
  await s.call("GET", Q);
  const st = await s.call("GET", "/status");
  assert.equal(st.body.live_search, true);
  assert.equal(st.body.quota.search_calls, 1);
  assert.ok(!JSON.stringify(st.body).includes("test-key"));
});
