/**
 * InterviewSimulator.js
 * Wires up the persona selector, voice recording (Web Speech API),
 * AI Speaking (SpeechSynthesis), and all API calls to the Express/Groq backend.
 */

document.addEventListener("DOMContentLoaded", () => {

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const setupPanel       = document.getElementById("setupPanel");
  const startBtn         = document.getElementById("startBtn");
  const resetBtn         = document.getElementById("resetBtn");
  const interviewUI      = document.getElementById("interviewUI");
  const feedbackUI       = document.getElementById("feedbackUI");
  const recordBtn        = document.getElementById("recordBtn");
  const stopBtn          = document.getElementById("stopBtn");
  const transcript       = document.getElementById("transcript");
  const timerEl          = document.getElementById("timer");
  const previewTypeText  = document.getElementById("previewTypeText");
  const previewRoleText  = document.getElementById("previewRoleText");
  const previewPersona   = document.getElementById("previewPersonaText");
  const currentQuestionEl= document.getElementById("currentQuestion");
  const tipsList         = document.getElementById("tipsList");
  const submitBtn        = document.getElementById("submitBtn");
  const skipBtn          = document.getElementById("skipBtn");
  const qaBreakdown      = document.getElementById("qaBreakdown");
  const practiceAgainBtn = document.getElementById("practiceAgainBtn");

  // Interviewer badge elements
  const interviewerEmoji = document.getElementById("interviewerEmoji");
  const interviewerName  = document.getElementById("interviewerName");
  const interviewerTitle = document.getElementById("interviewerTitle");
  const aiAvatarEmoji    = document.getElementById("aiAvatarEmoji");
  const aiLabel          = document.getElementById("aiLabel");

  // ── State ──────────────────────────────────────────────────────────────────
  let currentType      = "hr";
  let currentRole      = "any";
  let session_id       = null;
  let questions        = [];
  let answers          = [];
  let currentQIndex    = 0;
  let timeLeft         = 600;
  let timerInterval    = null;
  let recognition      = null;
  let isRecording      = false;
  let finalTranscript  = "";   // ← tracks confirmed spoken words only
  let autoRecordAfterSpeak = false; // Optional: auto-start recording after AI speaks

  let currentPersona = {
    id:    "senior-engineer",
    name:  "Alex Chen",
    title: "Senior Engineer @ FAANG",
    style: "Direct, technical, expects precision. Will probe deep on system design and code quality.",
    emoji: "👨‍💻",
  };

  // ── AI Speaking (Speech Synthesis) ─────────────────────────────────────────
  function speakText(text, onEndCallback = null) {
    if (!window.speechSynthesis) {
      console.warn("Speech synthesis not supported");
      if (onEndCallback) onEndCallback();
      return;
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure voice - try to find a good voice
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Optional: Auto-trigger recording after AI finishes speaking
    if (onEndCallback) {
      utterance.onend = onEndCallback;
    }
    
    window.speechSynthesis.speak(utterance);
  }

  // ── Interview type buttons ─────────────────────────────────────────────────
  const typeButtons = document.querySelectorAll(".interview-type");
  typeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      typeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      const labelMap = { hr: "Behavioral", technical: "Technical", consulting: "Consulting & Case" };
      previewTypeText.textContent = labelMap[currentType] || btn.querySelector("span").textContent;
    });
  });

  // ── Role chips ─────────────────────────────────────────────────────────────
  const roleChips = document.querySelectorAll(".roles-container .chip");
  roleChips.forEach(chip => {
    chip.addEventListener("click", () => {
      roleChips.forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      currentRole = chip.dataset.role;
      previewRoleText.textContent = chip.textContent;
    });
  });

  // ── Persona cards ──────────────────────────────────────────────────────────
  const personaCards = document.querySelectorAll(".persona-card");
  personaCards.forEach(card => {
    card.addEventListener("click", () => {
      personaCards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      currentPersona = {
        id:    card.dataset.persona,
        name:  card.dataset.name,
        title: card.dataset.title,
        style: card.dataset.style,
        emoji: card.dataset.emoji,
      };
      document.getElementById("personaPreviewName").textContent    = currentPersona.name;
      document.getElementById("personaPreviewTitle").textContent   = currentPersona.title;
      document.getElementById("personaPreviewStyle").textContent   = currentPersona.style;
      document.querySelector(".persona-preview-avatar").textContent = currentPersona.emoji;
      previewPersona.textContent = currentPersona.name;
    });
  });

  // ── Reset ──────────────────────────────────────────────────────────────────
  resetBtn.addEventListener("click", () => {
    typeButtons.forEach(b => b.classList.remove("active"));
    typeButtons[0].classList.add("active");
    roleChips.forEach(c => c.classList.remove("selected"));
    currentType = "hr";
    currentRole = "any";
    previewTypeText.textContent = "Behavioral";
    previewRoleText.textContent = "Any";
  });

  // ── Voice recording (Web Speech API) ──────────────────────────────────────
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startRecording() {
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser. Please type your answer.");
      return;
    }

    // Cancel any ongoing speech before starting recording
    window.speechSynthesis.cancel();
    
    finalTranscript = ""; // reset on each new recording session

    recognition = new SpeechRecognition();
    recognition.lang = "en-ZA";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t + " "; // permanently append confirmed words
        } else {
          interim = t; // replace interim — don't append, prevents repetition
        }
      }
      transcript.value = finalTranscript + interim;
    };

    recognition.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
      stopRecording();
    };

    recognition.onend = () => {
      if (isRecording) recognition.start(); // keep alive until manually stopped
    };

    recognition.start();
    isRecording = true;
    recordBtn.classList.add("recording");
    recordBtn.innerHTML = '<i class="fa-solid fa-circle"></i><span>Recording…</span>';
    stopBtn.classList.remove("hidden");
  }

  function stopRecording() {
    isRecording = false;
    if (recognition) {
      recognition.onend = null; // prevent auto-restart
      recognition.stop();
      recognition = null;
    }
    recordBtn.classList.remove("recording");
    recordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Record</span>';
    stopBtn.classList.add("hidden");
  }

  recordBtn.addEventListener("click", () => { if (!isRecording) startRecording(); });
  stopBtn.addEventListener("click",   () => { if (isRecording)  stopRecording();  });

  // ── Start Interview ────────────────────────────────────────────────────────
  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Starting…';

    const user_id = localStorage.getItem("skillforge_user_id") || "guest_user";

    try {
      const res = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id,
          job_role_id:   currentRole === "any" ? null : currentRole,
          question_type: currentType,
          persona:       currentPersona,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start session");

      session_id    = data.session_id;
      questions     = data.questions;
      answers       = [];
      currentQIndex = 0;

      interviewerEmoji.textContent = currentPersona.emoji;
      interviewerName.textContent  = currentPersona.name;
      interviewerTitle.textContent = currentPersona.title;
      aiAvatarEmoji.textContent    = currentPersona.emoji;
      aiLabel.textContent          = currentPersona.name;

      setupPanel.classList.add("hidden");
      interviewUI.classList.remove("hidden");
      interviewUI.scrollIntoView({ behavior: "smooth" });

      updateQuestion();
      startTimer();

    } catch (err) {
      alert("Could not start interview: " + err.message);
    } finally {
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Interview';
    }
  });

  // ── Timer ──────────────────────────────────────────────────────────────────
  function startTimer() {
    timeLeft = 600;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        endInterview();
        return;
      }
      const m = Math.floor(timeLeft / 60).toString().padStart(2, "0");
      const s = (timeLeft % 60).toString().padStart(2, "0");
      timerEl.textContent = `${m}:${s}`;
      if (timeLeft <= 120) timerEl.style.color = "#ea580c";
      if (timeLeft <= 60)  timerEl.style.color = "#dc2626";
    }, 1000);
  }

  // ── Update displayed question (with AI voice) ──────────────────────────────
  function updateQuestion() {
    if (currentQIndex >= questions.length) return;
    
    finalTranscript = ""; // reset speech state for new question
    const q = questions[currentQIndex];
    currentQuestionEl.textContent = q.text;
    
    // Speak the question with optional auto-record after speaking
    speakText(q.text, () => {
      // Optional: Automatically start recording after AI finishes speaking
      if (autoRecordAfterSpeak && !isRecording) {
        setTimeout(() => startRecording(), 500);
      }
    });
    
    const pct = ((currentQIndex + 1) / questions.length) * 100;
    document.querySelector(".bar-fill").style.width = `${pct}%`;
    document.querySelector(".progress-label").textContent =
      `${currentQIndex + 1} of ${questions.length} questions`;
    transcript.value = "";
  }

  // ── Submit Answer ──────────────────────────────────────────────────────────
  submitBtn.addEventListener("click", async () => {
    const answer = transcript.value.trim();
    if (!answer) { alert("Please type or record an answer."); return; }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Evaluating…';
    if (isRecording) stopRecording();
    
    // Cancel any ongoing AI speech
    window.speechSynthesis.cancel();

    const q = questions[currentQIndex];

    try {
      const feedbackData = await submitAnswer(session_id, q.id, answer, currentPersona);
      answers.push({ question_id: q.id, question_text: q.text, answer, feedback: feedbackData });
      advanceOrEnd();
    } catch (err) {
      alert("Could not submit answer: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Submit Answer';
    }
  });

  // ── Skip ──────────────────────────────────────────────────────────────────
  skipBtn.addEventListener("click", () => {
    if (isRecording) stopRecording();
    window.speechSynthesis.cancel(); // Cancel any AI speech
    answers.push({
      question_id:   questions[currentQIndex].id,
      question_text: questions[currentQIndex].text,
      answer:        null,
      feedback:      null,
    });
    advanceOrEnd();
  });

  function advanceOrEnd() {
    currentQIndex++;
    if (currentQIndex < questions.length) {
      updateQuestion();
    } else {
      endInterview();
    }
  }

  // ── Submit answer to backend ───────────────────────────────────────────────
  async function submitAnswer(sid, question_id, user_answer, persona) {
    const res = await fetch("/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid, question_id, user_answer, persona }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Answer submission failed");
    return data;
  }

  // ── End Interview (with cleanup) ───────────────────────────────────────────
  async function endInterview() {
    if (timerInterval) clearInterval(timerInterval);
    if (isRecording) stopRecording();
    
    // Stop any ongoing AI speech
    window.speechSynthesis.cancel();
    
    if (!session_id) return;

    try {
      const res = await fetch("/api/interview/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      interviewUI.classList.add("hidden");
      feedbackUI.classList.remove("hidden");
      feedbackUI.scrollIntoView({ behavior: "smooth" });
      renderFeedback(data);
    } catch (err) {
      alert("Could not end interview: " + err.message);
    }
  }

  // ── Render final feedback ──────────────────────────────────────────────────
  function renderFeedback(data) {
    document.getElementById("overallScore").textContent = data.overallScore ?? "–";

    const breakdown = data.breakdown || {};
    setBadge("confidenceBadge", breakdown.confidence);
    setBadge("clarityBadge",    breakdown.clarity);
    setBadge("structureBadge",  breakdown.structure);

    tipsList.innerHTML = "";
    const tips = Array.isArray(data.tips) ? data.tips : ["Keep practising and focus on specific examples."];
    tips.forEach(tip => {
      const li = document.createElement("li");
      li.textContent = tip;
      tipsList.appendChild(li);
    });

    qaBreakdown.innerHTML = "";
    if (Array.isArray(data.perQuestion) && data.perQuestion.length) {
      const title = document.createElement("h4");
      title.textContent = "Question-by-Question Review";
      title.style.marginBottom = "12px";
      qaBreakdown.appendChild(title);

      data.perQuestion.forEach((item, idx) => {
        const div = document.createElement("div");
        div.className = "qa-item";
        div.innerHTML = `
          <div class="qa-q"><span class="qa-num">Q${idx + 1}</span>${item.question}</div>
          <div class="qa-a"><em>Your answer:</em> ${item.answer || "<span style='color:#94a3b8'>Skipped</span>"}</div>
          <div class="qa-fb">${item.feedback || ""}</div>
        `;
        qaBreakdown.appendChild(div);
      });
    }
  }

  function setBadge(id, score) {
    const badge = document.getElementById(id);
    if (!badge) return;
    const s = score ?? 0;
    const level = s >= 7 ? "high" : s >= 4 ? "good" : "weak";
    const labels = { high: "Strong", good: "Average", weak: "Needs Work" };
    badge.className = `score-badge ${level}`;
    badge.querySelector(".score").textContent = s;
    badge.querySelector(".label").textContent = labels[level];
  }

  // ── Practice Again ─────────────────────────────────────────────────────────
  practiceAgainBtn.addEventListener("click", () => {
    // Cancel any ongoing AI speech
    window.speechSynthesis.cancel();
    
    session_id      = null;
    questions       = [];
    answers         = [];
    currentQIndex   = 0;
    finalTranscript = "";
    feedbackUI.classList.add("hidden");
    setupPanel.classList.remove("hidden");
    setupPanel.scrollIntoView({ behavior: "smooth" });
    timerEl.textContent = "10:00";
    timerEl.style.color = "";
    document.querySelector(".bar-fill").style.width = "0%";
  });

});