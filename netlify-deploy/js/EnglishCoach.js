/* =========================================================
   ENGLISH COACH (browser side)

   1. Set-up: "Where is your English now?" and "Where do you want to get to?"
   2. A real back-and-forth chat: Sipho speaks first ("How was your day?"),
      you answer out loud, he answers back, and so on.
   3. "Finish": today's level, and exactly how to improve.
   4. Progress: your level day by day, your streak, your goal.

   Everything a person says or types is written with textContent, never
   innerHTML, so nothing can inject markup into the page.
========================================================= */

const API = "/api/english";
const COACH_ID = "articulation-coach";          // same character (and free fallback voice) as the drills page
const VOICE_KEY = "sf-english-voice";
const HANDS_KEY = "sf-english-handsfree";

const LEVEL_CODES = ["A1", "A2", "B1", "B2", "C1", "C2"];
const BAND_START = { A1: 1, A2: 1.5, B1: 2.5, B2: 3.5, C1: 4.5, C2: 5.5 };
const MIN_WORDS = 25;                           // the server needs this much speech to estimate a level
const MAX_RECORD_SECONDS = 90;
const MIN_RECORD_SECONDS = 0.6;
const DAILY_CHOICES = [5, 10, 15, 20];

const STATUS_TEXT = {
  idle: "Your turn.",
  listening: "Listening\u2026",
  thinking: "Sipho is thinking\u2026",
  speaking: "Sipho is speaking\u2026",
};

const CONFIDENCE_TEXT = {
  low: "A rough estimate: a short chat can only show so much. Talk for about 3 minutes for a more reliable result.",
  medium: "A fair estimate, based on this chat.",
  high: "A reliable estimate, based on a good long chat.",
};

const SKILL_LABELS = {
  fluency: "Fluency",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  coherence: "Organising your ideas",
  interaction: "Interacting",
};

const TREND_TEXT = {
  up: "Going up.",
  down: "A little lower than your last few chats. That is normal, so keep going.",
  steady: "Holding steady.",
  new: "Chat a few more times and I will show your trend.",
};

const state = {
  screen: "loading",
  profile: null,
  levels: [],
  interestOptions: [],
  firstName: "",
  minor: false,
  snapshot: { tracked: null, gap: null, streak: { days: 0, practisedToday: false }, todayMinutes: 0, sessionsToday: 0 },
  limits: { sessionsPerDay: 8, maxTurns: 40 },
  setup: { step: 1, current: undefined, target: null, interests: [], custom: [], minutes: 10, editing: false },
  session: null,        // { id, startedAt, startedIso, turns: [{role,text,seconds,fillers}], ended, clock }
  phase: "idle",        // idle | listening | thinking | speaking
  recording: null,
  starting: false,
  voiceOn: true,
  handsFree: false,
  lastCoach: { text: "", spoken: "" },
  pending: null,        // a learner message waiting for a reply (so "Try again" can resend it)
  noSpeechStreak: 0,
  finishing: false,
};

const el = {};
let avatar = null;
let playback = null;    // { audio, url, finish }
let speakToken = 0;

/* ---------- small helpers ---------- */

const $ = (id) => document.getElementById(id);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const wordCount = (text) => (String(text).match(/[\p{L}\p{N}'\u2019-]+/gu) || []).length;

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
const levelCodes = () => (state.levels.length ? state.levels.map((l) => l.level) : LEVEL_CODES);
const levelInfo = (code) => state.levels.find((l) => l.level === code) || { level: code, title: "", can: "", goal: "" };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---------- server calls ---------- */

async function api(path, { method = "GET", json, headers = {}, body } = {}) {
  const options = { method, headers: { ...authHeaders(), ...headers } };
  if (json !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(json);
  } else if (body !== undefined) {
    options.body = body;
  }

  let res;
  try {
    res = await fetch(`${API}${path}`, options);
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
    throw Object.assign(new Error(data?.error || "Something went wrong. Try again."), { status: res.status, data });
  }
  return data;
}

/* ---------- messages ---------- */

function showError(message) {
  el.error.textContent = message;
  el.error.hidden = false;
}

function clearError() {
  el.error.textContent = "";
  el.error.hidden = true;
}

function setPhase(name) {
  state.phase = name;
  el.status.dataset.state = name;
  el.status.textContent = name === "idle" && state.handsFree ? "Your turn. I will listen when Sipho finishes." : STATUS_TEXT[name] || STATUS_TEXT.idle;
  const mic = el.btnMic;
  mic.dataset.state = name === "listening" ? "recording" : "idle";
  el.btnMicLabel.textContent = name === "listening" ? "Tap to send" : name === "thinking" ? "Please wait\u2026" : "Tap to talk";
  mic.disabled = name === "thinking";
  mic.setAttribute("aria-pressed", name === "listening" ? "true" : "false");
}

/* ---------- screens ---------- */

const SCREENS = ["Loading", "Setup", "Talk", "Result", "Progress"];

function tabsLocked() {
  return !!(state.session && !state.session.ended);
}

function showScreen(name, { focus = false } = {}) {
  state.screen = name;
  for (const s of SCREENS) $(`screen${s}`).hidden = s.toLowerCase() !== name;

  const hasProfile = !!state.profile;
  el.tabs.hidden = !(hasProfile && ["talk", "result", "progress"].includes(name));
  const onProgress = name === "progress";
  el.tabTalk.setAttribute("aria-selected", String(!onProgress));
  el.tabProgress.setAttribute("aria-selected", String(onProgress));
  el.tabTalk.tabIndex = onProgress ? -1 : 0;
  el.tabProgress.tabIndex = onProgress ? 0 : -1;

  if (focus) {
    const heading = { setup: el.setupTitle, result: el.resultHeadline, progress: $("progLevelTitle") }[name];
    heading?.focus?.({ preventScroll: false });
  }
}

function wireTabs() {
  const pick = (name) => {
    if (tabsLocked()) {
      showError("Finish this chat, or leave it, before you switch.");
      return;
    }
    clearError();
    if (name === "progress") goProgress();
    else goTalk();
  };
  el.tabTalk.addEventListener("click", () => pick("talk"));
  el.tabProgress.addEventListener("click", () => pick("progress"));
  el.tabs.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.target === el.tabTalk ? "progress" : "talk";
    (next === "progress" ? el.tabProgress : el.tabTalk).focus();
    pick(next);
  });
}

/* ---------- the level ladder (A1 ... C2) ---------- */

function buildLadder({ today = null, progress = 0, goal = null, youLabel = "You", label = "" } = {}) {
  const codes = levelCodes();
  const todayIdx = codes.indexOf(today);
  const goalIdx = codes.indexOf(goal);
  const ol = node("ol", "eng-ladder");
  const parts = ["English levels A1 to C2"];
  if (todayIdx >= 0) parts.push(`${youLabel.toLowerCase()} ${today}`);
  if (goalIdx >= 0) parts.push(`goal ${goal}`);
  ol.setAttribute("aria-label", label || parts.join(", "));

  codes.forEach((code, i) => {
    const li = node("li", "eng-rung");
    li.dataset.level = code;
    if (todayIdx >= 0 && i < todayIdx) li.classList.add("is-passed");
    if (i === todayIdx) li.classList.add("is-today");
    if (i === goalIdx) li.classList.add("is-goal");

    const bar = node("span", "eng-rung-bar");
    const fill = node("span", "eng-rung-fill");
    if (i === todayIdx) fill.style.width = `${Math.round(clamp(progress, 0, 1) * 100)}%`;
    else if (todayIdx >= 0 && i < todayIdx) fill.style.width = "100%";
    bar.append(fill);

    const tags = node("span", "eng-rung-tags");
    if (i === todayIdx) tags.append(node("span", "eng-tag eng-tag-you", youLabel));
    if (i === goalIdx) tags.append(node("span", "eng-tag eng-tag-goal", "Goal"));
    li.append(bar, node("span", "eng-rung-code", code), tags);
    ol.append(li);
  });
  return ol;
}

function placeLadder(container, options) {
  clear(container);
  container.append(buildLadder(options));
}

/* =========================================================
   Set-up
========================================================= */

function defaultTarget(current) {
  const codes = levelCodes();
  if (current === undefined || current === null) return "B2";
  const i = codes.indexOf(current);
  return codes[Math.min(codes.length - 1, i + 1)];
}

function openSetup({ editing = false } = {}) {
  const p = state.profile;
  state.setup = {
    step: 1,
    editing,
    current: p ? p.currentLevel : undefined,
    target: p ? p.targetLevel : null,
    targetChosen: !!p,          // a goal you set yourself is kept; a suggested one follows your level
    interests: p ? [...p.interests] : [],
    custom: p ? p.interests.filter((i) => !state.interestOptions.includes(i)) : [],
    minutes: p ? p.dailyMinutes : 10,
  };
  renderSetup();
  showScreen("setup", { focus: true });
}

function choice({ name, value, checked, code, title, text, onChange, type = "radio" }) {
  const label = node("label", "eng-choice");
  const input = node("input");
  input.type = type;
  input.name = name;
  input.value = value;
  input.checked = !!checked;
  input.addEventListener("change", () => onChange(input));
  const words = node("span", "eng-choice-text");
  words.append(node("strong", null, title));
  if (text) words.append(node("small", null, text));
  label.append(input);
  if (code) label.append(node("span", "eng-choice-code", code));
  label.append(words);
  return label;
}

function setupIsValid() {
  const s = state.setup;
  if (s.step === 1) return s.current !== undefined;
  if (s.step === 2) return !!s.target;
  return true;
}

function updateSetupNav() {
  const s = state.setup;
  el.btnSetupBack.hidden = s.step === 1;
  el.btnSetupNext.textContent = s.step === 4 ? "Save and start chatting" : "Next";
  el.btnSetupNext.disabled = !setupIsValid();
}

function renderSetup() {
  const s = state.setup;
  el.setupStep.textContent = `Step ${s.step} of 4`;
  el.setupError.hidden = true;
  clear(el.setupBody);

  if (s.step === 1) {
    el.setupTitle.textContent = "Where is your English right now?";
    el.setupHelp.textContent = "Pick the one that sounds most like you. A guess is fine. Sipho works out the rest as you chat.";
    const group = node("fieldset", "eng-choices");
    group.append(node("legend", "eng-sr", "Your current English level"));
    for (const code of levelCodes()) {
      const info = levelInfo(code);
      group.append(choice({
        name: "current", value: code, checked: s.current === code, code, title: info.title, text: info.can,
        onChange: () => { s.current = code; updateSetupNav(); },
      }));
    }
    group.append(choice({
      name: "current", value: "unsure", checked: s.current === null, code: "?", title: "I am not sure yet",
      text: "No problem. We will find out in your first chat.",
      onChange: () => { s.current = null; updateSetupNav(); },
    }));
    el.setupBody.append(group);
  }

  if (s.step === 2) {
    el.setupTitle.textContent = "Which level do you want to reach?";
    el.setupHelp.textContent = "Sipho will chat at your level and gently stretch you towards this one.";
    const codes = levelCodes();
    const floor = typeof s.current === "string" ? codes.indexOf(s.current) : 0;
    const allowed = codes.filter((c, i) => i >= Math.max(1, floor));
    if (!allowed.length) allowed.push(codes[codes.length - 1]);
    if (!s.targetChosen || !s.target || !allowed.includes(s.target)) {
      s.target = allowed.includes(defaultTarget(s.current)) ? defaultTarget(s.current) : allowed[0];
      s.targetChosen = false;
    }

    const group = node("fieldset", "eng-choices");
    group.append(node("legend", "eng-sr", "The level you want to reach"));
    for (const code of allowed) {
      const info = levelInfo(code);
      group.append(choice({
        name: "target", value: code, checked: s.target === code, code, title: `${info.title}: ${info.goal || ""}`.replace(/: $/, ""), text: info.can,
        onChange: () => { s.target = code; s.targetChosen = true; updateSetupNav(); },
      }));
    }
    el.setupBody.append(group);
  }

  if (s.step === 3) {
    el.setupTitle.textContent = "What do you like talking about?";
    el.setupHelp.textContent = "Pick up to 6. Sipho will bring these up, so practising feels like a real chat.";
    const group = node("fieldset", "eng-interests");
    group.append(node("legend", "eng-sr", "Things you like talking about"));
    const options = [...state.interestOptions, ...s.custom.filter((c) => !state.interestOptions.includes(c))];
    for (const name of options) {
      const label = choice({
        name: "interest", value: name, type: "checkbox", checked: s.interests.includes(name), title: name,
        onChange: (input) => {
          if (input.checked) s.interests.push(name);
          else s.interests = s.interests.filter((i) => i !== name);
          syncInterestLimits();
        },
      });
      label.classList.add("eng-chip-choice");
      group.append(label);
    }
    el.setupBody.append(group);

    const custom = node("div", "eng-custom");
    const input = node("input");
    input.type = "text";
    input.id = "customInterest";
    input.maxLength = 40;
    input.placeholder = "Something else you enjoy";
    input.setAttribute("aria-label", "Add your own topic");
    const add = node("button", "eng-btn", "Add");
    add.type = "button";
    add.id = "btnAddInterest";
    const doAdd = () => {
      const value = input.value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (!value || s.interests.length >= 6) return;
      if (!s.custom.includes(value) && !state.interestOptions.includes(value)) s.custom.push(value);
      if (!s.interests.includes(value)) s.interests.push(value);
      renderSetup();
    };
    add.addEventListener("click", doAdd);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doAdd(); } });
    custom.append(input, add);
    el.setupBody.append(custom);
    syncInterestLimits();
  }

  if (s.step === 4) {
    el.setupTitle.textContent = "How long do you want to chat each day?";
    el.setupHelp.textContent = "A little every day beats a lot once a week.";
    const group = node("fieldset", "eng-choices eng-choices-row");
    group.append(node("legend", "eng-sr", "Daily practice time"));
    for (const m of DAILY_CHOICES) {
      group.append(choice({
        name: "minutes", value: String(m), checked: s.minutes === m, title: `${m} minutes`,
        onChange: () => { s.minutes = m; renderSummary(); },
      }));
    }
    el.setupBody.append(group);
    const summary = node("ul", "eng-summary-list");
    summary.id = "setupSummary";
    el.setupBody.append(summary);
    renderSummary();
  }
  updateSetupNav();
}

function syncInterestLimits() {
  const full = state.setup.interests.length >= 6;
  for (const input of el.setupBody.querySelectorAll('input[name="interest"]')) input.disabled = full && !input.checked;
  const add = $("btnAddInterest");
  if (add) add.disabled = full;
}

function renderSummary() {
  const s = state.setup;
  const box = $("setupSummary");
  if (!box) return;
  clear(box);
  const rows = [
    ["Your level now", s.current ? `${s.current} (${levelInfo(s.current).title})` : "Not sure yet. We will find out in your first chat."],
    ["Your goal", s.target ? `${s.target}: ${levelInfo(s.target).goal}` : ""],
    ["Topics", s.interests.length ? s.interests.join(", ") : "Anything. Sipho will ask."],
    ["Daily chat", `${s.minutes} minutes`],
  ];
  for (const [k, v] of rows) {
    const li = node("li");
    li.append(node("strong", null, `${k}: `), document.createTextNode(v));
    box.append(li);
  }
}

async function setupNext() {
  const s = state.setup;
  if (!setupIsValid()) return;
  if (s.step < 4) {
    s.step += 1;
    renderSetup();
    el.setupTitle.focus();
    return;
  }
  el.btnSetupNext.disabled = true;
  try {
    await api("/profile", {
      method: "PUT",
      json: { currentLevel: s.current || null, targetLevel: s.target, dailyMinutes: s.minutes, interests: s.interests },
    });
    await loadProfile();
    goTalk();
  } catch (err) {
    el.setupError.textContent = err.message;
    el.setupError.hidden = false;
    el.btnSetupNext.disabled = false;
  }
}

function setupBack() {
  if (state.setup.step > 1) {
    state.setup.step -= 1;
    renderSetup();
    el.setupTitle.focus();
  }
}

/* =========================================================
   The talk screen
========================================================= */

function goTalk() {
  clearError();
  if (tabsLocked()) { showScreen("talk"); return; }
  renderStart();
  el.talkStart.hidden = false;
  el.talkLive.hidden = true;
  showScreen("talk");
}

function renderStart() {
  const { snapshot: snap, profile } = state;
  const first = !snap.tracked && !snap.streak.days && !snap.sessionsToday;
  el.startGreeting.textContent = state.firstName ? `Hi ${state.firstName}` : "Hi there";

  el.startLine.textContent = first
    ? "Ready for your first chat? Sipho will ask how your day was. Just talk. There are no wrong answers."
    : snap.streak.practisedToday
      ? "You have already chatted today. Another round keeps the momentum going."
      : snap.streak.days > 0
        ? `Keep your ${snap.streak.days}-day streak going.`
        : "Ready when you are.";

  clear(el.startChips);
  const chips = [
    snap.streak.days > 0 ? `${snap.streak.days}-day streak` : "Start your streak today",
    `${snap.todayMinutes} of ${profile.dailyMinutes} min today`,
    snap.tracked ? `Your level: ${snap.tracked.level}` : profile.currentLevel ? `Your estimate: ${profile.currentLevel}` : "Level: Sipho will find out",
    `Goal: ${profile.targetLevel}`,
  ];
  for (const c of chips) el.startChips.append(node("span", "eng-chip", c));

  placeLadder(el.talkLadder, {
    today: snap.tracked?.level || profile.currentLevel,
    progress: snap.tracked?.progress || 0,
    goal: profile.targetLevel,
    youLabel: snap.tracked ? "You" : "Your estimate",
  });

  el.startError.hidden = true;
  setVoiceNote();
  el.handsFreeToggle.checked = state.handsFree;
}

function setVoiceNote(premium) {
  if (premium === true) el.voiceNote.textContent = "Voice: natural";
  else if (premium === false) el.voiceNote.textContent = "Voice: standard";
  else el.voiceNote.textContent = "";
}

/* ---------- the conversation log ---------- */

function addLine(role, text, { record = true, seconds = 0, fillers = 0, crisis = false, pending = false } = {}) {
  const line = node("div", `eng-line eng-line-${role}`);
  if (crisis) line.classList.add("eng-line-care");
  if (pending) line.classList.add("is-pending");
  line.append(node("span", "eng-line-who", role === "coach" ? "Sipho" : "You"));
  line.append(node("span", "eng-line-text", text));
  el.log.append(line);
  el.log.scrollTop = el.log.scrollHeight;

  if (record && role === "coach") state.session.turns.push({ role, text });
  if (role === "coach") state.lastCoach = { text, spoken: state.lastCoach.spoken };
  return line;
}

function learnerWords() {
  return (state.session?.turns || []).filter((t) => t.role === "learner").reduce((n, t) => n + wordCount(t.text), 0);
}

function updateClock() {
  const s = state.session;
  if (!s) return;
  const elapsed = (Date.now() - s.startedAt) / 1000;
  el.clock.textContent = formatClock(elapsed);
  const goal = state.profile.dailyMinutes;
  const done = state.snapshot.todayMinutes + elapsed / 60;
  el.goalFill.style.width = `${clamp((done / goal) * 100, 0, 100)}%`;
  el.goalNote.textContent = `${Math.min(Math.floor(done), goal)} of ${goal} min today`;
}

/* ---------- starting a chat ---------- */

async function startSession() {
  if (state.session && !state.session.ended) return;
  el.startError.hidden = true;
  el.btnStart.disabled = true;
  let data;
  try {
    data = await api("/session/start", { method: "POST", json: { hour: new Date().getHours() } });
  } catch (err) {
    el.btnStart.disabled = false;
    if (err.data?.needsProfile) { openSetup(); return; }
    el.startError.textContent = err.message;
    el.startError.hidden = false;
    return;
  }
  el.btnStart.disabled = false;

  state.session = { id: data.sessionId, startedAt: Date.now(), startedIso: data.startedAt, turns: [], ended: false, clock: null };
  state.noSpeechStreak = 0;
  state.pending = null;
  clear(el.log);
  clear(el.ideaList);
  el.ideaBox.hidden = true;
  el.retryBox.hidden = true;
  el.typeBox.hidden = true;
  el.btnType.setAttribute("aria-expanded", "false");
  el.finishNote.textContent = "";
  el.talkStart.hidden = true;
  el.talkLive.hidden = false;
  el.liveHint.textContent = state.handsFree
    ? "Hands-free is on. Talk when Sipho finishes. Tap the mic to send early."
    : "Tap the mic, say your answer, then tap again to send.";
  updateClock();
  state.session.clock = setInterval(updateClock, 1000);
  setPhase("idle");

  addLine("coach", data.opener);
  const outcome = await speakCoach(data.opener, data.opener);
  afterCoachSpoke(outcome);
}

function endSessionUi() {
  const s = state.session;
  if (!s) return;
  clearInterval(s.clock);
  s.ended = true;
  cancelListening();
  stopSpeaking();
  setPhase("idle");
}

function leaveSession() {
  endSessionUi();
  state.session = null;
  clearError();
  goTalk();
}

function afterCoachSpoke(outcome) {
  const s = state.session;
  if (!s || s.ended || outcome === "interrupted") return;
  setPhase("idle");
  if (state.handsFree && !state.pending && !state.finishing) startListening({ auto: true });
}

/* =========================================================
   The coach's voice: natural voice -> free voice -> browser voice
========================================================= */

function stopSpeaking() {
  speakToken += 1;
  if (playback) {
    const p = playback;
    playback = null;
    p.audio.onended = null;
    p.audio.onerror = null;
    try { p.audio.pause(); } catch { /* ignore */ }
    try { URL.revokeObjectURL(p.url); } catch { /* ignore */ }
    p.finish("interrupted");
  }
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  avatar?.detachAudio?.();
}

async function fetchVoice(text) {
  const tries = [
    () => fetch(`${API}/speak`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ text }) }),
    () => fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, personaId: COACH_ID }) }),
  ];
  for (const attempt of tries) {
    try {
      const res = await attempt();
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob && blob.size > 0) {
        const provider = res.headers?.get?.("x-tts-premium");
        return { blob, premium: provider === "true" ? true : provider === "false" ? false : undefined };
      }
    } catch { /* try the next one */ }
  }
  return null;
}

function browserVoice(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") { resolve("skipped"); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-ZA";
    u.rate = 0.95;
    u.onend = u.onerror = () => resolve("ended");
    window.speechSynthesis.speak(u);
  });
}

/** Speaks `spoken` (or `text`). Resolves "ended", "interrupted" or "skipped" when it's over. */
async function speakCoach(text, spoken, { force = false } = {}) {
  const say = spoken || text;
  state.lastCoach = { text: text || say, spoken: say };
  if (!say || (!state.voiceOn && !force)) return "skipped";

  stopSpeaking();
  const token = speakToken;
  setPhase("speaking");

  const voice = await fetchVoice(say);
  if (token !== speakToken) return "interrupted";

  if (!voice) {
    const result = await browserVoice(say);
    if (token === speakToken) setPhase("idle");
    return token === speakToken ? result : "interrupted";
  }
  setVoiceNote(voice.premium);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(voice.blob);
    const audio = new Audio(url);
    const finish = (result) => {
      avatar?.detachAudio?.();
      if (playback && playback.audio === audio) playback = null;
      resolve(result);
    };
    playback = { audio, url, finish };
    avatar?.attachAudio?.(audio);
    audio.onended = () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } finish("ended"); };
    audio.onerror = async () => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      if (playback?.audio === audio) playback = null;
      avatar?.detachAudio?.();
      resolve(await browserVoice(say));
    };
    Promise.resolve(audio.play()).catch(() => audio.onerror());
  });
}

/* =========================================================
   Listening
========================================================= */

function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function micErrorMessage(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is blocked. Allow the microphone for this site in your browser's address bar, then tap the mic again. You can also use Type instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone found. Plug one in, or use Type instead.";
    case "NotReadableError":
      return "Another app is using your microphone. Close it and try again, or use Type instead.";
    default:
      return "Could not start the microphone. Check your browser settings, or use Type instead.";
  }
}

function startMeter(stream, onLevel) {
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
      onLevel?.(rms);
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

async function startListening({ auto = false } = {}) {
  const s = state.session;
  if (!s || s.ended || state.recording || state.starting || state.phase === "thinking" || state.finishing) return;
  clearError();
  stopSpeaking();

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showError("This browser cannot record audio here. Use a recent Chrome, Edge, Firefox or Safari over https, or use Type instead.");
    setHandsFree(false);
    setPhase("idle");
    return;
  }

  state.starting = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    state.starting = false;
    showError(micErrorMessage(err));
    setHandsFree(false);
    setPhase("idle");
    return;
  }
  state.starting = false;
  if (!state.session || state.session.ended) { stream.getTracks().forEach((t) => t.stop()); return; }

  const mimeType = pickMimeType();
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    showError("Could not start recording in this browser. Try Chrome or Edge, or use Type instead.");
    setHandsFree(false);
    setPhase("idle");
    return;
  }

  const vad = auto && window.SFVad ? window.SFVad.createVad() : null;
  const rec = { recorder, stream, mimeType, chunks: [], startedAt: Date.now(), meter: null, timer: null, auto, discarded: false, stopping: false, warned: false, note: "" };
  state.recording = rec;
  rec.meter = startMeter(stream, (rms) => {
    if (!vad || rec.stopping) return;
    const verdict = vad.update(rms, performance.now());
    if (verdict === "stop") stopListening();
    else if (verdict === "give_up") cancelListening("I did not hear you. Tap the mic when you are ready.");
  });

  recorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
  recorder.onstop = () => finishRecording(rec);
  recorder.start();
  setPhase("listening");
  el.liveHint.textContent = auto ? "Listening. I will send it when you stop talking, or tap the mic." : "Recording. Tap the mic when you are done.";

  rec.timer = setInterval(() => {
    const elapsed = (Date.now() - rec.startedAt) / 1000;
    if (!rec.warned && !auto && elapsed >= 3 && rec.meter && rec.meter.peak() < 0.01) {
      rec.warned = true;
      el.liveHint.textContent = "I cannot hear anything yet. Check that the right microphone is selected.";
    }
    if (elapsed >= MAX_RECORD_SECONDS) stopListening();
  }, 250);
}

function stopListening() {
  const rec = state.recording;
  if (!rec || rec.stopping) return;
  rec.stopping = true;
  clearInterval(rec.timer);
  try { rec.recorder.stop(); } catch { finishRecording(rec); }
}

function cancelListening(message = "") {
  const rec = state.recording;
  if (!rec) return;
  rec.discarded = true;
  rec.note = message;
  stopListening();
}

function releaseRecording(rec) {
  clearInterval(rec.timer);
  rec.meter?.stop();
  rec.stream.getTracks().forEach((t) => t.stop());
  if (state.recording === rec) state.recording = null;
  setPhase("idle");
}

async function finishRecording(rec) {
  if (state.recording !== rec) return;
  const seconds = (Date.now() - rec.startedAt) / 1000;
  const type = rec.recorder.mimeType || rec.mimeType || "audio/webm";
  const blob = new Blob(rec.chunks, { type });
  releaseRecording(rec);

  if (rec.discarded) {
    if (rec.note) el.liveHint.textContent = rec.note;
    return;
  }
  if (seconds < MIN_RECORD_SECONDS || blob.size < 1500) {
    el.liveHint.textContent = "That was very short. Tap the mic and try again.";
    return;
  }
  await submitTurn(blob);
}

/* =========================================================
   A turn: you speak -> text -> Sipho replies -> he speaks
========================================================= */

async function submitTurn(blob) {
  setPhase("thinking");
  let heard;
  try {
    heard = await api("/turn/transcribe", { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
  } catch (err) {
    setPhase("idle");
    showError(err.message);
    return;
  }

  if (!heard.ok) {
    state.noSpeechStreak += 1;
    setPhase("idle");
    el.liveHint.textContent = heard.message || "I could not hear anything. Check your microphone and try again.";
    if (state.handsFree && state.noSpeechStreak >= 2) {
      setHandsFree(false);
      el.liveHint.textContent = "I still cannot hear you, so I switched hands-free off. Tap the mic when you are ready.";
    } else if (state.handsFree) {
      setTimeout(() => afterCoachSpoke("ended"), 600);
    }
    return;
  }
  state.noSpeechStreak = 0;
  await sendLearnerText(heard.text, { seconds: heard.metrics?.seconds || 0, fillers: heard.metrics?.fillers || 0 });
}

function historyForServer() {
  return state.session.turns.slice(-12).map(({ role, text }) => ({ role, text }));
}

async function sendLearnerText(text, metrics = {}, { retry = false } = {}) {
  const s = state.session;
  if (!s || s.ended) return;
  const clean = String(text).replace(/\s+/g, " ").trim().slice(0, 600);
  if (!clean) return;

  clearError();
  el.retryBox.hidden = true;
  el.ideaBox.hidden = true;
  let line = retry ? el.log.querySelector(".is-pending") : null;
  if (!line) line = addLine("learner", clean, { record: false, pending: true });
  setPhase("thinking");

  let reply;
  try {
    reply = await api("/turn/reply", { method: "POST", json: { sessionId: s.id, history: historyForServer(), userText: clean } });
  } catch (err) {
    state.pending = { text: clean, metrics };
    setPhase("idle");
    if (err.data?.tooLong) {
      el.retryBox.hidden = true;
      el.finishNote.textContent = "This chat has gone on a long time. Finish it to see your level.";
      el.btnMic.disabled = true;
      line.classList.remove("is-pending");
      state.pending = null;
      return;
    }
    el.retryMsg.textContent = err.message;
    el.retryBox.hidden = false;
    return;
  }

  state.pending = null;
  line.classList.remove("is-pending");
  const care = !!reply.crisis;
  if (!care) s.turns.push({ role: "learner", text: clean, seconds: metrics.seconds || 0, fillers: metrics.fillers || 0 });
  addLine("coach", reply.reply, { record: !care, crisis: care });
  if (care) setHandsFree(false);            // never loop a microphone at someone who just said something hard

  const outcome = await speakCoach(reply.reply, reply.spoken);
  afterCoachSpoke(care ? "interrupted" : outcome);
  if (care) setPhase("idle");
}

async function getIdea() {
  const s = state.session;
  if (!s || state.phase === "thinking") return;
  el.btnIdea.disabled = true;
  try {
    const data = await api("/hint", { method: "POST", json: { history: historyForServer() } });
    clear(el.ideaList);
    for (const idea of data.ideas || []) el.ideaList.append(node("li", null, idea));
    el.ideaBox.hidden = !(data.ideas || []).length;
  } catch (err) {
    showError(err.message);
  } finally {
    el.btnIdea.disabled = false;
  }
}

function toggleType() {
  const open = el.typeBox.hidden;
  el.typeBox.hidden = !open;
  el.btnType.setAttribute("aria-expanded", String(open));
  if (open) el.typeInput.focus();
}

function sendTyped() {
  const text = el.typeInput.value;
  if (!text.trim() || state.phase === "thinking") return;
  el.typeInput.value = "";
  stopSpeaking();
  cancelListening();
  sendLearnerText(text, {});
}

function setHandsFree(on) {
  state.handsFree = on;
  el.handsFreeToggle.checked = on;
  localStorage.setItem(HANDS_KEY, on ? "on" : "off");
}

/* =========================================================
   Finishing: today's level
========================================================= */

async function finishSession() {
  const s = state.session;
  if (!s || s.ended || state.finishing) return;
  clearError();

  const words = learnerWords();
  if (words < MIN_WORDS) {
    el.finishNote.textContent = `Say a little more first. I need about ${MIN_WORDS} words from you to estimate your level, and so far I have heard ${words}.`;
    return;
  }

  state.finishing = true;
  el.btnFinish.disabled = true;
  cancelListening();
  stopSpeaking();
  setPhase("thinking");
  el.status.textContent = "Working out your level\u2026";
  el.finishNote.textContent = "Working out your level. This takes a few seconds.";

  const turns = s.turns.slice(-100).map((t) => ({ role: t.role, text: t.text.slice(0, 600), seconds: t.seconds || 0, fillers: t.fillers || 0 }));
  let result;
  try {
    result = await api("/session/finish", {
      method: "POST",
      json: { sessionId: s.id, startedAt: s.startedIso, durationSeconds: Math.round((Date.now() - s.startedAt) / 1000), turns },
    });
  } catch (err) {
    state.finishing = false;
    el.btnFinish.disabled = false;
    setPhase("idle");
    el.finishNote.textContent = "";
    showError(err.message);
    return;
  }

  state.finishing = false;
  el.btnFinish.disabled = false;
  if (!result.ok) {
    setPhase("idle");
    el.finishNote.textContent = result.message || "That was too short to estimate. Keep chatting a little longer.";
    return;
  }

  endSessionUi();
  state.session = null;
  if (result.profileUpdate && state.profile) Object.assign(state.profile, result.profileUpdate);
  state.snapshot = { ...state.snapshot, ...pickSnapshot(result.progress) };
  renderResult(result);
  showScreen("result", { focus: true });
  speakCoach(result.assessment.summary, result.assessment.summary);
}

function pickSnapshot(progress) {
  return { tracked: progress.tracked, gap: progress.gap, streak: progress.streak, todayMinutes: progress.todayMinutes };
}

function renderResult({ assessment: a, progress, profileUpdate }) {
  el.resultHeadline.textContent = `Your level today: ${a.level}`;
  const pct = Math.round(a.progress * 100);
  const next = LEVEL_CODES[LEVEL_CODES.indexOf(a.level) + 1];
  el.resultSub.textContent = next ? `About ${pct}% of the way through ${a.level}, on the way to ${next}.` : "That is the top of the scale. Beautiful English.";
  el.resultConfidence.textContent = CONFIDENCE_TEXT[a.confidence] || "";
  el.resultConfidence.dataset.confidence = a.confidence;
  el.resultSummary.textContent = a.summary || "";

  el.resultNote.hidden = !profileUpdate;
  if (profileUpdate) {
    el.resultNote.textContent = `We have set your starting level to ${profileUpdate.currentLevel}, and your goal to ${profileUpdate.targetLevel}. You can change this any time in My progress.`;
  }

  placeLadder(el.resultLadder, { today: a.level, progress: a.progress, goal: progress.target, youLabel: "Today" });

  clear(el.skillList);
  for (const [key, label] of Object.entries(SKILL_LABELS)) {
    const level = a.skills[key];
    if (!level) continue;
    const li = node("li", "eng-skill");
    li.append(node("span", "eng-skill-name", label));
    const meter = node("span", "eng-skill-meter");
    meter.setAttribute("role", "img");
    meter.setAttribute("aria-label", `${label}: ${level}`);
    const at = LEVEL_CODES.indexOf(level);
    LEVEL_CODES.forEach((code, i) => meter.append(node("span", i <= at ? "is-on" : "")));
    li.append(meter, node("span", "eng-skill-level", level));
    el.skillList.append(li);
  }

  clear(el.strengthList);
  for (const s of a.strengths || []) el.strengthList.append(node("li", null, s));
  $("strengthBlock").hidden = !(a.strengths || []).length;

  clear(el.improveList);
  for (const item of a.improvements || []) {
    const li = node("li", "eng-fix");
    li.append(node("p", "eng-fix-focus", item.focus));
    const said = node("p", "eng-fix-said");
    said.append(node("span", "eng-fix-label", "You said"), node("q", null, item.youSaid));
    const better = node("p", "eng-fix-better");
    better.append(node("span", "eng-fix-label", "Try"), node("q", null, item.tryInstead));
    li.append(said, better, node("p", "eng-fix-why", item.why));
    el.improveList.append(li);
  }
  if (!(a.improvements || []).length) {
    el.improveList.append(node("li", "eng-fix-none", "Nothing stood out to fix in this chat. Keep going, and try longer answers next time."));
  }

  clear(el.vocabList);
  for (const v of a.vocabulary || []) {
    const li = node("li");
    li.append(node("strong", null, v.word), document.createTextNode(`: ${v.meaning}`));
    if (v.example) li.append(node("em", null, v.example));
    el.vocabList.append(li);
  }
  $("vocabBlock").hidden = !(a.vocabulary || []).length;

  el.nextTime.textContent = a.nextTime ? `Next time: ${a.nextTime}` : "";
  el.nextTime.hidden = !a.nextTime;

  clear(el.resultStats);
  const stats = [
    plural(a.stats.minutes, "minute", "minutes"),
    plural(a.stats.learnerWords, "word", "words"),
    a.stats.wpm ? `${a.stats.wpm} words a minute` : null,
    progress.streak.days > 0 ? `${progress.streak.days}-day streak` : null,
  ].filter(Boolean);
  for (const t of stats) el.resultStats.append(node("li", null, t));
}

/* =========================================================
   Progress
========================================================= */

async function goProgress() {
  clearError();
  showScreen("progress", { focus: true });
  try {
    const data = await api("/progress");
    renderProgress(data);
  } catch (err) {
    showError(err.message);
  }
}

function renderProgress(d) {
  $("progStreak").textContent = String(d.streak.days);
  $("progMinutes").textContent = String(d.totals.minutes);
  $("progSessions").textContent = String(d.totals.sessions);
  const goal = d.profile?.targetLevel || state.profile?.targetLevel;

  if (d.tracked) {
    $("progLevel").textContent = `${d.tracked.level}, about ${Math.round(d.tracked.progress * 100)}% through`;
    $("progLevelSub").textContent = `${TREND_TEXT[d.tracked.trend] || ""} Based on your last ${plural(d.tracked.basedOn, "chat", "chats")}.`;
    placeLadder($("progLadder"), { today: d.tracked.level, progress: d.tracked.progress, goal, youLabel: "You" });
  } else {
    $("progLevel").textContent = "Not measured yet";
    $("progLevelSub").textContent = "Finish your first chat and your level appears here.";
    placeLadder($("progLadder"), { today: d.profile?.currentLevel || null, goal, youLabel: "Your estimate" });
  }

  const gap = $("progGap");
  if (d.gap && d.gap.reached) gap.textContent = `You have reached ${d.gap.target}. Set a higher goal to keep growing.`;
  else if (d.gap) gap.textContent = `${d.gap.target} is your goal. Keep chatting, and your level will keep rising towards it.`;
  else gap.textContent = "";

  renderChart(d.days || [], goal);

  const list = $("recentList");
  clear(list);
  for (const s of d.recent || []) {
    const li = node("li", "eng-recent-item");
    const top = node("p", "eng-recent-top");
    top.append(node("strong", null, whenLabel(s.at)), node("span", "eng-badge", `Level ${s.level}`), node("span", "eng-fine", `${plural(s.minutes, "min", "min")}, ${s.confidence} confidence`));
    li.append(top);
    if (s.focus.length) li.append(node("p", "eng-fine", `Worked on: ${s.focus.join(", ")}`));
    if (s.vocabulary.length) li.append(node("p", "eng-fine", `New words: ${s.vocabulary.join(", ")}`));
    if (s.topics.length) li.append(node("p", "eng-fine", `Talked about: ${s.topics.join(", ")}`));
    list.append(li);
  }
  if (!(d.recent || []).length) list.append(node("li", "eng-fine", "No chats yet. Your first one appears here."));
}

function svgEl(name, attrs = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function renderChart(days, goal) {
  const box = $("progChart");
  clear(box);
  $("progEmpty").hidden = days.length >= 2;
  if (!days.length) return;

  const W = 640, H = 220, L = 44, R = 18, T = 14, B = 30;
  const scores = days.map((d) => d.score);
  let lo = Math.max(1, Math.floor(Math.min(...scores) - 0.5));
  let hi = Math.min(6, Math.ceil(Math.max(...scores) + 0.5));
  if (goal && BAND_START[goal] != null) hi = Math.max(hi, Math.min(6, Math.ceil(BAND_START[goal] + 0.3)));
  if (hi - lo < 2) { hi = Math.min(6, lo + 2); lo = Math.max(1, hi - 2); }

  const x = (i) => (days.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (days.length - 1));
  const y = (s) => T + ((hi - s) / (hi - lo)) * (H - T - B);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "eng-chart-svg", role: "img", "aria-label": `Your level by day. Latest: ${days[days.length - 1].level}.` });
  for (const code of LEVEL_CODES) {
    const s = BAND_START[code];
    if (s < lo || s > hi) continue;
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: y(s), y2: y(s), class: "eng-grid" }));
    const t = svgEl("text", { x: L - 8, y: y(s) + 4, class: "eng-axis", "text-anchor": "end" });
    t.textContent = code;
    svg.append(t);
  }
  if (goal && BAND_START[goal] >= lo && BAND_START[goal] <= hi) {
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: y(BAND_START[goal]), y2: y(BAND_START[goal]), class: "eng-goal-line" }));
    const t = svgEl("text", { x: W - R, y: y(BAND_START[goal]) - 5, class: "eng-goal-text", "text-anchor": "end" });
    t.textContent = `Goal ${goal}`;
    svg.append(t);
  }
  if (days.length > 1) svg.append(svgEl("polyline", { points: days.map((d, i) => `${x(i)},${y(d.score)}`).join(" "), class: "eng-line-path" }));
  days.forEach((d, i) => {
    const dot = svgEl("circle", { cx: x(i), cy: y(d.score), r: 5, class: "eng-dot" });
    const title = svgEl("title");
    title.textContent = `${d.date}: ${d.level}`;
    dot.append(title);
    svg.append(dot);
  });
  for (const i of days.length > 1 ? [0, days.length - 1] : [0]) {
    const t = svgEl("text", { x: x(i), y: H - 8, class: "eng-axis", "text-anchor": i === 0 && days.length > 1 ? "start" : days.length === 1 ? "middle" : "end" });
    t.textContent = days[i].date.slice(5);
    svg.append(t);
  }
  box.append(svg);

  const table = node("table", "eng-sr");
  table.append(node("caption", null, "Your level by day"));
  for (const d of days) {
    const tr = node("tr");
    tr.append(node("th", null, d.date), node("td", null, `${d.level} (${d.score})`));
    table.append(tr);
  }
  box.append(table);
}

async function deleteData() {
  el.btnDeleteYes.disabled = true;
  try {
    await api("/data", { method: "DELETE" });
    state.profile = null;
    state.snapshot = { tracked: null, gap: null, streak: { days: 0, practisedToday: false }, todayMinutes: 0, sessionsToday: 0 };
    $("deleteBox").hidden = true;
    await loadProfile();
    openSetup();
    showError("Your English practice data has been deleted.");
  } catch (err) {
    showError(err.message);
  } finally {
    el.btnDeleteYes.disabled = false;
  }
}

/* =========================================================
   Page start-up
========================================================= */

async function loadProfile() {
  const d = await api("/profile");
  state.profile = d.profile;
  state.levels = d.levels || [];
  state.interestOptions = d.interestOptions || [];
  state.firstName = d.firstName || "";
  state.minor = !!d.minor;
  state.snapshot = { tracked: d.tracked, gap: d.gap, streak: d.streak, todayMinutes: d.todayMinutes, sessionsToday: d.sessionsToday };
  state.limits = d.limits || state.limits;
  return d;
}

async function boot() {
  el.loadError.hidden = true;
  el.loadingText.hidden = false;
  showScreen("loading");
  try {
    await loadProfile();
  } catch (err) {
    el.loadingText.hidden = true;
    el.loadErrorText.textContent = err.message;
    el.loadError.hidden = false;
    return;
  }
  if (!state.profile) openSetup();
  else goTalk();
}

function wireSidebar() {
  const menuBtn = $("menuBtn");
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!menuBtn || !sidebar) return;
  const open = () => { sidebar.classList.add("open"); overlay?.classList.add("show"); menuBtn.setAttribute("aria-expanded", "true"); };
  const close = () => { sidebar.classList.remove("open"); overlay?.classList.remove("show"); menuBtn.setAttribute("aria-expanded", "false"); };
  menuBtn.addEventListener("click", () => (sidebar.classList.contains("open") ? close() : open()));
  overlay?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

async function loadMe() {
  try {
    const res = await fetch("/api/auth/me", { headers: authHeaders() });
    if (!res.ok) return;
    const me = await res.json();
    el.profileName.textContent = me.firstName || me.email || "";
    el.profileEmail.textContent = me.email || "";
  } catch { /* the page works without it */ }
}

async function initAvatar() {
  try {
    // The real file name is "Avatarengine.js" (that exact spelling is what Linux hosting needs).
    const mod = await import("./Avatarengine.js");
    avatar = new mod.AvatarEngine(el.canvas, COACH_ID);
    avatar.start();
  } catch (err) {
    console.warn("Coach avatar unavailable:", err?.message);
    el.canvas.hidden = true;
    el.badge.hidden = false;
  }
}

function collectElements() {
  const ids = {
    tabs: "engTabs", tabTalk: "tab-talk", tabProgress: "tab-progress", error: "errorBox",
    loadingText: "loadingText", loadError: "loadError", loadErrorText: "loadErrorText", btnRetryLoad: "btnRetryLoad",
    setupStep: "setupStep", setupTitle: "setupTitle", setupHelp: "setupHelp", setupBody: "setupBody", setupError: "setupError",
    btnSetupBack: "btnSetupBack", btnSetupNext: "btnSetupNext",
    canvas: "coachCanvas", badge: "coachBadge", status: "coachStatus", voiceToggle: "voiceToggle", handsFreeToggle: "handsFreeToggle", voiceNote: "voiceNote",
    talkStart: "talkStart", startGreeting: "startGreeting", startLine: "startLine", startChips: "startChips", talkLadder: "talkLadder", btnStart: "btnStart", startError: "startError",
    talkLive: "talkLive", clock: "sessionClock", goalNote: "goalNote", goalFill: "goalFill", log: "convoLog",
    retryBox: "retryBox", retryMsg: "retryMsg", btnRetry: "btnRetry", ideaBox: "ideaBox", ideaList: "ideaList",
    btnMic: "btnMic", btnMicLabel: "btnMicLabel", meter: "meterFill", liveHint: "liveHint",
    typeBox: "typeBox", typeInput: "typeInput", btnSend: "btnSend", btnIdea: "btnIdea", btnType: "btnType", btnReplay: "btnReplay",
    btnFinish: "btnFinish", btnLeave: "btnLeave", finishNote: "finishNote",
    resultHeadline: "resultHeadline", resultSub: "resultSub", resultConfidence: "resultConfidence", resultLadder: "resultLadder", resultSummary: "resultSummary", resultNote: "resultNote",
    skillList: "skillList", strengthList: "strengthList", improveList: "improveList", vocabList: "vocabList", nextTime: "nextTime", resultStats: "resultStats",
    btnChatAgain: "btnChatAgain", btnSeeProgress: "btnSeeProgress",
    btnChangeGoals: "btnChangeGoals", btnDeleteData: "btnDeleteData", btnDeleteYes: "btnDeleteYes", btnDeleteNo: "btnDeleteNo",
    profileName: "profileName", profileEmail: "profileEmail",
  };
  for (const [key, id] of Object.entries(ids)) el[key] = $(id);
}

function bindEvents() {
  wireTabs();
  el.btnRetryLoad.addEventListener("click", boot);
  el.btnSetupNext.addEventListener("click", setupNext);
  el.btnSetupBack.addEventListener("click", setupBack);
  el.btnStart.addEventListener("click", startSession);

  el.btnMic.addEventListener("click", () => {
    if (state.phase === "listening") { stopListening(); return; }
    if (state.phase === "thinking") return;
    startListening({ auto: false });           // also works while Sipho is speaking: talking over him stops him
  });
  el.btnRetry.addEventListener("click", () => { if (state.pending) sendLearnerText(state.pending.text, state.pending.metrics, { retry: true }); });
  el.btnIdea.addEventListener("click", getIdea);
  el.btnType.addEventListener("click", toggleType);
  el.btnSend.addEventListener("click", sendTyped);
  el.typeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendTyped(); } });
  el.btnReplay.addEventListener("click", () => {
    if (!state.lastCoach.text) return;
    cancelListening();
    speakCoach(state.lastCoach.text, state.lastCoach.spoken, { force: true }).then((o) => { if (o !== "interrupted") setPhase("idle"); });
  });
  el.btnFinish.addEventListener("click", finishSession);
  el.btnLeave.addEventListener("click", leaveSession);

  el.voiceToggle.addEventListener("change", () => {
    state.voiceOn = el.voiceToggle.checked;
    localStorage.setItem(VOICE_KEY, state.voiceOn ? "on" : "off");
    if (!state.voiceOn) stopSpeaking();
  });
  el.handsFreeToggle.addEventListener("change", () => {
    setHandsFree(el.handsFreeToggle.checked);
    if (state.session && !state.session.ended) setPhase(state.phase);
    if (state.handsFree && state.session && !state.session.ended && state.phase === "idle") startListening({ auto: true });
  });

  el.btnChatAgain.addEventListener("click", () => { stopSpeaking(); clearError(); goTalk(); });
  el.btnSeeProgress.addEventListener("click", () => { stopSpeaking(); goProgress(); });
  el.btnChangeGoals.addEventListener("click", () => openSetup({ editing: true }));
  el.btnDeleteData.addEventListener("click", () => { $("deleteBox").hidden = false; el.btnDeleteNo.focus(); });
  el.btnDeleteNo.addEventListener("click", () => { $("deleteBox").hidden = true; el.btnDeleteData.focus(); });
  el.btnDeleteYes.addEventListener("click", deleteData);

  window.addEventListener("pagehide", () => { stopSpeaking(); cancelListening(); });
}

async function init() {
  if (!localStorage.getItem("sb-access-token")) { goToLogin(); return; }

  collectElements();
  wireSidebar();
  bindEvents();

  state.voiceOn = localStorage.getItem(VOICE_KEY) !== "off";
  state.handsFree = localStorage.getItem(HANDS_KEY) === "on";
  el.voiceToggle.checked = state.voiceOn;
  el.handsFreeToggle.checked = state.handsFree;
  setPhase("idle");

  loadMe();
  initAvatar();
  await boot();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();