// scripts/seedEscoJobs.js
require("dotenv").config();
const { Pool } = require("pg");
const { searchOccupations, getOccupationSkills } = require("../lib/escoClient");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const INDUSTRIES = [
  {
    key: "Information and communications",
    queries: ["software", "web developer", "data analyst", "cybersecurity", "network"]
  },
  {
    key: "Professional, scientific and technical",
    queries: ["accountant", "marketing", "consultant", "architect", "engineer"]
  },
  {
    key: "Health and social work",
    queries: ["nurse", "doctor", "therapist", "care worker"]
  },
  {
    key: "Education",
    queries: ["teacher", "lecturer", "trainer", "educational"]
  },
  {
    key: "Finance and insurance",
    queries: ["financial analyst", "banker", "actuary", "insurance"]
  }
];

async function upsertJob(title, industry, escoUri, dataJson) {
  const { rows } = await pool.query(
    `insert into jobs (title, industry, esco_occupation_uri, data)
     values ($1, $2, $3, $4)
     on conflict (esco_occupation_uri) do update
       set title = $1, industry = $2, data = $4
     returning job_id as id, title, industry, esco_occupation_uri`,
    [title, industry, escoUri, JSON.stringify(dataJson)]
  );
  return rows[0];
}

async function upsertJobSkills(jobId, skills, language = "en") {
  // skills: [{ uri, label }]
  for (const s of skills) {
    await pool.query(
      `insert into job_skills (job_id, skill_name, esco_skill_uri, is_essential)
       values ($1, $2, $3, true)
       on conflict (job_id, skill_name) do nothing`,
      [jobId, s.label, s.uri]
    );
  }
}

async function seed() {
  console.log("Starting ESCO jobs seed...");

  for (const ind of INDUSTRIES) {
    console.log(`Industry: ${ind.key}`);

    for (const q of ind.queries) {
      console.log(`  Searching occupations: "${q}"`);
      const res = await searchOccupations(q, { language: "en", size: 15 });
      const results = res.results || [];

      for (const r of results) {
        const title = r.title || r.label;
        const uri = r.uri;

        if (!title || !uri) continue;

        // Insert/update job
        const job = await upsertJob(title, ind.key, uri, r);
        console.log(`    Job: ${title} (${job.id})`);

        // Fetch occupation skills
        try {
          const occData = await getOccupationSkills(uri, "en");
          const skills = occData.skills || [];

          if (skills.length === 0) {
            console.log(`      No skills found for ${title}`);
            continue;
          }

          await upsertJobSkills(job.id, skills, "en");
          console.log(`      Inserted ${skills.length} skills for ${title}`);
        } catch (err) {
          console.error(`      Error fetching skills for ${title}:`, err.message);
        }
      }
    }
  }

  console.log("ESCO jobs seed completed.");
  await pool.end();
}

seed().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});