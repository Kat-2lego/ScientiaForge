/**
 * Data access for NSC past papers + Active Recall (Supabase, service-role client).
 * Kept separate from the router so the router can be tested with a fake repo.
 */
"use strict";

const PAPER_COLUMNS =
  "id, year, exam_session, grade, subject, paper_number, language, paper_title, " +
  "question_paper_storage_path, memorandum_storage_path, source_url, page_count, total_marks, " +
  "question_count, recall_question_count, auto_markable_count, processing_status, processing_notes, updated_at";

const QUESTION_COLUMNS =
  "id, paper_id, question_number, sort_key, top_question, section, context_text, question_text, " +
  "question_type, options, marks, page_number, has_figure, is_auto_markable";

const MEMO_COLUMNS =
  "question_id, answer_text, accepted_answer, accepted_alternatives, keywords, answer_format, marks, memo_page_number";

const VISIBLE = ["ready", "partial"];

function check({ data, error }) {
  if (error) {
    const err = new Error(error.message || "Database error");
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  return data;
}

function createNscRepo(supabase) {
  return {
    async filterOptions() {
      return check(await supabase.rpc("nsc_paper_filter_options"));
    },

    async listPapers({ grade, subject, year, session, paperNumber, limit, offset }) {
      let q = supabase.from("nsc_papers").select(PAPER_COLUMNS, { count: "exact" }).in("processing_status", VISIBLE);
      if (grade) q = q.eq("grade", grade);
      if (subject) q = q.eq("subject", subject);
      if (year) q = q.eq("year", year);
      if (session) q = q.eq("exam_session", session);
      if (paperNumber) q = q.eq("paper_number", paperNumber);
      const res = await q
        .order("year", { ascending: false })
        .order("exam_session", { ascending: false })
        .order("subject", { ascending: true })
        .order("paper_number", { ascending: true })
        .range(offset, offset + limit - 1);
      return { papers: check(res) || [], total: res.count ?? 0 };
    },

    async getPaper(id) {
      return check(
        await supabase.from("nsc_papers").select(PAPER_COLUMNS).eq("id", id).in("processing_status", VISIBLE).maybeSingle()
      );
    },

    async getPapersByIds(ids) {
      if (!ids.length) return [];
      return check(
        await supabase
          .from("nsc_papers")
          .select("id, subject, year, exam_session, grade, paper_number, paper_title")
          .in("id", ids)
      );
    },

    async getRecallQuestions(paperId) {
      return check(
        await supabase
          .from("nsc_questions")
          .select("id, question_number, sort_key, top_question, section, question_type, question_text, is_auto_markable, marks")
          .eq("paper_id", paperId)
          .eq("is_recall_suitable", true)
      );
    },

    async getQuestions(ids) {
      if (!ids.length) return [];
      return check(await supabase.from("nsc_questions").select(QUESTION_COLUMNS).in("id", ids));
    },

    async getMemos(questionIds) {
      if (!questionIds.length) return [];
      return check(await supabase.from("nsc_memo_answers").select(MEMO_COLUMNS).in("question_id", questionIds));
    },

    async getSeenQuestionIds(userId, paperId) {
      const rows = check(
        await supabase.from("nsc_quiz_sessions").select("question_ids").eq("user_id", userId).eq("paper_id", paperId)
      );
      return new Set((rows || []).flatMap((r) => r.question_ids || []));
    },

    async createSession(row) {
      return check(await supabase.from("nsc_quiz_sessions").insert(row).select("*").single());
    },

    async getSession(id) {
      return check(await supabase.from("nsc_quiz_sessions").select("*").eq("id", id).maybeSingle());
    },

    async listSessions(userId, { paperId, limit, offset }) {
      let q = supabase.from("nsc_quiz_sessions").select("*", { count: "exact" }).eq("user_id", userId);
      if (paperId) q = q.eq("paper_id", paperId);
      const res = await q.order("started_at", { ascending: false }).range(offset, offset + limit - 1);
      return { sessions: check(res) || [], total: res.count ?? 0 };
    },

    async getAttempts(sessionId) {
      return check(
        await supabase.from("nsc_quiz_attempts").select("*").eq("session_id", sessionId).order("answered_at", { ascending: true })
      );
    },

    /** Returns null when the question was already answered in this session. */
    async insertAttempt(row) {
      const { data, error } = await supabase.from("nsc_quiz_attempts").insert(row).select("*").single();
      if (error && error.code === "23505") return null;
      return check({ data, error });
    },

    /** Self-mark an attempt that is still waiting; returns null if it isn't. */
    async selfMarkAttempt(sessionId, questionId, patch) {
      const rows = check(
        await supabase
          .from("nsc_quiz_attempts")
          .update(patch)
          .eq("session_id", sessionId)
          .eq("question_id", questionId)
          .is("is_correct", null)
          .select("*")
      );
      return rows && rows.length ? rows[0] : null;
    },
  };
}

module.exports = { createNscRepo };
