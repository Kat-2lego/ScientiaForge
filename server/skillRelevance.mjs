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

// Core domain keywords that make a skill plausibly relevant to office/knowledge-work roles.
// This is intentionally broad but excludes clearly physical/biological/medical domains.
const CORE_SKILL_KEYWORDS = [
  "communication",
  "interpersonal",
  "negotiation",
  "negotiate",
  "rights",
  "human rights",
  "law",
  "legal",
  "policy",
  "compliance",
  "advocacy",
  "advise",
  "counselling",
  "counseling",
  "support",
  "victim",
  "violation",
  "investigate",
  "research",
  "analysis",
  "analyse",
  "analysis",
  "data",
  "information",
  "documentation",
  "reporting",
  "stakeholder",
  "engagement",
  "community",
  "social",
  "service",
  "case",
  "management",
  "project",
  "planning",
  "strategy",
  "monitoring",
  "evaluation",
  "training",
  "capacity building",
  "awareness",
  "campaign",
  "fundraising",
  "grant",
  "budget",
  "finance",
  "administration",
  "coordination",
  "collaboration",
  "partnership",
  "networking",
  "governance",
  "ethics",
  "risk",
  "quality",
  "improvement",
  "development",
  "implementation",
  "monitor",
  "evaluate",
  "consultation",
  "participation",
  "inclusion",
  "diversity",
  "equality",
  "equity",
  "non-discrimination",
  "discrimination",
  "harassment",
  "complaint",
  "mediation",
  "conflict",
  "resolution",
  "peace",
  "justice",
  "court",
  "legislation",
  "regulation",
  "standard",
  "procedure",
  "guideline",
  "framework",
  "system",
  "process",
  "database",
  "ict",
  "digital",
  "software",
  "application",
  "web",
  "internet",
  "technology",
  "security",
  "privacy",
  "confidentiality",
  "record",
  "records",
  "knowledge",
  "learning",
  "education",
  "teaching",
  "curriculum",
  "assessment",
  "marketing",
  "brand",
  "customer",
  "client",
  "sales",
  "service",
  "retail",
  "finance",
  "accounting",
  "budgeting",
  "audit",
  "tax",
  "investment",
  "insurance",
  "banking",
  "economic",
  "economy",
  "trade",
  "industry",
  "supply chain",
  "logistics",
  "procurement",
  "contract",
  "tender",
  "vendor",
  "supplier",
];

// Patterns that almost always indicate irrelevant skills for office/knowledge-work roles.
const OBVIOUSLY_IRRELEVANT_PATTERNS = [
  /printing press/i,
  /flexographic/i,
  /rotogravure/i,
  /paper press/i,
  /weaving/i,
  /rope lashing/i,
  /airport stakeholder/i,
  /promote animals/i,
  /animal.*promote/i,
  /liquid penetrant/i,
  /headbox/i,
  /vacuum forming/i,
  /vehicle.*accessibility equipment/i,
  /measure the human body for wearing apparel/i,
  /radiation effects on human body/i,
  /human anatomy/i,
  /human physiology/i,
  /human ear/i,
  /human dynamics as part of hospitality/i,
  /human factors regarding safety/i,
  /human resources department processes/i,
  /forecast human population trends/i,
  /provide treatment strategies for challenges to human health/i,
  /human-computer interaction/i, // optional: remove if you DO want HCI
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

export function hasCoreSkillKeyword(skillLabel) {
  const lower = skillLabel.toLowerCase();

  // Direct phrase checks for multi-word keywords
  const multiWord = [
    "human rights",
    "supply chain",
    "conflict resolution",
    "capacity building",
  ];

  for (const phrase of multiWord) {
    if (lower.includes(phrase)) return true;
  }

  const tokens = tokenize(lower);
  const tokenSet = new Set(tokens);

  for (const kw of CORE_SKILL_KEYWORDS) {
    if (kw.includes(" ")) {
      if (lower.includes(kw)) return true;
    } else {
      if (tokenSet.has(kw)) return true;
    }
  }

  return false;
}

export function scoreSkillRelevance(occupationTitle, skillLabel) {
  const occTokens = tokenize(occupationTitle);
  const skillTokens = tokenize(skillLabel);

  if (occTokens.length === 0 || skillTokens.length === 0) {
    return 0;
  }

  const occSet = new Set(occTokens);

  const occOverlap = skillTokens.filter((t) => occSet.has(t)).length;

  const startsWithOccToken = occTokens.some((t) =>
    skillTokens[0]?.startsWith(t)
  )
    ? 0.5
    : 0;

  const lengthPenalty =
    skillTokens.length > 6 ? (skillTokens.length - 6) * 0.05 : 0;

  const baseScore = occOverlap / occTokens.length;

  return Math.max(0, baseScore + startsWithOccToken - lengthPenalty);
}