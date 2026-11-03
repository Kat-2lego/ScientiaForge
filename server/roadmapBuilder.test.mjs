// server/roadmapBuilder.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { buildRoadmap } from "./roadmapBuilder.mjs";

const modules = [
  {
    id: "property-market",
    title: "Property Market Research",
    stage: "Foundations",
    order: 10,
    description: "Research and compare properties.",
    skills: [
      "real estate market",
      "compare property values",
    ],
    suggestedAction: "Prepare a sample property comparison.",

    // These legacy fields must not reach the response.
    steps: [{ title: "Old lesson" }],
    resourceUrl: "https://example.com",
    resources: [{ title: "Old resource", url: "https://example.com" }],
  },
  {
    id: "property-valuation",
    title: "Property Valuation",
    stage: "Career knowledge",
    order: 20,
    description: "Understand property valuation.",
    skills: [
      "compare property values",
      "value properties",
    ],
  },
];

function recommendedSkills(result) {
  return [
    ...result.roadmap.flatMap((area) => area.skillsToAcquire),
    ...result.otherSkills,
  ];
}

test("every missing skill is recommended exactly once", () => {
  const missing = [
    "real estate market",
    "compare property values",
    "value properties",
    "mortgage loans",
  ];

  const result = buildRoadmap(missing, modules);
  const recommended = recommendedSkills(result);

  assert.deepEqual(
    [...recommended].sort(),
    [...missing].sort()
  );

  assert.equal(new Set(recommended).size, recommended.length);

  assert.equal(
    result.summary.groupedSkills + result.summary.otherSkills,
    result.summary.totalMissingSkills
  );
});

test("overlapping groups do not repeat the same skill", () => {
  const result = buildRoadmap(
    ["compare property values", "value properties"],
    modules
  );

  const occurrences = recommendedSkills(result).filter(
    (skill) => skill === "compare property values"
  );

  assert.equal(occurrences.length, 1);
});

test("removing a missing skill removes its recommendation", () => {
  const before = buildRoadmap(
    ["real estate market", "compare property values"],
    modules
  );

  const after = buildRoadmap(
    ["real estate market"],
    modules
  );

  assert.ok(
    recommendedSkills(before).includes("compare property values")
  );

  assert.ok(
    !recommendedSkills(after).includes("compare property values")
  );

  // The development area remains because another skill still matches.
  assert.equal(after.roadmap[0].id, "property-market");
});

test("skills without custom groups remain visible", () => {
  const missing = [
    "operate welding equipment",
    "interpret 2D plans",
    "wear appropriate protective gear",
  ];

  const result = buildRoadmap(missing, modules);

  assert.equal(result.roadmap.length, 0);
  assert.deepEqual(result.otherSkills, missing);
  assert.equal(result.summary.totalMissingSkills, 3);
});

test("an empty missing list produces an empty roadmap", () => {
  const result = buildRoadmap([], modules);

  assert.deepEqual(result.roadmap, []);
  assert.deepEqual(result.otherSkills, []);
  assert.equal(result.summary.totalMissingSkills, 0);
});

test("case and whitespace variations do not duplicate skills", () => {
  const result = buildRoadmap(
    [
      "compare property values",
      " COMPARE   PROPERTY VALUES ",
    ],
    modules
  );

  assert.equal(result.summary.totalMissingSkills, 1);
  assert.equal(recommendedSkills(result).length, 1);
  assert.equal(result.roadmap.length, 1);
});

test("development areas follow the configured editorial order", () => {
  const result = buildRoadmap(
    ["value properties", "real estate market"],
    [...modules].reverse()
  );

  assert.deepEqual(
    result.roadmap.map((area) => area.id),
    ["property-market", "property-valuation"]
  );
});

test("course steps and resources are excluded from recommendations", () => {
  const result = buildRoadmap(
    ["real estate market"],
    modules
  );

  const area = result.roadmap[0];

  for (const field of ["steps", "resources", "resourceUrl"]) {
    assert.equal(Object.hasOwn(area, field), false);
  }

  assert.equal(
    area.suggestedAction,
    "Prepare a sample property comparison."
  );
});