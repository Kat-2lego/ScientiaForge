#!/usr/bin/env node
/* =========================================================
   fix-case-sensitivity.mjs
   Windows and macOS don't care whether a link says "dashboard.html" or
   "Dashboard.html". Linux hosting (Render, Railway, most servers) does,
   so a page that works on your laptop can show a blank sidebar or a
   missing stylesheet once deployed.

   This finds every reference in client/ (HTML links and scripts, JS
   imports and page redirects, CSS url()/@import) that points at a file
   whose capitalisation is different, and fixes the REFERENCE to match
   the real file name. It never renames your files.

   Run from the project root:   node fix-case-sensitivity.mjs
   Preview only:                node fix-case-sensitivity.mjs --dry-run

   Safe to run more than once. Keeps each file's line endings. It only
   changes a reference when exactly one file matches ignoring case; links
   to files that don't exist at all are listed, not changed.
========================================================= */

import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const CLIENT = path.join(ROOT, "client");

if (!fs.existsSync(CLIENT)) {
  console.error("client/ not found. Run this from the project root.");
  process.exit(1);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "py", "__pycache__"]);
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|mailto:|tel:|javascript:)/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(html|js|mjs|css)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Walk `ref` from `baseDir`, one segment at a time, matching each name against what is really on disk.
 * Returns { status: "ok" | "fixed" | "missing" | "ambiguous", fixed?: string }.
 */
function resolveRef(baseDir, ref) {
  const parts = ref.split("/");
  let dir = baseDir;
  const out = [];
  let changed = false;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === "" && i === 0) { out.push(part); continue; }        // leading slash: caller already set baseDir
    if (part === "." || part === "") { out.push(part); continue; }
    if (part === "..") { dir = path.dirname(dir); out.push(part); continue; }

    let names;
    try { names = fs.readdirSync(dir); } catch { return { status: "missing" }; }
    if (names.includes(part)) { out.push(part); dir = path.join(dir, part); continue; }

    const matches = names.filter((n) => n.toLowerCase() === part.toLowerCase());
    if (matches.length === 1) { out.push(matches[0]); dir = path.join(dir, matches[0]); changed = true; continue; }
    return { status: matches.length > 1 ? "ambiguous" : "missing" };
  }
  return changed ? { status: "fixed", fixed: out.join("/") } : { status: "ok" };
}

/** Where a reference written in `file` is relative to. Page names in JS strings may be relative to client/pages. */
function basesFor(file, ref) {
  if (ref.startsWith("/")) return [CLIENT];
  const bases = [path.dirname(file)];
  if (/\.html$/i.test(ref) && !ref.includes("/")) bases.push(path.join(CLIENT, "pages"));
  return bases;
}

const PATTERNS = {
  html: [/\b(?:href|src)\s*=\s*(["'])([^"']+)\1/g],
  js: [
    /\bfrom\s*(["'])([^"']+)\1/g,
    /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g,
    /\bimport\s*(["'])([^"']+)\1/g,
    /(["'`])([A-Za-z0-9_\-./]+\.html)(?:[?#][^"'`]*)?\1/g,
  ],
  css: [/url\(\s*(["']?)([^)"']+)\1\s*\)/g, /@import\s*(["'])([^"']+)\1/g],
};

function kindOf(file) {
  if (/\.html$/i.test(file)) return "html";
  if (/\.css$/i.test(file)) return "css";
  return "js";
}

const changes = [];
const missing = [];
const ambiguous = [];
let filesChanged = 0;

for (const file of walk(CLIENT)) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  let edited = false;

  for (const pattern of PATTERNS[kindOf(file)]) {
    text = text.replace(pattern, (whole, quote, ref) => {
      if (!ref || EXTERNAL.test(ref) || /[{}$]/.test(ref)) return whole;
      const [clean, tail = ""] = ref.split(/([?#].*)$/, 2);
      if (!clean) return whole;
      if (clean.startsWith("/") && !fs.existsSync(path.join(CLIENT, clean.split("/")[1] || "")) &&
          !fs.readdirSync(CLIENT).some((n) => n.toLowerCase() === (clean.split("/")[1] || "").toLowerCase())) return whole;   // e.g. /api/...
      if (!/\.[a-z0-9]{1,5}$/i.test(clean)) return whole;                                                    // not a file reference

      let outcome = { status: "missing" };
      for (const base of basesFor(file, clean)) {
        const r = resolveRef(base, clean);
        if (r.status === "ok") return whole;
        if (r.status === "fixed") { outcome = r; break; }
        if (r.status === "ambiguous") outcome = r;
      }
      if (outcome.status === "fixed") {
        changes.push({ file: rel, from: clean, to: outcome.fixed });
        edited = true;
        return whole.replace(clean, outcome.fixed);
      }
      (outcome.status === "ambiguous" ? ambiguous : missing).push({ file: rel, ref: clean });
      return whole;
    });
  }

  if (edited) {
    filesChanged += 1;
    if (!DRY) fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
  }
}

console.log(`\nCase-sensitivity fixer${DRY ? " (preview only, nothing was changed)" : ""}\n`);

if (changes.length) {
  const byPair = new Map();
  for (const c of changes) {
    const key = `${c.from}  ->  ${c.to}`;
    byPair.set(key, [...(byPair.get(key) || []), c.file]);
  }
  for (const [pair, files] of byPair) console.log(`  ${DRY ? "WOULD FIX" : "FIXED    "}  ${pair}   (${files.length} place${files.length === 1 ? "" : "s"}: ${[...new Set(files)].slice(0, 3).join(", ")}${new Set(files).size > 3 ? ", ..." : ""})`);
} else {
  console.log("  Every reference already matches its file's real capitalisation.");
}

const uniqueMissing = [...new Map(missing.map((m) => [`${m.file}|${m.ref}`, m])).values()];
if (uniqueMissing.length) {
  console.log(`\n  Not a capitalisation problem, but these point at files that do not exist (${uniqueMissing.length}):`);
  for (const m of uniqueMissing.slice(0, 15)) console.log(`    ${m.file}  ->  ${m.ref}`);
  if (uniqueMissing.length > 15) console.log(`    ...and ${uniqueMissing.length - 15} more`);
}
if (ambiguous.length) {
  console.log(`\n  Two files differ only by capitalisation, so I left these alone (${ambiguous.length}):`);
  for (const m of ambiguous) console.log(`    ${m.file}  ->  ${m.ref}`);
}

console.log(`\n${changes.length} reference${changes.length === 1 ? "" : "s"} ${DRY ? "to fix" : "fixed"} in ${filesChanged} file${filesChanged === 1 ? "" : "s"}.`);
if (!DRY && changes.length) console.log("Hard-refresh the browser (Ctrl+Shift+R) and commit the changes.");
