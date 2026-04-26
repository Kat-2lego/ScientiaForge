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

  let currentType = "hr";
  let currentRole = "any";
  let timeLeft = 0;
  let timerInterval = null;

  // --- Interview type selection ---
  const typeButtons = document.querySelectorAll(".interview-type");
  typeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const type = btn.dataset.type;
      currentType = type;

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
      previewRoleText.textContent = role.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
    });
  });

  // --- Reset button ---
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
    if (recordBtn.classList.contains("recording")) {
      return;
    }

    recordBtn.classList.add("recording");
    recordBtn.innerHTML = '<i class="fa-solid fa-circle"></i><span>Recording...</span>';
    stopBtn.style.display = "inline-flex";

    // mock: add some text after 1s (you’ll replace with real speech‑to‑text later)
    setTimeout(() => {
      transcript.value = "Thank you for the opportunity. I’ve been working on JavaScript and React for the past year...";
    }, 1000);
  });

  stopBtn.addEventListener("click", () => {
    if (!recordBtn.classList.contains("recording")) {
      return;
    }

    recordBtn.classList.remove("recording");
    recordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Record</span>';
    stopBtn.style.display = "none";
  });

  // --- Start interview ---
  startBtn.addEventListener("click", () => {
    // clear previous timer if any
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // 10 minutes for demo (600s)
    timeLeft = 600;
    interviewUI.classList.remove("hidden");
    interviewUI.scrollIntoView({ behavior: "smooth" });

    // simple timer
    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft < 0) {
        timeLeft = 0;
        clearInterval(timerInterval);
        showFeedback();
        return;
      }

      const m = Math.floor(timeLeft / 60).toString().padStart(2, "0");
      const s = (timeLeft % 60).toString().padStart(2, "0");
      timer.textContent = `${m}:${s}`;
    }, 1000);
  });

  // --- Show feedback UI ---
  function showFeedback() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // example scores (you’ll replace with real API data)
    document.querySelector("#feedbackUI .overall-score .score").textContent = "85";
    document.querySelectorAll(".score-badge")[0].querySelector(".score").textContent = "88";
    document.querySelectorAll(".score-badge")[1].querySelector(".score").textContent = "76";
    document.querySelectorAll(".score-badge")[2].querySelector(".score").textContent = "82";

    // simple “high / good / good” labels
    document.querySelectorAll(".score-badge").forEach((badge, i) => {
      const label = i === 0 ? "high" : "good";
      const strong = badge.querySelector("span.label");
      strong.classList.add(label === "high" ? "low" : "good");
      strong.textContent = label;
    });

    // hide interview UI and show feedback
    interviewUI.classList.add("hidden");
    feedbackUI.classList.remove("hidden");
    feedbackUI.scrollIntoView({ behavior: "smooth" });
  }

  // --- Skip / submit buttons (visual only for now) ---
  const skipBtn   = document.getElementById("skipBtn");
  const submitBtn = document.getElementById("submitBtn");

  // could advance questions in a real implementation
  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      // demo: just move progress bar a bit
      const bar = document.querySelector(".bar-fill");
      const width = parseFloat(bar.style.width) || 0;
      if (width < 100) {
        const newWidth = width + 10;
        bar.style.width = Math.min(newWidth, 100) + "%";
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      // show feedback immediately (for demo)
      showFeedback();
    });
  }
});