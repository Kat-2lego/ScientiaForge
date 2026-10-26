import crypto from "node:crypto";
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

// ------------------------------------------------------------
// Background jobs
// ------------------------------------------------------------
// Each upload becomes a job that runs on the server after the upload
// request has already returned. The analysis keeps going even if the
// user leaves the CV page. Jobs live in memory, so no database changes
// are needed; the finished result is saved to the database as before.

const STALE_JOB_MS = 3 * 60 * 1000; // a job running longer than this is treated as dead
const FINISHED_JOB_TTL_MS = 30 * 60 * 1000; // keep finished jobs for 30 minutes

const JOB_ERROR_FALLBACK =
  "Something went wrong while analysing your CV. Please upload it again.";
const JOB_STALE_MESSAGE =
  "The analysis took too long and was stopped. Please upload your CV again.";

const jobs = new Map(); // jobId -> job
const runningJobByUser = new Map(); // userId -> jobId

function createJob(userId, fileName, targetRole) {
  const job = {
    id: crypto.randomUUID(),
    userId,
    status: "processing",
    fileName,
    targetRole,
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    finishedAtMs: null,
    result: null,
    error: null,
  };

  jobs.set(job.id, job);
  runningJobByUser.set(userId, job.id);

  return job;
}

function finishJob(job, status, { result = null, error = null } = {}) {
  job.status = status;
  job.result = result;
  job.error = error;
  job.finishedAtMs = Date.now();

  if (runningJobByUser.get(job.userId) === job.id) {
    runningJobByUser.delete(job.userId);
  }
}

function discardJob(job) {
  jobs.delete(job.id);

  if (runningJobByUser.get(job.userId) === job.id) {
    runningJobByUser.delete(job.userId);
  }
}

/** The user's running job, or null. Also catches jobs that got stuck. */
function getRunningJob(userId) {
  const jobId = runningJobByUser.get(userId);
  const job = jobId ? jobs.get(jobId) : null;

  if (!job || job.status !== "processing") {
    runningJobByUser.delete(userId);
    return null;
  }

  if (Date.now() - job.startedAtMs > STALE_JOB_MS) {
    finishJob(job, "failed", { error: JOB_STALE_MESSAGE });
    return null;
  }

  return job;
}

/** What the frontend sees while a job is running. */
const publicJob = (job) => ({
  jobId: job.id,
  status: job.status,
  fileName: job.fileName,
  targetRole: job.targetRole,
  startedAt: job.startedAt,
});

// Remove old finished jobs every 5 minutes so memory doesn't grow
setInterval(() => {
  const now = Date.now();

  for (const [jobId, job] of jobs) {
    if (job.finishedAtMs && now - job.finishedAtMs > FINISHED_JOB_TTL_MS) {
      jobs.delete(jobId);
    }
  }
}, 5 * 60 * 1000).unref();

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Wraps multer so file errors (e.g. too large) return clean JSON.
 * Multer errors never reach the route's try/catch, so they're handled here.
 */
const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error:
          err.code === "LIMIT_FILE_SIZE"
            ? "The uploaded file is larger than 5 MB."
            : err.message,
      });
    }

    return next(err);
  });
};

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

const buildFeedbackRows = (analysisId, analysis) => [
  ...analysis.feedback.good.map((text) => ({
    analysis_id: analysisId,
    category: "structure",
    severity: "low",
    suggestion: text,
  })),
  ...analysis.feedback.bad.map((text) => ({
    analysis_id: analysisId,
    category: "wording",
    severity: "high",
    suggestion: text,
  })),
  ...analysis.feedback.quickFixes.map((text) => ({
    analysis_id: analysisId,
    category: "keywords",
    severity: "medium",
    suggestion: text,
  })),
];

/** Score of the user's current latest CV (for the progress comparison). */
async function getPreviousScore(userId) {
  const { data, error } = await supabaseAdmin
    .from("cv_documents")
    .select("overall_score")
    .eq("user_id", userId)
    .eq("is_latest", true)
    .order("analysed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Previous score lookup error:", error.message);
    return null;
  }

  return data ? data.overall_score : null;
}

// ------------------------------------------------------------
// The background work: analyse with Gemini, then save
// ------------------------------------------------------------
async function runAnalysisJob(job, { cvText, fileSize, usage }) {
  const userId = job.userId;
  const targetRole = job.targetRole;
  let newCvId = null; // used to roll back if a later step fails

  try {
    // Gemini and the previous-score lookup don't depend on each other
    const [aiAnalysis, previousScore] = await Promise.all([
      analyzeCvWithGemini(cvText, targetRole),
      getPreviousScore(userId),
    ]);
    console.log(`⏱ [cv/job ${job.id}] gemini analysis: ${Date.now() - job.startedAtMs}ms`);

    const analysis = { ...normalizeCvAnalysis(aiAnalysis), targetRole };
    const now = new Date().toISOString();

    // 1. Insert the new CV document as the latest
    const { data: cvDoc, error: docError } = await supabaseAdmin
      .from("cv_documents")
      .insert({
        user_id: userId,
        file_url: "",
        file_name: job.fileName,
        file_size_kb: Math.round(fileSize / 1024),
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
        "Failed to save CV analysis: " + (analysisError?.message || "unknown error")
      );
    }

    // 3 + 4. Feedback items and un-flagging older CVs, at the same time
    const feedbackRows = buildFeedbackRows(analysisRow.analysis_id, analysis);

    const [{ error: feedbackError }, { error: flipError }] = await Promise.all([
      feedbackRows.length > 0
        ? supabaseAdmin.from("cv_feedback_items").insert(feedbackRows)
        : Promise.resolve({ error: null }),

      supabaseAdmin
        .from("cv_documents")
        .update({ is_latest: false })
        .eq("user_id", userId)
        .eq("is_latest", true)
        .neq("cv_id", cvDoc.cv_id),
    ]);

    if (feedbackError) {
      console.error("Feedback insert error:", feedbackError.message);
    }

    if (flipError) {
      console.error("is_latest update error:", flipError.message);
    }

    newCvId = null; // everything saved, nothing to roll back

    finishJob(job, "completed", {
      result: {
        ...analysis,
        cvId: cvDoc.cv_id,
        fileName: job.fileName,
        analyzedAt: now,
        previousScore,
        plan: usage.planName,
        uploadsUsed: usage.used + 1,
        uploadsLimit: usage.unlimited ? -1 : usage.limit,
      },
    });

    console.log(`✅ [cv/job ${job.id}] finished in ${Date.now() - job.startedAtMs}ms`);

    // Best-effort and not awaited — the dashboard's "Activities" count and
    // the admin feature-usage charts both read this, but a logging hiccup
    // here should never hold up the response the user is waiting on.
    logFeatureEvent(userId, "cv_analyzer", "completed", {
      metadata: { score: analysis.score, ats: analysis.ats },
    });
  } catch (error) {
    console.error(`❌ [cv/job ${job.id}] failed after ${Date.now() - job.startedAtMs}ms:`, error);

    // Roll back a half-saved CV so it doesn't count against the quota
    if (newCvId) {
      await supabaseAdmin.from("cv_documents").delete().eq("cv_id", newCvId);
    }

    const message = ["AI_UNAVAILABLE", "CV_TEXT_TOO_SHORT"].includes(error.code)
      ? error.message
      : JOB_ERROR_FALLBACK;

    finishJob(job, "failed", { error: message });
  }
}

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

/**
 * Start a CV analysis. Replies straight away (202) with a job;
 * the analysis continues in the background.
 */
router.post("/upload", requireAuth, uploadSingleFile, async (req, res) => {
  const userId = req.user.id;

  if (!req.file) {
    return res.status(400).json({ error: "No CV file was uploaded." });
  }

  // Only one analysis at a time per user
  const running = getRunningJob(userId);

  if (running) {
    return res.status(409).json({
      error: "Your previous CV is still being analysed. Please wait for it to finish.",
      code: "ANALYSIS_IN_PROGRESS",
      job: publicJob(running),
    });
  }

  const targetRole =
    (typeof req.body.targetRole === "string" && req.body.targetRole.trim()) ||
    "General professional role";

  // Reserve the slot immediately so a double-click can't start two jobs
  const job = createJob(userId, req.file.originalname, targetRole);

  try {
    // Quota check and text extraction don't depend on each other - run together
    const [usage, cvText] = await Promise.all([
      enforceQuota(userId),
      extractTextFromFile(req.file.buffer, req.file.mimetype),
    ]);

    if (!cvText || !cvText.trim()) {
      discardJob(job);
      return res.status(400).json({
        error:
          "We couldn't read any text from this file. Please upload a text-based PDF, DOCX or TXT.",
      });
    }

    if (cvText.trim().length < 100) {
      discardJob(job);
      return res.status(400).json({
        error: "This CV has too little text to analyse. Please check the file and try again.",
      });
    }

    // Not awaited on purpose: the analysis keeps running after we reply
    runAnalysisJob(job, { cvText, fileSize: req.file.size, usage }).catch((err) => {
      console.error("CV JOB CRASHED:", err);
      finishJob(job, "failed", { error: JOB_ERROR_FALLBACK });
    });

    return res.status(202).json({
      ...publicJob(job),
      plan: usage.planName,
      uploadsUsed: usage.used + 1,
      uploadsLimit: usage.unlimited ? -1 : usage.limit,
    });
  } catch (error) {
    discardJob(job);
    console.error("CV UPLOAD ERROR:", error);

    if (error.code === "UPLOAD_LIMIT_REACHED") {
      return res.status(403).json({ error: error.message, code: error.code });
    }

    return res.status(500).json({
      error: "Could not start the CV analysis.",
      details: error.message,
    });
  }
});

/**
 * The user's running analysis, if any. Every dashboard page calls this
 * on load so it can show progress wherever the user is.
 */
router.get("/active", requireAuth, (req, res) => {
  const job = getRunningJob(req.user.id);
  return res.status(200).json({ job: job ? publicJob(job) : null });
});

/**
 * Status of one analysis job. Includes the full analysis once completed.
 */
router.get("/jobs/:jobId", requireAuth, (req, res) => {
  const job = jobs.get(req.params.jobId);

  // Users can only see their own jobs
  if (!job || job.userId !== req.user.id) {
    return res.status(404).json({ error: "Analysis not found." });
  }

  if (job.status === "processing") {
    const running = getRunningJob(job.userId); // also marks stuck jobs as failed

    if (running && running.id === job.id) {
      return res.status(200).json(publicJob(job));
    }
  }

  if (job.status === "failed") {
    return res.status(200).json({
      jobId: job.id,
      status: "failed",
      fileName: job.fileName,
      error: job.error || JOB_ERROR_FALLBACK,
    });
  }

  return res.status(200).json({
    jobId: job.id,
    status: "completed",
    fileName: job.fileName,
    analysis: job.result,
  });
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