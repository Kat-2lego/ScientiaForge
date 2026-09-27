// server/skillRelevance.mjs
const OCCUPATION_FAMILIES = {
  technology: [
    "software",
    "developer",
    "programmer",
    "engineer",
    "ict",
    "it",
    "web",
    "data analyst",
    "data scientist",
    "cyber",
    "network",
    "systems administrator",
    "devops",
    "cloud",
  ],
  culinary: [
    "chef",
    "cook",
    "pastry",
    "baker",
    "culinary",
    "kitchen",
    "catering",
  ],
  healthcare: [
    "nurse",
    "doctor",
    "physician",
    "therapist",
    "pharmacist",
    "radiographer",
    "paramedic",
    "dentist",
    "midwife",
    "clinician",
    "healthcare",
    "health care",
  ],
  engineering: [
    "engineer",
    "civil engineer",
    "mechanical engineer",
    "electrical engineer",
    "industrial engineer",
    "chemical engineer",
  ],
  hospitality: [
    "hotel",
    "restaurant",
    "waiter",
    "waitress",
    "bartender",
    "front desk",
    "housekeeping",
    "tour guide",
    "travel agent",
  ],
  // Add more families as needed
};

function getOccupationFamily(occupationTitle) {
  const title = occupationTitle.toLowerCase();

  if (OCCUPATION_FAMILIES.technology.some((k) => title.includes(k))) {
    return "technology";
  }
  if (OCCUPATION_FAMILIES.culinary.some((k) => title.includes(k))) {
    return "culinary";
  }
  if (OCCUPATION_FAMILIES.healthcare.some((k) => title.includes(k))) {
    return "healthcare";
  }
  if (OCCUPATION_FAMILIES.engineering.some((k) => title.includes(k))) {
    return "engineering";
  }
  if (OCCUPATION_FAMILIES.hospitality.some((k) => title.includes(k))) {
    return "hospitality";
  }

  return "general";
}
const FAMILY_NEGATIVE_KEYWORDS = {
  technology: [
    "circuit design",
    "wafer",
    "bleach",
    "camping gear",
    "residential care",
    "healthcare user",
    "patient",
    "nursing",
    "cooking techniques",
    "cook meat",
    "prepare meals",
  ],
  culinary: [
    "circuit design",
    "wafer",
    "bleach",
    "camping gear",
    "residential care",
    "healthcare user",
    "patient",
    "nursing",
    "software configuration",
    "devops",
    "infrastructure as code",
  ],
  healthcare: [
    "circuit design",
    "wafer",
    "bleach",
    "camping gear",
    "cooking techniques",
    "cook meat",
    "prepare meals",
    "software configuration",
    "devops",
  ],
  engineering: [
    "cook meat",
    "prepare meals",
    "cooking techniques",
    "bleach",
    "camping gear",
    "residential care",
    "healthcare user",
    "patient",
    "nursing",
  ],
  hospitality: [
    "circuit design",
    "wafer",
    "bleach",
    "camping gear",
    "residential care",
    "healthcare user",
    "patient",
    "nursing",
    "software configuration",
    "devops",
  ],
  general: [],
};

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
  /human-computer interaction/i,
  /train security officers/i,
  /sex education/i,
  /analyse samples of food/i,
  /analyse samples of beverages/i,
  /food and beverages/i,
  /conduct research on reproductive medicine/i,
  /reproductive medicine/i,
  /monitor title procedures/i,
  /title procedures/i,
  /laboratory.*analysis/i,
  /lab.*analysis/i,
  /clinical.*trial/i,
  /medical.*procedure/i,
  /surgical.*procedure/i,
  /patient.*care/i,
  /nursing.*care/i,
  /operate.*machine/i,
  /operate.*press/i,
  /operate.*equipment/i,

  // New: clearly non-culinary / non-hospitality skills
  /imprint circuit design onto wafers/i,
  /types of bleach/i,
  /camping gear/i,
  /organise operations of residential care services/i,
  /assist healthcare users achieve autonomy/i,
  /types of digesters/i,
];

export function isObviouslyIrrelevant(skillLabel, occupationTitle = "") {
  // Global patterns that are always irrelevant
  const globalIrrelevant = OBVIOUSLY_IRRELEVANT_PATTERNS.some((re) =>
    re.test(skillLabel)
  );

  if (globalIrrelevant) return true;

  // Occupation-family-specific negative keywords
  const family = getOccupationFamily(occupationTitle);
  const negatives = FAMILY_NEGATIVE_KEYWORDS[family] || [];

  const lower = skillLabel.toLowerCase();

  for (const kw of negatives) {
    if (lower.includes(kw)) {
      return true;
    }
  }

  return false;
}

// You can keep scoreSkillRelevance if you want, but it’s no longer used
// by getOccupationSkills in Option B.
export function scoreSkillRelevance(occupationTitle, skillLabel) {
  return 0; // not used in Option B
}