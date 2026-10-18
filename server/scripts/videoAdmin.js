#!/usr/bin/env node
/* Video Discovery admin: curate channels, sync them, flag videos, keep the cache legal.
 *
 *   node server/scripts/videoAdmin.js add-channel @handle --subjects mathematics,physical-sciences --curricula NSC --trust 2
 *   node server/scripts/videoAdmin.js list-channels
 *   node server/scripts/videoAdmin.js set-trust @handle 3            (0 blocked, 1 listed, 2 trusted, 3 verified)
 *   node server/scripts/videoAdmin.js sync [@handle]                 pull recent uploads (about 1 unit per 50 videos)
 *   node server/scripts/videoAdmin.js refresh                        30-day rule: refresh what's in use, purge the rest (run daily)
 *   node server/scripts/videoAdmin.js verify <video id or URL> --subject mathematics [--topic trigonometry] [--note "..."]
 *   node server/scripts/videoAdmin.js block <video id or URL> [--note "..."]
 *   node server/scripts/videoAdmin.js unflag <video id or URL>
 *   node server/scripts/videoAdmin.js preview --subject mathematics --grade 12 --curriculum NSC --topic trigonometry [--q "..."] [--minutes 20]
 *   node server/scripts/videoAdmin.js quota
 *
 * Run from the ScientiaForge folder (where package.json and .env are). Reads SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY and YOUTUBE_API_KEY from SkillForge/.env (then server/.env if present).
 * Its own Supabase client, on purpose: server/db.js is a raw Postgres connection (ES module),
 * and this tool runs as its own process, not inside server.mjs.
 */
"use strict";

const tx = require("../services/video/taxonomy");

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

/** Video id from an id or any common YouTube URL form. */
function parseVideoId(input) {
  const s = String(input || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (/(^|\.)youtu\.be$/.test(u.hostname)) return parseVideoId(u.pathname.slice(1));
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.searchParams.get("v")) return parseVideoId(u.searchParams.get("v"));
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

const list = (v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);

async function run(argv, { repo, discovery, provider, out = console.log }) {
  const args = parseArgs(argv);
  const [cmd, target] = args._;
  const findChannel = async (ref) => {
    const channels = await repo.listChannels();
    return channels.find((c) => c.provider_channel_id === ref || (c.handle && c.handle.toLowerCase() === String(ref).toLowerCase()));
  };

  switch (cmd) {
    case "add-channel": {
      if (!target) throw new Error("Give a channel @handle or UC... id.");
      if (!provider) throw new Error("Set YOUTUBE_API_KEY to look up channels.");
      const subjects = list(args.subjects);
      const bad = subjects.filter((s) => !tx.getSubject(s));
      if (bad.length) throw new Error(`Unknown subject(s): ${bad.join(", ")}. Use ids like: ${tx.SUBJECTS.map((s) => s.id).join(", ")}`);
      const curricula = list(args.curricula);
      const trust = args.trust === undefined ? 2 : Number(args.trust);
      if (![0, 1, 2, 3].includes(trust)) throw new Error("--trust must be 0, 1, 2 or 3.");
      const info = await provider.getChannel(CHANNEL_ID_RE.test(target) ? { id: target } : { handle: target });
      if (!info) throw new Error(`YouTube has no channel ${target}.`);
      const row = await repo.upsertChannel({
        provider: "youtube", provider_channel_id: info.provider_channel_id, handle: info.handle || (target.startsWith("@") ? target : null),
        title: info.title, uploads_playlist_id: info.uploads_playlist_id, fetched_at: new Date().toISOString(),
        subjects, curricula, trust_level: trust, notes: typeof args.notes === "string" ? args.notes : null,
      });
      out(`Added ${info.title} (${info.provider_channel_id}), trust ${row.trust_level}, subjects: ${subjects.join(", ") || "all"}.`);
      out("Next: node server/scripts/videoAdmin.js sync " + (info.handle || info.provider_channel_id));
      return row;
    }
    case "list-channels": {
      const channels = await repo.listChannels();
      if (!channels.length) out("No curated channels yet. Add one with add-channel.");
      for (const c of channels) {
        out(`${String(c.trust_level)}  ${(c.title || "(title not cached)").padEnd(34)} ${(c.handle || c.provider_channel_id).padEnd(26)} ${(c.subjects || []).join(",") || "all subjects"}  ${(c.curricula || []).join(",")}  synced: ${c.last_synced_at ? c.last_synced_at.slice(0, 10) : "never"}`);
      }
      return channels;
    }
    case "set-trust": {
      const level = Number(args._[2]);
      if (![0, 1, 2, 3].includes(level)) throw new Error("Trust must be 0 (blocked), 1, 2 or 3 (verified).");
      const c = await findChannel(target);
      if (!c) throw new Error(`No curated channel ${target}. See list-channels.`);
      await repo.updateChannel(c.provider_channel_id, { trust_level: level });
      out(`${c.title || c.provider_channel_id}: trust ${level}.`);
      return level;
    }
    case "sync": {
      let only;
      if (target) {
        const c = await findChannel(target);
        if (!c) throw new Error(`No curated channel ${target}. See list-channels.`);
        only = c.provider_channel_id;
      }
      const report = await discovery.syncChannels({ only, maxPerChannel: args.max ? Number(args.max) : 200 });
      for (const r of report) out(r.error ? `  ${r.channel}: FAILED (${r.error})` : `  ${r.channel}: ${r.uploads} uploads, ${r.refreshed} refreshed`);
      return report;
    }
    case "refresh": {
      const r = await discovery.refreshAndPurge();
      out(`Refreshed ${r.refreshed} videos still in use; purged ${JSON.stringify(r.purged)}.`);
      return r;
    }
    case "verify":
    case "block": {
      const id = parseVideoId(target);
      if (!id) throw new Error("Give a YouTube video id or URL.");
      if (cmd === "verify" && !tx.getSubject(args.subject)) throw new Error("Verified videos need --subject (e.g. --subject mathematics).");
      await repo.setFlag({
        provider_video_id: id, status: cmd === "verify" ? "verified" : "blocked",
        subject: tx.getSubject(args.subject) ? args.subject : null,
        topic: typeof args.topic === "string" ? args.topic : null,
        note: typeof args.note === "string" ? args.note : null,
      });
      out(`${id} is now ${cmd === "verify" ? "SkillForge verified" : "blocked"}.`);
      return id;
    }
    case "unflag": {
      const id = parseVideoId(target);
      if (!id) throw new Error("Give a YouTube video id or URL.");
      await repo.removeFlag(id);
      out(`${id}: flag removed.`);
      return id;
    }
    case "preview": {
      const filters = { subject: args.subject, grade: args.grade, curriculum: args.curriculum, topic: args.topic, subtopic: args.subtopic,
        types: args.types, minutes: args.minutes, language: args.language, level: args.level, q: typeof args.q === "string" ? args.q : undefined, limit: 15 };
      const r = await discovery.search(filters, { liveSearch: !args["no-live"] });
      out(`Query: "${r.query_used}" (${r.source})${r.detected ? `  detected: ${r.detected.name}` : ""}`);
      for (const n of [...r.relaxed, ...r.notices]) out(`  note: ${n.message}`);
      r.results.forEach((v, i) => {
        out(`${String(i + 1).padStart(2)}. ${String(v.match).padStart(3)}  ${v.title.slice(0, 70)}`);
        out(`        ${v.channel.title}  |  ${v.reasons.join("; ") || "no reasons"}${v.cautions.length ? `  |  ! ${v.cautions.join("; ")}` : ""}`);
      });
      return r;
    }
    case "quota": {
      const s = await discovery.status();
      out(`Live search: ${s.live_search ? "on" : "off (no YOUTUBE_API_KEY)"}`);
      out(`Today (Pacific time ${s.quota.date}): ${s.quota.search_calls}/${s.quota.search_limit} searches, ${s.quota.units}/${s.quota.unit_limit} units`);
      return s;
    }
    default:
      out(require("node:fs").readFileSync(__filename, "utf8").split("\n").slice(1, 16).map((l) => l.replace(/^\/\*\s?|^ \*\/?\s?/, "")).join("\n"));
      return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || /^(-h|--help|help)$/.test(argv[0])) return run(["help"], {}); // usage needs no keys
  const path = require("node:path");
  try {
    const dotenv = require("dotenv");
    // repo-root .env first (same file `npm run dev` uses); values already set are never overwritten
    dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });
    dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  } catch {
    /* no dotenv package: fine as long as SUPABASE_URL etc. are already in process.env */
  }
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing from SkillForge/.env.");
    process.exit(1);
  }
  const { createClient } = require("@supabase/supabase-js");
  const { loadVideoConfig } = require("../services/video/config");
  const { createVideoRepo } = require("../services/video/videoRepo");
  const { createYouTubeProvider } = require("../services/video/youtubeProvider");
  const { createVideoDiscovery } = require("../services/video/discovery");
  const cfg = loadVideoConfig();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const repo = createVideoRepo(supabase, { maxAgeDays: cfg.cache.maxAgeDays });
  const provider = env.YOUTUBE_API_KEY
    ? createYouTubeProvider({ apiKey: env.YOUTUBE_API_KEY, config: cfg, quota: { charge: (c) => repo.chargeQuota(c, cfg.quota) } })
    : null;
  const discovery = createVideoDiscovery({ repo, provider, config: cfg });
  try {
    await run(argv, { repo, discovery, provider });
  } catch (err) {
    const hint = /vd_\w+.*does not exist|schema cache/i.test(err.message) ? " (run supabase/migrations/20260929_video_discovery.sql first)" : "";
    console.error(`Error: ${err.message}${hint}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, parseArgs, parseVideoId };
