#!/usr/bin/env node
/* =========================================================
   apply-english-coach.mjs
   Wires the English Coach into your existing files:

     server/server.mjs             import + mount the route
     server/routes/admin.js        count "english_coach" in the admin charts
     client/js/adminDashboard.js   label + colour for it in the admin charts
     client/pages/*.html           an "English Coach" link in every sidebar
     client/pages/Articulation.html  a small link across to the new page

   Run from the project root:   node apply-english-coach.mjs
   Preview only:                node apply-english-coach.mjs --dry-run

   Works whether or not the Articulation Coach installer was run first, and
   is safe to run more than once. It keeps each file's line endings, and if a
   spot has changed since this was written it does NOT guess: it prints the
   exact lines to add by hand.
========================================================= */

import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const results = [];

const read = (p) => fs.readFileSync(p, "utf8");
const note = (status, file, what, manual) => results.push({ status, file, what, manual });

/**
 * Apply the first variant whose anchor occurs exactly once.
 * A variant is { anchor, replacement }. Line endings are preserved.
 */
function edit({ file, what, variants, alreadyDone, manual }) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return note("manual", file, what, `File not found: ${file}`);

  const raw = read(full);
  const crlf = raw.includes("\r\n");
  const text = raw.replace(/\r\n/g, "\n");
  if (alreadyDone(text)) return note("done", file, what);

  for (const v of variants) {
    if (text.split(v.anchor).length - 1 === 1) {
      const out = text.replace(v.anchor, () => v.replacement);
      if (!DRY) fs.writeFileSync(full, crlf ? out.replace(/\n/g, "\r\n") : out);
      return note("applied", file, what);
    }
  }
  note("manual", file, what, `Could not find the usual spot in ${file}, so I left it alone. Add by hand:\n${manual}`);
}

/* ---------- 1. server.mjs ---------- */

const IMPORT_ART = 'import articulationRoutes from "./routes/articulation.js";\n';
const IMPORT_ADMIN = 'import adminRoutes from "./routes/admin.js";\n';
const IMPORT_ENG = 'import englishRoutes from "./routes/english.js";\n';
edit({
  file: "server/server.mjs",
  what: "import the English Coach route",
  variants: [
    { anchor: IMPORT_ART, replacement: IMPORT_ART + IMPORT_ENG },
    { anchor: IMPORT_ADMIN, replacement: IMPORT_ADMIN + IMPORT_ENG },
  ],
  alreadyDone: (t) => t.includes("englishRoutes from"),
  manual: '  Near the other "import ... from ./routes/..." lines at the top, add:\n  import englishRoutes from "./routes/english.js";',
});

const MOUNT_ART = 'app.use("/api/articulation", articulationRoutes);\n';
const MOUNT_ADMIN = 'app.use("/api/admin", adminRoutes);\n';
const MOUNT_ENG = 'app.use("/api/english", englishRoutes);\n';
edit({
  file: "server/server.mjs",
  what: "mount it at /api/english",
  variants: [
    { anchor: MOUNT_ART, replacement: MOUNT_ART + MOUNT_ENG },
    { anchor: MOUNT_ADMIN, replacement: MOUNT_ADMIN + MOUNT_ENG },
  ],
  alreadyDone: (t) => t.includes('"/api/english"'),
  manual: '  Next to the other app.use("/api/...", ...) lines, add:\n  app.use("/api/english", englishRoutes);',
});

/* ---------- 2. admin charts ---------- */

edit({
  file: "server/routes/admin.js",
  what: "count the English Coach in the feature timeline",
  variants: [
    {
      anchor: 'const TRACKED_FEATURES = ["interview_simulator", "cv_analyzer", "skill_gap", "career_discovery", "articulation"];',
      replacement: 'const TRACKED_FEATURES = ["interview_simulator", "cv_analyzer", "skill_gap", "career_discovery", "articulation", "english_coach"];',
    },
    {
      anchor: 'const TRACKED_FEATURES = ["interview_simulator", "cv_analyzer", "skill_gap", "career_discovery"];',
      replacement: 'const TRACKED_FEATURES = ["interview_simulator", "cv_analyzer", "skill_gap", "career_discovery", "english_coach"];',
    },
  ],
  alreadyDone: (t) => /TRACKED_FEATURES\s*=\s*\[[^\]]*"english_coach"/.test(t),
  manual: '  Add "english_coach" to the end of the TRACKED_FEATURES array.',
});

edit({
  file: "client/js/adminDashboard.js",
  what: "label the English Coach in the admin chart",
  variants: [
    { anchor: '  articulation: "Articulation Coach",\n};', replacement: '  articulation: "Articulation Coach",\n  english_coach: "English Coach",\n};' },
    { anchor: '  career_discovery: "Career Discovery",\n};', replacement: '  career_discovery: "Career Discovery",\n  english_coach: "English Coach",\n};' },
  ],
  alreadyDone: (t) => /english_coach:\s*"English Coach"/.test(t),
  manual: '  In the FEATURE_LABELS object, add this line:\n  english_coach: "English Coach",',
});

edit({
  file: "client/js/adminDashboard.js",
  what: "give it a colour in the admin chart",
  variants: [
    {
      anchor: 'const FEATURE_COLORS = ["--primary", "--orange", "--cyan", "--admin-purple", "--admin-green"];',
      replacement: 'const FEATURE_COLORS = ["--primary", "--orange", "--cyan", "--admin-purple", "--admin-green", "--admin-red"];',
    },
    {
      anchor: 'const FEATURE_COLORS = ["--primary", "--orange", "--cyan", "--admin-purple"];',
      replacement: 'const FEATURE_COLORS = ["--primary", "--orange", "--cyan", "--admin-purple", "--admin-green", "--admin-red"];',
    },
  ],
  alreadyDone: (t) => /FEATURE_COLORS\s*=\s*\[[^\]]*--admin-red/.test(t),
  manual: '  Add "--admin-red" to the end of the FEATURE_COLORS array (and "--admin-green" before it if it is missing).',
});

/* ---------- 3. sidebar link on every page that has one ---------- */

const ARTICULATION_BLOCK = /^([ \t]*)<a class="nav-item(?: active)?" href="Articulation\.html"[^>]*>[\s\S]*?<\/a>[ \t]*\n/m;
const INTERVIEW_BLOCK = /^([ \t]*)<a class="nav-item(?: active)?" href="InterviewSimulator\.html"[^>]*>[\s\S]*?<\/a>[ \t]*\n/m;
const pagesDir = path.join(ROOT, "client/pages");

function navItem(indent) {
  return (
    `${indent}<a class="nav-item" href="EnglishCoach.html" data-label="English Coach">\n` +
    `${indent}  <i data-lucide="messages-square"></i>\n` +
    `${indent}  <span>English Coach</span>\n` +
    `${indent}</a>\n\n`
  );
}

if (!fs.existsSync(pagesDir)) {
  note("manual", "client/pages", "sidebar link", "client/pages not found. Run this from the project root.");
} else {
  for (const name of fs.readdirSync(pagesDir).filter((n) => n.endsWith(".html")).sort()) {
    if (name === "EnglishCoach.html") continue;
    const full = path.join(pagesDir, name);
    const raw = read(full);
    if (!raw.includes('href="InterviewSimulator.html"')) continue;          // page has no sidebar

    const crlf = raw.includes("\r\n");
    const text = raw.replace(/\r\n/g, "\n");
    const file = `client/pages/${name}`;
    if (text.includes('href="EnglishCoach.html"')) { note("done", file, "sidebar link"); continue; }

    // sits just above the Articulation Coach link if there is one, otherwise just below the Interview Simulator
    let out = null;
    const art = ARTICULATION_BLOCK.exec(text);
    if (art) {
      out = text.replace(art[0], () => navItem(art[1]) + art[0]);
    } else {
      const interview = INTERVIEW_BLOCK.exec(text);
      if (interview) out = text.replace(interview[0], () => `${interview[0]}\n${navItem(interview[1]).replace(/\n\n$/, "\n")}`);
    }
    if (!out) {
      note("manual", file, "sidebar link",
        `Add this under the Interview Simulator link in ${file}:\n` +
        '<a class="nav-item" href="EnglishCoach.html" data-label="English Coach">\n  <i data-lucide="messages-square"></i>\n  <span>English Coach</span>\n</a>');
      continue;
    }
    if (!DRY) fs.writeFileSync(full, crlf ? out.replace(/\n/g, "\r\n") : out);
    note("applied", file, "sidebar link");
  }
}

/* ---------- 4. a link from the drills page to the conversation ---------- */

if (fs.existsSync(path.join(ROOT, "client/pages/Articulation.html"))) {
  edit({
    file: "client/pages/Articulation.html",
    what: "link across to the English Coach conversation",
    variants: [{
      anchor: "and talks back.</p>\n",
      replacement: 'and talks back.</p>\n      <p>Want a real conversation instead? <a href="EnglishCoach.html">Chat with your English coach</a>.</p>\n',
    }],
    alreadyDone: (t) => t.includes('href="EnglishCoach.html">Chat with your English coach'),
    manual: '  Optional. Under the intro paragraph, add:\n  <p>Want a real conversation instead? <a href="EnglishCoach.html">Chat with your English coach</a>.</p>',
  });
}

/* ---------- 4b. keep the voice-sampler's output out of git ---------- */

{
  const gi = path.join(ROOT, ".gitignore");
  if (fs.existsSync(gi)) {
    const raw = read(gi);
    if (/^\/?voice-samples\/?\s*$/m.test(raw)) note("done", ".gitignore", "ignore the voice-samples folder");
    else {
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      if (!DRY) fs.writeFileSync(gi, raw + (raw.endsWith("\n") || raw === "" ? "" : eol) + "voice-samples/" + eol);
      note("applied", ".gitignore", "ignore the voice-samples folder");
    }
  }
}

/* ---------- 5. things that must already exist ---------- */

const mustExist = [
  ["server/routes/english.js", "the route (unzip the English Coach files into the project first)"],
  ["server/services/englishLevels.js", "the level maths"],
  ["server/services/conversationCoach.js", "the coach's prompts and safety replies"],
  ["server/services/ttsProviders.js", "the voice layer"],
  ["server/services/speechAnalysis.js", "the speech analysis module (from the Articulation Coach files)"],
  ["server/services/featureEvents.js", "feature event logging (from the admin panel work)"],
  ["client/pages/EnglishCoach.html", "the page"],
  ["client/js/EnglishCoach.js", "the page script"],
  ["client/js/vad.js", "the hands-free listening logic"],
  ["client/css/EnglishCoach.css", "the page styles"],
  ["database/english_coach_migration.sql", "the database tables"],
];
for (const [file, why] of mustExist) {
  if (!fs.existsSync(path.join(ROOT, file))) note("manual", file, "required file", `Missing ${file}: ${why}.`);
}

const pkg = path.join(ROOT, "server/services/package.json");
if (!fs.existsSync(pkg)) {
  if (!DRY) { fs.mkdirSync(path.dirname(pkg), { recursive: true }); fs.writeFileSync(pkg, '{ "type": "module" }\n'); }
  note("applied", "server/services/package.json", "mark the services folder as ES modules (required)");
}

/* ---------- report ---------- */

const label = { applied: DRY ? "WOULD ADD " : "ADDED     ", done: "ALREADY   ", manual: "DO BY HAND" };
console.log(`\nEnglish Coach installer${DRY ? " (preview only, nothing was changed)" : ""}\n`);
for (const r of results) console.log(`  ${label[r.status]}  ${r.file}  ${r.what}`);

const manual = results.filter((r) => r.status === "manual");
const applied = results.filter((r) => r.status === "applied").length;
const done = results.filter((r) => r.status === "done").length;
console.log(`\n${applied} ${DRY ? "to add" : "added"}, ${done} already in place, ${manual.length} need you.`);

if (manual.length) {
  console.log("\n--- Things to do by hand ---");
  for (const r of manual) console.log(`\n[${r.file}] ${r.what}\n${r.manual}`);
  process.exitCode = 2;
} else if (!DRY) {
  console.log(
    "\nTwo more things before it works:\n" +
    "  1. Run database/english_coach_migration.sql in the Supabase SQL editor.\n" +
    "  2. Restart the server (Ctrl+C, then npm run dev) and hard-refresh the browser (Ctrl+Shift+R).\n" +
    "\nOptional: pick the coach's voice. See README-ENGLISH-COACH.md, and try  node tools/voice-sampler.mjs"
  );
}
