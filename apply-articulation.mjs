#!/usr/bin/env node
/* =========================================================
   apply-articulation.mjs
   Wires the Articulation Coach into your existing files:

     server/server.mjs             import + mount the route, add the coach voice
     server/routes/admin.js        count "articulation" in the admin charts
     client/js/adminDashboard.js   label + colour for it in the admin charts
     client/pages/*.html           an "Articulation Coach" link in every sidebar

   Run from the project root:   node apply-articulation.mjs
   Preview only:                node apply-articulation.mjs --dry-run

   Safe to run more than once. It keeps each file's line endings, and if a
   spot has changed since this was written it does NOT guess: it prints the
   exact lines to add by hand.
========================================================= */

import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const results = [];

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const read = (p) => fs.readFileSync(p, "utf8");

function note(status, file, what, manual) {
  results.push({ status, file, what, manual });
}

/** Replace `anchor` (which must occur exactly once) with `replacement`, keeping the file's line endings. */
function edit({ file, what, anchor, replacement, alreadyDone }) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return note("manual", file, what, `File not found: ${file}`);

  const raw = read(full);
  const crlf = raw.includes("\r\n");
  const text = raw.replace(/\r\n/g, "\n");

  if (alreadyDone(text)) return note("done", file, what);

  const count = text.split(anchor).length - 1;
  if (count !== 1) {
    return note("manual", file, what, `Could not find this spot in ${file} (found ${count} matches). Add by hand:\n${replacement}`);
  }

  const out = text.replace(anchor, () => replacement);
  if (!DRY) fs.writeFileSync(full, crlf ? out.replace(/\n/g, "\r\n") : out);
  note("applied", file, what);
}

/* ---------- 1. server.mjs ---------- */

edit({
  file: "server/server.mjs",
  what: "import the Articulation route",
  anchor: 'import adminRoutes from "./routes/admin.js";\n',
  replacement: 'import adminRoutes from "./routes/admin.js";\nimport articulationRoutes from "./routes/articulation.js";\n',
  alreadyDone: (t) => t.includes("articulationRoutes from"),
});

edit({
  file: "server/server.mjs",
  what: "mount it at /api/articulation",
  anchor: 'app.use("/api/admin", adminRoutes);\n',
  replacement: 'app.use("/api/admin", adminRoutes);\napp.use("/api/articulation", articulationRoutes);\n',
  alreadyDone: (t) => t.includes('"/api/articulation"'),
});

edit({
  file: "server/server.mjs",
  what: "give the coach its own voice",
  anchor: '  "consultant": { voice: "en-IN-NeerjaNeural", rate: 1.08, pitch: "+5Hz" },\n',
  replacement:
    '  "consultant": { voice: "en-IN-NeerjaNeural", rate: 1.08, pitch: "+5Hz" },\n' +
    '  "articulation-coach": { voice: "en-ZA-LukeNeural", rate: 0.95, pitch: "+0Hz" },\n',
  alreadyDone: (t) => t.includes('"articulation-coach"'),
});

/* ---------- 2. admin charts ---------- */

edit({
  file: "server/routes/admin.js",
  what: "count the Articulation Coach in the feature timeline",
  anchor: 'const TRACKED_FEATURES = ["interview_simulator", "cv_analyzer", "skill_gap", "career_discovery"];',
  replacement: 'const TRACKED_FEATURES = ["interview_simulator", "cv_analyzer", "skill_gap", "career_discovery", "articulation"];',
  alreadyDone: (t) => /TRACKED_FEATURES\s*=\s*\[[^\]]*"articulation"/.test(t),
});

edit({
  file: "client/js/adminDashboard.js",
  what: "label the Articulation Coach in the admin chart",
  anchor: '  career_discovery: "Career Discovery",\n};',
  replacement: '  career_discovery: "Career Discovery",\n  articulation: "Articulation Coach",\n};',
  alreadyDone: (t) => /articulation:\s*"Articulation Coach"/.test(t),
});

edit({
  file: "client/js/adminDashboard.js",
  what: "give it a colour in the admin chart",
  anchor: 'const FEATURE_COLORS = ["--primary", "--orange", "--cyan", "--admin-purple"];',
  replacement: 'const FEATURE_COLORS = ["--primary", "--orange", "--cyan", "--admin-purple", "--admin-green"];',
  alreadyDone: (t) => /FEATURE_COLORS\s*=\s*\[[^\]]*--admin-green/.test(t),
});

/* ---------- 3. sidebar link on every page that has one ---------- */

const NAV_BLOCK = /^([ \t]*)<a class="nav-item(?: active)?" href="InterviewSimulator\.html"[^>]*>[\s\S]*?<\/a>[ \t]*\n/m;
const pagesDir = path.join(ROOT, "client/pages");

if (!fs.existsSync(pagesDir)) {
  note("manual", "client/pages", "sidebar link", "client/pages not found. Run this from the project root.");
} else {
  for (const name of fs.readdirSync(pagesDir).filter((n) => n.endsWith(".html")).sort()) {
    if (name === "Articulation.html") continue;
    const full = path.join(pagesDir, name);
    const raw = read(full);
    if (!raw.includes('href="InterviewSimulator.html"')) continue;          // page has no sidebar

    const crlf = raw.includes("\r\n");
    const text = raw.replace(/\r\n/g, "\n");
    const file = `client/pages/${name}`;

    if (text.includes('href="Articulation.html"')) { note("done", file, "sidebar link"); continue; }

    const match = NAV_BLOCK.exec(text);
    if (!match) {
      note("manual", file, "sidebar link",
        `Add this under the Interview Simulator link in ${file}:\n` +
        '<a class="nav-item" href="Articulation.html" data-label="Articulation Coach">\n  <i data-lucide="audio-waveform"></i>\n  <span>Articulation Coach</span>\n</a>');
      continue;
    }

    const indent = match[1];
    const item =
      `\n${indent}<a class="nav-item" href="Articulation.html" data-label="Articulation Coach">\n` +
      `${indent}  <i data-lucide="audio-waveform"></i>\n` +
      `${indent}  <span>Articulation Coach</span>\n` +
      `${indent}</a>\n`;
    const out = text.replace(match[0], () => match[0] + item);
    if (!DRY) fs.writeFileSync(full, crlf ? out.replace(/\n/g, "\r\n") : out);
    note("applied", file, "sidebar link");
  }
}

/* ---------- 4. things that must already exist ---------- */

const mustExist = [
  ["server/routes/articulation.js", "the route (unzip the Articulation Coach files into the project first)"],
  ["server/services/speechAnalysis.js", "the analysis module"],
  ["server/services/articulationCoach.js", "the coaching module"],
  ["server/services/articulationPrompts.js", "the practice prompts"],
  ["server/services/featureEvents.js", "feature event logging (from the admin panel work)"],
  ["client/pages/Articulation.html", "the page"],
  ["client/js/Articulation.js", "the page script"],
  ["client/css/Articulation.css", "the page styles"],
];
for (const [file, why] of mustExist) {
  if (!fs.existsSync(path.join(ROOT, file))) note("manual", file, "required file", `Missing ${file}: ${why}.`);
}

const pkg = path.join(ROOT, "server/services/package.json");
if (!fs.existsSync(pkg)) {
  if (!DRY) { fs.mkdirSync(path.dirname(pkg), { recursive: true }); fs.writeFileSync(pkg, '{ "type": "module" }\n'); }
  note("applied", "server/services/package.json", 'mark the services folder as ES modules (required)');
}

/* ---------- report ---------- */

const label = { applied: DRY ? "WOULD ADD " : "ADDED     ", done: "ALREADY   ", manual: "DO BY HAND" };
console.log(`\nArticulation Coach installer${DRY ? " (preview only, nothing was changed)" : ""}\n`);
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
  console.log("\nDone. Restart the server (Ctrl+C, then npm run dev) and hard-refresh the browser (Ctrl+Shift+R).");
}
