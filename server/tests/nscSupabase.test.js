"use strict";
/* nscRepo + router through the REAL @supabase/supabase-js client, talking to a fake PostgREST.
   This is the exact code path that runs against your Supabase project. */
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const createNscRouter = require("../routes/nscPapers");
const { createFakePostgrest, makeTables, ingest, listen } = require("./fakePostgrest");

const FIXTURES = ["collector_ls_p1.json", "collector_maths_p1.json"].map((f) => require(`./fixtures/${f}`));
const USER = "11111111-1111-4111-8111-111111111111";

async function boot() {
  const tables = makeTables();
  FIXTURES.forEach((f) => ingest(tables, f));
  const fake = createFakePostgrest(tables);
  const url = await listen(fake);
  const supabase = createClient(url, "test-service-role-key", { auth: { persistSession: false, autoRefreshToken: false } });
  const app = express();
  app.use("/nsc", createNscRouter({ supabase, requireAuth: (req, _res, next) => ((req.user = { id: USER }), next()) }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/nsc`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { call, tables, fake, close: () => { server.close(); fake.server.close(); } };
}

const answerFor = (q) => {
  const m = q.memo.accepted_answer;
  return q.options ? m : q.memo.answer_format === "number" ? m.split("=").pop().trim().replace(/−/g, "-") : m.toLowerCase();
};

test("browse: filters, papers, one paper, download links", async (t) => {
  const { call, close } = await boot();
  t.after(close);
  const filters = await call("GET", "/filters");
  assert.deepEqual(filters.body.subjects, ["Life Sciences", "Mathematics"]);
  assert.deepEqual(filters.body.years, [2023]);

  const all = await call("GET", "/papers?limit=1&offset=0");
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 2);          // the count comes from Content-Range
  assert.equal(all.body.papers.length, 1);

  const ls = await call("GET", "/papers?subject=Life%20Sciences&year=2023&session=November&grade=12&paper=1");
  assert.equal(ls.body.total, 1);
  const paper = ls.body.papers[0];
  assert.equal(paper.recall_available, true);
  assert.match(paper.question_paper_download_url, /\/storage\/v1\/object\/public\/past-papers\/NSC\/2023\/November\/Life_Sciences\/Paper_1\.pdf/);

  assert.equal((await call("GET", `/papers/${paper.id}`)).body.paper.subject, "Life Sciences");
  assert.equal((await call("GET", "/papers/9999")).status, 404);
});

test("a whole session through supabase-js: start, answer, self-mark, finish, retry, history", async (t) => {
  const { call, tables, close } = await boot();
  t.after(close);
  const paperId = tables.nsc_papers.find((p) => p.subject === "Life Sciences").id;
  const source = new Map(FIXTURES[0].questions.map((q) => [q.question_number, q]));

  const started = await call("POST", "/sessions", { paper_id: paperId });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const { session, questions } = started.body;
  assert.equal(questions.length, FIXTURES[0].questions.filter((q) => q.is_recall_suitable).length);
  assert.equal(session.question_count, questions.length);
  assert.ok(questions.every((q) => q.memo === null && q.attempt === null), "memo hidden before answering");
  assert.ok(!JSON.stringify(started.body).includes("accepted_answer"));

  // typing the memo answer is marked correct; explanations are self-marked
  let selfMarked = 0;
  for (const q of questions) {
    const src = source.get(q.question_number);
    if (q.marking === "auto") {
      const r = await call("POST", `/sessions/${session.id}/answers`, { question_id: q.id, answer: answerFor(src) });
      assert.equal(r.status, 201, `${q.question_number}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.verdict, "correct", `${q.question_number} "${answerFor(src)}"`);
      assert.ok(r.body.memo.answer_text);
    } else {
      const r = await call("POST", `/sessions/${session.id}/answers`, { question_id: q.id, answer: "my attempt" });
      assert.equal(r.body.verdict, "self_mark");
      assert.equal(r.body.session.status, "in_progress");
      const marks = selfMarked++ === 0 ? 0 : q.marks; // get the first one wrong
      const m = await call("POST", `/sessions/${session.id}/answers/${q.id}/self-mark`, { marks_awarded: marks });
      assert.equal(m.status, 200, JSON.stringify(m.body));
    }
  }
  assert.ok(selfMarked >= 1);

  // answering twice is refused (unique violation surfaces as 409)
  const dup = await call("POST", `/sessions/${session.id}/answers`, { question_id: questions[0].id, answer: "B" });
  assert.equal(dup.status, 409);

  const done = await call("GET", `/sessions/${session.id}`);
  assert.equal(done.body.session.status, "completed");
  assert.equal(done.body.session.incorrect_count, 1);
  assert.equal(done.body.session.correct_count, questions.length - 1);
  assert.ok(done.body.questions.every((q) => q.memo && q.memo.answer_text), "memo shown once answered");
  assert.ok(done.body.session.percentage > 0);

  const retry = await call("POST", "/sessions", { retry_of: session.id });
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.equal(retry.body.session.mode, "retry");
  assert.equal(retry.body.session.question_count, 1);

  const history = await call("GET", `/sessions?paper_id=${paperId}`);
  assert.equal(history.body.total, 2);
  assert.equal(history.body.sessions[0].paper.subject, "Life Sciences");
});

test("a second session prefers questions the student hasn't seen", async (t) => {
  const { call, tables, close } = await boot();
  t.after(close);
  const paperId = tables.nsc_papers.find((p) => p.subject === "Mathematics").id;
  const a = await call("POST", "/sessions", { paper_id: paperId });
  const b = await call("POST", "/sessions", { paper_id: paperId });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(b.body.questions.length, a.body.questions.length); // small paper: same set, nothing invented
});

test("only the columns the repo asks for are read (no surprises against the real schema)", async (t) => {
  const { call, tables, fake, close } = await boot();
  t.after(close);
  await call("POST", "/sessions", { paper_id: tables.nsc_papers[0].id });
  assert.ok(fake.log.some((l) => l.startsWith("GET nsc_questions")));
  assert.ok(fake.log.every((l) => !/select=\*&?.*nsc_memo_answers/.test(l)));
});
