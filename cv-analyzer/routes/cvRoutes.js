import express from "express";
import multer from "multer";
import Groq from "groq-sdk";
import { extractTextFromFile } from "../services/pdfService.js";
const router = express.Router();
const upload = multer();

// DEBUG: confirm env is loaded
console.log("🔑 GROQ KEY LOADED:", process.env.GROQ_API_KEY ? "YES" : "NO");

// Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // extract text from PDF
   const text = await extractTextFromFile(req.file.buffer, req.file.mimetype);
    console.log("📄 EXTRACTED TEXT:", text?.slice(0, 300)); // DEBUG

    // prompt
    const prompt = `
You are an expert ATS CV Analyzer.

Return ONLY valid JSON in this format:

{
  "score": 0,
  "match": 0,
  "ats": 0,
  "content": 0,
  "formatting": 0,
  "skills": [],
  "feedback": {
    "good": [],
    "bad": [],
    "quickFixes": []
  }
}

CV:
${text}
`;

    // call Groq
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    let aiResponse = completion.choices[0]?.message?.content || "";

    // clean markdown JSON
    aiResponse = aiResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // parse safely
    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (err) {
      return res.status(500).json({
        error: "Failed to parse AI response",
        raw: aiResponse,
      });
    }

    res.json(parsed);

  } catch (error) {
    console.error("CV ANALYZER ERROR:", error);

    res.status(500).json({
      error: "AI CV analysis failed",
      details: error.message,
    });
  }
});

export default router;