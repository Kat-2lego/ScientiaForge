// server/skillMatcher.mjs

const STOPWORDS = new Set([
  "apply",
  "using",
  "use",
  "basic",
  "advanced",
  "skills",
  "skill",
  "knowledge",
  "abilities",
  "ability",
  "competence",
  "competences",
  "and",
  "or",
  "the",
  "a",
  "an",
  "with",
  "for",
  "to",
  "in",
  "on",
  "of",
]);

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[_.,\/#!$%\^&\*;:{}=\-_`~()"'?+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.filter((t) => !STOPWORDS.has(t));
}

function skillMatchScore(userSkill, requiredSkill) {
  const uTokens = tokenize(userSkill);
  const rTokens = tokenize(requiredSkill);

  if (uTokens.length === 0 || rTokens.length === 0) {
    return 0;
  }

  // Count overlapping tokens
  const userSet = new Set(uTokens);
  const overlap = rTokens.filter((t) => userSet.has(t));

  // Score based on how many required tokens are covered
  return overlap.length / rTokens.length;
}

/**
 * For each required skill, decide if the user "has" it.
 * Returns { have: string[], missing: string[] }
 */
export function computeSkillGap(userSkillNames, requiredSkills, threshold = 0.5) {
  const have = [];
  const missing = [];

  for (const req of requiredSkills) {
    let bestScore = 0;

    for (const userSkill of userSkillNames) {
      const score = skillMatchScore(userSkill, req);
      if (score > bestScore) bestScore = score;
    }

    if (bestScore >= threshold) {
      have.push(req);
    } else {
      missing.push(req);
    }
  }

  return { have, missing };
}