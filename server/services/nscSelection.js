/**
 * Choose up to 20 real questions from a paper for an Active Recall session.
 *
 *  1. only questions the collector marked suitable are passed in
 *  2. near-duplicates are dropped ("Identify part B" / "Identify part C")
 *  3. questions are spread across the paper's top-level questions so one
 *     section (e.g. 10 MCQs) can't take over the session
 *  4. inside each question: questions this student hasn't seen come first,
 *     then auto-markable ones, then paper order
 *  5. the chosen questions are presented in paper order
 *
 * Nothing is invented: a paper with 12 suitable questions gives a 12-question session.
 */
"use strict";

const { normalizeText } = require("./nscMarking");

const MAX_SESSION_QUESTIONS = 20;

function compareSortKey(a, b) {
  const ka = a.sort_key || [];
  const kb = b.sort_key || [];
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] ?? -1) - (kb[i] ?? -1);
    if (d) return d;
  }
  return (a.id || 0) - (b.id || 0);
}

function wordSet(text) {
  return new Set(normalizeText(text).split(" ").filter((w) => w.length > 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function dropNearDuplicates(questions) {
  const kept = [];
  const sets = [];
  for (const q of [...questions].sort(compareSortKey)) {
    const ws = wordSet(q.question_text || "");
    const dup = kept.some((k, i) => k.top_question === q.top_question && ws.size >= 3 && jaccard(ws, sets[i]) >= 0.85);
    if (!dup) {
      kept.push(q);
      sets.push(ws);
    }
  }
  return kept;
}

function selectQuestions(questions, { limit = MAX_SESSION_QUESTIONS, seen = new Set() } = {}) {
  const max = Math.max(1, Math.min(limit, MAX_SESSION_QUESTIONS));
  const pool = dropNearDuplicates(questions || []);
  if (pool.length <= max) return pool.sort(compareSortKey);

  const rank = (q) => (seen.has(q.id) ? 2 : 0) + (q.is_auto_markable ? 0 : 1);
  const byPriority = (a, b) => rank(a) - rank(b) || compareSortKey(a, b);

  const groups = new Map();
  for (const q of pool) {
    const key = `${q.section || ""}|${q.top_question}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  const ordered = [...groups.values()].sort((a, b) => compareSortKey(a[0], b[0]));
  ordered.forEach((g) => g.sort(byPriority));

  // Round-robin: every top-level question gets a turn, best candidates first.
  const chosen = [];
  while (chosen.length < max && ordered.some((g) => g.length)) {
    for (const g of ordered) {
      if (chosen.length >= max) break;
      if (g.length) chosen.push(g.shift());
    }
  }
  return chosen.sort(compareSortKey);
}

module.exports = { selectQuestions, dropNearDuplicates, compareSortKey, MAX_SESSION_QUESTIONS };
