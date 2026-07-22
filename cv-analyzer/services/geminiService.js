import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const cvAnalysisSchema = {
  type: "object",
  properties: {
    score: {
      type: "number",
      description: "Overall CV score from 0 to 100",
    },
    match: {
      type: "number",
      description: "Target job match percentage from 0 to 100",
    },
    ats: {
      type: "number",
      description: "ATS compatibility score from 0 to 100",
    },
    content: {
      type: "number",
      description: "CV content quality score from 0 to 100",
    },
    formatting: {
      type: "number",
      description: "CV formatting score from 0 to 100",
    },
    targetRole: {
      type: "string",
      description: "The job role used to evaluate the CV",
    },
    skills: {
      type: "array",
      items: {
        type: "string",
      },
      description: "Skills that are clearly found in the CV",
    },
    missingSkills: {
      type: "array",
      items: {
        type: "string",
      },
      description: "Important skills missing for the target role",
    },
    summary: {
      type: "string",
      description: "A short professional summary of the CV analysis",
    },
    feedback: {
      type: "object",
      properties: {
        good: {
          type: "array",
          items: {
            type: "string",
          },
        },
        bad: {
          type: "array",
          items: {
            type: "string",
          },
        },
        quickFixes: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: ["good", "bad", "quickFixes"],
    },
  },
  required: [
    "score",
    "match",
    "ats",
    "content",
    "formatting",
    "targetRole",
    "skills",
    "missingSkills",
    "summary",
    "feedback",
  ],
};

export const analyzeCvWithGemini = async (
  cvText,
  targetRole = "General professional role"
) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from the .env file.");
  }

  if (!cvText || cvText.trim().length < 100) {
    throw new Error("The extracted CV text is empty or too short.");
  }

  const prompt = `
You are an expert ATS CV analyzer and recruitment specialist.

Analyze the CV only from the information provided below.

Target role:
${targetRole}

Instructions:

1. Give every score as a number from 0 to 100.
2. Do not invent qualifications, experience, projects or skills.
3. Only include a skill under "skills" when it is clearly present in the CV.
4. Include relevant missing skills under "missingSkills" based on the target role.
5. Evaluate ATS compatibility, content quality and formatting separately.
6. Give clear, practical and specific feedback.
7. Keep each feedback item concise.
8. Return honest scores. Do not automatically give a high score.
9. The overall score should reasonably reflect ATS, content, formatting and job match.
10. Do not include Markdown or text outside the required JSON structure.

CV text:
${cvText}
`;

const response = await ai.models.generateContent({
  model: "gemini-3.5-flash",
  contents: prompt,
  config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: cvAnalysisSchema,
    },
  });

  const responseText = response.text?.trim();

  if (!responseText) {
    throw new Error("Gemini returned an empty response.");
  }

  try {
    return JSON.parse(responseText);
  } catch {
    console.error("Invalid Gemini response:", responseText);
    throw new Error("Gemini returned invalid JSON.");
  }
};