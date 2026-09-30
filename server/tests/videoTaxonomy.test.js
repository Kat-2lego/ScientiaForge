"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const tx = require("../services/video/taxonomy");

const where = (q, subject = null) => {
  const d = tx.detectTopic(q, subject);
  if (!d) return null;
  if (d.confidence !== "high") return "low";
  return [d.subject, d.topic, d.subtopic].filter(Boolean).join("/");
};

test("learners' own words find the right subject and topic (Grades 10-12)", () => {
  const cases = {
    "how do I solve sin x equations": "mathematics/trigonometry/equations",
    "grade 12 trigonometry": "mathematics/trigonometry",
    "surface area of a cone": "mathematics/measurement",
    photosynthesis: "life-sciences/photosynthesis-respiration",
    mitosis: "life-sciences/cells",
    "the heart": "life-sciences/transport-support",
    "newton second law": "physical-sciences/mechanics/newtons-laws",
    "Newton's 3rd law problems": "physical-sciences/mechanics/newtons-laws",
    "boyles law": "physical-sciences/gases",
    "galvanic cells": "physical-sciences/electrochemistry",
    "supply and demand": "economics/microeconomics",
    "python loops": "programming/python/basics",
  };
  for (const [q, want] of Object.entries(cases)) assert.equal(where(q), want, q);
});

test("vague or unrelated words never pick a subject on their own", () => {
  assert.equal(where("hello there"), null);
  assert.equal(where("graph"), "low");
  assert.equal(where("excel cell formatting"), "computer-applications-technology/spreadsheets", "a spreadsheet cell is not biology");
});

test("every id is unique and every topic has a name", () => {
  const { subjects } = tx.publicTaxonomy();
  assert.equal(new Set(subjects.map((s) => s.id)).size, subjects.length);
  for (const s of subjects) {
    assert.equal(new Set(s.topics.map((t) => t.id)).size, s.topics.length, s.id);
    for (const t of s.topics) {
      assert.ok(t.name, `${s.id}/${t.id}`);
      assert.equal(new Set(t.subtopics.map((x) => x.id)).size, t.subtopics.length, `${s.id}/${t.id}`);
    }
  }
});
