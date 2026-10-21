// Run from the project root:   node --test server/tests/vad.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sandbox = {};
vm.runInNewContext(fs.readFileSync(new URL("../../client/js/vad.js", import.meta.url), "utf8"), sandbox);
const { createVad } = sandbox.SFVad;

// feeds a pattern of loudness readings every 50ms and returns the first non-"wait" answer
function run(vad, readings, step = 50) {
  let t = 1000;
  for (const [rms, ms] of readings) {
    for (let i = 0; i < ms / step; i += 1) {
      const out = vad.update(rms, t);
      t += step;
      if (out !== "wait") return { out, at: t - 1000 };
    }
  }
  return { out: "wait", at: t - 1000 };
}

test("stops 2.5 seconds after someone finishes talking, not before", () => {
  const r = run(createVad(), [[0.001, 400], [0.1, 3000], [0.002, 5000]]);
  assert.equal(r.out, "stop");
  // 400ms lead-in + 3000ms of speech + 2500ms of quiet (give or take one reading)
  assert.ok(r.at >= 5850 && r.at <= 6000, `stopped at ${r.at}ms`);
});

test("a thinking pause of 2 seconds mid-answer does not cut a learner off", () => {
  const r = run(createVad(), [[0.1, 2000], [0.003, 2000], [0.1, 2000], [0.003, 1000]]);
  assert.equal(r.out, "wait", "still listening after a 2s pause and 1s more quiet");
});

test("a 3-second pause does end the turn", () => {
  const r = run(createVad(), [[0.1, 2000], [0.003, 3000]]);
  assert.equal(r.out, "stop");
});

test("talking again resets the silence countdown", () => {
  const vad = createVad();
  const r = run(vad, [[0.1, 1000], [0.003, 2400], [0.1, 200], [0.003, 2400]]);
  assert.equal(r.out, "wait", "two 2.4s gaps with speech between are not one 4.8s gap");
});

test("a cough or click is not speech", () => {
  const r = run(createVad(), [[0.001, 500], [0.2, 100], [0.001, 3000]]);
  assert.equal(r.out, "wait", "100ms of noise never counts as having spoken, so it never 'stops'");
});

test("nobody speaks: gives up after 12 seconds", () => {
  const r = run(createVad(), [[0.002, 20000]]);
  assert.equal(r.out, "give_up");
  assert.ok(r.at >= 11900 && r.at <= 12100, `gave up at ${r.at}ms`);
});

test("someone who starts late is not given up on once they speak", () => {
  const r = run(createVad(), [[0.002, 9000], [0.1, 2000], [0.002, 1000]]);
  assert.equal(r.out, "wait");
});

test("a stalled tab can't fake speech or silence", () => {
  const vad = createVad();
  vad.update(0.1, 0);
  assert.equal(vad.update(0.1, 60_000), "wait", "a 60s jump counts as at most 250ms of speech");
  assert.equal(vad.spoke(), false, "250ms is under the 300ms needed");
});

test("thresholds can be tuned", () => {
  const r = run(createVad({ silenceMs: 1000 }), [[0.1, 1000], [0.003, 3000]]);
  assert.equal(r.out, "stop");
  assert.ok(r.at < 2300);
});
