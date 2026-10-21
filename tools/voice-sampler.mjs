#!/usr/bin/env node
/* =========================================================
   voice-sampler.mjs
   "Most natural" is something your ears should decide. This makes the
   same coach sentence in every voice you have a key for, saves them in
   voice-samples/, and builds voice-samples/index.html so you can click
   through and compare. It also shows how long each took to start and
   roughly what a 10-minute chat would cost with each.

   Run from the project root (so your .env is picked up):
     node --env-file=.env tools/voice-sampler.mjs
   Options:
     --text "Your own sentence to hear"      (keep it under 180 characters)
     --only groq,openai,elevenlabs,edge      (just these providers)
     --zar 18                                (Rand per US dollar, for the cost line)

   Only providers whose key is in .env are tried. A few cents at most.
========================================================= */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groqSpeech, openaiSpeech, elevenLabsSpeech, edgeSpeech, readConfig } from "../server/services/ttsProviders.js";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

const TEXT = opt("text", "Oh nice, that sounds like a great weekend! I love a good braai. What did you cook, and who came over to join you?").slice(0, 180);
const ONLY = opt("only", "").split(",").map((s) => s.trim()).filter(Boolean);
const ZAR = Number(opt("zar", 18)) || 18;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "voice-samples");

const config = readConfig(process.env);
const wants = (name) => !ONLY.length || ONLY.includes(name);

// Roughly 3,600 characters of Sipho speaking in a 10-minute chat (about 4 minutes of audio).
const CHARS_PER_CHAT = 3600;
const PRICES = [
  // [provider, label, USD per 1,000,000 characters, note]
  ["groq", "Groq Orpheus", 22, "list price"],
  ["openai", "OpenAI gpt-4o-mini-tts", 16.7, "about $0.015 a minute of speech; billed by audio, so this is an estimate"],
  ["elevenlabs", "ElevenLabs Flash", 50, "Multilingual v2 / v3 cost about double"],
  ["edge", "Edge (free voice)", 0, "free"],
];

const jobs = [];
if (wants("groq") && config.groq.apiKey) {
  for (const voice of ["autumn", "diana", "hannah", "austin", "daniel", "troy"]) {
    jobs.push({ provider: "groq", voice, ext: "wav", run: () => groqSpeech({ text: TEXT, ...config.groq, voice, fetchImpl: fetch }) });
  }
}
if (wants("openai") && config.openai.apiKey) {
  for (const voice of ["cedar", "marin", "coral", "ash", "sage", "ballad"]) {
    jobs.push({ provider: "openai", voice, ext: "mp3", run: () => openaiSpeech({ text: TEXT, ...config.openai, voice, fetchImpl: fetch }) });
  }
}
if (wants("elevenlabs") && config.elevenlabs.apiKey) {
  const ids = (process.env.ELEVENLABS_VOICE_IDS || config.elevenlabs.voiceId).split(",").map((s) => s.trim()).filter(Boolean);
  for (const voiceId of ids) {
    jobs.push({ provider: "elevenlabs", voice: voiceId, ext: "mp3", run: () => elevenLabsSpeech({ text: TEXT, ...config.elevenlabs, voiceId, fetchImpl: fetch }) });
  }
}
if (wants("edge")) {
  for (const voice of ["en-ZA-LukeNeural", "en-ZA-LeahNeural", "en-US-AndrewNeural", "en-GB-RyanNeural"]) {
    jobs.push({ provider: "edge", voice, ext: "mp3", run: () => edgeSpeech({ text: TEXT, voice }) });
  }
}

if (!jobs.length) {
  console.log("No voices to try. Add GROQ_API_KEY (or OPENAI_API_KEY / ELEVENLABS_API_KEY) to your .env, or run with --only edge.");
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
console.log(`\nSaying: "${TEXT}"\n`);

const rows = [];
for (const job of jobs) {
  const name = `${job.provider}-${job.voice}`.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const started = Date.now();
  try {
    const { audio } = await job.run();
    const ms = Date.now() - started;
    fs.writeFileSync(path.join(OUT, `${name}.${job.ext}`), audio);
    rows.push({ ...job, name, file: `${name}.${job.ext}`, ms, ok: true });
    console.log(`  ok    ${job.provider.padEnd(11)} ${job.voice.padEnd(20)} ${String(ms).padStart(5)} ms`);
  } catch (err) {
    rows.push({ ...job, name, ok: false, error: String(err.message).slice(0, 160) });
    console.log(`  FAIL  ${job.provider.padEnd(11)} ${job.voice.padEnd(20)} ${String(err.message).slice(0, 110)}`);
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const good = rows.filter((r) => r.ok);

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Coach voice samples</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 760px; margin: 32px auto; padding: 0 16px; color: #0f172a; }
  h1 { margin-bottom: 4px; } .say { padding: 12px 16px; background: #eff6ff; border-radius: 10px; }
  .row { display: grid; grid-template-columns: 190px 1fr 70px; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  .row b { font-weight: 700; } .row small { color: #64748b; display: block; } audio { width: 100%; } .ms { color: #64748b; text-align: right; }
  .fail { color: #b91c1c; } code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
</style></head><body>
<h1>Coach voice samples</h1>
<p class="say">&ldquo;${esc(TEXT)}&rdquo;</p>
<p>Listen on the headphones your learners will use. When you have a winner, put it in <code>.env</code> and restart the server:</p>
<ul>
  <li><b>groq</b> or <b>openai</b>: <code>ENGLISH_TTS_PROVIDER=groq</code> and <code>ENGLISH_TTS_VOICE=daniel</code> (use the voice name shown)</li>
  <li><b>elevenlabs</b>: <code>ENGLISH_TTS_PROVIDER=elevenlabs</code> and <code>ELEVENLABS_VOICE_ID=&lt;the id shown&gt;</code></li>
  <li><b>edge</b> (the free voice, used whenever a paid one fails): <code>ENGLISH_EDGE_VOICE=en-ZA-LeahNeural</code></li>
</ul>
${rows.map((r) => r.ok
  ? `<div class="row"><div><b>${esc(r.provider)}</b><small>${esc(r.voice)}</small></div><audio controls preload="none" src="${esc(r.file)}"></audio><div class="ms">${r.ms} ms</div></div>`
  : `<div class="row"><div><b>${esc(r.provider)}</b><small>${esc(r.voice)}</small></div><div class="fail">${esc(r.error)}</div><div></div></div>`).join("\n")}
</body></html>`;
fs.writeFileSync(path.join(OUT, "index.html"), html);

console.log(`\nWhat a 10-minute chat costs for Sipho's voice (about ${CHARS_PER_CHAT} characters), at R${ZAR} to the dollar.`);
console.log("List prices found in October 2026. Check each provider's pricing page before you rely on them.\n");
for (const [id, label, perMillion, noteText] of PRICES) {
  if (!jobs.some((j) => j.provider === id)) continue;
  const usd = (CHARS_PER_CHAT / 1_000_000) * perMillion;
  console.log(`  ${label.padEnd(24)} about R${(usd * ZAR).toFixed(2).padStart(5)} per chat, R${(usd * ZAR * 30).toFixed(0).padStart(4)} for 30 daily chats (${noteText})`);
}

if (rows.some((r) => !r.ok && r.provider === "groq" && /terms/i.test(r.error))) {
  console.log("\nGroq says its Orpheus voice terms have not been accepted yet. Accept them once here, then run this again:");
  console.log("  https://console.groq.com/playground?model=canopylabs/orpheus-v1-english");
}
if (rows.some((r) => !r.ok && r.provider === "edge")) {
  console.log("\nThe free Edge voice failed. If you are online, update it with:  npm install msedge-tts@latest  (version 2.1.0 or newer).");
}

console.log(`\n${good.length} of ${rows.length} voices made.${good.length ? `\nOpen this in your browser to listen and compare:\n  ${path.join(OUT, "index.html")}` : ""}`);
process.exit(good.length ? 0 : 1);
