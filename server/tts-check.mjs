// server/tts-check.mjs
// Diagnoses Edge TTS failures ("Unexpected server response: 403 / 200", or silent hangs).
// Run from the project root:   node server/tts-check.mjs

import { Communicate } from "edge-tts-universal";

const CLOCK_URLS = ["https://speech.platform.bing.com/", "https://www.bing.com/"];
const VOICES_TO_TEST = ["en-US-GuyNeural", "en-ZA-LeahNeural"];
const CLOCK_TOLERANCE_SECONDS = 120;
const VOICE_TIMEOUT_MS = 15000;

async function measureClockSkewSeconds() {
  for (const url of CLOCK_URLS) {
    try {
      const sentAt = Date.now();
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
      const receivedAt = Date.now();
      const serverDate = res.headers.get("date");
      if (!serverDate) continue;
      const localMidpoint = (sentAt + receivedAt) / 2;
      return Math.round((localMidpoint - new Date(serverDate).getTime()) / 1000);
    } catch {
      // try the next URL
    }
  }
  return null;
}

async function collectAudio(voice) {
const comm = new Communicate("Hello, and welcome to your interview.", {
  voice,
  rate: "-5%",
  pitch: "+0Hz",
  connectionTimeout: 10000,
});
  let bytes = 0;
  for await (const chunk of comm.stream()) {
    if (chunk.type === "audio" && chunk.data) bytes += chunk.data.length;
  }
  return bytes;
}

async function tryVoice(voice) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${VOICE_TIMEOUT_MS / 1000}s with no result`)),
      VOICE_TIMEOUT_MS
    );
  });
  try {
    const bytes = await Promise.race([collectAudio(voice), timeout]);
    return { ok: bytes > 0, bytes, error: bytes > 0 ? "" : "no audio received" };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// Keeps Node alive so a dropped connection can't end the script silently.
const keepAlive = setInterval(() => {}, 1000);

console.log("\n1) Comparing your computer's clock with Microsoft's...");
const skew = await measureClockSkewSeconds();
if (skew === null) {
  console.log("   Could not reach Microsoft to compare clocks.");
} else {
  const n = Math.abs(skew);
  console.log(`   Your clock is ${n} second${n === 1 ? "" : "s"} ${skew >= 0 ? "ahead of" : "behind"} Microsoft's.`);
}

console.log("\n2) Trying to generate speech with your real voices...");
const results = [];
for (const voice of VOICES_TO_TEST) {
  const r = await tryVoice(voice);
  console.log(`   ${voice}: ${r.ok ? `OK (${r.bytes} bytes of audio)` : `FAILED - ${r.error}`}`);
  results.push(r);
}

const anyOk = results.some((r) => r.ok);
const allErrors = results.map((r) => r.error || "").join(" ");
const clockBad = skew !== null && Math.abs(skew) > CLOCK_TOLERANCE_SECONDS;

console.log("\n=== RESULT ===");
if (anyOk) {
  console.log("Voices work from this computer. If the app still sounds wrong,");
  console.log("an old server process is probably still running. Restart the server.");
} else if (clockBad) {
  console.log(`CAUSE: your computer's clock is ${Math.abs(skew)}s off. Microsoft rejects requests`);
  console.log("signed with a wrong clock.");
  console.log("FIX: Windows Settings > Time & language > Date & time > turn on 'Set time");
  console.log("automatically', then click 'Sync now'. Re-run this check.");
} else if (/403/.test(allErrors)) {
  console.log("Your clock is fine, so Microsoft is refusing this connection (403).");
  console.log("NEXT: run this on your phone's hotspot.");
  console.log("  - Works on the hotspot: your Wi-Fi/ISP is the problem.");
  console.log("  - Fails everywhere: use the official Azure Speech service (same voices).");
} else if (/200/.test(allErrors) || /timed out/.test(allErrors)) {
  console.log("Your clock is fine, but the connection either got a normal web page back or hung.");
  console.log("NEXT: run this on your phone's hotspot.");
  console.log("  - Works on the hotspot: your Wi-Fi/VPN/antivirus is interfering.");
  console.log("  - Fails everywhere: Microsoft's free endpoint isn't usable from here; use Azure Speech.");
} else if (skew === null) {
  console.log("Could not reach Microsoft at all. Check your internet, VPN or firewall.");
} else {
  console.log("Unexpected failure. Copy the FAILED lines above and send them to me.");
}
console.log("");

clearInterval(keepAlive);
process.exit(0);