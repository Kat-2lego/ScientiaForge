/**
 * InterviewSimulator.js  (upgraded)
 * Integrates:
 *  - AvatarEngine   : canvas-based talking avatar with lipsync + eye contact
 *  - BehaviorAnalyzer: webcam face analysis (eye contact, head tilt, presence)
 *  - ReportGenerator : detailed HTML + PDF report
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

  // ── State ──────────────────────────────────────────────────────────────────
  let currentType     = "hr";
  let currentRole     = "any";
  let session_id      = null;
  let questions       = [];
  let answers         = [];
  let currentQIndex   = 0;
  let timeLeft        = 600;
  let timerInterval   = null;
  let recognition     = null;
  let isRecording     = false;
  let finalTranscript = "";
  let currentAudio    = null;
  let isSpeaking      = false;
  let webcamActive    = false;

  let currentPersona = {
    id:    "senior-engineer",
    name:  "Alex Chen",
    title: "Senior Engineer @ FAANG",
    style: "Direct, technical, expects precision.",
    emoji: "👨‍💻",
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
      console.warn("Edge TTS failed:", err.message);
      isSpeaking = false;
      fallbackSpeak(text, onEndCallback);
    }
  }

  function fallbackSpeak(text, onEndCallback = null) {
    if (!window.speechSynthesis) { if (onEndCallback) onEndCallback(); return; }
    window.speechSynthesis.cancel();
    const u   = new SpeechSynthesisUtterance(text);
    u.rate    = 0.9; u.pitch = 1.0; u.volume = 1.0;
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

  // ── Role chips ─────────────────────────────────────────────────────────────
  document.querySelectorAll(".roles-container .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".roles-container .chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      currentRole = chip.dataset.role;
      previewRoleText.textContent = chip.textContent;
    });
  });

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
        emoji: card.dataset.emoji,
      };
      document.getElementById("personaPreviewName").textContent     = currentPersona.name;
      document.getElementById("personaPreviewTitle").textContent    = currentPersona.title;
      document.getElementById("personaPreviewStyle").textContent    = currentPersona.style;
      document.querySelector(".persona-preview-avatar").textContent = currentPersona.emoji;
      previewPersona.textContent = currentPersona.name;

      // Switch avatar persona
      if (avatarEngine) avatarEngine.switchPersona(currentPersona.id);
    });
  });

  // ── Reset ──────────────────────────────────────────────────────────────────
  resetBtn?.addEventListener("click", () => {
    document.querySelectorAll(".interview-type")[0].click();
    document.querySelectorAll(".roles-container .chip").forEach(c => c.classList.remove("selected"));
    currentRole = "any";
    previewRoleText.textContent = "Any";
  });

  // ── Webcam toggle ──────────────────────────────────────────────────────────
  webcamToggleBtn?.addEventListener("click", async () => {
    if (webcamActive) {
      behaviorAnalyzer?.stop();
      behaviorAnalyzer = null;
      webcamActive     = false;
      webcamVideo.srcObject = null;
      webcamToggleBtn.textContent = "📷 Enable Webcam Analysis";
      webcamToggleBtn.classList.remove("active");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        webcamVideo.srcObject = stream;
        behaviorAnalyzer      = new BehaviorAnalyzer(webcamVideo, webcamCanvas);
        await behaviorAnalyzer.start();
        webcamActive          = true;
        webcamToggleBtn.textContent = "📷 Webcam Active";
        webcamToggleBtn.classList.add("active");
      } catch (e) {
        alert("Could not access webcam: " + e.message);
      }
    }
  });

  // ── Voice recording (Web Speech API) ──────────────────────────────────────
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startRecording() {
    if (!SpeechRecognition) {
      alert("Speech recognition not supported. Please type your answer.");
      return;
    }
    stopAudio();
    finalTranscript = "";
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

    recognition.onerror = (e) => { console.warn("Speech error:", e.error); stopRecording(); };
    recognition.onend   = () => { if (isRecording) recognition.start(); };
    recognition.start();

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

    const user_id = localStorage.getItem("skillforge_user_id") || "guest_user";

    try {
      const res  = await fetch("/api/interview/start", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, job_role_id: currentRole === "any" ? null : currentRole,
          question_type: currentType, persona: currentPersona }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");

      session_id    = data.session_id;
      questions     = data.questions;
      answers       = [];
      sessionAnswers= [];
      currentQIndex = 0;

      if (interviewerName)  interviewerName.textContent  = currentPersona.name;
      if (interviewerTitle) interviewerTitle.textContent = currentPersona.title;
      if (aiLabel)          aiLabel.textContent          = currentPersona.name;

      setupPanel.classList.add("hidden");
      interviewUI.classList.remove("hidden");
      interviewUI.scrollIntoView({ behavior: "smooth" });

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
  function startTimer() {
    timeLeft = 600;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) { clearInterval(timerInterval); endInterview(); return; }
      const m = Math.floor(timeLeft / 60).toString().padStart(2, "0");
      const s = (timeLeft % 60).toString().padStart(2, "0");
      timerEl.textContent = `${m}:${s}`;
      if (timeLeft <= 120) timerEl.style.color = "#ea580c";
      if (timeLeft <= 60)  timerEl.style.color = "#dc2626";
    }, 1000);
  }

  // ── Display & speak question ───────────────────────────────────────────────
  function updateQuestion() {
    if (currentQIndex >= questions.length) return;
    finalTranscript  = "";
    const q          = questions[currentQIndex];
    currentQuestionEl.textContent = q.text;
    speakText(q.text);

    const pct = ((currentQIndex + 1) / questions.length) * 100;
    const fill = document.querySelector(".bar-fill");
    const lbl  = document.querySelector(".progress-label");
    if (fill) fill.style.width = `${pct}%`;
    if (lbl)  lbl.textContent  = `${currentQIndex + 1} of ${questions.length} questions`;
    transcript.value = "";
  }

  // ── Submit Answer ──────────────────────────────────────────────────────────
  submitBtn.addEventListener("click", async () => {
    const answer = transcript.value.trim();
    if (!answer) { alert("Please type or record an answer."); return; }

    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Evaluating…';
    if (isRecording) stopRecording();
    stopAudio();

    const q = questions[currentQIndex];

    try {
      const feedbackData = await submitAnswer(session_id, q.id, answer, currentPersona);
      // Store enriched answer including score
      sessionAnswers.push({
        question_id:   q.id,
        question_text: q.text,
        answer,
        score:         feedbackData.overallScore,
        feedback:      feedbackData.feedback,
      });
      answers.push({ question_id: q.id, question_text: q.text, answer, feedback: feedbackData });
      advanceOrEnd();
    } catch (err) {
      alert("Could not submit answer: " + err.message);
    } finally {
      submitBtn.disabled  = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Submit Answer';
    }
  });

  skipBtn.addEventListener("click", () => {
    if (isRecording) stopRecording();
    stopAudio();
    sessionAnswers.push({ question_id: questions[currentQIndex].id,
      question_text: questions[currentQIndex].text, answer: null, score: null, feedback: null });
    answers.push({ question_id: questions[currentQIndex].id,
      question_text: questions[currentQIndex].text, answer: null, feedback: null });
    advanceOrEnd();
  });

  function advanceOrEnd() {
    currentQIndex++;
    if (currentQIndex < questions.length) updateQuestion();
    else endInterview();
  }

  async function submitAnswer(sid, question_id, user_answer, persona) {
    const res  = await fetch("/api/interview/answer", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid, question_id, user_answer, persona }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Answer submission failed");
    return data;
  }

  // ── End Interview ──────────────────────────────────────────────────────────
  async function endInterview() {
    if (timerInterval) clearInterval(timerInterval);
    if (isRecording) stopRecording();
    stopAudio();
    if (!session_id) return;

    try {
      const res  = await fetch("/api/interview/end", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id, answers }),
      });
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
    } catch (err) {
      alert("Could not end interview: " + err.message);
    }
  }

  function _renderSimpleFeedback(data) {
    const overallEl = document.getElementById("overallScore");
    if (overallEl) overallEl.textContent = data.overallScore ?? "–";
  }

  // ── Practice Again ─────────────────────────────────────────────────────────
  practiceAgainBtn?.addEventListener("click", () => {
    stopAudio();
    session_id      = null;
    questions       = [];
    answers         = [];
    sessionAnswers  = [];
    currentQIndex   = 0;
    finalTranscript = "";
    feedbackUI.classList.add("hidden");
    setupPanel.classList.remove("hidden");
    setupPanel.scrollIntoView({ behavior: "smooth" });
    if (timerEl) { timerEl.textContent = "10:00"; timerEl.style.color = ""; }
    const fill = document.querySelector(".bar-fill");
    if (fill) fill.style.width = "0%";
    if (reportContainer) reportContainer.innerHTML = "";
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