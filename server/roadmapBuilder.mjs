// server/roadmapBuilder.mjs

function normalizeSkill(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRoadmap(missingSkills, modules) {
  const missingByKey = new Map();

  for (const skill of missingSkills) {
    const key = normalizeSkill(skill);

    if (key && !missingByKey.has(key)) {
      missingByKey.set(key, skill.trim());
    }
  }

  const candidates = modules
    .map((module) => {
      const supportedSkills = new Set(
        (module.skills || []).map(normalizeSkill)
      );

      const matchedSkills = [...missingByKey.entries()]
        .filter(([key]) => supportedSkills.has(key))
        .map(([, label]) => label);

      return {
        ...module,
        matchedSkills,
      };
    })
    .filter((module) => module.matchedSkills.length > 0)
    .sort(
      (a, b) =>
        (a.order ?? 1000) - (b.order ?? 1000) ||
        b.matchedSkills.length - a.matchedSkills.length ||
        a.id.localeCompare(b.id)
    );

  const groupedKeys = new Set();
  const roadmap = [];

  for (const module of candidates) {
    // Assign each missing skill to one development area.
    const skillsToAcquire = module.matchedSkills.filter(
      (skill) => !groupedKeys.has(normalizeSkill(skill))
    );

    if (!skillsToAcquire.length) continue;

    roadmap.push({
      id: module.id,
      title: module.title,
      description: module.description,
      stage: module.stage || "Skill development",
      skillsToAcquire,
      suggestedAction:
        module.suggestedAction || module.practiceTask || null,
      note: module.note || null,
    });

    for (const skill of skillsToAcquire) {
      groupedKeys.add(normalizeSkill(skill));
    }
  }

  // Ungrouped skills remain recommendations, not unsupported content.
  const otherSkills = [...missingByKey.entries()]
    .filter(([key]) => !groupedKeys.has(key))
    .map(([, label]) => label);

  return {
    roadmap,
    otherSkills,
    summary: {
      totalMissingSkills: missingByKey.size,
      developmentAreas: roadmap.length,
      groupedSkills: groupedKeys.size,
      otherSkills: otherSkills.length,
    },
  };
}