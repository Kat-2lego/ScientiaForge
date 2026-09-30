"use strict";
/* The router over real HTTP with an in-memory repo that behaves like the SQL
   (unique attempts, "is_correct is null" guard, trigger-maintained totals). */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const createNscRouter = require("../routes/nscPapers");
const { makeRepo } = require("./fakeRepo");

async function startServer() {
  const { repo, questions } = makeRepo();
  const app = express();
  const requireAuth = (req, res, next) => {
    const user = req.get("x-test-user");
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    req.user = { id: user };
    next();
  };
  app.use("/api/study-hub/nsc", createNscRouter({ repo, requireAuth, publicUrlBase: "https://proj.supabase.co" }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/study-hub/nsc`;
  const call = async (method, path, body, user = "user-1") => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { server, call, questions };
}

test("browse, run a full session, self-mark, finish, retry", async (t) => {
  const { server, call, questions: seeded } = await startServer();
  t.after(() => server.close());

  const list = await call("GET", "/papers?subject=Life%20Sciences", null, null);
  assert.equal(list.status, 200);
  const paper = list.body.papers[0];
  assert.equal(paper.recall_available, true);
  assert.equal(paper.recall_session_size, 20);
  assert.match(paper.question_paper_download_url, /Paper_1\.pdf\?download=NSC_2023_November_Life_Sciences_P1\.pdf$/);

  assert.equal((await call("GET", "/papers?session=Winter")).status, 400);
  assert.equal((await call("POST", "/sessions", { paper_id: 1 }, null)).status, 401);
  assert.equal((await call("POST", "/sessions", { paper_id: 2 })).status, 409); // download-only paper

  const created = await call("POST", "/sessions", { paper_id: 1 });
  assert.equal(created.status, 201);
  const { session, questions } = created.body;
  assert.equal(session.question_count, 20);
  assert.equal(questions.length, 20);
  assert.ok(questions.every((q) => q.memo === null && q.attempt === null), "memo hidden before answering");
  assert.ok(new Set(questions.map((q) => q.question_number.split(".")[0])).size === 3, "spread across questions");
  assert.ok(!JSON.stringify(created.body).includes("accepted_answer"));
  // questions from a section with a figure are flagged so the page can point at the paper
  const source = new Map(seeded.map((x) => [x.id, x]));
  assert.ok(questions.some((q) => q.has_figure === true), "flagged questions are served");
  assert.ok(questions.every((q) => q.has_figure === Boolean(source.get(q.id).has_figure)));

  // someone else can't see or answer it
  assert.equal((await call("GET", `/sessions/${session.id}`, null, "user-2")).status, 404);

  for (const q of questions) {
    if (q.answer_input === "choice") {
      const pick = q.question_number.endsWith(".1") ? "A" : "b";
      const r = await call("POST", `/sessions/${session.id}/answers`, { question_id: q.id, answer: pick });
      assert.equal(r.status, 201);
      assert.equal(r.body.verdict, pick === "A" ? "incorrect" : "correct");
      assert.equal(r.body.memo.answer_text, "B");
    } else {
      const r = await call("POST", `/sessions/${session.id}/answers`, { question_id: q.id, answer: "my attempt" });
      assert.equal(r.body.verdict, "self_mark");
      assert.equal(r.body.attempt.is_correct, null);
      const mark = q.question_number.endsWith(".2") ? 1 : 3;
      assert.equal((await call("POST", `/sessions/${session.id}/answers/${q.id}/self-mark`, { marks_awarded: 9 })).status, 400);
      const m = await call("POST", `/sessions/${session.id}/answers/${q.id}/self-mark`, { marks_awarded: mark });
      assert.equal(m.status, 200);
      assert.equal(m.body.attempt.is_correct, mark === 3);
      assert.equal((await call("POST", `/sessions/${session.id}/answers/${q.id}/self-mark`, { marks_awarded: 3 })).status, 409);
    }
  }
  const again = await call("POST", `/sessions/${session.id}/answers`, { question_id: questions[0].id, answer: "B" });
  assert.equal(again.status, 409);

  const done = await call("GET", `/sessions/${session.id}`);
  assert.equal(done.body.session.status, "completed");
  const wrong = done.body.questions.filter((q) => q.attempt.is_correct === false).length;
  assert.equal(done.body.session.incorrect_count, wrong);
  assert.equal(done.body.session.percentage, Math.round((10000 * (20 - wrong)) / 20) / 100);
  assert.ok(done.body.questions.every((q) => q.memo && q.memo.answer_text));

  const retry = await call("POST", "/sessions", { retry_of: session.id });
  assert.equal(retry.status, 201);
  assert.equal(retry.body.session.mode, "retry");
  assert.equal(retry.body.session.question_count, wrong);

  const history = await call("GET", "/sessions?paper_id=1");
  assert.equal(history.body.sessions.length, 2);
  assert.equal(history.body.sessions[0].paper.subject, "Life Sciences");
});

test("gave up, bad ids and question not in session", async (t) => {
  const { server, call, questions } = await startServer();
  t.after(() => server.close());
  const { body } = await call("POST", "/sessions", { paper_id: 1 });
  const q = body.questions[0];
  const skip = await call("POST", `/sessions/${body.session.id}/answers`, { question_id: q.id, answer: "", gave_up: true });
  assert.equal(skip.body.verdict, "skipped");
  assert.equal(skip.body.attempt.marks_awarded, 0);
  assert.equal(skip.body.memo.answer_text.length > 0, true);
  const outsider = questions.find((x) => !body.questions.some((y) => y.id === x.id));
  assert.equal((await call("POST", `/sessions/${body.session.id}/answers`, { question_id: outsider.id, answer: "B" })).status, 400);
  assert.equal((await call("GET", "/sessions/not-a-uuid")).status, 404);
  assert.equal((await call("POST", "/sessions", { retry_of: body.session.id })).status, 409); // not finished
});

test("second session prefers questions not seen yet", async (t) => {
  const { server, call } = await startServer();
  t.after(() => server.close());
  const first = await call("POST", "/sessions", { paper_id: 1 });
  const second = await call("POST", "/sessions", { paper_id: 1 });
  const seen = new Set(first.body.questions.map((q) => q.id));
  const fresh = second.body.questions.filter((q) => !seen.has(q.id));
  assert.equal(fresh.length, 4); // 24 suitable, 20 seen -> all 4 unseen are included
});

test("download-only papers say why Active Recall is unavailable", () => {
  const { recallUnavailableReason } = require("../routes/nscPapers");
  const base = { processing_status: "partial", recall_question_count: 0, memorandum_storage_path: "m.pdf" };
  assert.equal(recallUnavailableReason({ ...base, processing_notes: "no questions extracted: the PDF has almost no text (0 characters on 10 pages): it looks like a scan" }), "scanned");
  assert.equal(recallUnavailableReason({ ...base, memorandum_storage_path: null, processing_notes: "memo not usable: The memo link returns the question paper itself" }), "no_memo");
  assert.equal(recallUnavailableReason({ ...base, processing_notes: "67 questions extracted; 2 suitable" }), "few_questions");
  assert.equal(recallUnavailableReason({ ...base, processing_status: "ready", recall_question_count: 20 }), null);
});
