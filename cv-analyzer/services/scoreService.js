export const calculateCVScore = (text) => {
  const lowerText = text.toLowerCase();

  const skills = [
    "javascript",
    "react",
    "node",
    "html",
    "css",
    "sql",
    "python",
    "java",
    "git",
    "api"
  ];

  let score = 0;
  let foundSkills = [];

  skills.forEach((skill) => {
    if (lowerText.includes(skill)) {
      score += 10;
      foundSkills.push(skill);
    }
  });

  // cap score at 100
  if (score > 100) score = 100;

  return {
    score,
    foundSkills
  };
};