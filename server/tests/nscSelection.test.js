"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { selectQuestions, dropNearDuplicates } = require("../services/nscSelection.cjs");

let id = 0;
const q = (top, sub, extra = {}) => ({
  id: ++id,
  question_number: `${top}.${sub}`,
  sort_key: [top, sub],
  top_question: top,
  section: top === 1 ? "Section A" : "Section B",
  question_text: `Question ${top}.${sub} about topic ${top * 100 + sub}`,
  is_auto_markable: false,
  ...extra,
});

test("small papers keep every question, in paper order", () => {
  const qs = [q(2, 1), q(1, 2), q(1, 1)];
  assert.deepEqual(selectQuestions(qs).map((x) => x.question_number), ["1.1", "1.2", "2.1"]);
});

test("never more than 20, spread across top-level questions", () => {
  const qs = [];
  for (let i = 1; i <= 30; i++) qs.push(q(1, i, { is_auto_markable: true })); // 30 MCQs
  for (let t = 2; t <= 4; t++) for (let i = 1; i <= 6; i++) qs.push(q(t, i));
  const picked = selectQuestions(qs);
  assert.equal(picked.length, 20);
  const perTop = picked.reduce((m, x) => ((m[x.top_question] = (m[x.top_question] || 0) + 1), m), {});
  assert.ok(perTop[1] <= 5 + 1, JSON.stringify(perTop));
  assert.ok(perTop[2] >= 4 && perTop[3] >= 4 && perTop[4] >= 4, JSON.stringify(perTop));
  const order = picked.map((x) => x.sort_key.join("."));
  assert.deepEqual(order, [...order].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
});

test("auto-markable questions preferred within a question, unseen before seen", () => {
  const qs = [];
  for (let i = 1; i <= 25; i++) qs.push(q(3, i, { is_auto_markable: i > 20 }));
  const picked = selectQuestions(qs);
  assert.ok([21, 22, 23, 24, 25].every((n) => picked.some((x) => x.question_number === `3.${n}`)));
  const seen = new Set(picked.map((x) => x.id));
  const second = selectQuestions(qs, { seen });
  const fresh = second.filter((x) => !seen.has(x.id));
  assert.equal(fresh.length, 5); // only 5 unseen remain, and they're all used
});

test("near-duplicate questions are dropped", () => {
  const qs = [
    q(2, 1, { question_text: "Identify the part labelled B in the ear" }),
    q(2, 2, { question_text: "Identify the part labelled C in the ear" }),
    q(2, 3, { question_text: "Explain how the cochlea converts vibrations" }),
  ];
  // "part B" / "part C" differ only by a label: one of them is enough in a 20-question session
  assert.deepEqual(dropNearDuplicates(qs).map((x) => x.question_number), ["2.1", "2.3"]);
  const same = [q(3, 1, { question_text: "Name the hormone secreted by the pituitary gland" }),
                q(3, 2, { question_text: "Name the hormone secreted by the pituitary gland." })];
  assert.equal(dropNearDuplicates(same).length, 1);
});
