import express from "express";
import multer from "multer";

import { extractTextFromFile } from "../services/pdfService.js";
import { analyzeCvWithGemini } from "../services/geminiService.js";
import { normalizeCvAnalysis } from "../services/scoreService.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { enforceQuota, getUserPlanAndUsage } from "../services/quotaService.js";
import { supabaseAdmin } from "../services/supabaseClient.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No CV file was uploaded.",
      });
    }

    const usage = await enforceQuota(req.user.id);

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

    // Mark any previous CVs as no longer the latest
    await supabaseAdmin
      .from("cv_documents")
      .update({ is_latest: false })
      .eq("user_id", req.user.id)
      .eq("is_latest", true);

    // 1. Insert the CV document
    const { data: cvDoc, error: docError } = await supabaseAdmin
      .from("cv_documents")
      .insert({
        user_id: req.user.id,
        file_url: "",
        file_name: req.file.originalname,
        file_size_kb: Math.round(req.file.size / 1024),
        raw_text: cvText,
        overall_score: analysis.score,
        ats_score: analysis.ats,
        is_latest: true,
        analysed_at: new Date().toISOString(),
      })
      .select("cv_id")
      .single();

    if (docError || !cvDoc) {
      throw new Error(
        "Failed to save CV document: " + (docError?.message || "unknown error")
      );
    }

    // 2. Insert the analysis
    const { data: analysisRow, error: analysisError } = await supabaseAdmin
      .from("cv_analyses")
      .insert({
        cv_id: cvDoc.cv_id,
        overall_score: analysis.score,
        ats_score: analysis.ats,
        summary: analysis.summary,
        analysed_at: new Date().toISOString(),
      })
      .select("analysis_id")
      .single();

    if (analysisError || !analysisRow) {
      throw new Error(
        "Failed to save CV analysis: " +
          (analysisError?.message || "unknown error")
      );
    }

    // 3. Insert feedback items (using only valid feedback_category enum values)
    const feedbackRows = [
      ...analysis.feedback.good.map((text) => ({
        analysis_id: analysisRow.analysis_id,
        category: "structure",
        severity: "low",
        suggestion: text,
      })),
      ...analysis.feedback.bad.map((text) => ({
        analysis_id: analysisRow.analysis_id,
        category: "wording",
        severity: "high",
        suggestion: text,
      })),
      ...analysis.feedback.quickFixes.map((text) => ({
        analysis_id: analysisRow.analysis_id,
        category: "keywords",
        severity: "medium",
        suggestion: text,
      })),
    ];

    if (feedbackRows.length > 0) {
      const { error: feedbackError } = await supabaseAdmin
        .from("cv_feedback_items")
        .insert(feedbackRows);

      if (feedbackError) {
        console.error("Feedback insert error:", feedbackError.message);
      }
    }

    return res.status(200).json({
      ...analysis,
      plan: usage.planName,
      uploadsUsed: usage.used + 1,
      uploadsLimit: usage.unlimited ? -1 : usage.limit,
    });
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

    if (error.status === 403) {
      return res.status(403).json({
        error: error.message,
        code: error.code,
      });
    }

    return res.status(500).json({
      error: "CV analysis failed.",
      details: error.message,
    });
  }
});

router.get("/history", requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("cv_documents")
    .select(
      "cv_id, file_name, overall_score, ats_score, uploaded_at, analysed_at, is_latest"
    )
    .eq("user_id", req.user.id)
    .order("uploaded_at", { ascending: false })
    .limit(10);

  if (error) {
    return res.status(500).json({ error: "Could not load history." });
  }

  return res.status(200).json({ history: data });
});

router.get("/quota", requireAuth, async (req, res) => {
  try {
    const usage = await getUserPlanAndUsage(req.user.id);
    return res.status(200).json(usage);
  } catch (error) {
    return res.status(500).json({ error: "Could not load quota." });
  }
});

export default router;