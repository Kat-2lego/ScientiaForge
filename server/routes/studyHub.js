import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const databaseClient = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : supabase;

/* =========================================================
   PAST PAPERS
   GET /api/study-hub/past-papers?subject_id=&grade=&curriculum=NSC|IEB
========================================================= */

router.get("/past-papers", async (req, res) => {
  const { subject_id, grade, curriculum } = req.query;

  let query = databaseClient
    .from("past_papers")
    .select(
      "paper_id, grade, curriculum, year, paper_number, resource_type, file_url, source, subjects ( subject_id, name )"
    )
    .order("grade", { ascending: false });

  if (subject_id) query = query.eq("subject_id", subject_id);
  if (grade) query = query.eq("grade", grade);
  if (curriculum) query = query.eq("curriculum", curriculum);

  const { data, error } = await query;

  if (error) {
    console.error("❌ past-papers fetch error:", error);
    return res.status(500).json({ error: "Failed to load past papers." });
  }
  return res.json({ papers: data });
});

/* =========================================================
   STUDY / APPLICATION VIDEOS
   GET /api/study-hub/videos?subject_id=&category=&institution_id=&bursary_id=&grade=
   category: subject_study | how_to_apply_university | how_to_apply_bursary
========================================================= */

router.get("/videos", async (req, res) => {
  const { subject_id, category, institution_id, bursary_id, grade } = req.query;

  let query = databaseClient
    .from("study_videos")
    .select(
      `video_id, category, title, youtube_url, grade,
       subjects ( subject_id, name ),
       institutions ( institution_id, name ),
       bursaries ( bursary_id, name, redirect_url )`
    )
    .order("video_id", { ascending: false });

  if (subject_id) query = query.eq("subject_id", subject_id);
  if (category) query = query.eq("category", category);
  if (institution_id) query = query.eq("institution_id", institution_id);
  if (bursary_id) query = query.eq("bursary_id", bursary_id);
  if (grade) query = query.eq("grade", grade);

  const { data, error } = await query;

  if (error) {
    console.error("❌ videos fetch error:", error);
    return res.status(500).json({ error: "Failed to load study videos." });
  }
  return res.json({ videos: data });
});

/* =========================================================
   BURSARIES (same table the Career Pathfinder uses — kept here
   too so the Study Hub page can fetch its own "Apply for a
   bursary" cards without depending on the other router).
========================================================= */

router.get("/bursaries", async (req, res) => {
  const { data, error } = await databaseClient
    .from("bursaries")
    .select(
      "bursary_id, name, provider, field_of_study, description, eligibility_requirements, application_open_date, application_close_date, coverage, redirect_url, is_active"
    )
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("❌ bursaries fetch error:", error);
    return res.status(500).json({ error: "Failed to load bursaries." });
  }
  return res.json({ bursaries: data });
});

export default router;