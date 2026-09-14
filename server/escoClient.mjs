// server/escoClient.mjs

import {
  scoreSkillRelevance,
  isObviouslyIrrelevant,
  hasCoreSkillKeyword,
} from "./skillRelevance.mjs";

const ESCO_BASE_URL = "https://ec.europa.eu/esco/api";

export async function searchEscoOccupations(searchText) {
  const url = new URL(`${ESCO_BASE_URL}/search`);

  url.searchParams.set("text", searchText);
  url.searchParams.set("type", "occupation");
  url.searchParams.set("language", "en");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SkillForge/1.0",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ESCO occupation search failed: ${response.status}. ` +
      `Body: ${text.slice(0, 200)}`
    );
  }

  const data = await response.json();
  const results = data?._embedded?.results || [];

  return results.map((item) => ({
    escoUri: item.uri,
    title: item.title || item.label || "Unnamed occupation",
    iscoCode: extractIscoCode(item),
  }));
}

export function extractIscoCode(concept) {
  if (typeof concept.code === "string" && /^\d/.test(concept.code)) {
    const match = concept.code.match(/^(\d{4})/);
    if (match) return match[1];
    return concept.code.slice(0, 4);
  }

  if (Array.isArray(concept.codes) && concept.codes.length > 0) {
    const firstCode =
      concept.codes[0].value ||
      concept.codes[0].code ||
      concept.codes[0];

    if (typeof firstCode === "string" && /^\d/.test(firstCode)) {
      const match = firstCode.match(/^(\d{4})/);
      if (match) return match[1];
      return firstCode.slice(0, 4);
    }
  }

  return null;
}

export async function getOccupationSkills(escoUri, language = "en", options = {}) {
  const {
    maxSkills = 30,
    fetchLimit = 80,
  } = options;

  const conceptUrl = new URL(`${ESCO_BASE_URL}/resource`);
  conceptUrl.searchParams.set("uri", escoUri);

  const conceptRes = await fetch(conceptUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SkillForge/1.0",
    },
  });

  if (!conceptRes.ok) {
    const text = await conceptRes.text().catch(() => "");
    throw new Error(
      `ESCO concept request failed: ${conceptRes.status}. ` +
      `Body: ${text.slice(0, 200)}`
    );
  }

  const concept = await conceptRes.json();

  const iscoCode = extractIscoCode(concept);

  if (!iscoCode) {
    console.warn("No ISCO code found for occupation:", escoUri);
    return [];
  }

  const occupationTitle =
    concept.preferredLabel?.[language] ||
    concept.preferredLabel?.en ||
    concept.title ||
    "worker";

  const skillsUrl = new URL(`${ESCO_BASE_URL}/search`);

  skillsUrl.searchParams.set("type", "skill");
  skillsUrl.searchParams.set("language", language);
  skillsUrl.searchParams.set("limit", String(fetchLimit));
  skillsUrl.searchParams.set("text", occupationTitle);
  skillsUrl.searchParams.set("isco", iscoCode);

  console.log(
    `ESCO skills search: text="${occupationTitle}", isco=${iscoCode}, limit=${fetchLimit}`
  );

  const skillsRes = await fetch(skillsUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SkillForge/1.0",
    },
  });

  if (!skillsRes.ok) {
    const text = await skillsRes.text().catch(() => "");
    throw new Error(
      `ESCO skills search failed: ${skillsRes.status}. ` +
      `Body: ${text.slice(0, 200)}`
    );
  }

  const skillsData = await skillsRes.json();
  const results = skillsData?._embedded?.results || [];

  console.log(
    `ESCO skills search returned ${results.length} raw skills for ISCO ${iscoCode} ("${occupationTitle}")`
  );

  let allSkills = results.map((s) => {
    const label =
      s.preferredLabel?.[language] ||
      s.preferredLabel?.en ||
      s.title ||
      s.label ||
      "Skill";
    return label;
  });

  // 1) Hard filter: remove obviously irrelevant skills
  const filteredByIrrelevance = allSkills.filter(
    (label) => !isObviouslyIrrelevant(label)
  );

  console.log(
    `After irrelevance filter: ${filteredByIrrelevance.length} skills for "${occupationTitle}"`
  );

  // 2) Require at least one core skill keyword
  const filteredByCore = filteredByIrrelevance.filter((label) =>
    hasCoreSkillKeyword(label)
  );

  console.log(
    `After core keyword filter: ${filteredByCore.length} skills for "${occupationTitle}"`
  );

  // 3) Score and sort by relevance
  const scored = filteredByCore.map((label) => ({
    label,
    score: scoreSkillRelevance(occupationTitle, label),
  }));

  scored.sort((a, b) => b.score - a.score);

  // 4) Take top N
  const top = scored.slice(0, maxSkills);

  console.log(
    `Selected ${top.length} top skills for "${occupationTitle}"; top score=${top[0]?.score?.toFixed(3) ?? 0}, last score=${top[top.length - 1]?.score?.toFixed(3) ?? 0}`
  );

  return top.map((s) => s.label);
}