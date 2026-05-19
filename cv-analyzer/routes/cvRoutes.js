import express from "express";
import multer from "multer";
import { extractTextFromPDF } from "../services/pdfService.js";
import { calculateCVScore } from "../services/scoreService.js";

const router = express.Router();
const upload = multer();

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const text = await extractTextFromPDF(req.file.buffer);

    const result = calculateCVScore(text);

    let feedback = [];

    if (result.score < 40) {
      feedback.push("Add more technical skills to your CV");
    }
    if (!result.foundSkills.includes("javascript")) {
      feedback.push("Consider adding JavaScript experience");
    }
    if (!result.foundSkills.includes("git")) {
      feedback.push("Include version control (Git) experience");
    }

    res.json({
      text,
      score: result.score,
      skills: result.foundSkills,
      feedback
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;