// server/tts-check.mjs
// Diagnoses "Edge TTS WebSocket error: Unexpected server response: 403".
// Run from the project root:   node server/tts-check.mjs

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const CLOCK_URLS = ["https://speech.platform.bing.com/", "https://www.bing.com/"];
const VOICES_TO_TEST = ["en-US-GuyNeural", "en-ZA-LeahNeural"];
const CLOCK_TOLERANCE_SECONDS = 120;

async function measureClockSkewSeconds() {
  for (const url of CLOCK_URLS) {
    try {
      const sentAt = Date.now();
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
      const receivedAt = Date.now();
      const serverDate = res.headers.get("date");
      if (!serverDate) continue;

      // Compare against the midpoint of the request so network delay cancels out.
      const localMidpoint = (sentAt + receivedAt) / 2;
      return Math.round((localMidpoint - new Date(serverDate).getTime()) / 1000);
    } catch {
      // try the next URL
    }
  }
  return null;
}

async function tryVoice(voice) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream("Hello, and welcome to your interview.", {
      rate: 1.0,
      pitch: "+0Hz",
    });

    let bytes = 0;
    await new Promise((resolve, reject) => {
      audioStream.on("data", (chunk) => { bytes += chunk.length; });
      audioStream.on("end", resolve);
      audioStream.on("error", reject);
    });

    return { ok: bytes > 0, bytes };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    try { tts.close?.(); } catch { /* ignore */ }
  }
}

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
  console.log("Voices work from this computer. If the app still uses the robotic voice,");
  console.log("an old server process is probably still running — restart the server.");
} else if (clockBad) {
  console.log(`CAUSE: your computer's clock is ${Math.abs(skew)}s off. Microsoft rejects requests`);
  console.log("signed with a wrong clock.");
  console.log("FIX: Windows Settings > Time & language > Date & time > turn on 'Set time");
  console.log("automatically', then click 'Sync now'. Re-run this check.");
} else if (/403/.test(allErrors)) {
  console.log("Your clock is fine, so Microsoft itself is refusing this connection (403).");
  console.log("That usually means throttling or your network/IP being blocked, not your code.");
  console.log("NEXT: run this again on your phone's hotspot.");
  console.log("  - Works on the hotspot: your Wi-Fi/ISP is the problem (try again later or use a VPN).");
  console.log("  - Fails everywhere: Microsoft's free service is rejecting this client.");
  console.log("    The reliable fix is the official Azure Speech service (same voices).");
} else if (skew === null) {
  console.log("Could not reach Microsoft at all. Check your internet connection, VPN or firewall.");
} else {
  console.log("Unexpected failure — copy the FAILED lines above and send them to me.");
}
console.log("");

process.exit(0);