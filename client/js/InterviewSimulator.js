/**
 * InterviewSimulator.js  (upgraded + pause/resume)
 * Integrates:
 *  - AvatarEngine   : canvas-based talking avatar with lipsync + eye contact
 *  - BehaviorAnalyzer: webcam face analysis (eye contact, head tilt, presence)
 *  - ReportGenerator : detailed HTML + PDF report
 *  - Pause/resume    : interview freezes when the user leaves the page and
 *                      offers a resume screen when they come back
 */

import { AvatarEngine }                        from "./AvatarEngine.js";
import { BehaviorAnalyzer, analyzeFillerWords } from "./BehaviorAnalyzer.js";
import { ReportGenerator }                      from "./ReportGenerator.js";

document.addEventListener("DOMContentLoaded", () => {

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const setupPanel        = document.getElementById("setupPanel");
  const startBtn          = document.getElementById("startBtn");
  const resetBtn          = document.getElementById("resetBtn");
  const interviewUI       = document.getElementById("interviewUI");
  const feedbackUI        = document.getElementById("feedbackUI");
  const recordBtn         = document.getElementById("recordBtn");
  const stopBtn           = document.getElementById("stopBtn");
  const transcript        = document.getElementById("transcript");
  const timerEl           = document.getElementById("timer");
  const previewTypeText   = document.getElementById("previewTypeText");
  const previewRoleText   = document.getElementById("previewRoleText");
  const previewPersona    = document.getElementById("previewPersonaText");
  const currentQuestionEl = document.getElementById("currentQuestion");
  const submitBtn         = document.getElementById("submitBtn");
  const skipBtn           = document.getElementById("skipBtn");
  const practiceAgainBtn  = document.getElementById("practiceAgainBtn");
  const interviewerName   = document.getElementById("interviewerName");
  const interviewerTitle  = document.getElementById("interviewerTitle");
  const aiLabel           = document.getElementById("aiLabel");

  // ── Avatar canvas elements (added in HTML upgrade) ─────────────────────────
  const avatarCanvas      = document.getElementById("avatarCanvas");     // interviewer
  const webcamVideo       = document.getElementById("webcamVideo");       // candidate
  const webcamCanvas      = document.getElementById("webcamOverlay");     // face overlay
  const webcamToggleBtn   = document.getElementById("webcamToggleBtn");
  const reportContainer   = document.getElementById("reportContainer");

  // ── Duration + question-count + quant/diagram elements ────────────────────
  const durationSlider       = document.getElementById("durationSlider");
  const durationValue        = document.getElementById("durationValue");
  const previewDurationText  = document.getElementById("previewDurationText");
  const questionCountInput   = document.getElementById("questionCountInput");
  const questionCountDecrement = document.getElementById("questionCountDecrement");
  const questionCountIncrement = document.getElementById("questionCountIncrement");
  const questionCountValue   = document.getElementById("questionCountValue");
  const previewQuestionCountText = document.getElementById("previewQuestionCountText");
  const questionTimeBadge    = document.getElementById("questionTimeBadge");
  const diagramBox           = document.getElementById("diagramBox");
  const diagramCopyBtn       = document.getElementById("diagramCopyBtn");
  const webcamWrap           = document.getElementById("webcamWrap");
  const diagramContent       = document.getElementById("diagramContent");
  const finalAnswerWrap      = document.getElementById("finalAnswerWrap");
  const finalAnswerInput     = document.getElementById("finalAnswerInput");

  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");

  /* ================= SIDEBAR ================= */

  function openSidebar() {
    sidebar.classList.add("open");
    overlay?.classList.add("visible");
    menuBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay?.classList.remove("visible");
    menuBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
  }

  if (menuBtn && sidebar) {

    menuBtn.addEventListener("click", () => {
      sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });

    overlay?.addEventListener("click", closeSidebar);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) {
        closeSidebar();
      }
    });

    // close the drawer when a nav link is tapped on mobile
    sidebar.querySelectorAll(".nav-item").forEach(link => {
      link.addEventListener("click", () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });

    // if the viewport grows back to desktop, reset state
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) closeSidebar();
    });

  }

  // ── State ──────────────────────────────────────────────────────────────────
  let currentType      = "hr";
  let currentRole      = "any";
  let session_id       = null;
  let questions        = [];
  let answers          = [];
  let currentQIndex    = 0;
  let interviewMinutes     = 15;
  let totalDurationSeconds = interviewMinutes * 60;
  let timeLeft              = totalDurationSeconds;
  let targetQuestionCount  = null; // null = no limit (time-based only)
  let timerInterval    = null;
  let recognition      = null;
  let isRecording      = false;
  let finalTranscript  = "";
  let currentAudio     = null;
  let isSpeaking       = false;
  let webcamActive     = false;
  let fetchingNextQuestion = false; // guards against duplicate top-up calls
  let questionToken    = 0;     // invalidates auto-record callbacks from old questions
  let endTime          = null;  // wall-clock deadline, so the timer survives tab switches
  let isEnding         = false; // stops endInterview from running twice

  // Pause / resume state
  const PAUSE_KEY        = "skillforge_paused_interview";
  const PAUSE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // discard saved sessions after 24h
  let isPaused      = false;
  let pausedDraft   = { transcript: "", finalAnswer: "" };
  let pausedOverlay = null;

  let currentPersona = {
    id:    "senior-engineer",
    name:  "Alex Chen",
    title: "Senior Engineer @ FAANG",
    style: "Direct, technical, expects precision.",
    icon:  "fa-solid fa-laptop-code",
  };

  // ── Engine instances ───────────────────────────────────────────────────────
  let avatarEngine    = avatarCanvas ? new AvatarEngine(avatarCanvas, currentPersona.id) : null;
  let behaviorAnalyzer= null;
  let reportGenerator = null;
  let sessionAnswers  = [];   // richer than `answers` — holds score + feedback

  // Start avatar idle loop immediately
  if (avatarEngine) avatarEngine.start();

  // ── TTS ────────────────────────────────────────────────────────────────────

  async function speakText(text, onEndCallback = null) {
    if (isSpeaking) return;
    isSpeaking = true;
    stopAudio();

    try {
      const res = await fetch("/api/tts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text, personaId: currentPersona.id }),
      });

      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const audioBlob = await res.blob();
      if (!audioBlob || audioBlob.size === 0) throw new Error("Empty audio blob");

      const audioUrl  = URL.createObjectURL(audioBlob);
      currentAudio    = new Audio(audioUrl);

      // Attach to avatar lipsync
      if (avatarEngine) avatarEngine.attachAudio(currentAudio);

      currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (avatarEngine) avatarEngine.detachAudio();
        currentAudio = null;
        isSpeaking   = false;
        if (onEndCallback) onEndCallback();
      };

      currentAudio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        if (avatarEngine) avatarEngine.detachAudio();
        currentAudio = null;
        isSpeaking   = false;
        fallbackSpeak(text, onEndCallback);
      };

      await currentAudio.play();
    } catch (err) {
      console.warn("TTS failed, using browser voice:", err.message);
      isSpeaking = false;
      fallbackSpeak(text, onEndCallback);
    }
  }

  // Browsers load their voice list asynchronously, so warm it up early.
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", () => {
      window.speechSynthesis.getVoices();
    });
  }

  function pickBestBrowserVoice() {
    const english = window.speechSynthesis.getVoices()
      .filter(v => v.lang && v.lang.toLowerCase().startsWith("en"));
    return (
      english.find(v => /natural/i.test(v.name)) ||
      english.find(v => /online/i.test(v.name)) ||
      english.find(v => /google/i.test(v.name)) ||
      english.find(v => v.lang === "en-ZA") ||
      english[0] || null
    );
  }

  function fallbackSpeak(text, onEndCallback = null) {
    if (!window.speechSynthesis) { if (onEndCallback) onEndCallback(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const best = pickBestBrowserVoice();
    if (best) { u.voice = best; u.lang = best.lang; }
    u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
    u.onend   = () => { isSpeaking = false; if (onEndCallback) onEndCallback(); };
    u.onerror = () => { isSpeaking = false; if (onEndCallback) onEndCallback(); };
    window.speechSynthesis.speak(u);
  }

  function stopAudio() {
    isSpeaking = false;
    if (avatarEngine) avatarEngine.detachAudio();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  // ── Interview type buttons ─────────────────────────────────────────────────
  document.querySelectorAll(".interview-type").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".interview-type").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      const labelMap = { hr: "Behavioral", technical: "Technical", consulting: "Consulting & Case" };
      previewTypeText.textContent = labelMap[currentType] || btn.querySelector("span").textContent;
    });
  });

  // ── Duration slider (5-30 min) ─────────────────────────────────────────
  function updateDurationDisplay() {
    durationValue.textContent = `${interviewMinutes} min`;
    if (previewDurationText) previewDurationText.textContent = `${interviewMinutes} minutes`;
  }

  durationSlider?.addEventListener("input", () => {
    interviewMinutes = Number(durationSlider.value);
    updateDurationDisplay();
  });

  updateDurationDisplay();

  // ── Number of questions (min 5, no upper limit) ──────────────────────────
  const MIN_TARGET_QUESTIONS = 5;

  function updateQuestionCountDisplay() {
    const label = targetQuestionCount ? `${targetQuestionCount} questions` : "No limit";
    if (questionCountValue) questionCountValue.textContent = label;
    if (previewQuestionCountText) previewQuestionCountText.textContent = label;
  }

  questionCountInput?.addEventListener("input", () => {
    const raw = questionCountInput.value.trim();
    targetQuestionCount = raw === "" ? null : Math.max(MIN_TARGET_QUESTIONS, Math.round(Number(raw)) || MIN_TARGET_QUESTIONS);
    updateQuestionCountDisplay();
  });

  // Snap back up to the minimum if the candidate types something below it
  // and clicks away, without fighting them while they're still typing.
  questionCountInput?.addEventListener("blur", () => {
    if (questionCountInput.value.trim() === "") return;
    const n = Number(questionCountInput.value);
    if (Number.isFinite(n) && n < MIN_TARGET_QUESTIONS) {
      questionCountInput.value = MIN_TARGET_QUESTIONS;
      targetQuestionCount = MIN_TARGET_QUESTIONS;
      updateQuestionCountDisplay();
    }
  });

  // +/- stepper buttons — just move the number input and let its own
  // "input" handler above do the actual state update, so there's exactly
  // one place that owns the parsing logic.
  questionCountDecrement?.addEventListener("click", () => {
    const current = Number(questionCountInput.value) || MIN_TARGET_QUESTIONS;
    questionCountInput.value = Math.max(MIN_TARGET_QUESTIONS, current - 1);
    questionCountInput.dispatchEvent(new Event("input"));
  });

  questionCountIncrement?.addEventListener("click", () => {
    const current = Number(questionCountInput.value) || MIN_TARGET_QUESTIONS;
    questionCountInput.value = Math.max(MIN_TARGET_QUESTIONS, current + 1);
    questionCountInput.dispatchEvent(new Event("input"));
  });

  updateQuestionCountDisplay();

  // Copy the given-information/diagram block to the clipboard.
  diagramCopyBtn?.addEventListener("click", async () => {
    const text = diagramContent?.textContent || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const original = diagramCopyBtn.innerHTML;
      diagramCopyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => { diagramCopyBtn.innerHTML = original; }, 1200);
    } catch (err) {
      console.warn("Could not copy diagram text:", err.message);
    }
  });

  // ── Role search + custom entry ───────────────────────────────────────────
  const roleSearchInput  = document.getElementById("roleSearchInput");
  const roleSuggestions  = document.getElementById("roleSuggestions");
  const roleSelectedChip = document.getElementById("roleSelectedChip");
  const roleSelectedText = document.getElementById("roleSelectedText");
  const roleClearBtn     = document.getElementById("roleClearBtn");

  let roleSearchDebounce = null;

  function selectRole(title) {
    currentRole = title;
    previewRoleText.textContent = title;
    if (roleSelectedText) roleSelectedText.textContent = title;
    roleSelectedChip?.classList.remove("hidden");
    if (roleSearchInput) roleSearchInput.value = "";
    hideSuggestions();
  }

  function clearRole() {
    currentRole = "any";
    previewRoleText.textContent = "Any";
    roleSelectedChip?.classList.add("hidden");
  }

  function hideSuggestions() {
    roleSuggestions?.classList.add("hidden");
    if (roleSuggestions) roleSuggestions.innerHTML = "";
  }

  function renderSuggestions(results, query) {
    if (!roleSuggestions) return;
    roleSuggestions.innerHTML = "";

    // Use mousedown + preventDefault (not click) so the search input never
    // actually loses focus when a suggestion is picked. Previously this
    // used "click", but clicking a non-focusable element still blurs
    // whatever input currently has focus on mousedown — which fired our
    // hide-on-blur handler and deleted the suggestion from the DOM before
    // its own click event could land, making it look like it "just
    // disappeared" instead of being selectable.
    results.forEach((title) => {
      const item = document.createElement("div");
      item.className = "role-suggestion-item";
      item.textContent = title;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectRole(title);
      });
      roleSuggestions.appendChild(item);
    });

    if (query) {
      const custom = document.createElement("div");
      custom.className = "role-suggestion-item role-suggestion-custom";
      custom.textContent = `Use "${query}" as my role`;
      custom.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectRole(query);
      });
      roleSuggestions.appendChild(custom);
    }

    roleSuggestions.classList.toggle("hidden", roleSuggestions.children.length === 0);
  }

  roleSearchInput?.addEventListener("input", () => {
    const query = roleSearchInput.value.trim();
    clearTimeout(roleSearchDebounce);

    roleSearchDebounce = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/jobs/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderSuggestions(data.results || [], query);
      } catch (err) {
        console.warn("Role search failed:", err.message);
        renderSuggestions([], query);
      }
    }, 200);
  });

  roleSearchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && roleSearchInput.value.trim()) {
      e.preventDefault();
      selectRole(roleSearchInput.value.trim());
    }
  });

  roleSearchInput?.addEventListener("blur", () => {
    setTimeout(hideSuggestions, 150); // allow click on a suggestion to register first
  });

  roleClearBtn?.addEventListener("click", clearRole);

  // ── Persona cards ──────────────────────────────────────────────────────────
  document.querySelectorAll(".persona-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".persona-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      currentPersona = {
        id:    card.dataset.persona,
        name:  card.dataset.name,
        title: card.dataset.title,
        style: card.dataset.style,
        icon:  card.dataset.icon,
      };
      document.getElementById("personaPreviewName").textContent  = currentPersona.name;
      document.getElementById("personaPreviewTitle").textContent = currentPersona.title;
      document.getElementById("personaPreviewStyle").textContent = currentPersona.style;
      const previewIconEl = document.getElementById("personaPreviewIcon");
      if (previewIconEl) previewIconEl.className = currentPersona.icon;
      previewPersona.textContent = currentPersona.name;

      // Switch avatar persona
      if (avatarEngine) avatarEngine.switchPersona(currentPersona.id);
    });
  });

  // ── Reset ──────────────────────────────────────────────────────────────────
  resetBtn?.addEventListener("click", () => {
    document.querySelectorAll(".interview-type")[0].click();
    clearRole();
    interviewMinutes = 15;
    if (durationSlider) durationSlider.value = 15;
    updateDurationDisplay();
    targetQuestionCount = null;
    if (questionCountInput) questionCountInput.value = "";
    updateQuestionCountDisplay();
  });

  // ── Webcam toggle ──────────────────────────────────────────────────────────
  webcamToggleBtn?.addEventListener("click", async () => {
    if (webcamActive) {
      behaviorAnalyzer?.stop();
      behaviorAnalyzer = null;
      webcamActive     = false;
      webcamVideo.srcObject = null;
      webcamToggleBtn.innerHTML = '<i class="fa-solid fa-video"></i> Enable Webcam Analysis';
      webcamToggleBtn.classList.remove("active");
      webcamWrap?.classList.remove("is-live");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        webcamVideo.srcObject = stream;
        behaviorAnalyzer      = new BehaviorAnalyzer(webcamVideo, webcamCanvas);
        await behaviorAnalyzer.start();
        webcamActive          = true;
        webcamToggleBtn.innerHTML = '<i class="fa-solid fa-video"></i> Webcam Active';
        webcamToggleBtn.classList.add("active");
        webcamWrap?.classList.add("is-live");
      } catch (e) {
        alert("Could not access webcam: " + e.message);
      }
    }
  });

  // ── Voice recording (Web Speech API) ──────────────────────────────────────
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startRecording({ auto = false } = {}) {
    if (!SpeechRecognition) {
      if (!auto) alert("Speech recognition not supported. Please type your answer.");
      return;
    }
    if (isRecording) return;

    stopAudio();
    // Keep anything already typed instead of wiping it
    finalTranscript = transcript.value.trim() ? transcript.value.trim() + " " : "";

    recognition = new SpeechRecognition();
    recognition.lang           = "en-ZA";
    recognition.continuous     = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t + " ";
        else interim = t;
      }
      transcript.value = finalTranscript + interim;
    };

    recognition.onerror = (e) => {
      console.warn("Speech error:", e.error);
      // Silence and brief interruptions are normal while someone thinks.
      // Let onend restart it instead of switching the mic off.
      if (e.error === "no-speech" || e.error === "aborted") return;
      stopRecording();
    };

    recognition.onend = () => {
      if (!isRecording || !recognition) return;
      try { recognition.start(); }
      catch (err) { console.warn("Could not restart recognition:", err.message); }
    };

    try {
      recognition.start();
    } catch (err) {
      console.warn("Could not start recognition:", err.message);
      recognition = null;
      return;
    }

    isRecording = true;
    recordBtn.classList.add("recording");
    recordBtn.innerHTML = '<i class="fa-solid fa-circle"></i><span>Recording…</span>';
    stopBtn.classList.remove("hidden");
  }

  function stopRecording() {
    isRecording = false;
    if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
    recordBtn.classList.remove("recording");
    recordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Record</span>';
    stopBtn.classList.add("hidden");
  }

  recordBtn?.addEventListener("click", () => { if (!isRecording) startRecording(); });
  stopBtn?.addEventListener("click",   () => { if (isRecording)  stopRecording();  });

  // ── Start Interview ────────────────────────────────────────────────────────
  startBtn.addEventListener("click", async () => {
    startBtn.disabled  = true;
    startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Starting…';

    // The server derives the authenticated user from this Bearer token
    // (via requireAuth on /api/interview/start) — it no longer trusts a
    // user_id sent in the request body.
    const token = localStorage.getItem("sb-access-token");

    if (!token) {
      alert("Your session has expired. Please log in again.");
      window.location.href = "/pages/LogIn.html";
      startBtn.disabled  = false;
      startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Interview';
      return;
    }

    try {
      const res  = await fetch("/api/interview/start", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ job_role_id: currentRole === "any" ? null : currentRole,
          question_type: currentType, persona: currentPersona, duration_minutes: interviewMinutes,
          question_count: targetQuestionCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");

      session_id    = data.session_id;
      clearPausedState(); // a brand-new session replaces any saved paused one
      isPaused      = false;
      questions     = data.questions;
      answers       = [];
      sessionAnswers= [];
      currentQIndex = 0;

      // Server clamps duration (5-30 min) and question count (min 5) —
      // use its authoritative values.
      if (data.duration_seconds) {
        totalDurationSeconds = data.duration_seconds;
        timeLeft = data.duration_seconds;
      }
      targetQuestionCount = data.target_question_count ?? targetQuestionCount;
      updateQuestionCountDisplay();

      if (interviewerName)  interviewerName.textContent  = currentPersona.name;
      if (interviewerTitle) interviewerTitle.textContent = currentPersona.title;
      if (aiLabel)          aiLabel.textContent          = currentPersona.name;

      setupPanel.classList.add("hidden");
      interviewUI.classList.remove("hidden");
      interviewUI.scrollIntoView({ behavior: "smooth" });

      isEnding = false; // new session can end normally
      updateQuestion();
      startTimer();
    } catch (err) {
      alert("Could not start interview: " + err.message);
    } finally {
      startBtn.disabled  = false;
      startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Interview';
    }
  });

  // ── Timer ──────────────────────────────────────────────────────────────────
  // timeLeft is set by the start-interview handler from the server's
  // (clamped) duration_seconds before this is called. The countdown uses a
  // wall-clock deadline (endTime) so it stays accurate when the tab is in
  // the background and the browser throttles setInterval.
  function renderTimer() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, "0");
    const s = (timeLeft % 60).toString().padStart(2, "0");
    timerEl.textContent = `${m}:${s}`;
    timerEl.style.color = timeLeft <= 60 ? "#dc2626" : timeLeft <= 120 ? "#ea580c" : "";
  }

  function tick() {
    if (isPaused || endTime === null) return;
    timeLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      renderTimer();
      endInterview();
      return;
    }
    renderTimer();
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    endTime = Date.now() + timeLeft * 1000;
    renderTimer();
    timerInterval = setInterval(tick, 1000);
  }

  // When the candidate returns to the tab, catch the timer up and make sure
  // the mic is still listening.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || isPaused) return;
    if (endTime && timerInterval) tick();
    if (isRecording && recognition) {
      try { recognition.start(); } catch (_) { /* already running */ }
    }
  });

  // ── Display & speak question ───────────────────────────────────────────────
  function updateQuestion() {
    if (currentQIndex >= questions.length) return;
    finalTranscript  = "";
    const q          = questions[currentQIndex];
    currentQuestionEl.textContent = q.text;

    // Once the interviewer finishes speaking, start the mic automatically.
    // The token makes sure a callback from an old question can't fire.
    const myToken = ++questionToken;
    speakText(q.text, () => {
      if (myToken !== questionToken) return;                // question already changed
      if (interviewUI.classList.contains("hidden")) return; // interview not on screen
      startRecording({ auto: true });
    });

    // Suggested time budget — longer for quant/engineering questions that
    // need real calculation, shorter for icebreaker/soft ones.
    if (questionTimeBadge) {
      const mins = q.suggestedTimeMinutes || 2;
      questionTimeBadge.innerHTML = `<i class="fa-regular fa-clock"></i> Suggested time: ${mins} min`;
    }

    // Diagram / given data — only for questions that include one.
    if (diagramBox && diagramContent) {
      if (q.diagram) {
        diagramContent.textContent = q.diagram;
        diagramBox.classList.remove("hidden");
      } else {
        diagramContent.textContent = "";
        diagramBox.classList.add("hidden");
      }
    }

    // Final numeric answer field — only for quant-style questions.
    if (finalAnswerWrap) {
      finalAnswerWrap.classList.toggle("hidden", q.answerFormat !== "numeric");
    }
    if (finalAnswerInput) finalAnswerInput.value = "";

    // Progress reflects the question-count target when the candidate set
    // one; otherwise it falls back to time elapsed against the chosen
    // duration, since with no count set the question supply is open-ended.
    const fill = document.querySelector(".bar-fill");
    const lbl  = document.querySelector(".progress-label");

    if (targetQuestionCount) {
      const pct = Math.min(100, Math.max(0, ((currentQIndex + 1) / targetQuestionCount) * 100));
      if (fill) fill.style.width = `${pct}%`;
      if (lbl)  lbl.textContent  = `Question ${currentQIndex + 1} of ${targetQuestionCount}`;
    } else {
      const elapsed = totalDurationSeconds - timeLeft;
      const pct = totalDurationSeconds > 0
        ? Math.min(100, Math.max(0, (elapsed / totalDurationSeconds) * 100))
        : 0;
      if (fill) fill.style.width = `${pct}%`;
      if (lbl)  lbl.textContent  = `Question ${currentQIndex + 1} · ${Math.round(pct)}% of interview time used`;
    }

    transcript.value = "";

    // Keep 1-2 questions buffered ahead in the background so advancing
    // never has to stall on a network round trip.
    maybeTopUpQuestions();
  }

  // Silently fetch and append another question ahead of time so the
  // candidate is never left waiting when they advance.
  async function maybeTopUpQuestions() {
    if (fetchingNextQuestion) return;
    if (questions.length - currentQIndex > 1) return; // buffer already healthy
    if (timeLeft < 30) return; // not enough time left for it to matter
    if (targetQuestionCount && questions.length >= targetQuestionCount) return; // target already covered

    fetchingNextQuestion = true;
    try {
      const res  = await fetch("/api/interview/next-question", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id }),
      });
      const data = await res.json();
      if (res.ok && data.question) {
        questions.push(data.question);
      }
    } catch (err) {
      console.warn("Background question top-up failed:", err.message);
    } finally {
      fetchingNextQuestion = false;
    }
  }

  // ── Submit Answer ──────────────────────────────────────────────────────────
  submitBtn.addEventListener("click", async () => {
    const answer = transcript.value.trim();
    if (!answer) { alert("Please type or record an answer."); return; }

    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Evaluating…';
    if (isRecording) stopRecording();
    stopAudio();
    questionToken++; // cancel any pending auto-record for this question

    const q = questions[currentQIndex];
    const finalAnswer = finalAnswerInput && !finalAnswerWrap.classList.contains("hidden")
      ? finalAnswerInput.value.trim()
      : "";

    try {
      const feedbackData = await submitAnswer(session_id, q.id, answer, finalAnswer, currentPersona);
      // Store enriched answer including score
      sessionAnswers.push({
        question_id:   q.id,
        question_text: q.text,
        answer,
        finalAnswer,
        score:         feedbackData.overallScore,
        feedback:      feedbackData.feedback,
      });
      answers.push({ question_id: q.id, question_text: q.text, answer, finalAnswer, feedback: feedbackData });
      await advanceOrEnd();
    } catch (err) {
      alert("Could not submit answer: " + err.message);
    } finally {
      submitBtn.disabled  = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Submit Answer';
    }
  });

  skipBtn.addEventListener("click", async () => {
    if (isRecording) stopRecording();
    stopAudio();
    questionToken++; // cancel any pending auto-record for this question
    sessionAnswers.push({ question_id: questions[currentQIndex].id,
      question_text: questions[currentQIndex].text, answer: null, score: null, feedback: null });
    answers.push({ question_id: questions[currentQIndex].id,
      question_text: questions[currentQIndex].text, answer: null, feedback: null });
    await advanceOrEnd();
  });

  // Advances to the next buffered question, fetching one on demand if the
  // buffer has run dry but time remains — the candidate should never hit a
  // dead end just because the initial batch is used up. Stops once the
  // candidate's requested question-count target is reached, even if time
  // is still left on the clock.
  async function advanceOrEnd() {
    currentQIndex++;

    if (targetQuestionCount && currentQIndex >= targetQuestionCount) {
      endInterview();
      return;
    }

    if (currentQIndex < questions.length) {
      updateQuestion();
      return;
    }

    if (timeLeft > 20) {
      currentQuestionEl.innerHTML = "<em>Preparing the next question…</em>";
      if (diagramBox) diagramBox.classList.add("hidden");
      if (questionTimeBadge) {
        questionTimeBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading…';
      }

      try {
        const res  = await fetch("/api/interview/next-question", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ session_id }),
        });
        const data = await res.json();
        if (res.ok && data.question) {
          questions.push(data.question);
          updateQuestion();
          return;
        }
      } catch (err) {
        console.warn("Could not fetch the next question:", err.message);
      }
    }

    endInterview();
  }

  async function submitAnswer(sid, question_id, user_answer, final_answer, persona) {
    const res  = await fetch("/api/interview/answer", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid, question_id, user_answer, final_answer, persona }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Answer submission failed");
    return data;
  }

  // ── Dead / expired session handling ────────────────────────────────────────
  // Called when the server no longer recognises the session (404), e.g. after
  // a server restart. Clears every trace of it so it cannot be re-saved or
  // restored, and returns the user to the setup screen.
  function discardDeadSession() {
    clearPausedState();
    hidePausedOverlay();
    isEnding   = false;
    isPaused   = false;
    session_id = null;
    questionToken++;
    endTime    = null;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (isRecording) stopRecording();
    stopAudio();
    interviewUI.classList.add("hidden");
    setupPanel.classList.remove("hidden");
    alert("That interview session has expired, so it was discarded. You can start a new one.");
  }

  // ── End Interview ──────────────────────────────────────────────────────────
  async function endInterview() {
    if (isEnding || !session_id) return;
    isEnding = true;
    clearPausedState(); // finished sessions must not be resumable
    questionToken++;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    endTime = null;
    if (isRecording) stopRecording();
    stopAudio();

    try {
      const res  = await fetch("/api/interview/end", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id, answers }),
      });

      // Server doesn't know this session (e.g. it restarted): drop it cleanly
      // instead of leaving a half-active interview that gets re-saved.
      if (res.status === 404) { discardDeadSession(); return; }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Grab webcam report if active
      const behaviorReport = webcamActive && behaviorAnalyzer
        ? behaviorAnalyzer.getReport()
        : null;
      behaviorAnalyzer?.stop();
      behaviorAnalyzer = null;
      webcamActive     = false;

      // Enrich per-question with scores from sessionAnswers
      const perQuestion = (data.perQuestion || []).map((pq, i) => ({
        ...pq,
        score: sessionAnswers[i]?.score ?? null,
      }));

      const candidateName = localStorage.getItem("skillforge_display_name") || "Candidate";

      // Build report data
      const reportData = {
        candidateName,
        personaName:   currentPersona.name,
        personaTitle:  currentPersona.title,
        interviewType: { hr: "Behavioral", technical: "Technical", consulting: "Consulting" }[currentType] || currentType,
        targetRole:    currentRole === "any" ? "General" : currentRole.replace(/-/g, " "),
        date:          new Date(),
        overallScore:  data.overallScore,
        breakdown:     data.breakdown,
        perQuestion,
        tips:          data.tips,
        behaviorReport,
      };

      reportGenerator = new ReportGenerator(reportData);

      interviewUI.classList.add("hidden");
      feedbackUI.classList.remove("hidden");
      feedbackUI.scrollIntoView({ behavior: "smooth" });

      // Render into the report container
      if (reportContainer) {
        reportGenerator.renderHTML(reportContainer);
      } else {
        // Fallback to old simple feedback
        _renderSimpleFeedback(data);
      }

      // Show the existing rating popup after successful interview completion
      window.SFRating?.afterUse("interview_simulator");
    } catch (err) {
      isEnding = false; // allow another attempt if ending failed
      alert("Could not end interview: " + err.message);
    }
  }

  function _renderSimpleFeedback(data) {
    const overallEl = document.getElementById("overallScore");
    if (overallEl) overallEl.textContent = data.overallScore ?? "–";
  }

  // ── Pause / resume across page navigation ──────────────────────────────────
  function isInterviewActive() {
    return !!session_id && !isEnding && !interviewUI.classList.contains("hidden");
  }

  // Stops everything that runs "live": timer, mic, audio.
  function freezeInterview() {
    if (endTime !== null) {
      timeLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    endTime = null;

    // Capture the draft BEFORE stopping the mic
    pausedDraft = {
      transcript:  transcript.value,
      finalAnswer: finalAnswerInput ? finalAnswerInput.value : "",
    };

    if (isRecording) stopRecording();
    stopAudio();
    questionToken++; // cancel any pending auto-record
    isPaused = true;
  }

  function savePausedState() {
    try {
      localStorage.setItem(PAUSE_KEY, JSON.stringify({
        savedAt: Date.now(),
        session_id, questions, answers, sessionAnswers, currentQIndex,
        timeLeft, totalDurationSeconds, interviewMinutes, targetQuestionCount,
        currentType, currentRole, currentPersona,
        draft: pausedDraft,
      }));
    } catch (err) {
      console.warn("Could not save paused interview:", err.message);
    }
  }

  function clearPausedState() {
    try { localStorage.removeItem(PAUSE_KEY); } catch (_) {}
  }

  function showPausedOverlay() {
    if (pausedOverlay) return;
    const m = Math.floor(timeLeft / 60), s = String(timeLeft % 60).padStart(2, "0");

    pausedOverlay = document.createElement("div");
    pausedOverlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.85);" +
      "display:flex;align-items:center;justify-content:center;padding:16px;";
    pausedOverlay.innerHTML = `
      <div style="background:#fff;color:#0f172a;border-radius:16px;padding:32px;
                  max-width:380px;width:100%;text-align:center;">
        <h2 style="margin:0 0 8px;">Interview paused</h2>
        <p style="margin:0 0 20px;">Time remaining: <strong>${m}:${s}</strong></p>
        <button id="resumeInterviewBtn" style="width:100%;padding:12px;border:0;border-radius:10px;
                background:#2563eb;color:#fff;font-size:1rem;cursor:pointer;margin-bottom:10px;">
          <i class="fa-solid fa-play"></i> Resume interview
        </button>
        <button id="endPausedBtn" style="width:100%;padding:12px;border:1px solid #cbd5e1;
                border-radius:10px;background:#fff;font-size:1rem;cursor:pointer;">
          End now &amp; see feedback
        </button>
      </div>`;
    document.body.appendChild(pausedOverlay);

    pausedOverlay.querySelector("#resumeInterviewBtn").addEventListener("click", resumeInterview);
    pausedOverlay.querySelector("#endPausedBtn").addEventListener("click", () => {
      hidePausedOverlay();
      isPaused = false;
      clearPausedState();
      endInterview();
    });
  }

  function hidePausedOverlay() {
    pausedOverlay?.remove();
    pausedOverlay = null;
  }

  function resumeInterview() {
    hidePausedOverlay();
    clearPausedState();
    isPaused = false;

    updateQuestion(); // re-reads the question aloud, then auto-starts the mic
    // updateQuestion() clears the inputs, so put the saved draft back
    transcript.value = pausedDraft.transcript || "";
    if (finalAnswerInput) finalAnswerInput.value = pausedDraft.finalAnswer || "";
    startTimer();     // continues from the saved timeLeft
  }

  // Fires on sidebar links, back/forward, URL changes and tab close
  window.addEventListener("pagehide", () => {
    if (!isInterviewActive() || isPaused) return;
    freezeInterview();
    // An interview with no time left is over: never save it as resumable
    if (timeLeft <= 0) { clearPausedState(); return; }
    savePausedState();
  });

  // Page restored from the back/forward cache — it's still frozen, so show the overlay
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && isPaused && isInterviewActive()) showPausedOverlay();
  });

  // Page loaded fresh — restore a saved session if there is one
  function restorePausedInterview() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PAUSE_KEY)); } catch (_) {}
    if (!saved || !saved.session_id || !(saved.timeLeft > 0) ||
        Date.now() - saved.savedAt > PAUSE_MAX_AGE_MS) {
      clearPausedState();
      return;
    }

    session_id           = saved.session_id;
    questions            = saved.questions || [];
    answers              = saved.answers || [];
    sessionAnswers       = saved.sessionAnswers || [];
    currentQIndex        = saved.currentQIndex || 0;
    timeLeft             = saved.timeLeft;
    totalDurationSeconds = saved.totalDurationSeconds;
    interviewMinutes     = saved.interviewMinutes;
    targetQuestionCount  = saved.targetQuestionCount;
    currentType          = saved.currentType;
    currentRole          = saved.currentRole;
    currentPersona       = saved.currentPersona;
    pausedDraft          = saved.draft || pausedDraft;
    isEnding             = false;
    isPaused             = true;

    if (avatarEngine) avatarEngine.switchPersona(currentPersona.id);
    if (interviewerName)  interviewerName.textContent  = currentPersona.name;
    if (interviewerTitle) interviewerTitle.textContent = currentPersona.title;
    if (aiLabel)          aiLabel.textContent          = currentPersona.name;

    setupPanel.classList.add("hidden");
    interviewUI.classList.remove("hidden");
    currentQuestionEl.textContent = questions[currentQIndex]?.text || "";
    renderTimer();
    showPausedOverlay();
  }

  restorePausedInterview();

  // ── Practice Again ─────────────────────────────────────────────────────────
  practiceAgainBtn?.addEventListener("click", () => {
    stopAudio();
    questionToken++;
    clearPausedState();
    isPaused        = false;
    session_id      = null;
    questions       = [];
    answers         = [];
    sessionAnswers  = [];
    currentQIndex   = 0;
    finalTranscript = "";
    feedbackUI.classList.add("hidden");
    setupPanel.classList.remove("hidden");
    setupPanel.scrollIntoView({ behavior: "smooth" });
    if (timerEl) { timerEl.textContent = `${interviewMinutes}:00`; timerEl.style.color = ""; }
    const fill = document.querySelector(".bar-fill");
    if (fill) fill.style.width = "0%";
    if (reportContainer) reportContainer.innerHTML = "";
    if (diagramBox) diagramBox.classList.add("hidden");
    if (finalAnswerWrap) finalAnswerWrap.classList.add("hidden");
  });

});

async function loadUserGreeting() {
  const token = localStorage.getItem('sb-access-token');

  if(!token) return window.location.href = "/pages/LogIn.html";

  try{
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}`}
    });

    if(!res.ok) return window.location.href = "/pages/LogIn.html";

    const { firstName, email } = await res.json();

    document.querySelector(".profile-name").textContent = `${firstName}`;
    document.querySelector(".profile-email").textContent = `${email}`
  }catch(err){
    console.error("Failed to load user:", err);
  }
}

loadUserGreeting();