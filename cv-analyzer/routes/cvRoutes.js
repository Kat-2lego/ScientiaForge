import express from "express";
import multer from "multer";

import { extractTextFromFile } from "../services/pdfService.js";
import { analyzeCvWithGemini } from "../services/geminiService.js";
import { normalizeCvAnalysis } from "../services/scoreService.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No CV file was uploaded.",
      });
    }

    const targetRole =
      typeof req.body.targetRole === "string"
        ? req.body.targetRole.trim()
        : "";

    const cvText = await extractTextFromFile(
      req.file.buffer,
      req.file.mimetype
    );

    const aiAnalysis = await analyzeCvWithGemini(
      cvText,
      targetRole || "General professional role"
    );

    const analysis = normalizeCvAnalysis(aiAnalysis);

    return res.status(200).json(analysis);
  } catch (error) {
    console.error("CV ANALYZER ERROR:", error);

    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "The uploaded file is larger than 5 MB."
            : error.message,
      });
    }

    return res.status(500).json({
      error: "CV analysis failed.",
      details: error.message,
    });
  }
});

export default router;