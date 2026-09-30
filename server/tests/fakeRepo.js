"use strict";
/* In-memory stand-in for nscRepo that behaves like the SQL (used by tests and the demo server). */
const crypto = require("node:crypto");

function makeRepo({ seed = true } = {}) {
  const papers = [
    { id: 1, year: 2023, exam_session: "November", grade: 12, subject: "Life Sciences", paper_number: 1, language: "English",
      paper_title: "Life Sciences Paper 1", question_paper_storage_path: "NSC/2023/November/Life_Sciences/Paper_1.pdf",
      memorandum_storage_path: "NSC/2023/November/Life_Sciences/Paper_1_Memorandum.pdf", source_url: "https://dbe",
      page_count: 19, total_marks: 150, question_count: 30, recall_question_count: 24, auto_markable_count: 12, processing_status: "ready" },
    { id: 2, year: 2023, exam_session: "November", grade: 12, subject: "Mathematics", paper_number: 1, language: "English",
      paper_title: "Mathematics Paper 1", question_paper_storage_path: "NSC/2023/November/Mathematics/Paper_1.pdf",
      memorandum_storage_path: null, source_url: "https://dbe", page_count: 9, total_marks: 150, question_count: 40,
      recall_question_count: 0, auto_markable_count: 0, processing_status: "partial" },
  ];
  const questions = [];
  const memos = [];
  let qid = 100;
  const qid_seq = { get n() { return qid; }, set n(v) { qid = v; } };
  for (let top = 1; top <= 3; top++) {
    for (let i = 1; i <= 8; i++) {
      const id = ++qid;
      const mcq = top === 1;
      questions.push({ id, paper_id: 1, question_number: `${top}.${i}`, sort_key: [top, i], top_question: top,
        section: mcq ? "Section A" : "Section B", context_text: null, question_text: `Question ${top}.${i} on topic ${id}`,
        question_type: mcq ? "multiple_choice" : "other", options: mcq ? [{ label: "A", text: "a" }, { label: "B", text: "b" }] : null,
        marks: mcq ? 2 : 3, page_number: top + 2, has_figure: top === 3 && i % 2 === 0, is_auto_markable: mcq, is_recall_suitable: true });
      memos.push({ question_id: id, answer_text: mcq ? "B" : `Memo answer ${id}`, accepted_answer: mcq ? "B" : null,
        accepted_alternatives: [], keywords: [], answer_format: mcq ? "letter" : "text", marks: mcq ? 2 : 3, memo_page_number: 4 });
    }
  }
  if (!seed) {
    papers.length = 0;
    questions.length = 0;
    memos.length = 0;
  }

  /* Mirrors public.nsc_ingest_paper(p_paper, p_questions): one paper row,
     question rows, memo rows only when answer_text is non-blank, and the
     paper's counts computed the same way as the SQL. */
  function ingest({ paper, questions: qs }) {
    const id = papers.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const slug = paper.subject.replace(/[^A-Za-z0-9]+/g, "_");
    const base = `NSC/${paper.year}/${paper.exam_session.replace("/", "-")}/${slug}/Paper_${paper.paper_number}`;
    const suitable = qs.filter((q) => q.is_recall_suitable);
    papers.push({
      id, grade: 12, language: "English", processing_status: "ready", page_count: 12, source_url: "https://www.education.gov.za",
      paper_title: `${paper.subject} Paper ${paper.paper_number}`,
      question_paper_storage_path: `${base}.pdf`, memorandum_storage_path: `${base}_Memorandum.pdf`,
      ...paper,
      question_count: qs.length,
      recall_question_count: suitable.length,
      auto_markable_count: suitable.filter((q) => q.is_auto_markable).length,
    });
    for (const q of qs) {
      const qid = ++qid_seq.n;
      const { memo, ...row } = q;
      questions.push({ id: qid, paper_id: id, ...row, options: Array.isArray(q.options) ? q.options : null });
      if (memo && String(memo.answer_text || "").trim()) {
        memos.push({ question_id: qid, accepted_alternatives: [], keywords: [], answer_format: "text", ...memo });
      }
    }
    return id;
  }

  const sessions = [];
  const attempts = [];
  const refresh = (sid) => {
    const s = sessions.find((x) => x.id === sid);
    const a = attempts.filter((x) => x.session_id === sid);
    const marked = a.filter((x) => x.is_correct !== null).length;
    Object.assign(s, {
      answered_count: a.length,
      correct_count: a.filter((x) => x.is_correct === true).length,
      incorrect_count: a.filter((x) => x.is_correct === false).length,
      score: a.reduce((t, x) => t + (x.marks_awarded || 0), 0),
      percentage: marked === s.question_count ? Math.round((10000 * a.filter((x) => x.is_correct).length) / s.question_count) / 100 : null,
      completed_at: marked === s.question_count ? s.completed_at || new Date().toISOString() : null,
    });
  };
  const visible = (p) => ["ready", "partial"].includes(p.processing_status);
  const repo = {
    filterOptions: async () => ({ subjects: ["Life Sciences", "Mathematics"], years: [2023], sessions: ["November"], grades: [12], paper_numbers: [1] }),
    listPapers: async (f) => {
      let list = papers.filter(visible);
      if (f.subject) list = list.filter((p) => p.subject === f.subject);
      return { papers: list.slice(f.offset, f.offset + f.limit), total: list.length };
    },
    getPaper: async (id) => papers.find((p) => p.id === id && visible(p)) || null,
    getPapersByIds: async (ids) => papers.filter((p) => ids.includes(p.id)),
    getRecallQuestions: async (pid) => questions.filter((q) => q.paper_id === pid && q.is_recall_suitable),
    getQuestions: async (ids) => questions.filter((q) => ids.includes(q.id)),
    getMemos: async (ids) => memos.filter((m) => ids.includes(m.question_id)),
    getSeenQuestionIds: async (uid, pid) => new Set(sessions.filter((s) => s.user_id === uid && s.paper_id === pid).flatMap((s) => s.question_ids)),
    createSession: async (row) => {
      const s = { id: crypto.randomUUID(), parent_session_id: null, answered_count: 0, correct_count: 0, incorrect_count: 0,
        score: 0, percentage: null, started_at: new Date().toISOString(), completed_at: null, ...row };
      sessions.push(s);
      return { ...s };
    },
    getSession: async (id) => (sessions.find((s) => s.id === id) ? { ...sessions.find((s) => s.id === id) } : null),
    listSessions: async (uid, { paperId, limit, offset }) => {
      const list = sessions.filter((s) => s.user_id === uid && (!paperId || s.paper_id === paperId)).reverse();
      return { sessions: list.slice(offset, offset + limit), total: list.length };
    },
    getAttempts: async (sid) => attempts.filter((a) => a.session_id === sid),
    insertAttempt: async (row) => {
      if (attempts.some((a) => a.session_id === row.session_id && a.question_id === row.question_id)) return null;
      const a = { answered_at: new Date().toISOString(), ...row };
      attempts.push(a);
      refresh(row.session_id);
      return a;
    },
    selfMarkAttempt: async (sid, qid, patch) => {
      const a = attempts.find((x) => x.session_id === sid && x.question_id === qid && x.is_correct === null);
      if (!a) return null;
      Object.assign(a, patch);
      refresh(sid);
      return a;
    },
  };
  return { repo, questions, memos, ingest };
}

module.exports = { makeRepo };
