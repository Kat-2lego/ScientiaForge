// server/skillRelevance.mjs

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
  "ensure",
  "perform",
  "carry out",
  "operate",
  "manage",
  "develop",
]);

const WEB_DEV_KEYWORDS = [
  "web",
  "software",
  "application",
  "api",
  "frontend",
  "backend",
  "database",
  "server",
  "cloud",
  "devops",
  "security",
  "testing",
  "framework",
  "cms",
  "wordpress",
  "joomla",
  "drupal",
  "analytics",
  "marketing",
  "seo",
  "social media",
  "version control",
  "git",
  "agile",
  "scrum",
  "ci/cd",
  "container",
  "docker",
  "kubernetes",
  "microservice",
  "rest",
  "graphql",
  "javascript",
  "typescript",
  "python",
  "java",
  "php",
  "ruby",
  "node",
  "react",
  "angular",
  "vue",
  "sql",
  "nosql",
  "html",
  "css",
  "ux",
  "ui",
  "accessibility",
  "w3c",
  "owasp",
];

const OBVIOUSLY_IRRELEVANT_PATTERNS = [
  /printing press/i,
  /flexographic/i,
  /rotogravure/i,
  /paper press/i,
  /weaving/i,
  /rope lashing/i,
  /airport stakeholder/i,
  /animal/i,
  /promote animals/i,
  /liquid penetrant/i,
  /headbox/i,
  /vacuum forming/i,
  /vehicle.*accessibility equipment/i,
];

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[_.,\/#!$%\^&\*;:{}=\-_`~()"'?+]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t));
}

export function isObviouslyIrrelevant(skillLabel) {
  return OBVIOUSLY_IRRELEVANT_PATTERNS.some((re) => re.test(skillLabel));
}

export function scoreSkillRelevance(occupationTitle, skillLabel) {
  const occTokens = tokenize(occupationTitle);
  const skillTokens = tokenize(skillLabel);

  if (occTokens.length === 0 || skillTokens.length === 0) {
    return 0;
  }

  const occSet = new Set(occTokens);
  const webSet = new Set(WEB_DEV_KEYWORDS);

  // Overlap with occupation tokens
  const occOverlap = skillTokens.filter((t) => occSet.has(t)).length;

  // Overlap with general web/dev keywords
  const webOverlap = skillTokens.filter((t) => webSet.has(t)).length;

  // Bonus if skill starts with an occupation token
  const startsWithOccToken = occTokens.some((t) =>
    skillTokens[0]?.startsWith(t)
  )
    ? 0.5
    : 0;

  // Penalize very long, generic-sounding skills
  const lengthPenalty =
    skillTokens.length > 6 ? (skillTokens.length - 6) * 0.05 : 0;

  const baseScore = (occOverlap * 1.5 + webOverlap) / (occTokens.length + 1);

  return Math.max(0, baseScore + startsWithOccToken - lengthPenalty);
}