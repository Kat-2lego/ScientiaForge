/* =========================================================
   TEXT-TO-SPEECH PROVIDERS
   One function, `synthesize(text, { userId })`, in front of:

     groq        Orpheus on Groq. Uses the Groq key you already have.
                 Expressive and fast. Limited to ~200 characters per request,
                 so long replies are split, synthesized in parallel and
                 stitched into one WAV.
     openai      gpt-4o-mini-tts (steerable tone). Needs OPENAI_API_KEY.
     elevenlabs  Generally rated the most natural. Needs ELEVENLABS_API_KEY.
     edge        Microsoft Neural voices through the official Azure Speech
                 REST API. Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.
                 Always the last resort.

   Choose with ENGLISH_TTS_PROVIDER. If a premium provider fails, is not
   configured, or the learner has used their daily premium-voice budget,
   the reply is spoken by the Azure voice instead of failing.
========================================================= */

const GROQ_MODEL = "canopylabs/orpheus-v1-english";
const GROQ_MAX_CHARS = 180;               // Groq's limit is "under 200 characters" per request
const GROQ_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"];

export class TtsError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ---------- splitting text for short-input providers ---------- */

export function splitForTts(text, max = GROQ_MAX_CHARS) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [clean];
  const pieces = [];
  for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
    if (sentence.length <= max) { pieces.push(sentence); continue; }
    // too long for one request: break at commas / semicolons, then at spaces
    let rest = sentence;
    while (rest.length > max) {
      const window = rest.slice(0, max);
      let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "));
      if (cut < max * 0.4) cut = window.lastIndexOf(" ");
      if (cut <= 0) cut = max;
      pieces.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) pieces.push(rest);
  }

  // merge neighbours so we make as few requests as possible
  const chunks = [];
  for (const piece of pieces) {
    const last = chunks[chunks.length - 1];
    if (last && `${last} ${piece}`.length <= max) chunks[chunks.length - 1] = `${last} ${piece}`;
    else chunks.push(piece);
  }
  return chunks;
}

/* ---------- WAV ---------- */

export function parseWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new TtsError("bad_audio", "Not a WAV file");
  }
  let offset = 12;
  let fmt = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        blockAlign: buf.readUInt16LE(body + 12),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      if (!fmt) throw new TtsError("bad_audio", "WAV data before format");
      // streamed files can claim a huge/zero size: trust what is actually there
      const end = size === 0 || size === 0xffffffff || body + size > buf.length ? buf.length : body + size;
      return { fmt, data: buf.subarray(body, end) };
    }
    offset = body + size + (size % 2);
  }
  throw new TtsError("bad_audio", "WAV has no audio data");
}

function wavHeader(fmt, dataLength) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(fmt.audioFormat, 20);
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.sampleRate, 24);
  header.writeUInt32LE(fmt.sampleRate * fmt.blockAlign, 28);
  header.writeUInt16LE(fmt.blockAlign, 32);
  header.writeUInt16LE(fmt.bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/** Joins WAV files into one, with a short natural pause between them. */
export function concatWav(buffers, gapMs = 140) {
  const parsed = buffers.map(parseWav);
  const { fmt } = parsed[0];
  for (const p of parsed) {
    if (p.fmt.sampleRate !== fmt.sampleRate || p.fmt.channels !== fmt.channels || p.fmt.bitsPerSample !== fmt.bitsPerSample) {
      throw new TtsError("bad_audio", "Audio pieces do not match");
    }
  }
  const gapBytes = Math.round((fmt.sampleRate * gapMs) / 1000) * fmt.blockAlign;
  const gap = Buffer.alloc(gapBytes);
  const parts = [];
  parsed.forEach((p, i) => { if (i > 0 && gapBytes) parts.push(gap); parts.push(p.data); });
  const data = Buffer.concat(parts);
  return Buffer.concat([wavHeader(fmt, data.length), data]);
}

/* ---------- helpers ---------- */

async function failFrom(res, provider) {
  let detail = "";
  try { detail = (await res.text()).slice(0, 400); } catch { /* ignore */ }
  if (res.status === 400 && /terms/i.test(detail)) {
    throw new TtsError("terms_required", `${provider}: the model's terms must be accepted in the provider's console. ${detail}`, 400);
  }
  if (res.status === 401 || res.status === 403) throw new TtsError("unauthorised", `${provider}: key rejected (${res.status})`, res.status);
  if (res.status === 429) throw new TtsError("rate_limited", `${provider}: rate limited`, 429);
  throw new TtsError("provider_error", `${provider}: ${res.status} ${detail}`, res.status);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* ---------- the providers ---------- */

export async function groqSpeech({ text, voice, apiKey, baseUrl, fetchImpl }) {
  const chunks = splitForTts(text, GROQ_MAX_CHARS);
  if (!chunks.length) throw new TtsError("empty", "Nothing to say");
  const pieces = await mapLimit(chunks, 4, async (chunk) => {
    const res = await fetchImpl(`${baseUrl}/openai/v1/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: GROQ_MODEL, input: chunk, voice, response_format: "wav" }),
    });
    if (!res.ok) await failFrom(res, "groq");
    return Buffer.from(await res.arrayBuffer());
  });
  return { audio: pieces.length === 1 ? pieces[0] : concatWav(pieces), contentType: "audio/wav" };
}

export async function openaiSpeech({ text, voice, apiKey, baseUrl, instructions, fetchImpl }) {
  const res = await fetchImpl(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", input: text, voice, instructions, response_format: "mp3" }),
  });
  if (!res.ok) await failFrom(res, "openai");
  return { audio: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg" };
}

export async function elevenLabsSpeech({ text, voiceId, modelId, apiKey, baseUrl, fetchImpl }) {
  const res = await fetchImpl(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: modelId }),
  });
  if (!res.ok) await failFrom(res, "elevenlabs");
  return { audio: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg" };
}

/**
 * Microsoft Neural voices through the official Azure Speech REST API.
 * Plain HTTPS, so it works on Render, Netlify Functions, or anywhere else.
 * Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. "southafricanorth").
 */
export async function edgeSpeech({ text, voice = "en-ZA-LukeNeural", rate = 0.95, pitch = "+0Hz" }) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new TtsError("not_configured", "AZURE_SPEECH_KEY / AZURE_SPEECH_REGION are not set");
  }

  // The old code used a multiplier (0.95); SSML wants a percent string ("-5%").
  const pct = Math.round((rate - 1) * 100);
  const ratePct = `${pct >= 0 ? "+" : ""}${pct}%`;
  const lang = voice.split("-").slice(0, 2).join("-");          // "en-ZA-LukeNeural" -> "en-ZA"
  const safe = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const ssml =
    `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}">` +
    `<prosody rate="${ratePct}" pitch="${pitch}">${safe}</prosody></voice></speak>`;

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "skillforge",
    },
    body: ssml,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new TtsError("provider_error", `azure: ${res.status} ${detail}`, res.status);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  if (!audio.length) throw new TtsError("empty", "Azure returned no audio");
  return { audio, contentType: "audio/mpeg" };
}

/* ---------- budget: premium voices cost money ---------- */

export function createBudget(limitChars, now = () => new Date()) {
  const used = new Map();
  const today = () => now().toISOString().slice(0, 10);
  return {
    canSpend(userId, chars) { return (used.get(`${userId}:${today()}`) || 0) + chars <= limitChars; },
    spend(userId, chars) {
      const key = `${userId}:${today()}`;
      used.set(key, (used.get(key) || 0) + chars);
      if (used.size > 5000) for (const k of used.keys()) if (!k.endsWith(today())) used.delete(k);
    },
    used(userId) { return used.get(`${userId}:${today()}`) || 0; },
    limit: limitChars,
  };
}

/* ---------- configuration + the single entry point ---------- */

export function readConfig(env = process.env) {
  const has = { groq: !!env.GROQ_API_KEY, openai: !!env.OPENAI_API_KEY, elevenlabs: !!env.ELEVENLABS_API_KEY };
  const asked = String(env.ENGLISH_TTS_PROVIDER || "").toLowerCase();
  const provider = ["groq", "openai", "elevenlabs", "edge"].includes(asked) ? asked : has.groq ? "groq" : "edge";
  const configured = provider === "edge" || has[provider];

  return {
    provider,
    configured,
    voice: env.ENGLISH_TTS_VOICE || "",
    edgeVoice: env.ENGLISH_EDGE_VOICE || "en-ZA-LukeNeural",   // the Azure fallback voice
    groq: { apiKey: env.GROQ_API_KEY, baseUrl: (env.GROQ_BASE_URL || "https://api.groq.com").replace(/\/+$/, ""), voice: GROQ_VOICES.includes(env.ENGLISH_TTS_VOICE) ? env.ENGLISH_TTS_VOICE : "daniel" },
    openai: {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: (env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, ""),
      voice: OPENAI_VOICES.includes(env.ENGLISH_TTS_VOICE) ? env.ENGLISH_TTS_VOICE : "cedar",
      instructions: `Speak as a warm, patient English conversation coach. Natural, relaxed pace, friendly and encouraging, clear enunciation, like a kind friend chatting. ${env.ENGLISH_TTS_ACCENT ? `Use a light ${env.ENGLISH_TTS_ACCENT} accent.` : "Use a neutral, easy-to-understand accent."}`,
    },
    elevenlabs: {
      apiKey: env.ELEVENLABS_API_KEY,
      baseUrl: (env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, ""),
      voiceId: env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
      modelId: env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
    },
    premiumCharsPerDay: Number(env.ENGLISH_PREMIUM_TTS_CHARS_PER_DAY) || 12000,
    maxChars: 700,
    timeoutMs: Number(env.ENGLISH_TTS_TIMEOUT_MS) || 12000,   // a slow voice is as bad as a broken one
  };
}

export function createSynthesizer({ env = process.env, fetchImpl = globalThis.fetch, edge = edgeSpeech, now } = {}) {
  const config = readConfig(env);
  const budget = createBudget(config.premiumCharsPerDay, now);
  const warned = new Set();

  // Every request gets a deadline, so a hanging provider fails over instead of leaving a learner in silence.
  const timedFetch = (url, opts = {}) => fetchImpl(url, { ...opts, signal: AbortSignal.timeout(config.timeoutMs) });
  const timedOut = (err) => err?.name === "TimeoutError" || err?.name === "AbortError";

  async function run(provider, text) {
    try {
      if (provider === "groq") return await groqSpeech({ text, ...config.groq, fetchImpl: timedFetch });
      if (provider === "openai") return await openaiSpeech({ text, ...config.openai, fetchImpl: timedFetch });
      if (provider === "elevenlabs") return await elevenLabsSpeech({ text, ...config.elevenlabs, fetchImpl: timedFetch });
      let timer;
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new TtsError("timeout", "the Azure voice took too long")), config.timeoutMs); });
      try { return await Promise.race([edge({ text, voice: config.edgeVoice }), deadline]); } finally { clearTimeout(timer); }
    } catch (err) {
      if (timedOut(err)) throw new TtsError("timeout", `${provider} took longer than ${config.timeoutMs}ms`);
      throw err;
    }
  }

  async function synthesize(rawText, { userId = "anon" } = {}) {
    const text = String(rawText ?? "").replace(/\s+/g, " ").trim().slice(0, config.maxChars);
    if (!text) throw new TtsError("empty", "Nothing to say");

    const order = [];
    if (config.provider !== "edge" && config.configured && budget.canSpend(userId, text.length)) order.push(config.provider);
    order.push("edge");

    let lastError;
    for (const provider of order) {
      try {
        const out = await run(provider, text);
        if (provider !== "edge") budget.spend(userId, text.length);
        return { ...out, provider, premium: provider !== "edge" };
      } catch (err) {
        lastError = err;
        const key = `${provider}:${err.code || "error"}`;
        if (!warned.has(key)) {
          warned.add(key);
          console.warn(`English coach voice: ${provider} failed (${err.code || "error"}): ${String(err.message).slice(0, 200)}${provider === "groq" && err.code === "terms_required" ? " Open https://console.groq.com/playground?model=canopylabs/orpheus-v1-english and accept the terms." : ""}`);
        }
      }
    }
    throw lastError;
  }

  return { synthesize, config, budget };
}