/* =========================================================
   ARTICULATION COACH — PRACTICE MATERIAL
   Lives on the server so the coaching model is only ever given
   prompts we wrote, never text supplied by the browser.

   Rules for the "say it clearly" sentences (enforced by the tests):
   letters, spaces, commas and full stops only — no digits, hyphens
   or contractions — so the speech-to-text output can be compared
   word-for-word with the target.
========================================================= */

export const EXPLAIN_PROMPTS = [
  // interview
  { id: "e-about-you", category: "interview", text: "Tell me about yourself.", targetSeconds: 45 },
  { id: "e-hire-you", category: "interview", text: "Why should we hire you?", targetSeconds: 45 },
  { id: "e-strength", category: "interview", text: "What is your greatest strength, and when did it help you most?", targetSeconds: 45 },
  { id: "e-problem", category: "interview", text: "Tell me about a time you solved a difficult problem.", targetSeconds: 60 },
  { id: "e-five-years", category: "interview", text: "Where do you want to be in five years, and how will you get there?", targetSeconds: 45 },
  { id: "e-why-us", category: "interview", text: "Why do you want to work for this company?", targetSeconds: 40 },
  // workplace
  { id: "e-explain-job", category: "workplace", text: "Explain what you do, or want to do, to a friend who knows nothing about your field.", targetSeconds: 45 },
  { id: "e-late-update", category: "workplace", text: "Give your manager a clear update on a project that is running late.", targetSeconds: 45 },
  { id: "e-disagree", category: "workplace", text: "Politely disagree with a colleague's idea and suggest a better one.", targetSeconds: 40 },
  { id: "e-first-day", category: "workplace", text: "Introduce yourself to your new team on your first day.", targetSeconds: 30 },
  { id: "e-mistake", category: "workplace", text: "Describe a mistake you made at work or school and what you learned from it.", targetSeconds: 45 },
  // school
  { id: "e-teach", category: "school", text: "Teach a younger learner one thing you studied this week.", targetSeconds: 45 },
  { id: "e-class-intro", category: "school", text: "Introduce yourself to your class for an oral presentation.", targetSeconds: 30 },
  { id: "e-persuade", category: "school", text: "Persuade your classmates to join a club or project you care about.", targetSeconds: 45 },
  { id: "e-inspire", category: "school", text: "Describe a person who inspires you and explain why.", targetSeconds: 45 },
];

export const REPEAT_PROMPTS = [
  // easy
  { id: "r-excited", level: "easy", text: "I am excited about this opportunity." },
  { id: "r-thanks", level: "easy", text: "Thank you for taking the time to meet with me today." },
  { id: "r-team", level: "easy", text: "I work well in a team and on my own." },
  { id: "r-learn", level: "easy", text: "I would like to learn more about the role." },
  // medium
  { id: "r-strengths", level: "medium", text: "Please describe your strengths and the skills you bring to this role." },
  { id: "r-satisfaction", level: "medium", text: "I specifically increased customer satisfaction through consistent communication." },
  { id: "r-prepared", level: "medium", text: "My experience has prepared me for the responsibilities of this position." },
  { id: "r-accountable", level: "medium", text: "Collaboration and accountability are important to how I work." },
  // hard
  { id: "r-stakeholder", level: "hard", text: "Strategic stakeholder engagement strengthens project outcomes and builds trust." },
  { id: "r-thirteenth", level: "hard", text: "The thirteenth quarterly review revealed three significant improvements." },
  { id: "r-targets", level: "hard", text: "Our team consistently exceeded the performance targets despite tight deadlines." },
  { id: "r-pressure", level: "hard", text: "I thoroughly enjoy solving complex problems under pressure." },
];

export function findPrompt(mode, id) {
  const list = mode === "explain" ? EXPLAIN_PROMPTS : mode === "repeat" ? REPEAT_PROMPTS : [];
  return list.find((p) => p.id === id) || null;
}
