"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { markAnswer, extractValues, answerInputFor } = require("../services/nscMarking");

const v = (answer, memo) => markAnswer(answer, memo).verdict;

test("letters: case, brackets and trailing text", () => {
  const memo = { answer_format: "letter", accepted_answer: "D" };
  for (const a of ["D", "d", "(D)", "D.", "D - Iris", " d "]) assert.equal(v(a, memo), "correct", a);
  for (const a of ["B", "Iris", "AD"]) assert.equal(v(a, memo), "incorrect", a);
});

test("true / false", () => {
  assert.equal(v("true", { answer_format: "boolean", accepted_answer: "True" }), "correct");
  assert.equal(v("Waar", { answer_format: "boolean", accepted_answer: "True" }), "correct");
  assert.equal(v("F", { answer_format: "boolean", accepted_answer: "False" }), "correct");
  assert.equal(v("true", { answer_format: "boolean", accepted_answer: "False" }), "incorrect");
});

test("numbers: 5 = 5.0 = 5,00 and units are ignored", () => {
  const memo = { answer_format: "number", accepted_answer: "x = 5" };
  for (const a of ["5", "5.0", "5,00", "x=5", "x = 5.00", "5 m", "2x = 10, x = 5"]) assert.equal(v(a, memo), "correct", a);
  for (const a of ["6", "0.5", "50", "x"]) assert.equal(v(a, memo), "incorrect", a);
});

test("numbers: several roots in any order", () => {
  const memo = { answer_format: "number", accepted_answer: "x = −2 or x = −3" };
  for (const a of ["-2 or -3", "x = -3 ; x = -2", "−3, −2", "x=-2 and x=-3"]) assert.equal(v(a, memo), "correct", a);
  assert.equal(v("-2", memo), "incorrect");
  assert.equal(v("2 or 3", memo), "incorrect");
});

test("numbers: SA decimal comma, percentages, rounding, rands, scientific", () => {
  assert.equal(v("5.35", { answer_format: "number", accepted_answer: "37,4 x 100 = 5,35%" }), "correct");
  assert.equal(v("5,35%", { answer_format: "number", accepted_answer: "= 5,35%" }), "correct");
  assert.equal(v("5.4", { answer_format: "number", accepted_answer: "= 5,35%" }), "correct"); // rounded 1 dp
  assert.equal(v("5", { answer_format: "number", accepted_answer: "= 5,35%" }), "incorrect");
  assert.equal(v("R1 250,50", { answer_format: "number", accepted_answer: "R 1 250,50" }), "correct");
  assert.equal(v("1,250.50", { answer_format: "number", accepted_answer: "R 1 250,50" }), "correct"); // US style
  assert.equal(v("6.02 x 10^23", { answer_format: "number", accepted_answer: "6,02 × 10²³" }), "correct");
  assert.equal(v("6.0e23", { answer_format: "number", accepted_answer: "6,02 × 10²³" }), "correct");
  assert.equal(v("820", { answer_format: "number", accepted_answer: "= 820" }), "correct");
  assert.equal(v("819", { answer_format: "number", accepted_answer: "= 820" }), "incorrect");
  assert.equal(v("1/2", { answer_format: "number", accepted_answer: "0,5" }), "correct");
});

test("extractValues reads the value after the last =", () => {
  assert.deepEqual(extractValues("a = 8 m·s⁻²").map((x) => x.value), [8]);
  assert.deepEqual(extractValues("T3 = 2.5 × 5 = 12.5 m").map((x) => x.value), [12.5]);
});

test("expressions: factor order and term order don't matter", () => {
  const memo = { answer_format: "expression", accepted_answer: "(x − 3)(x + 3)" };
  for (const a of ["(x-3)(x+3)", "(x+3)(x-3)", "(3+x)(x-3)", "( x + 3 ) ( x − 3 )"]) assert.equal(v(a, memo), "correct", a);
  assert.equal(v("(x-3)^2", memo), "needs_self_mark");
  assert.equal(v("x^2 - 9", memo), "needs_self_mark"); // equivalent but not factorised: student decides
});

test("terms: spelling slips, articles, alternatives, padding", () => {
  const memo = { answer_format: "term", accepted_answer: "Blastocyst", accepted_alternatives: ["blastula"], keywords: [] };
  for (const a of ["Blastocyst", "blastocyst.", "the blastocyst", "Blastocist", "blastula", "It is a blastocyst"]) {
    assert.equal(v(a, memo), "correct", a);
  }
  assert.equal(v("morula", memo), "incorrect");
  const ext = { answer_format: "term", accepted_answer: "External fertilisation", accepted_alternatives: [], keywords: ["external", "fertilisation"] };
  assert.equal(v("external fertilization", ext), "correct");
  assert.equal(v("internal fertilisation", ext), "needs_self_mark"); // shares a key word: student checks
  assert.equal(v("mitosis", ext), "incorrect");
});

test("short words are not fuzzy-matched", () => {
  const memo = { answer_format: "term", accepted_answer: "LH", accepted_alternatives: [], keywords: [] };
  assert.equal(v("FH", memo), "incorrect");
  assert.equal(v("lh", memo), "correct");
});

test("A only / B only choices", () => {
  const memo = { answer_format: "term", accepted_answer: "Both A and B" };
  assert.equal(v("Both A and B", memo), "correct");
  assert.equal(v("B only", memo), "incorrect");
});

test("text answers and blanks", () => {
  assert.equal(v("because the eggs dry out", { answer_format: "text" }), "needs_self_mark");
  assert.equal(v("   ", { answer_format: "term", accepted_answer: "Urethra" }), "incorrect");
  assert.equal(v("anything", null), "needs_self_mark");
});

test("answer input types never depend on the answer itself", () => {
  assert.equal(answerInputFor({ options: [{ label: "A" }] }, "letter"), "choice");
  assert.equal(answerInputFor({ question_type: "numerical" }, "number"), "number");
  assert.equal(answerInputFor({ question_type: "calculation" }, "number"), "working");
  assert.equal(answerInputFor({ question_type: "short_answer" }, "term"), "short");
  assert.equal(answerInputFor({ question_type: "other" }, "text"), "long");
});
