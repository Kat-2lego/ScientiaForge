"use strict";
/* Contract test: real collector output (tests/fixtures/collector_*.json, made by
   `python collector.py --local ...` on the DBE-layout fixture PDFs) goes through
   the ingest mirror, the router and the marker. Every auto-marked question must
   accept the memo's own answer and reject a wrong one. */
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const createNscRouter = require("../routes/nscPapers");
const { makeRepo } = require("./fakeRepo");
const { markAnswer } = require("../services/nscMarking");

const FIXTURES = ["collector_ls_p1.json", "collector_maths_p1.json"].map((f) => require(`./fixtures/${f}`));

/** What a student who knows the answer would actually type. */
function studentAnswerFor(q) {
  const m = q.memo;
  if (m.answer_format === "letter") return m.accepted_answer.toLowerCase();
  if (q.options) return m.accepted_answer; // "B only" style: the option label
  if (m.answer_format === "number") {
    const last = m.accepted_answer.split(/\s+or\s+/i).map((p) => p.split("=").pop().trim());
    return last.join(" or ").replace(/−/g, "-").replace(/,/g, ".");
  }
  if (m.answer_format === "expression") return m.accepted_answer.replace(/\s+/g, "").replace(/−/g, "-");
  return m.accepted_answer.toLowerCase();
}

function wrongAnswerFor(q) {
  const m = q.memo;
  if (m.answer_format === "letter") return m.accepted_answer === "A" ? "B" : "A";
  if (q.options) return q.options.find((o) => o.label !== m.accepted_answer).label;
  if (m.answer_format === "number") return "987654";
  if (m.answer_format === "expression") return "(x-7)(x+2)";
  return "photosynthesis";
}

test("fixtures contain what the UI needs", () => {
  for (const { questions } of FIXTURES) {
    for (const q of questions) {
      assert.ok(q.question_number && q.question_text && Array.isArray(q.sort_key), q.question_number);
      if (q.is_recall_suitable) assert.ok(q.memo && q.memo.answer_text, `${q.question_number} suitable but no memo`);
      if (q.is_auto_markable && q.is_recall_suitable) assert.ok(q.memo.accepted_answer, `${q.question_number} auto but no accepted answer`);
      if (q.question_type === "multiple_choice" && q.is_recall_suitable) assert.ok(q.options.length >= 2, q.question_number);
    }
  }
});

test("every auto-marked question accepts the memo answer and rejects a wrong one", () => {
  for (const { paper, questions } of FIXTURES) {
    for (const q of questions.filter((x) => x.is_auto_markable && x.is_recall_suitable)) {
      const right = studentAnswerFor(q);
      assert.equal(markAnswer(right, q.memo).verdict, "correct", `${paper.subject} ${q.question_number}: "${right}" vs ${JSON.stringify(q.memo.accepted_answer)}`);
      const wrong = wrongAnswerFor(q);
      assert.notEqual(markAnswer(wrong, q.memo).verdict, "correct", `${paper.subject} ${q.question_number}: "${wrong}" accepted`);
    }
  }
});

test("collector payload -> API -> marking, over HTTP", async (t) => {
  const { repo, ingest } = makeRepo({ seed: false });
  const ids = FIXTURES.map((f) => ingest(f));
  const app = express();
  app.use("/nsc", createNscRouter({ repo, requireAuth: (req, _res, next) => ((req.user = { id: "u1" }), next()), publicUrlBase: "http://x" }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/nsc`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  for (const [i, fixture] of FIXTURES.entries()) {
    const byNumber = new Map(fixture.questions.map((q) => [q.question_number, q]));
    const { status, body } = await call("POST", "/sessions", { paper_id: ids[i] });
    assert.equal(status, 201);
    const suitable = fixture.questions.filter((q) => q.is_recall_suitable).length;
    assert.equal(body.questions.length, Math.min(20, suitable));
    assert.ok(!body.questions.some((q) => byNumber.get(q.question_number).is_recall_suitable === false), "unsuitable question served");

    for (const q of body.questions) {
      const src = byNumber.get(q.question_number);
      assert.equal(q.memo, null);
      assert.equal(typeof q.has_figure, "boolean");
      if (src.options) assert.equal(q.answer_input, "choice");
      const answer = q.marking === "auto" ? studentAnswerFor(src) : "my attempt";
      const r = await call("POST", `/sessions/${body.session.id}/answers`, { question_id: q.id, answer });
      assert.equal(r.status, 201);
      if (q.marking === "auto") {
        assert.equal(r.body.verdict, "correct", `${fixture.paper.subject} ${q.question_number} "${answer}"`);
        assert.equal(r.body.attempt.marks_awarded, src.marks || src.memo.marks || 1);
      } else {
        assert.equal(r.body.verdict, "self_mark");
        assert.equal(r.body.memo.answer_text, src.memo.answer_text);
        await call("POST", `/sessions/${body.session.id}/answers/${q.id}/self-mark`, { marks_awarded: 0 });
      }
    }
    const done = await call("GET", `/sessions/${body.session.id}`);
    assert.equal(done.body.session.status, "completed");
    const selfCount = body.questions.filter((q) => q.marking === "self").length;
    assert.equal(done.body.session.correct_count, body.questions.length - selfCount);
  }
});
