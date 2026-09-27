// server/skillRelevance.mjs

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

export function isObviouslyIrrelevant(skillLabel) {
  return OBVIOUSLY_IRRELEVANT_PATTERNS.some((re) => re.test(skillLabel));
}

// You can keep scoreSkillRelevance if you want, but it’s no longer used
// by getOccupationSkills in Option B.
export function scoreSkillRelevance(occupationTitle, skillLabel) {
  return 0; // not used in Option B
}