/**
 * NSC Past Papers + Active Recall API
 * CommonJS (.cjs) on purpose: routes/package.json makes plain .js files in this folder ES modules.
 * Mount (server.mjs):
 *   import createNscRouter from "./routes/nscPapers.cjs";
 *   app.use("/api/study-hub/nsc", createNscRouter({ supabase: supabaseAdmin, requireAuth }));
 *
 * `supabase` must be the SERVICE-ROLE client: memo answers have no public read
 * policy, and this router is what enforces "memo hidden until you answer" and
 * "you only see your own sessions".
 *
 *   GET  /filters                                   subjects, years, sessions, grades, paper numbers
 *   GET  /papers?grade&subject&year&session&paper   browse (paged: limit, offset)
 *   GET  /papers/:id                                one paper + download links
 *   POST /sessions            { paper_id } | { retry_of }   start a session (auth)
 *   GET  /sessions?paper_id                         my sessions, newest first (auth)
 *   GET  /sessions/:id                              questions (+ memo for answered ones) (auth)
 *   POST /sessions/:id/answers                      { question_id, answer, gave_up } (auth)
 *   POST /sessions/:id/answers/:questionId/self-mark  { marks_awarded } (auth)
 */
"use strict";

const express = require("express");
const { createNscRepo } = require("../services/nscRepo.cjs");
const { markAnswer, answerInputFor } = require("../services/nscMarking.cjs");
const { selectQuestions, compareSortKey } = require("../services/nscSelection.cjs");

const SESSIONS = ["November", "May/June", "Feb/March"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWER_LENGTH = 4000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function intParam(value, { min, max } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new HttpError(400, `Invalid number: ${String(value).slice(0, 20)}`);
  }
  return n;
}

function userIdOf(req) {
  const id = req.user && (req.user.id || req.user.sub || req.user.user_id);
  if (!id) throw new HttpError(401, "Please sign in to use Active Recall.");
  return id;
}

/** Why Active Recall isn't available, as a short code the page turns into a sentence. */
function recallUnavailableReason(p) {
  if (p.processing_status === "ready" && p.recall_question_count > 0) return null;
  const notes = String(p.processing_notes || "").toLowerCase();
  if (/almost no text|looks like a scan/.test(notes)) return "scanned";
  if (!p.memorandum_storage_path || /memo not usable|no memo/.test(notes)) return "no_memo";
  return "few_questions";
}

function fileBase(paper) {
  const subject = paper.subject.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `NSC_${paper.year}_${paper.exam_session.replace("/", "-")}_${subject}_P${paper.paper_number}`;
}

function createNscRouter({ supabase, requireAuth, storageBucket = "past-papers", repo, publicUrlBase } = {}) {
  if (typeof requireAuth !== "function") throw new Error("createNscRouter needs your requireAuth middleware");
  if (!repo && !supabase) throw new Error("createNscRouter needs the service-role Supabase client");
  const db = repo || createNscRepo(supabase);
  const router = express.Router();
  router.use(express.json({ limit: "32kb" }));

  /* ------------------------------------------------------------ helpers */
  function publicUrl(path, downloadName) {
    if (!path) return null;
    if (supabase && supabase.storage) {
      const opts = downloadName ? { download: downloadName } : undefined;
      return supabase.storage.from(storageBucket).getPublicUrl(path, opts).data.publicUrl;
    }
    const base = `${publicUrlBase || ""}/storage/v1/object/public/${storageBucket}/${path}`;
    return downloadName ? `${base}?download=${encodeURIComponent(downloadName)}` : base;
  }

  function paperDto(p) {
    const name = fileBase(p);
    return {
      id: p.id,
      subject: p.subject,
      year: p.year,
      exam_session: p.exam_session,
      grade: p.grade,
      paper_number: p.paper_number,
      language: p.language,
      paper_title: p.paper_title,
      total_marks: p.total_marks,
      page_count: p.page_count,
      question_count: p.question_count,
      recall_question_count: p.recall_question_count,
      auto_markable_count: p.auto_markable_count,
      recall_available: p.processing_status === "ready" && p.recall_question_count > 0,
      recall_session_size: Math.min(20, p.recall_question_count || 0),
      recall_unavailable_reason: recallUnavailableReason(p),
      question_paper_url: publicUrl(p.question_paper_storage_path),
      question_paper_download_url: publicUrl(p.question_paper_storage_path, `${name}.pdf`),
      memorandum_url: publicUrl(p.memorandum_storage_path),
      memorandum_download_url: publicUrl(p.memorandum_storage_path, `${name}_Memo.pdf`),
      source_url: p.source_url,
    };
  }

  function sessionDto(s, paper) {
    return {
      id: s.id,
      paper_id: s.paper_id,
      mode: s.mode,
      parent_session_id: s.parent_session_id,
      question_count: s.question_count,
      answered_count: s.answered_count,
      correct_count: s.correct_count,
      incorrect_count: s.incorrect_count,
      score: Number(s.score),
      max_score: Number(s.max_score),
      percentage: s.percentage === null || s.percentage === undefined ? null : Number(s.percentage),
      started_at: s.started_at,
      completed_at: s.completed_at,
      status: s.completed_at ? "completed" : "in_progress",
      paper: paper
        ? {
            id: paper.id,
            subject: paper.subject,
            year: paper.year,
            exam_session: paper.exam_session,
            grade: paper.grade,
            paper_number: paper.paper_number,
            paper_title: paper.paper_title,
          }
        : null,
    };
  }

  async function ownSession(req) {
    const id = req.params.id;
    if (!UUID_RE.test(id)) throw new HttpError(404, "Session not found.");
    const session = await db.getSession(id);
    if (!session || session.user_id !== userIdOf(req)) throw new HttpError(404, "Session not found.");
    return session;
  }

  const maxMarksOf = (question, memo) => {
    const m = Number(question.marks || (memo && memo.marks) || 1);
    return m > 0 ? m : 1;
  };

  async function sessionDetail(session) {
    const [paper, questions, memos, attempts] = await Promise.all([
      db.getPaper(session.paper_id),
      db.getQuestions(session.question_ids),
      db.getMemos(session.question_ids),
      db.getAttempts(session.id),
    ]);
    const qById = new Map(questions.map((q) => [q.id, q]));
    const memoById = new Map(memos.map((m) => [m.question_id, m]));
    const attemptById = new Map(attempts.map((a) => [a.question_id, a]));

    const items = session.question_ids
      .map((qid) => qById.get(qid))
      .filter(Boolean)
      .map((q) => {
        const memo = memoById.get(q.id);
        const attempt = attemptById.get(q.id) || null;
        return {
          id: q.id,
          question_number: q.question_number,
          section: q.section,
          context_text: q.context_text,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options,
          marks: maxMarksOf(q, memo),
          page_number: q.page_number,
          has_figure: Boolean(q.has_figure),
          answer_input: answerInputFor(q, memo && memo.answer_format),
          marking: q.is_auto_markable ? "auto" : "self",
          attempt: attempt && {
            user_answer: attempt.user_answer,
            is_correct: attempt.is_correct,
            marks_awarded: attempt.marks_awarded === null ? null : Number(attempt.marks_awarded),
            max_marks: Number(attempt.max_marks),
            marking_method: attempt.marking_method,
            answered_at: attempt.answered_at,
          },
          // The memo is only ever sent for questions this student has already answered.
          memo: attempt && memo ? { answer_text: memo.answer_text, memo_page_number: memo.memo_page_number } : null,
        };
      });
    return { session: sessionDto(session, paper), paper: paper ? paperDto(paper) : null, questions: items };
  }

  /* ------------------------------------------------------------ browse */
  router.get(
    "/filters",
    wrap(async (_req, res) => {
      res.json(await db.filterOptions());
    })
  );

  router.get(
    "/papers",
    wrap(async (req, res) => {
      const limit = intParam(req.query.limit, { min: 1, max: 50 }) || 24;
      const offset = intParam(req.query.offset, { min: 0 }) || 0;
      const session = req.query.session ? String(req.query.session) : null;
      if (session && !SESSIONS.includes(session)) throw new HttpError(400, "Unknown exam session.");
      const { papers, total } = await db.listPapers({
        grade: intParam(req.query.grade, { min: 8, max: 12 }),
        subject: req.query.subject ? String(req.query.subject).slice(0, 120) : null,
        year: intParam(req.query.year, { min: 2008, max: 2100 }),
        session,
        paperNumber: intParam(req.query.paper, { min: 1, max: 5 }),
        limit,
        offset,
      });
      res.json({ papers: papers.map(paperDto), total, limit, offset });
    })
  );

  router.get(
    "/papers/:id",
    wrap(async (req, res) => {
      const id = intParam(req.params.id, { min: 1 });
      const paper = id && (await db.getPaper(id));
      if (!paper) throw new HttpError(404, "Paper not found.");
      res.json({ paper: paperDto(paper) });
    })
  );

  /* ------------------------------------------------------------ sessions */
  router.post(
    "/sessions",
    requireAuth,
    wrap(async (req, res) => {
      const userId = userIdOf(req);
      const body = req.body || {};

      if (body.retry_of) {
        if (!UUID_RE.test(String(body.retry_of))) throw new HttpError(404, "Session not found.");
        const parent = await db.getSession(String(body.retry_of));
        if (!parent || parent.user_id !== userId) throw new HttpError(404, "Session not found.");
        if (!parent.completed_at) throw new HttpError(409, "Finish this session before retrying it.");
        const attempts = await db.getAttempts(parent.id);
        const wrong = new Set(attempts.filter((a) => a.is_correct === false).map((a) => a.question_id));
        const ids = parent.question_ids.filter((qid) => wrong.has(qid));
        if (!ids.length) throw new HttpError(409, "Nothing to retry: you got every question right.");
        const [questions, memos] = await Promise.all([db.getQuestions(ids), db.getMemos(ids)]);
        const memoById = new Map(memos.map((m) => [m.question_id, m]));
        const maxScore = questions.reduce((sum, q) => sum + maxMarksOf(q, memoById.get(q.id)), 0);
        const created = await db.createSession({
          user_id: userId,
          paper_id: parent.paper_id,
          parent_session_id: parent.id,
          mode: "retry",
          question_ids: ids,
          question_count: ids.length,
          max_score: maxScore,
        });
        return res.status(201).json(await sessionDetail(created));
      }

      const paperId = intParam(body.paper_id, { min: 1 });
      if (!paperId) throw new HttpError(400, "paper_id is required.");
      const paper = await db.getPaper(paperId);
      if (!paper) throw new HttpError(404, "Paper not found.");
      if (paper.processing_status !== "ready" || !paper.recall_question_count) {
        throw new HttpError(409, "Active Recall isn't available for this paper yet. You can still download it.");
      }
      const [pool, seen] = await Promise.all([db.getRecallQuestions(paperId), db.getSeenQuestionIds(userId, paperId)]);
      const selected = selectQuestions(pool, { seen });
      if (!selected.length) throw new HttpError(409, "No questions from this paper are ready for Active Recall.");
      const ids = selected.sort(compareSortKey).map((q) => q.id);
      const memos = await db.getMemos(ids);
      const memoById = new Map(memos.map((m) => [m.question_id, m]));
      const created = await db.createSession({
        user_id: userId,
        paper_id: paperId,
        mode: "full",
        question_ids: ids,
        question_count: ids.length,
        max_score: selected.reduce((sum, q) => sum + maxMarksOf(q, memoById.get(q.id)), 0),
      });
      res.status(201).json(await sessionDetail(created));
    })
  );

  router.get(
    "/sessions",
    requireAuth,
    wrap(async (req, res) => {
      const userId = userIdOf(req);
      const limit = intParam(req.query.limit, { min: 1, max: 50 }) || 20;
      const offset = intParam(req.query.offset, { min: 0 }) || 0;
      const paperId = intParam(req.query.paper_id, { min: 1 });
      const { sessions, total } = await db.listSessions(userId, { paperId, limit, offset });
      const papers = await db.getPapersByIds([...new Set(sessions.map((s) => s.paper_id))]);
      const paperById = new Map(papers.map((p) => [p.id, p]));
      res.json({ sessions: sessions.map((s) => sessionDto(s, paperById.get(s.paper_id))), total, limit, offset });
    })
  );

  router.get(
    "/sessions/:id",
    requireAuth,
    wrap(async (req, res) => {
      res.json(await sessionDetail(await ownSession(req)));
    })
  );

  router.post(
    "/sessions/:id/answers",
    requireAuth,
    wrap(async (req, res) => {
      const session = await ownSession(req);
      if (session.completed_at) throw new HttpError(409, "This session is already finished.");
      const body = req.body || {};
      const questionId = intParam(body.question_id, { min: 1 });
      if (!questionId || !session.question_ids.map(Number).includes(questionId)) {
        throw new HttpError(400, "That question isn't part of this session.");
      }
      const answer = typeof body.answer === "string" ? body.answer.trim() : "";
      if (answer.length > MAX_ANSWER_LENGTH) throw new HttpError(400, "Your answer is too long.");

      const [[question], [memo]] = await Promise.all([db.getQuestions([questionId]), db.getMemos([questionId])]);
      if (!question) throw new HttpError(404, "Question not found.");
      const maxMarks = maxMarksOf(question, memo);
      const now = new Date().toISOString();

      let verdict;
      let row;
      if (body.gave_up === true || !answer) {
        verdict = "skipped";
        row = { is_correct: false, marks_awarded: 0, marking_method: "skipped", normalized_answer: null, marked_at: now };
      } else if (question.is_auto_markable && memo) {
        const result = markAnswer(answer, memo);
        if (result.verdict === "needs_self_mark") {
          verdict = "self_mark";
          row = { is_correct: null, marks_awarded: null, marking_method: "self", normalized_answer: result.normalized, marked_at: null };
        } else {
          const correct = result.verdict === "correct";
          verdict = correct ? "correct" : "incorrect";
          row = {
            is_correct: correct,
            marks_awarded: correct ? maxMarks : 0,
            marking_method: "auto",
            normalized_answer: result.normalized,
            marked_at: now,
          };
        }
      } else {
        verdict = "self_mark";
        row = { is_correct: null, marks_awarded: null, marking_method: "self", normalized_answer: null, marked_at: null };
      }

      const attempt = await db.insertAttempt({
        session_id: session.id,
        question_id: questionId,
        user_answer: answer,
        max_marks: maxMarks,
        ...row,
      });
      if (!attempt) throw new HttpError(409, "You've already answered this question.");

      const [fresh, paper] = await Promise.all([db.getSession(session.id), db.getPaper(session.paper_id)]);
      res.status(201).json({
        verdict,
        attempt: {
          question_id: questionId,
          user_answer: attempt.user_answer,
          is_correct: attempt.is_correct,
          marks_awarded: attempt.marks_awarded === null ? null : Number(attempt.marks_awarded),
          max_marks: Number(attempt.max_marks),
          marking_method: attempt.marking_method,
        },
        memo: memo ? { answer_text: memo.answer_text, memo_page_number: memo.memo_page_number } : null,
        session: sessionDto(fresh, paper),
      });
    })
  );

  router.post(
    "/sessions/:id/answers/:questionId/self-mark",
    requireAuth,
    wrap(async (req, res) => {
      const session = await ownSession(req);
      const questionId = intParam(req.params.questionId, { min: 1 });
      const attempts = await db.getAttempts(session.id);
      const attempt = attempts.find((a) => Number(a.question_id) === questionId);
      if (!attempt) throw new HttpError(404, "Answer the question before marking it.");
      if (attempt.is_correct !== null) throw new HttpError(409, "This answer has already been marked.");

      const raw = Number((req.body || {}).marks_awarded);
      const max = Number(attempt.max_marks);
      if (!Number.isFinite(raw) || raw < 0 || raw > max) throw new HttpError(400, `Marks must be between 0 and ${max}.`);
      const marks = Math.round(raw * 2) / 2;

      const updated = await db.selfMarkAttempt(session.id, questionId, {
        marks_awarded: marks,
        is_correct: marks >= max,
        marked_at: new Date().toISOString(),
      });
      if (!updated) throw new HttpError(409, "This answer has already been marked.");
      const [fresh, paper] = await Promise.all([db.getSession(session.id), db.getPaper(session.paper_id)]);
      res.json({
        attempt: {
          question_id: questionId,
          is_correct: updated.is_correct,
          marks_awarded: Number(updated.marks_awarded),
          max_marks: Number(updated.max_marks),
          marking_method: updated.marking_method,
        },
        session: sessionDto(fresh, paper),
      });
    })
  );

  /* ------------------------------------------------------------ errors */
  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
    console.error("[nsc]", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return router;
}

module.exports = createNscRouter;
module.exports.createNscRouter = createNscRouter;
module.exports.HttpError = HttpError;
module.exports.recallUnavailableReason = recallUnavailableReason;
