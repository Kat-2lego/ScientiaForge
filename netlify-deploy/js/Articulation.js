/* =========================================================
   ARTICULATION COACH (browser side)
   Pick a prompt -> record -> upload -> see the annotated results ->
   the coach talks back (same voice pipeline and avatar as the
   Interview Simulator).

   Everything user-visible is written with textContent, never innerHTML,
   so nothing a person says can inject markup into the page.
========================================================= */

const API = "/api/articulation";
const COACH_ID = "articulation-coach";
const VOICE_KEY = "sf-articulation-voice";

const MODES = {
  explain: {
    description:
      "Answer the question out loud in your own words. I will show you where you paused, where you said \u201Cum\u201D, and how clearly your answer was organised.",
    filterKey: "category",
    filters: [["all", "All"], ["interview", "Interview"], ["workplace", "Workplace"], ["school", "School"]],
    minSeconds: 3,
    maxSeconds: (p) => Math.min(120, Math.max(60, p.targetSeconds * 2)),
    hint: (p) => `Speak for about ${p.targetSeconds} seconds: make your point, give one example, then close.`,
    meta: (p) => `About ${p.targetSeconds} seconds`,
  },
  repeat: {
    description:
      "I say a sentence and you say it back. I will show you which words came through clearly and which ones got lost.",
    filterKey: "level",
    filters: [["all", "All"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]],
    minSeconds: 1,
    maxSeconds: () => 20,
    hint: () => "Press Hear it first, then say the sentence at a steady, natural pace.",
    meta: (p) => `${p.level[0].toUpperCase()}${p.level.slice(1)} sentence`,
  },
};

const STATUS_TEXT = {
  idle: "Ready when you are.",
  listening: "Listening\u2026",
  thinking: "Analysing your recording\u2026",
  speaking: "Coach is speaking\u2026",
};

const PACE_GUIDANCE = {
  slow: "Move along a bit faster so people stay with you.",
  slightly_slow: "A touch more pace will add energy.",
  sweet: "Easy to follow, and it still has energy.",
  slightly_fast: "Ease off slightly so each point can land.",
  fast: "Slow down. It is hard to follow when it goes this fast.",
};

const state = {
  mode: "explain",
  filter: "all",
  prompts: { explain: [], repeat: [] },
  current: null,
  recording: null,   // { recorder, stream, chunks, startedAt, timer, meter, maxSeconds, mimeType }
  busy: false,
  voiceOn: true,
  lastSpoken: "",
};

const el = {};
let avatar = null;
let currentAudio = null;

/* ---------- small helpers ---------- */

const $ = (id) => document.getElementById(id);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function clear(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
}

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function whenLabel(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function goToLogin() {
  localStorage.removeItem("sb-access-token");
  window.location.href = "LogIn.html";
}

const authHeaders = () => (typeof window.getAuthHeaders === "function" ? window.getAuthHeaders() : {});
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

/* ---------- server calls ---------- */

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) },
    });
  } catch {
    throw Object.assign(new Error("Could not reach the server. Check your connection and try again."), { status: 0 });
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }

  if (res.status === 401) {
    goToLogin();
    throw Object.assign(new Error("Log in again to continue."), { status: 401 });
  }
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || "Something went wrong. Try again."), { status: res.status });
  }
  return data;
}

/* ---------- status, errors ---------- */

function setStatus(name) {
  el.status.dataset.state = name;
  el.status.textContent = STATUS_TEXT[name] || STATUS_TEXT.idle;
}

function showError(message) {
  el.error.textContent = message;
  el.error.hidden = false;
}

function clearError() {
  el.error.textContent = "";
  el.error.hidden = true;
}

function lockControls(locked) {
  const busy = locked || state.busy || Boolean(state.recording);
  document.querySelectorAll(".art-tab, .art-chip, #btnNext, #btnHear").forEach((b) => { b.disabled = busy; });
}

/* ---------- sidebar (same behaviour as the other pages) ---------- */

function wireSidebar() {
  const menuBtn = $("menuBtn");
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!menuBtn || !sidebar) return;

  const open = () => {
    sidebar.classList.add("open");
    overlay?.classList.add("visible");
    menuBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
  };
  const close = () => {
    sidebar.classList.remove("open");
    overlay?.classList.remove("visible");
    menuBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
  };

  menuBtn.addEventListener("click", () => (sidebar.classList.contains("open") ? close() : open()));
  overlay?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  sidebar.querySelectorAll(".nav-item").forEach((a) =>
    a.addEventListener("click", () => { if (window.innerWidth <= 768) close(); })
  );
  window.addEventListener("resize", () => { if (window.innerWidth > 768) close(); });
}

async function loadProfile() {
  try {
    const res = await fetch("/api/auth/me", { headers: authHeaders() });
    if (!res.ok) return;
    const me = await res.json();
    el.profileName.textContent = me.firstName || me.email || "";
    el.profileEmail.textContent = me.email || "";
  } catch { /* the placeholders stay */ }
}

/* ---------- coach avatar + voice ---------- */

async function initAvatar() {
  try {
    let mod;
    // The simulator imports "AvatarEngine.js" but the file in git is "Avatarengine.js".
    // Trying both keeps this page working on case-sensitive hosts either way.
    try { mod = await import("./AvatarEngine.js"); } catch { mod = await import("./Avatarengine.js"); }
    avatar = new mod.AvatarEngine(el.canvas, COACH_ID);
    avatar.start();
  } catch (err) {
    console.warn("Coach avatar unavailable:", err?.message);
    el.canvas.hidden = true;
    el.badge.hidden = false;
  }
}

function stopSpeaking() {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio = null;
  }
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  avatar?.detachAudio?.();
  if (el.status.dataset.state === "speaking") setStatus("idle");
}

function fallbackSpeak(text) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    setStatus("idle");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-ZA";
  utterance.rate = 0.95;
  utterance.onend = utterance.onerror = () => setStatus("idle");
  setStatus("speaking");
  window.speechSynthesis.speak(utterance);
}

async function speak(text, { force = false } = {}) {
  if (!text || (!state.voiceOn && !force)) return;
  stopSpeaking();
  setStatus("speaking");

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, personaId: COACH_ID }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error("Empty audio");

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    avatar?.attachAudio?.(audio);

    const done = () => {
      URL.revokeObjectURL(url);
      avatar?.detachAudio?.();
      if (currentAudio === audio) currentAudio = null;
      if (el.status.dataset.state === "speaking") setStatus("idle");
    };
    audio.onended = done;
    audio.onerror = () => { done(); fallbackSpeak(text); };
    await audio.play();
  } catch (err) {
    console.warn("Coach voice unavailable, using the browser voice:", err?.message);
    fallbackSpeak(text);
  }
}

/* ---------- prompts ---------- */

function visiblePrompts() {
  const { filterKey } = MODES[state.mode];
  const all = state.prompts[state.mode] || [];
  return state.filter === "all" ? all : all.filter((p) => p[filterKey] === state.filter);
}

function choosePrompt() {
  const pool = visiblePrompts();
  if (!pool.length) { state.current = null; renderPrompt(); return; }
  const others = pool.length > 1 ? pool.filter((p) => p.id !== state.current?.id) : pool;
  state.current = others[Math.floor(Math.random() * others.length)];
  renderPrompt();
}

function renderPrompt() {
  const mode = MODES[state.mode];
  const p = state.current;
  el.promptText.textContent = p ? p.text : "No prompts here yet. Pick another type.";
  el.promptMeta.textContent = p ? mode.meta(p) : "";
  el.hint.textContent = p ? mode.hint(p) : "";
  el.btnHear.hidden = state.mode !== "repeat";
  el.btnRecord.disabled = !p || state.busy;
}

// `focusValue`: the chip to give keyboard focus back to after the row is redrawn,
// so pressing a chip with the keyboard doesn't throw the user out of the row.
function renderFilters(focusValue = null) {
  const { filters } = MODES[state.mode];
  clear(el.filters);
  for (const [value, label] of filters) {
    const chip = node("button", "art-chip", label);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(state.filter === value));
    chip.addEventListener("click", () => {
      state.filter = value;
      renderFilters(value);
      hideResults();
      choosePrompt();
    });
    el.filters.appendChild(chip);
    if (focusValue === value) chip.focus();
  }
}

function setMode(mode, { focusTab = false } = {}) {
  if (!MODES[mode]) return;
  stopSpeaking();
  state.mode = mode;
  state.filter = "all";
  state.current = null;

  document.querySelectorAll(".art-tab").forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focusTab) tab.focus();
  });
  el.panel.setAttribute("aria-labelledby", `tab-${mode}`);
  el.modeDesc.textContent = MODES[mode].description;

  clearError();
  hideResults();
  renderFilters();
  choosePrompt();
}

/* ---------- history ---------- */

function renderHistory(data) {
  clear(el.recentList);
  const sessions = data?.sessions || [];
  el.recentEmpty.hidden = sessions.length > 0;
  el.recentSummary.hidden = sessions.length === 0;

  if (sessions.length) {
    const week = data.last7Days ?? sessions.length;
    const best = data.bestScore != null ? ` Best score: ${data.bestScore}.` : "";
    el.recentSummary.textContent = `${week} ${week === 1 ? "session" : "sessions"} this week.${best}`;
  }

  for (const s of sessions) {
    const li = node("li");
    li.appendChild(node("span", null, s.mode === "repeat" ? "Say it clearly" : "Explain it"));
    li.appendChild(node("strong", null, s.score != null ? String(s.score) : "\u2013"));
    const time = node("time", null, whenLabel(s.at));
    time.dateTime = s.at;
    li.appendChild(time);
    el.recentList.appendChild(li);
  }
}

async function loadHistory() {
  try { renderHistory(await api("/history")); } catch { /* the empty state stays */ }
}

/* ---------- recording ---------- */

function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
    .find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function micErrorMessage(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is blocked. Allow the microphone for this site in your browser's address bar, then press Start recording again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone found. Plug one in or check your device settings, then try again.";
    case "NotReadableError":
      return "Another app is using your microphone. Close it and try again.";
    default:
      return "Could not start the microphone. Check your browser settings and try again.";
  }
}

function startMeter(stream) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    const ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let peak = 0;
    let raf = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / data.length);
      peak = Math.max(peak, rms);
      el.meter.style.width = `${Math.min(100, Math.round(rms * 300))}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();

    return {
      peak: () => peak,
      stop() { cancelAnimationFrame(raf); try { ctx.close?.(); } catch { /* ignore */ } el.meter.style.width = "0%"; },
    };
  } catch {
    return null;
  }
}

function setRecordButton(recording) {
  el.btnRecord.dataset.state = recording ? "recording" : "idle";
  el.btnRecordLabel.textContent = recording ? "Stop and get feedback" : "Start recording";
}

async function startRecording() {
  if (state.recording || state.busy || !state.current) return;
  clearError();
  hideResults();
  stopSpeaking();

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showError("This browser cannot record audio here. Use a recent Chrome, Edge, Firefox or Safari, and open the site over https.");
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    showError(micErrorMessage(err));
    return;
  }

  const mimeType = pickMimeType();
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    showError("Could not start recording in this browser. Try Chrome or Edge.");
    return;
  }

  const mode = MODES[state.mode];
  const rec = {
    recorder, stream, mimeType, chunks: [],
    startedAt: Date.now(),
    maxSeconds: mode.maxSeconds(state.current),
    meter: startMeter(stream),
    timer: null,
    warnedSilence: false,
    promptId: state.current.id,
    modeName: state.mode,
  };
  state.recording = rec;

  recorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
  recorder.onstop = () => finishRecording(rec);
  recorder.start();

  setRecordButton(true);
  setStatus("listening");
  lockControls(true);
  el.timer.textContent = "0:00";
  el.hint.textContent = "Recording. Press the button when you are done.";

  rec.timer = setInterval(() => {
    const elapsed = (Date.now() - rec.startedAt) / 1000;
    el.timer.textContent = formatClock(elapsed);
    if (!rec.warnedSilence && elapsed >= 3 && rec.meter && rec.meter.peak() < 0.01) {
      rec.warnedSilence = true;
      el.hint.textContent = "I cannot hear anything yet. Check that the right microphone is selected.";
    }
    if (elapsed >= rec.maxSeconds) stopRecording();
  }, 250);
}

function stopRecording() {
  const rec = state.recording;
  if (!rec || rec.stopping) return;
  rec.stopping = true;
  clearInterval(rec.timer);
  try { rec.recorder.stop(); } catch { finishRecording(rec); }
}

function releaseRecording(rec) {
  clearInterval(rec.timer);
  rec.meter?.stop();
  rec.stream.getTracks().forEach((t) => t.stop());
  state.recording = null;
  setRecordButton(false);
  el.timer.textContent = "0:00";
  setStatus("idle");
  lockControls(false);
  if (state.current) el.hint.textContent = MODES[state.mode].hint(state.current);
}

async function finishRecording(rec) {
  if (state.recording !== rec) return;
  const seconds = (Date.now() - rec.startedAt) / 1000;
  const type = rec.recorder.mimeType || rec.mimeType || "audio/webm";
  const blob = new Blob(rec.chunks, { type });
  releaseRecording(rec);

  const min = MODES[rec.modeName].minSeconds;
  if (seconds < min) {
    showError(`That was too short. Speak for at least ${min} second${min === 1 ? "" : "s"}.`);
    return;
  }
  if (blob.size < 1500) {
    showError("I did not catch any audio. Check your microphone and try again.");
    return;
  }
  await submit(blob, seconds, rec);
}

async function submit(blob, seconds, rec) {
  state.busy = true;
  el.btnRecord.disabled = true;
  lockControls(true);
  setStatus("thinking");

  try {
    const result = await api(
      `/analyze?mode=${rec.modeName}&promptId=${encodeURIComponent(rec.promptId)}&durationSeconds=${seconds.toFixed(1)}`,
      { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob }
    );
    state.busy = false;
    setStatus("idle");
    renderResult(result);
    loadHistory();
  } catch (err) {
    showError(err.message);
    setStatus("idle");
  } finally {
    state.busy = false;
    el.btnRecord.disabled = !state.current;
    lockControls(false);
  }
}

/* ---------- results ---------- */

function hideResults() {
  el.results.hidden = true;
}

function addFact(label, value, note) {
  const row = node("div", "art-fact");
  row.appendChild(node("dt", null, label));
  const dd = node("dd", null, value);
  if (note) dd.appendChild(node("small", null, note));
  row.appendChild(dd);
  el.facts.appendChild(row);
}

function fillList(list, items) {
  clear(list);
  for (const text of items || []) list.appendChild(node("li", null, text));
}

function renderTranscript(annotated) {
  clear(el.transcript);
  annotated.forEach((token, i) => {
    if (token.gap > 0) el.transcript.appendChild(node("span", "art-gap", `${token.gap}s pause`));
    if (token.filler) el.transcript.appendChild(node("mark", "art-filler", token.w));
    else el.transcript.appendChild(document.createTextNode(token.w));
    if (i < annotated.length - 1) el.transcript.appendChild(document.createTextNode(" "));
  });
}

const HINT_TEXT = {
  dropped_ending: (w) => `You said \u201C${w.heard}\u201D. Finish the word: \u201C${w.word.replace(/[^A-Za-z']/g, "")}\u201D.`,
  extra_ending: (w) => `You added to \u201C${w.word.replace(/[^A-Za-z']/g, "")}\u201D. Stop at the end of the word.`,
  sounded_close: (w) => `\u201C${w.word.replace(/[^A-Za-z']/g, "")}\u201D sounded like \u201C${w.heard}\u201D.`,
  different_word: (w) => `I heard \u201C${w.heard}\u201D where the word was \u201C${w.word.replace(/[^A-Za-z']/g, "")}\u201D.`,
};

function renderSentence(repeat) {
  clear(el.sentence);
  clear(el.wordList);
  repeat.words.forEach((w, i) => {
    const cls = w.status === "missed" ? "art-word--missed" : w.status === "misheard" ? "art-word--misheard" : "";
    el.sentence.appendChild(cls ? node("span", cls, w.word) : document.createTextNode(w.word));
    if (i < repeat.words.length - 1) el.sentence.appendChild(document.createTextNode(" "));

    if (w.status === "missed") {
      el.wordList.appendChild(node("li", null, `I did not hear \u201C${w.word.replace(/[^A-Za-z']/g, "")}\u201D.`));
    } else if (w.status === "misheard") {
      const describe = HINT_TEXT[w.hint] || HINT_TEXT.different_word;
      el.wordList.appendChild(node("li", null, describe(w)));
    }
  });

  const extras = repeat.extra || [];
  el.extra.hidden = extras.length === 0;
  el.extra.textContent = extras.length ? `Extra words I heard: ${extras.join(", ")}.` : "";
}

function renderPace(delivery) {
  if (delivery.wpm == null) {
    el.paceBlock.hidden = true;
    return;
  }
  el.paceBlock.hidden = false;
  const pct = ((clamp(delivery.wpm, 80, 200) - 80) / 120) * 100;
  el.paceMarker.style.left = `${pct}%`;
  el.paceMarker.dataset.label = `${delivery.wpm} wpm`;
  el.paceTrack.setAttribute(
    "aria-label",
    `Your pace was ${delivery.wpm} words per minute. The comfortable range is 130 to 160.`
  );
  const band = delivery.paceBand;
  el.paceNote.textContent = `${delivery.wpm} words per minute. ${band.label}. ${PACE_GUIDANCE[band.code] || ""}`.trim();
}

function renderFacts(result) {
  clear(el.facts);
  const d = result.delivery;

  if (result.mode === "explain") {
    const target = state.current?.targetSeconds;
    addFact("Length", `${Math.round(result.durationSeconds)} seconds`, target ? `Target: about ${target} seconds.` : "");

    if (d.wpm == null) addFact("Pace", "Too short to measure", "Speak for a few more seconds and I can tell you more.");

    const fillerWords = Object.entries(d.fillers.byWord).map(([w, n]) => `${w} \u00D7${n}`).join(", ");
    addFact(
      "Filler sounds",
      d.fillers.total === 0 ? "None" : `${d.fillers.total} (${fillerWords})`,
      d.fillers.total === 0 ? "Clean. Keep that up." : "A short silent pause sounds more confident than \u201Cum\u201D."
    );

    if (d.pauses.measured) {
      addFact(
        "Long pauses",
        d.pauses.count === 0 ? "None" : `${d.pauses.count}, longest ${d.pauses.longest} seconds`,
        "A short pause is fine. Pauses of 1.5 seconds or more can sound like hesitation."
      );
    } else {
      addFact("Long pauses", "Not measured", "I could not get word timings for this recording.");
    }

    const crutch = Object.entries(d.crutchWords || {});
    if (crutch.length) {
      addFact("Habit words", crutch.map(([w, n]) => `${w} \u00D7${n}`).join(", "), "Real words that turn into habits when you repeat them.");
    }
  } else {
    const total = result.repeat.words.length;
    const clearCount = result.repeat.words.filter((w) => w.status === "ok").length;
    addFact("Words clear", `${clearCount} of ${total}`, `${result.repeat.accuracy}% came through clearly.`);
  }

  if (d.clarity) {
    const band = d.clarity.band[0].toUpperCase() + d.clarity.band.slice(1);
    addFact("Clarity", `${band} (${d.clarity.value})`, "How easily the transcriber followed you. It is a guide, not a grade. Background noise can lower it.");
  }
}

function renderResult(result) {
  const coach = result.coach || {};
  el.results.hidden = false;
  el.headline.textContent = coach.headline || "Here is your feedback";
  el.reply.textContent = coach.spokenReply || "";

  const soft = result.ok === false;
  el.explainBlock.hidden = true;
  el.repeatBlock.hidden = true;
  el.paceBlock.hidden = true;
  clear(el.facts);

  if (soft) {
    el.scoreLine.hidden = true;
    el.strengthBlock.hidden = true;
    fillList(el.improveList, coach.improve);
    el.improveBlock.hidden = !(coach.improve || []).length;
    el.followUp.hidden = true;
  } else {
    const overall = result.scores?.overall;
    clear(el.scoreLine);
    el.scoreLine.hidden = overall == null;
    if (overall != null) {
      el.scoreLine.appendChild(node("strong", null, String(overall)));
      el.scoreLine.appendChild(document.createTextNode(" out of 100"));
    }

    if (result.mode === "explain") {
      el.explainBlock.hidden = false;
      renderTranscript(result.annotated || []);
      renderPace(result.delivery);
    } else {
      el.repeatBlock.hidden = false;
      renderSentence(result.repeat);
    }
    renderFacts(result);

    fillList(el.strengthList, coach.strengths);
    fillList(el.improveList, coach.improve);
    el.strengthBlock.hidden = !(coach.strengths || []).length;
    el.improveBlock.hidden = !(coach.improve || []).length;

    el.followUp.hidden = !coach.followUp;
    el.followUp.textContent = coach.followUp ? `Your coach asks: ${coach.followUp}` : "";
  }

  state.lastSpoken = [coach.spokenReply, !soft && coach.followUp].filter(Boolean).join(" ");
  el.btnReplay.hidden = !state.lastSpoken;

  el.headline.tabIndex = -1;
  el.results.scrollIntoView?.({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  el.headline.focus?.({ preventScroll: true });

  speak(state.lastSpoken);
}

/* ---------- wiring ---------- */

function bindEvents() {
  document.querySelectorAll(".art-tab").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      setMode(state.mode === "explain" ? "repeat" : "explain", { focusTab: true });
    });
  });

  el.btnNext.addEventListener("click", () => { clearError(); hideResults(); stopSpeaking(); choosePrompt(); });
  el.btnHear.addEventListener("click", () => { if (state.current) speak(state.current.text, { force: true }); });
  el.btnRecord.addEventListener("click", () => (state.recording ? stopRecording() : startRecording()));

  el.btnAgain.addEventListener("click", () => { hideResults(); stopSpeaking(); el.btnRecord.focus(); });
  el.btnAnother.addEventListener("click", () => { hideResults(); stopSpeaking(); choosePrompt(); el.btnRecord.focus(); });
  el.btnReplay.addEventListener("click", () => speak(state.lastSpoken, { force: true }));

  el.voiceToggle.addEventListener("change", () => {
    state.voiceOn = el.voiceToggle.checked;
    localStorage.setItem(VOICE_KEY, state.voiceOn ? "on" : "off");
    if (!state.voiceOn) stopSpeaking();
  });

  window.addEventListener("pagehide", () => {
    if (state.recording) { clearInterval(state.recording.timer); state.recording.stream.getTracks().forEach((t) => t.stop()); }
    stopSpeaking();
  });
}

function collectElements() {
  const ids = {
    status: "coachStatus", canvas: "coachCanvas", badge: "coachBadge", voiceToggle: "voiceToggle",
    recentList: "recentList", recentEmpty: "recentEmpty", recentSummary: "recentSummary",
    panel: "practiceBody", modeDesc: "modeDesc", filters: "filters",
    promptText: "promptText", promptMeta: "promptMeta", btnHear: "btnHear", btnNext: "btnNext",
    btnRecord: "btnRecord", btnRecordLabel: "btnRecordLabel", timer: "timer", meter: "meterFill",
    hint: "recHint", error: "errorBox",
    results: "results", headline: "resultHeadline", scoreLine: "scoreLine", reply: "coachReply",
    explainBlock: "explainBlock", transcript: "transcript",
    repeatBlock: "repeatBlock", sentence: "sentence", wordList: "wordList", extra: "extraWords",
    paceBlock: "paceBlock", paceTrack: "paceTrack", paceMarker: "paceMarker", paceNote: "paceNote",
    facts: "facts", strengthBlock: "strengthBlock", strengthList: "strengthList",
    improveBlock: "improveBlock", improveList: "improveList", followUp: "followUp",
    btnAgain: "btnAgain", btnAnother: "btnAnother", btnReplay: "btnReplay",
    profileName: "profileName", profileEmail: "profileEmail",
  };
  for (const [key, id] of Object.entries(ids)) el[key] = $(id);
}

async function init() {
  if (!localStorage.getItem("sb-access-token")) { goToLogin(); return; }

  collectElements();
  wireSidebar();
  bindEvents();

  state.voiceOn = localStorage.getItem(VOICE_KEY) !== "off";
  el.voiceToggle.checked = state.voiceOn;
  setStatus("idle");

  loadProfile();
  initAvatar();
  loadHistory();

  try {
    const data = await api("/prompts");
    state.prompts = { explain: data.explain || [], repeat: data.repeat || [] };
    setMode("explain");
  } catch (err) {
    el.promptText.textContent = "Could not load your prompts.";
    showError(err.message || "Could not load your prompts. Reload the page to try again.");
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
