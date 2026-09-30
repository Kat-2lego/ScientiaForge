import express from "express";
import multer from "multer";

import { extractTextFromFile } from "../services/pdfService.js";
import { analyzeCvWithGemini } from "../services/geminiService.js";
import { normalizeCvAnalysis } from "../services/scoreService.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { enforceQuota, getUserPlanAndUsage } from "../services/quotaService.js";
import { supabaseAdmin } from "../services/supabaseClient.js";
import { logFeatureEvent } from "../../services/featureEvents.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Rebuild the analysis object the frontend expects from DB rows.
 * Uses the stored `result` JSON when present; falls back to columns +
 * feedback items for CVs analysed before the migration.
 */
function buildAnalysisFromRows(doc, row, feedbackItems = []) {
  const targetRole = row?.target_role || doc.target_role || "";

  if (row?.result) {
    const analysis = normalizeCvAnalysis(row.result);
    return { ...analysis, targetRole: targetRole || analysis.targetRole };
  }

  const pick = (category) =>
    feedbackItems
      .filter((f) => f.category === category)
      .map((f) => f.suggestion);

  const score = row?.overall_score ?? doc.overall_score;

  return normalizeCvAnalysis({
    score,
    ats: row?.ats_score ?? doc.ats_score,
    match: row?.match_score ?? score,
    content: row?.content_score,
    formatting: row?.formatting_score,
    targetRole,
    skills: row?.skills,
    missingSkills: row?.missing_skills,
    summary: row?.summary,
    feedback: {
      good: pick("structure"),
      bad: pick("wording"),
      quickFixes: pick("keywords"),
    },
  });
}

router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  const userId = req.user.id;
  let newCvId = null; // used to roll back if a later step fails
  const requestStartedAt = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No CV file was uploaded." });
    }

    const usage = await enforceQuota(userId);

    const targetRole =
      (typeof req.body.targetRole === "string" && req.body.targetRole.trim()) ||
      "General professional role";

    const cvText = await extractTextFromFile(req.file.buffer, req.file.mimetype);

    if (!cvText || !cvText.trim()) {
      return res.status(400).json({
        error:
          "We couldn't read any text from this file. Please upload a text-based PDF, DOCX or TXT.",
      });
    }

    const aiAnalysis = await analyzeCvWithGemini(cvText, targetRole);
    const analysis = { ...normalizeCvAnalysis(aiAnalysis), targetRole };
    const now = new Date().toISOString();

    // 1. Insert the new CV document as the latest
    const { data: cvDoc, error: docError } = await supabaseAdmin
      .from("cv_documents")
      .insert({
        user_id: userId,
        file_url: "",
        file_name: req.file.originalname,
        file_size_kb: Math.round(req.file.size / 1024),
        raw_text: cvText,
        target_role: targetRole,
        overall_score: analysis.score,
        ats_score: analysis.ats,
        is_latest: true,
        analysed_at: now,
      })
      .select("cv_id")
      .single();

    if (docError || !cvDoc) {
      throw new Error(
        "Failed to save CV document: " + (docError?.message || "unknown error")
      );
    }
    newCvId = cvDoc.cv_id;

    // 2. Insert the full analysis
    const { data: analysisRow, error: analysisError } = await supabaseAdmin
      .from("cv_analyses")
      .insert({
        cv_id: cvDoc.cv_id,
        overall_score: analysis.score,
        ats_score: analysis.ats,
        match_score: analysis.match,
        content_score: analysis.content,
        formatting_score: analysis.formatting,
        target_role: targetRole,
        skills: analysis.skills,
        missing_skills: analysis.missingSkills,
        summary: analysis.summary,
        result: analysis,
        analysed_at: now,
      })
      .select("analysis_id")
      .single();

    if (analysisError || !analysisRow) {
      throw new Error(
        "Failed to save CV analysis: " +
          (analysisError?.message || "unknown error")
      );
    }

    // 3. Feedback items (kept for reporting/admin use)
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

    // 4. Only now mark older CVs as not latest
    //    (so a failed save never leaves the user with no latest CV)
    const { error: flipError } = await supabaseAdmin
      .from("cv_documents")
      .update({ is_latest: false })
      .eq("user_id", userId)
      .eq("is_latest", true)
      .neq("cv_id", cvDoc.cv_id);

    if (flipError) {
      console.error("is_latest update error:", flipError.message);
    }

    newCvId = null; // everything saved, nothing to roll back
    logFeatureEvent(req.user.id, "cv_analyzer", "completed", {
      durationSeconds: Math.round((Date.now() - requestStartedAt) / 1000),
      metadata: { targetRole: targetRole || null, overallScore: analysis.score },
    });

    return res.status(200).json({
      ...analysis,
      cvId: cvDoc.cv_id,
      fileName: req.file.originalname,
      analyzedAt: now,
      plan: usage.planName,
      uploadsUsed: usage.used + 1,
      uploadsLimit: usage.unlimited ? -1 : usage.limit,
    });
  } catch (error) {
    console.error("CV ANALYZER ERROR:", error);

    // Roll back a half-saved CV so it doesn't count against the quota
    if (newCvId) {
      await supabaseAdmin.from("cv_documents").delete().eq("cv_id", newCvId);
    }

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

/**
 * Latest saved analysis + previous score.
 * Used by the CV Analyzer page and the main dashboard.
 */
router.get("/latest", requireAuth, async (req, res) => {
  try {
    const { data: docs, error: docsError } = await supabaseAdmin
      .from("cv_documents")
      .select(
        "cv_id, file_name, target_role, overall_score, ats_score, analysed_at, is_latest"
      )
      .eq("user_id", req.user.id)
      .order("analysed_at", { ascending: false, nullsFirst: false })
      .limit(2);

    if (docsError) throw docsError;

    if (!docs || docs.length === 0) {
      return res.status(200).json({ analysis: null, previousScore: null });
    }

    const latest = docs.find((d) => d.is_latest) || docs[0];
    const previous = docs.find((d) => d.cv_id !== latest.cv_id);

    const { data: row, error: rowError } = await supabaseAdmin
      .from("cv_analyses")
      .select("*")
      .eq("cv_id", latest.cv_id)
      .order("analysed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rowError) throw rowError;

    // Only needed for old rows that have no stored `result`
    let feedbackItems = [];

    if (row && !row.result) {
      const { data: items } = await supabaseAdmin
        .from("cv_feedback_items")
        .select("category, suggestion")
        .eq("analysis_id", row.analysis_id);

      feedbackItems = items || [];
    }

    const analysis = buildAnalysisFromRows(latest, row, feedbackItems);

    return res.status(200).json({
      analysis: {
        ...analysis,
        cvId: latest.cv_id,
        fileName: latest.file_name,
        analyzedAt: latest.analysed_at,
      },
      previousScore: previous ? previous.overall_score : null,
    });
  } catch (error) {
    console.error("LATEST CV ERROR:", error);
    return res
      .status(500)
      .json({ error: "Could not load your latest CV analysis." });
  }
});

router.get("/history", requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("cv_documents")
    .select(
      "cv_id, file_name, target_role, overall_score, ats_score, uploaded_at, analysed_at, is_latest"
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