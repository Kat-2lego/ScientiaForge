import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

/* =========================================================
   SUPABASE CLIENT (mirrors the setup in server.mjs)
========================================================= */

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const databaseClient = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : supabase;

/* =========================================================
   AUTH (only needed for saving a learner's own subject list)
========================================================= */

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  req.userId = user.id;
  next();
}

/* =========================================================
   HELPERS
========================================================= */

function getApplicationStatus(openDate, closeDate, today) {
  const open = openDate ? new Date(openDate) : null;
  const close = closeDate ? new Date(closeDate) : null;
  if (close && close < today) return "closed";
  if (open && open > today) return "opening_soon";
  return "open";
}

function statusRank(status) {
  return { open: 0, opening_soon: 1, closed: 2 }[status] ?? 3;
}

// Small helper so query-string filters don't get applied when empty/blank
function hasValue(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/* =========================================================
   REFERENCE DATA
========================================================= */

// GET /api/career-pathfinder/subjects
router.get("/subjects", async (req, res) => {
  const { data, error } = await databaseClient
    .from("subjects")
    .select("subject_id, name, category")
    .order("name");

  if (error) {
    console.error("❌ subjects fetch error:", error);
    return res.status(500).json({ error: "Failed to load subjects." });
  }
  return res.json({ subjects: data });
});

// GET /api/career-pathfinder/careers
router.get("/careers", async (req, res) => {
  const { data, error } = await databaseClient
    .from("careers")
    .select("career_id, name, field, description")
    .order("name");

  if (error) {
    console.error("❌ careers fetch error:", error);
    return res.status(500).json({ error: "Failed to load careers." });
  }
  return res.json({ careers: data });
});

// GET /api/career-pathfinder/institutions?province=&type=
router.get("/institutions", async (req, res) => {
  const { province, type } = req.query;

  let query = databaseClient
    .from("institutions")
    .select(
      "institution_id, name, institution_type, province, city, website_url, logo_url"
    )
    .order("name");

  if (hasValue(province)) query = query.eq("province", province);
  if (hasValue(type)) query = query.eq("institution_type", type);

  const { data, error } = await query;

  if (error) {
    console.error("❌ institutions fetch error:", error);
    return res.status(500).json({ error: "Failed to load institutions." });
  }
  return res.json({ institutions: data });
});

/* =========================================================
   PROGRAMMES: browse (no subject matching, just filters)
   GET /api/career-pathfinder/programmes?career_id=&institution_id=&province=&institution_type=
========================================================= */

router.get("/programmes", async (req, res) => {
  const { career_id, institution_id, province, institution_type } = req.query;

  let query = databaseClient.from("programmes").select(
    `programme_id, faculty, duration_years, aps_min, application_open_date,
       application_close_date, tuition_estimate_zar, info_url, notes,
       qualifications ( qualification_id, name, qualification_level, nqf_level,
         qualification_careers ( careers ( career_id, name, field ) ) ),
       institutions!inner ( institution_id, name, institution_type, province, city, website_url ),
       programme_subject_requirements ( min_level, is_compulsory, subjects ( subject_id, name ) )`
  );

  if (hasValue(institution_id)) query = query.eq("institution_id", institution_id);
  if (hasValue(province)) query = query.eq("institutions.province", province);
  if (hasValue(institution_type))
    query = query.eq("institutions.institution_type", institution_type);

  const { data, error } = await query;

  if (error) {
    console.error("❌ programmes fetch error:", error);
    return res.status(500).json({ error: "Failed to load programmes." });
  }

  let programmes = data;

  if (hasValue(career_id)) {
    const careerIdNum = Number(career_id);
    programmes = programmes.filter((p) =>
      p.qualifications?.qualification_careers?.some(
        (qc) => qc.careers?.career_id === careerIdNum
      )
    );
  }

  return res.json({ programmes });
});

/* =========================================================
   MATCH: given a grade 12 learner's final/prelim subjects +
   levels, return the qualifications/programmes they meet the
   requirements for.
   POST body: { subjects: [{ subject_id, level }], province, institution_type, career_id }
========================================================= */

router.post("/match", async (req, res) => {
  const subjects = Array.isArray(req.body.subjects) ? req.body.subjects : [];
  const { province, institution_type, career_id } = req.body;

  if (subjects.length === 0) {
    return res
      .status(400)
      .json({ error: "Provide at least one subject with a level." });
  }

  // Validate each subject entry up front instead of silently dropping bad ones
  for (const s of subjects) {
    if (
      !s ||
      !s.subject_id ||
      !s.level ||
      Number(s.level) < 1 ||
      Number(s.level) > 7
    ) {
      return res.status(400).json({
        error: "Each subject needs a subject_id and a level from 1-7.",
      });
    }
  }

  const levelBySubjectId = new Map(
    subjects.map((s) => [Number(s.subject_id), Number(s.level)])
  );

  let query = databaseClient.from("programmes").select(
    `programme_id, faculty, duration_years, aps_min, application_open_date,
       application_close_date, tuition_estimate_zar, info_url, notes,
       qualifications ( qualification_id, name, qualification_level, nqf_level,
         qualification_careers ( careers ( career_id, name, field ) ) ),
       institutions!inner ( institution_id, name, institution_type, province, city, website_url ),
       programme_subject_requirements ( min_level, is_compulsory, subjects ( subject_id, name ) )`
  );

  if (hasValue(province)) query = query.eq("institutions.province", province);
  if (hasValue(institution_type))
    query = query.eq("institutions.institution_type", institution_type);

  const { data: programmes, error } = await query;

  if (error) {
    console.error("❌ match fetch error:", error);
    return res.status(500).json({ error: "Failed to compute matches." });
  }

  const careerIdNum = hasValue(career_id) ? Number(career_id) : null;

  const results = programmes
    .filter((p) => {
      if (!careerIdNum) return true;
      return p.qualifications?.qualification_careers?.some(
        (qc) => qc.careers?.career_id === careerIdNum
      );
    })
    .map((p) => {
      const requirements = p.programme_subject_requirements || [];

      const requirementStatus = requirements.map((r) => {
        const subjectId = r.subjects?.subject_id;
        const haveLevel = levelBySubjectId.get(subjectId) ?? null;
        return {
          subject: r.subjects?.name,
          subject_id: subjectId,
          min_level: r.min_level,
          is_compulsory: r.is_compulsory,
          have_level: haveLevel,
          met: haveLevel !== null && haveLevel >= r.min_level,
        };
      });

      const apsMet = p.aps_min
        ? [...levelBySubjectId.values()]
            .sort((a, b) => b - a)
            .slice(0, 6)
            .reduce((sum, lvl) => sum + lvl, 0) >= p.aps_min
        : true;

      const compulsoryUnmet = requirementStatus.filter(
        (r) => r.is_compulsory && !r.met
      );

      return {
        ...p,
        requirement_status: requirementStatus,
        aps_met: apsMet,
        qualifies: compulsoryUnmet.length === 0 && apsMet,
      };
    })
    .sort((a, b) => Number(b.qualifies) - Number(a.qualifies));

  return res.json({ results });
});

/* =========================================================
   LEARNER'S OWN SUBJECTS (private, requires auth)
========================================================= */

// GET /api/career-pathfinder/my-subjects
router.get("/my-subjects", requireAuth, async (req, res) => {
  const { data, error } = await databaseClient
    .from("user_subjects")
    .select("user_subject_id, level, subjects ( subject_id, name, category )")
    .eq("user_id", req.userId);

  if (error) {
    console.error("❌ my-subjects fetch error:", error);
    return res.status(500).json({ error: "Failed to load your subjects." });
  }
  return res.json({ subjects: data });
});

// POST /api/career-pathfinder/my-subjects  body: { subject_id, level }
router.post("/my-subjects", requireAuth, async (req, res) => {
  const { subject_id, level } = req.body;

  if (!subject_id || !level || level < 1 || level > 7) {
    return res
      .status(400)
      .json({ error: "subject_id and a level from 1-7 are required." });
  }

  const { data, error } = await databaseClient
    .from("user_subjects")
    .upsert(
      { user_id: req.userId, subject_id, level },
      { onConflict: "user_id,subject_id" }
    )
    .select();

  if (error) {
    console.error("❌ my-subjects upsert error:", error);
    return res.status(500).json({ error: "Failed to save the subject." });
  }
  return res.status(201).json({ success: true, subject: data?.[0] });
});

// DELETE /api/career-pathfinder/my-subjects/:subjectId
router.delete("/my-subjects/:subjectId", requireAuth, async (req, res) => {
  const { error } = await databaseClient
    .from("user_subjects")
    .delete()
    .eq("user_id", req.userId)
    .eq("subject_id", req.params.subjectId);

  if (error) {
    console.error("❌ my-subjects delete error:", error);
    return res.status(500).json({ error: "Failed to remove the subject." });
  }
  return res.json({ success: true });
});

/* =========================================================
   BURSARIES
========================================================= */

// GET /api/career-pathfinder/bursaries
// GET /api/career-pathfinder/bursaries?career_ids=1,2,3
router.get("/bursaries", async (req, res) => {
  const careerIds = String(req.query.career_ids || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

  const { data, error } = await databaseClient
    .from("bursaries")
    .select(
      `bursary_id, name, provider, field_of_study, description, eligibility_requirements,
       application_open_date, application_close_date, coverage, redirect_url, is_active,
       bursary_careers ( career_id, careers ( name ) )`
    )
    .eq("is_active", true);

  if (error) {
    console.error("❌ bursaries fetch error:", error);
    return res.status(500).json({ error: "Failed to load bursaries." });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let bursaries = data.map((b) => {
    const links = b.bursary_careers || [];
    const linkedCareerIds = links.map((l) => l.career_id);
    const closeDate = b.application_close_date
      ? new Date(b.application_close_date)
      : null;
    const daysUntilClose = closeDate
      ? Math.ceil((closeDate - today) / (1000 * 60 * 60 * 24))
      : null;

    return {
      bursary_id: b.bursary_id,
      name: b.name,
      provider: b.provider,
      field_of_study: b.field_of_study,
      description: b.description,
      eligibility_requirements: b.eligibility_requirements,
      application_open_date: b.application_open_date,
      application_close_date: b.application_close_date,
      coverage: b.coverage,
      redirect_url: b.redirect_url,
      is_general: links.length === 0,
      matched_fields: links.map((l) => l.careers?.name).filter(Boolean),
      matched:
        careerIds.length > 0 && linkedCareerIds.some((id) => careerIds.includes(id)),
      application_status: getApplicationStatus(
        b.application_open_date,
        b.application_close_date,
        today
      ),
      days_until_close: daysUntilClose,
      closing_soon: daysUntilClose !== null && daysUntilClose >= 0 && daysUntilClose <= 30,
    };
  });

  if (careerIds.length > 0) {
    bursaries = bursaries.filter((b) => b.matched || b.is_general);
  }

  bursaries.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    const statusDiff =
      statusRank(a.application_status) - statusRank(b.application_status);
    if (statusDiff !== 0) return statusDiff;
    const aClose = a.application_close_date
      ? new Date(a.application_close_date).getTime()
      : Infinity;
    const bClose = b.application_close_date
      ? new Date(b.application_close_date).getTime()
      : Infinity;
    return aClose - bClose;
  });

  return res.json({ bursaries });
});

export default router;