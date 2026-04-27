document.addEventListener("DOMContentLoaded", () => {
  const startBtn          = document.getElementById("startBtn");
  const resetBtn          = document.getElementById("resetBtn");
  const interviewUI       = document.getElementById("interviewUI");
  const feedbackUI        = document.getElementById("feedbackUI");
  const recordBtn         = document.getElementById("recordBtn");
  const stopBtn           = document.getElementById("stopBtn");
  const transcript        = document.getElementById("transcript");
  const timer             = document.getElementById("timer");
  const previewTypeText   = document.getElementById("previewTypeText");
  const previewRoleText   = document.getElementById("previewRoleText");
  const currentQuestionEl = document.getElementById("currentQuestion");
  const tipsList          = document.getElementById("tipsList");

  let currentType = "hr";
  let currentRole = "any";
  let session_id = null;
  let questions = [];
  let currentQIndex = 0;
  let timeLeft = 0;
  let timerInterval = null;

  // --- Interview type selection ---
  const typeButtons = document.querySelectorAll(".interview-type");
  typeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      const label = btn.querySelector("span").textContent;
      previewTypeText.textContent = label;
    });
  });

  // --- Role chips ---
  const roleChips = document.querySelectorAll(".roles-container .chip");
  roleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      roleChips.forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      const role = chip.dataset.role;
      currentRole = role;
      const capitalized = role.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
      previewRoleText.textContent = capitalized;
    });
  });

  resetBtn.addEventListener("click", () => {
    typeButtons.forEach((b) => b.classList.remove("active"));
    roleChips.forEach((c) => c.classList.remove("selected"));
    currentType = "hr";
    currentRole = "any";
    previewTypeText.textContent = "Behavioral";
    previewRoleText.textContent = "Any";
  });

  // --- Recording toggle (mock UI only) ---
  recordBtn.addEventListener("click", () => {
    if (recordBtn.classList.contains("recording")) return;
    recordBtn.classList.add("recording");
    recordBtn.innerHTML = '<i class="fa-solid fa-circle"></i><span>Recording...</span>';
    stopBtn.classList.remove("hidden");
    stopBtn.style.display = "inline-flex";

    setTimeout(() => {
      transcript.value = "Thank you for the opportunity. I've been working on JavaScript and React for the past year...";
    }, 1000);
  });

  stopBtn.addEventListener("click", () => {
    if (!recordBtn.classList.contains("recording")) return;
    recordBtn.classList.remove("recording");
    recordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Record</span>';
    stopBtn.style.display = "none";
  });

  // --- START INTERVIEW (calls API) ---
  startBtn.addEventListener("click", async () => {
    if (timerInterval) clearInterval(timerInterval);

    const user_id = "dummy_user_id"; // TODO: replace with real user ID from Supabase

    try {
      const res = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id,
          job_role_id: currentRole === "any" ? null : currentRole,
          question_type: currentType,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      session_id = data.session_id;
      questions = data.questions;
      currentQIndex = 0;

      startInterviewSession();
    } catch (err) {
      alert("Failed to start interview: " + err.message);
    }
  });

  function startInterviewSession() {
    if (!questions.length) return;

    interviewUI.classList.remove("hidden");
    interviewUI.scrollIntoView({ behavior: "smooth" });

    updateQuestion();
    timeLeft = 600; // 10 minutes

    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft < 0) {
        timeLeft = 0;
        clearInterval(timerInterval);
        endInterview();
        return;
      }
      const m = Math.floor(timeLeft / 60).toString().padStart(2, "0");
      const s = (timeLeft % 60).toString().padStart(2, "0");
      timer.textContent = `${m}:${s}`;
    }, 1000);
  }

  function updateQuestion() {
    if (currentQIndex >= questions.length) return;
    const q = questions[currentQIndex];
    currentQuestionEl.textContent = q.text;
    const progress = ((currentQIndex + 1) / questions.length) * 100;
    document.querySelector(".bar-fill").style.width = `${progress}%`;
    document.querySelector(".progress-label").textContent =
      `${currentQIndex + 1} of ${questions.length} questions`;
  }

  submitBtn.addEventListener("click", async () => {
    const answer = transcript.value.trim();
    if (!answer) {
      alert("Please type or record an answer.");
      return;
    }

    const q = questions[currentQIndex];
    const aiResp = await submitAnswer(session_id, q.id, answer);
    showFeedbackFromAI(aiResp);

    currentQIndex++;
    if (currentQIndex < questions.length) {
      updateQuestion();
      transcript.value = "";
    } else {
      endInterview();
    }
  });

  skipBtn.addEventListener("click", () => {
    currentQIndex++;
    if (currentQIndex < questions.length) {
      updateQuestion();
      transcript.value = "";
    } else {
      endInterview();
    }
  });

  async function submitAnswer(session_id, question_id, user_answer) {
    const res = await fetch("/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id, question_id, user_answer }),
    });
    return await res.json();
  }

  function showFeedbackFromAI(aiResp) {
    document.querySelector("#feedbackUI .overall-score .score").textContent =
      aiResp.overallScore;

    const badges = document.querySelectorAll(".score-badge");
    badges[0].querySelector(".score").textContent = aiResp.breakdown.confidence;
    badges[1].querySelector(".score").textContent = aiResp.breakdown.clarity;
    badges[2].querySelector(".score").textContent = aiResp.breakdown.structure;

    const labels = ["low", "medium", "high"];
    badges.forEach((badge, i) => {
      const label = i === 0 ? "low" : i === 1 ? "medium" : "high";
      const el = badge.querySelector("span.label");
      el.className = "label";
      el.classList.add(label);
      el.textContent = label;
    });

    const ul = document.getElementById("tipsList");
    ul.innerHTML = "";
    if (aiResp.tips && Array.isArray(aiResp.tips)) {
      aiResp.tips.forEach((tip) => {
        const li = document.createElement("li");
        li.textContent = tip;
        ul.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "Keep practicing and focus on giving specific examples.";
      ul.appendChild(li);
    }
  }

  async function endInterview() {
    if (!session_id) return;

    if (timerInterval) clearInterval(timerInterval);

    try {
      const res = await fetch("/api/interview/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      interviewUI.classList.add("hidden");
      feedbackUI.classList.remove("hidden");
      feedbackUI.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      alert("Failed to end interview: " + err.message);
    }
  }

  // ==============================
  // Career Discovery / Chip logic
  // ==============================

  const chips = document.querySelectorAll(".chip");

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
      const selected = document.querySelectorAll(".chip.selected");
      if (selected.length > 3) {
        chip.classList.remove("selected");
        alert("You can select up to 3 domains only.");
      }
    });
  });

  const questionBank = {
    tech: [
      {
        question: "How do you approach solving technical problems?",
        options: [
          { text: "Break it into logical steps", traits: { tech: 3 } },
          { text: "Experiment until it works", traits: { tech: 2, design: 1 } },
          { text: "Look for existing solutions online", traits: { tech: 1, data: 1 } }
        ]
      },
      {
        question: "What excites you most?",
        options: [
          { text: "Building applications", traits: { tech: 3 } },
          { text: "Fixing bugs", traits: { tech: 2 } },
          { text: "Optimizing systems", traits: { tech: 3, data: 1 } }
        ]
      },
      {
        question: "Which sounds fun?",
        options: [
          { text: "Coding a new feature", traits: { tech: 3 } },
          { text: "Automating tasks", traits: { tech: 2 } },
          { text: "Designing system architecture", traits: { tech: 3 } }
        ]
      },
      {
        question: "How do you learn best?",
        options: [
          { text: "Hands-on coding", traits: { tech: 3 } },
          { text: "Watching tutorials", traits: { tech: 1 } },
          { text: "Reading docs", traits: { tech: 2 } }
        ]
      },
      {
        question: "What would you enjoy building?",
        options: [
          { text: "Web apps", traits: { tech: 3 } },
          { text: "APIs", traits: { tech: 2 } },
          { text: "Backend systems", traits: { tech: 3 } }
        ]
      },
      {
        question: "Your mindset?",
        options: [
          { text: "Structured & logical", traits: { tech: 3 } },
          { text: "Flexible", traits: { tech: 1 } },
          { text: "Analytical", traits: { tech: 2 } }
        ]
      },
      {
        question: "Preferred work?",
        options: [
          { text: "System building", traits: { tech: 3 } },
          { text: "Debugging", traits: { tech: 2 } },
          { text: "Testing", traits: { tech: 1 } }
        ]
      },
      {
        question: "Biggest strength?",
        options: [
          { text: "Problem solving", traits: { tech: 3 } },
          { text: "Focus", traits: { tech: 2 } },
          { text: "Logic", traits: { tech: 3 } }
        ]
      },
      {
        question: "Preferred tools?",
        options: [
          { text: "Code editors", traits: { tech: 3 } },
          { text: "Terminal", traits: { tech: 2 } },
          { text: "Frameworks", traits: { tech: 3 } }
        ]
      },
      {
        question: "Your style?",
        options: [
          { text: "Build from scratch", traits: { tech: 3 } },
          { text: "Use templates", traits: { tech: 1 } },
          { text: "Customize systems", traits: { tech: 2 } }
        ]
      }
    ],

    data: [
      {
        question: "What do you enjoy?",
        options: [
          { text: "Analyzing numbers", traits: { data: 3 } },
          { text: "Finding trends", traits: { data: 3 } },
          { text: "Organizing data", traits: { data: 2 } }
        ]
      },
      {
        question: "Best task?",
        options: [
          { text: "Working with Excel", traits: { data: 3 } },
          { text: "Dashboards", traits: { data: 3 } },
          { text: "SQL queries", traits: { data: 3 } }
        ]
      },
      {
        question: "How do you decide?",
        options: [
          { text: "Using data", traits: { data: 3 } },
          { text: "Logic", traits: { data: 2 } },
          { text: "Experience", traits: { business: 1 } }
        ]
      },
      // ... (full data questions as given)
    ],

    design: [
      // ... (full design questions as given)
    ]
  };

  const careers = [
    {
      type: "tech",
      title: "Software Developer",
      salary: "R30,000 – R75,000",
      desc: "Build applications and scalable systems.",
      skills: ["JavaScript", "React", "Node.js"],
      demand: "High Demand",
      matchScore: 0,
      img: "url('https://images.unsplash.com/photo-1498050108023-c5249f4df085')"
    },
    {
      type: "data",
      title: "Data Analyst",
      salary: "R25,000 – R60,000",
      desc: "Analyze data to drive business decisions.",
      skills: ["SQL", "Excel", "Power BI"],
      demand: "Very High Demand",
      matchScore: 0,
      img: "url('https://images.unsplash.com/photo-1551288049-bebda4e38f71')"
    },
    {
      type: "design",
      title: "UX Designer",
      salary: "R25,000 – R65,000",
      desc: "Design user-friendly digital experiences.",
      skills: ["Figma", "User Research", "Prototyping"],
      demand: "High Demand",
      matchScore: 0,
      img: "url('https://images.unsplash.com/photo-1561070791-2526d30994b5')"
    }
  ];

  let scores = { tech: 0, data: 0, design: 0, business: 0 };
  let selectedDomains = [];

  const generateBtn = document.getElementById("generateBtn");
  const wrapper = document.getElementById("questionnaireWrapper");
  const cards = document.querySelectorAll(".career-card");
  const panelTitle = document.querySelector(".panel-header-row h2");
  const panelDesc = document.querySelector(".description");
  const panelSalary = document.querySelector(".salary-large");
  const panelHero = document.querySelector(".panel-hero");

  function generateQuestions(domains) {
    let final = [];
    domains.forEach((domain) => {
      if (questionBank[domain]) {
        final.push(...questionBank[domain]);
      }
    });
    return final;
  }

  const dynamicQuestions = [];

  generateBtn.addEventListener("click", () => {
    selectedDomains = Array.from(document.querySelectorAll(".chip.selected"))
      .map((chip) => chip.dataset.domain);

    if (selectedDomains.length === 0) {
      alert("Select at least 1 domain.");
      return;
    }

    const q = generateQuestions(selectedDomains);
    if (q.length === 0) {
      alert("No questions found for selected domains.");
      return;
    }

    dynamicQuestions.splice(0, dynamicQuestions.length, ...q);
    currentQIndex = 0;
    scores = { tech: 0, data: 0, design: 0, business: 0 };
    renderQuestion();
  });

  function renderQuestion() {
    const q = dynamicQuestions[currentQIndex];
    if (!q) return;

    wrapper.innerHTML = `
      <div class="quiz-container-modern">
        <div class="quiz-progress-bar">
          <div class="progress-fill" style="width: ${((currentQIndex + 1) / dynamicQuestions.length) * 100}%"></div>
        </div>
        <div class="quiz-question">
          ${q.question}
        </div>
        <div class="quiz-options">
          ${q.options
            .map(
              (opt) => `
            <button class="quiz-option-btn" data='${JSON.stringify(opt.traits)}'>
              <span>${opt.text}</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    document.querySelectorAll(".quiz-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".quiz-option-btn").forEach((b) => {
          b.classList.remove("selected");
        });
        btn.classList.add("selected");
        const traits = JSON.parse(btn.getAttribute("data"));
        for (let t in traits) {
          scores[t] = (scores[t] || 0) + traits[t];
        }

        setTimeout(() => {
          currentQIndex++;
          if (currentQIndex < dynamicQuestions.length) {
            renderQuestion();
          } else {
            showLoading();
          }
        }, 300);
      });
    });
  }

  function showLoading() {
    wrapper.innerHTML = `
      <div class="ai-processing">
        <div class="spinner"></div>
        <h3>Analyzing You...</h3>
        <p>Matching with careers...</p>
      </div>
    `;

    setTimeout(showResults, 2000);
  }

  function showResults() {
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    const topTrait = Object.keys(scores).reduce((a, b) => (scores[a] > scores[b] ? a : b));

    careers.forEach((c) => {
      const traitScore = scores[c.type] || 0;
      c.matchScore = Math.round((traitScore / total) * 100);
    });

    const sortedCareers = [...careers].sort((a, b) => b.matchScore - a.matchScore);

    wrapper.innerHTML = `
      <div class="result-card-pro">
        <div class="result-glow"></div>
        <div class="result-header">
          <span class="ai-badge">AI RESULT</span>
        </div>
        <h2 class="result-main">
          🔥 You are <span>${topTrait.toUpperCase()}</span>
        </h2>
        <p class="result-desc">
          Based on your responses, our AI engine ranked your best-fit careers below.
        </p>
      </div>
    `;

    const grid = document.querySelector(".cards-grid");
    if (grid) {
      grid.innerHTML = "";
      sortedCareers.forEach((career, i) => {
        const card = document.createElement("div");
        card.className = "career-card";
        if (i === 0) card.classList.add("active");
        card.innerHTML = `
          <div class="card-top">
            <h4>${career.title}</h4>
            <span class="match-badge">${career.matchScore}% Match</span>
          </div>
          <div class="salary">${career.salary}<span>/Mo</span></div>
          <div class="skills-tags">
            ${career.skills.map((s) => `<span>${s}</span>`).join("")}
          </div>
          <div class="card-image" style="background-image: ${career.img}"></div>
          <div class="card-footer">
            <span class="demand">${career.demand}</span>
          </div>
        `;
        card.addEventListener("click", () => {
          document.querySelectorAll(".career-card").forEach((c) => c.classList.remove("active"));
          card.classList.add("active");
          updateMainUI(career);
        });
        grid.appendChild(card);
      });

      updateMainUI(sortedCareers[0]);
    }
  }

  function updateMainUI(career) {
    cards.forEach((card) => {
      const title = card.querySelector("h4").textContent;
      if (title === career.title) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });

    panelTitle.textContent = career.title;
    panelDesc.textContent = career.desc;
    panelSalary.innerHTML = career.salary + '<span>/Mo</span>';
    panelHero.style.backgroundImage = career.img;
  }

  // If you want to store this in the backend, uncomment:
  /*
  async function sendCareerScores(scores) {
    await fetch("/api/career-discovery/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores }),
    });
  }
  */
});