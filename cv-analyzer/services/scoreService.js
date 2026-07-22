const clampScore = (value) => {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
};

const cleanStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const normalizeCvAnalysis = (analysis) => {
  if (!analysis || typeof analysis !== "object") {
    throw new Error("Invalid CV analysis result.");
  }

  return {
    score: clampScore(analysis.score),
    match: clampScore(analysis.match),
    ats: clampScore(analysis.ats),
    content: clampScore(analysis.content),
    formatting: clampScore(analysis.formatting),

    targetRole:
      typeof analysis.targetRole === "string"
        ? analysis.targetRole.trim()
        : "",

    skills: cleanStringArray(analysis.skills),
    missingSkills: cleanStringArray(analysis.missingSkills),

    summary:
      typeof analysis.summary === "string"
        ? analysis.summary.trim()
        : "",

    feedback: {
      good: cleanStringArray(analysis.feedback?.good),
      bad: cleanStringArray(analysis.feedback?.bad),
      quickFixes: cleanStringArray(
        analysis.feedback?.quickFixes
      ),
    },
  };
};