document.addEventListener("DOMContentLoaded", () => {

  /* ================= ELEMENTS ================= */
  lucide.createIcons();

  const searchInput = document.getElementById("searchInput");
  const emptyState = document.getElementById("emptyState");
  const sections = document.querySelectorAll(".searchable");

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

  /* ================= SEARCH ================= */
  // Local, in-page filtering of this dashboard's own cards/panels by their
  // data-search text. (Site-wide search is a separate, later piece of work.)

  if (searchInput) {

    searchInput.addEventListener("input", () => {

      const value = searchInput.value.toLowerCase();

      let visible = 0;

      sections.forEach(sec => {

        const match =
          sec.textContent.toLowerCase().includes(value);

        sec.style.display = match ? "" : "none";

        if (match) visible++;

      });

      if (emptyState) {
        emptyState.classList.toggle(
          "hidden",
          visible !== 0
        );
      }

    });

  }

  /* ================= PLANNER SHORTCUTS ================= */
  // The hero's "+ Add Goal" button and the Upcoming panel's CTA both just
  // open the real planner (the same one behind the calendar icon) instead
  // of running their own separate, disconnected reminder system.

  function openPlanner() {
    document.getElementById("plannerBtn")?.click();
  }

  function openPlannerAsGoal() {
    openPlanner();

    const typeField = document.querySelector('#plannerEventForm [name="type"]');
    if (typeField && typeField.value !== "goal") {
      typeField.value = "goal";
      typeField.dispatchEvent(new Event("change"));
    }
  }

  document
    .querySelector(".hero-actions .btn-primary")
    ?.addEventListener("click", openPlannerAsGoal);

  document
    .getElementById("upcomingActionBtn")
    ?.addEventListener("click", openPlanner);

  /* ================= DASHBOARD DATA ================= */
  // dashboard.js is shared with a couple of other pages that don't have
  // these stat cards — only fetch the summary where there's somewhere to
  // put it.
  if (document.getElementById("statCvScore")) {
    loadDashboardSummary();
  }

});

/* =========================================================
   GREETING
========================================================= */

async function loadUserGreeting() {
  const token = localStorage.getItem("sb-access-token");
  if (!token) return window.location.href = "/pages/LogIn.html";

  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return window.location.href = "/pages/LogIn.html";

    const { firstName, email } = await res.json();

    const nameEl = document.getElementById("greeting-name");
    if (nameEl) nameEl.textContent = firstName;

    const profileName = document.querySelector(".profile-name");
    if (profileName) profileName.textContent = firstName;

    const profileEmail = document.querySelector(".profile-email");
    if (profileEmail) profileEmail.textContent = email;
  } catch (err) {
    console.error("Failed to load user:", err);
  }
}

/* =========================================================
   DASHBOARD SUMMARY — real numbers, not placeholders
   Pulls from /api/dashboard/summary (CV analyses, interview
   sessions, skill-gap runs, planner goals/reminders and feature
   usage) and fills in every stat, chart and recommendation on
   the page from it.
========================================================= */

async function loadDashboardSummary() {
  const token = localStorage.getItem("sb-access-token");
  if (!token) return window.location.href = "/pages/LogIn.html";

  try {
    const res = await fetch("/api/dashboard/summary", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      window.location.href = "/pages/LogIn.html";
      return;
    }

    if (!res.ok) {
      throw new Error("Could not load dashboard data.");
    }

    const data = await res.json();
    renderDashboardSummary(data);
  } catch (err) {
    console.error("Dashboard summary error:", err);
    showDashboardLoadError();
  }
}

function showDashboardLoadError() {
  document.querySelectorAll(".stat-change").forEach((el) => {
    el.textContent = "Couldn't load";
    el.className = "stat-change";
  });

  const recommendList = document.getElementById("recommendList");
  if (recommendList) {
    recommendList.innerHTML = `
      <div class="list-card">
        <div class="list-left"><i data-lucide="wifi-off"></i> Couldn't load your progress — refresh to try again</div>
      </div>`;
    window.lucide?.createIcons();
  }

  const upcomingTitle = document.getElementById("upcomingTitle");
  if (upcomingTitle) upcomingTitle.textContent = "Couldn't load your planner";

  const upcomingWhen = document.getElementById("upcomingWhen");
  if (upcomingWhen) upcomingWhen.textContent = "Refresh to try again";
}

function renderDashboardSummary(data) {
  const { cv, interview, skillGap, goals, upcoming, activity, readinessPercent } = data;

  /* ---- CV Score ---- */
  setText("statCvScore", cv.hasAnalysis ? `${cv.score}` : "—");
  renderStatChange("statCvChange", {
    current: cv.score,
    previous: cv.previousScore,
    emptyText: "Upload your CV to get started",
    suffix: "since last upload",
  });
  renderSparkline("statCvChart", cv.history);

  /* ---- Interview Score ---- */
  setText("statInterviewScore", interview.hasSession ? `${interview.score}` : "—");
  renderStatChange("statInterviewChange", {
    current: interview.score,
    previous: interview.previousScore,
    emptyText: "Practice a mock interview to get started",
    suffix: "since last session",
  });
  renderSparkline("statInterviewChart", interview.history);

  /* ---- Skill Readiness ---- */
  setText("statSkillReadiness", skillGap.hasRun ? `${skillGap.matchScore}%` : "—");
  renderStatChange("statSkillChange", {
    current: skillGap.matchScore,
    previous: skillGap.previousMatchScore,
    emptyText: "Run a skill-gap analysis to get started",
    suffix: "since last check",
  });
  renderSparkline("statSkillChart", skillGap.history);

  /* ---- Activities ---- */
  setText("statActivity", `${activity.thisMonth}`);
  renderActivityChange("statActivityChange", activity);
  renderSparkline("statActivityChart", activity.recentWeeks);

  /* ---- Recommendations ---- */
  renderRecommendations({ cv, interview, skillGap });

  /* ---- Upcoming ---- */
  renderUpcoming(upcoming);

  /* ---- Goal completion ---- */
  setText("goalCompletionPercent", goals.total ? `${goals.completionPercent}%` : "—");
  setText(
    "goalCompletionCount",
    goals.total ? `${goals.completed} of ${goals.total} Career Goals` : "No career goals yet"
  );

  /* ---- Career readiness gauge ---- */
  setText("readinessValue", readinessPercent !== null ? `${readinessPercent}%` : "—");
  const ring = document.getElementById("readinessRing");
  if (ring) {
    const pct = readinessPercent ?? 0;
    const deg = Math.max(0, Math.min(360, (pct / 100) * 360));
    ring.style.background = `conic-gradient(var(--primary) ${deg}deg, #dfe7f6 ${deg}deg)`;
  }

  /* ---- Metrics row ---- */
  setText("metricInterviewsCompleted", `${interview.totalCompleted}`);
  setText("metricCvsAnalyzed", `${cv.totalAnalyzed}`);
}

/* ---------------- helpers ---------------- */

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderStatChange(id, { current, previous, emptyText, suffix }) {
  const el = document.getElementById(id);
  if (!el) return;

  if (current === null || current === undefined) {
    el.textContent = emptyText;
    el.className = "stat-change";
    return;
  }

  if (previous === null || previous === undefined) {
    el.textContent = "First result — nice start";
    el.className = "stat-change positive";
    return;
  }

  const delta = current - previous;
  el.className = "stat-change" + (delta > 0 ? " positive" : delta < 0 ? " negative" : "");
  el.textContent =
    delta === 0 ? `No change ${suffix}` : `${delta > 0 ? "+" : ""}${delta} ${suffix}`;
}

function renderActivityChange(id, activity) {
  const el = document.getElementById(id);
  if (!el) return;

  const { thisMonth, lastMonth } = activity;

  if (!thisMonth && !lastMonth) {
    el.textContent = "No activity yet this month";
    el.className = "stat-change";
    return;
  }

  if (!lastMonth) {
    el.textContent = `+${thisMonth} this month`;
    el.className = "stat-change positive";
    return;
  }

  const delta = thisMonth - lastMonth;
  el.className = "stat-change" + (delta > 0 ? " positive" : delta < 0 ? " negative" : "");
  el.textContent = delta === 0 ? "Same as last month" : `${delta > 0 ? "+" : ""}${delta} vs last month`;
}

function renderSparkline(id, values) {
  const container = document.getElementById(id);
  if (!container) return;

  container.innerHTML = "";
  const points = (values || []).filter((v) => typeof v === "number" && Number.isFinite(v));

  if (!points.length) {
    for (let i = 0; i < 5; i += 1) {
      const span = document.createElement("span");
      span.style.height = "6px";
      container.appendChild(span);
    }
    return;
  }

  if (points.length === 1) {
    const span = document.createElement("span");
    span.style.height = `${Math.max(8, Math.round((points[0] / 100) * 36))}px`;
    container.appendChild(span);
    return;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  points.forEach((value) => {
    const span = document.createElement("span");
    const ratio = (value - min) / range;
    span.style.height = `${Math.round(8 + ratio * 28)}px`;
    container.appendChild(span);
  });
}

function renderRecommendations({ cv, interview, skillGap }) {
  const container = document.getElementById("recommendList");
  if (!container) return;

  const items = [];

  if (!cv.hasAnalysis) {
    items.push({ icon: "file-up", text: "Upload your CV for an ATS score", href: "cvDashboard.html" });
  } else if (cv.score < 70) {
    items.push({ icon: "pencil-line", text: "Optimize your CV — your ATS score is below 70", href: "cvDashboard.html" });
  }

  if (!interview.hasSession) {
    items.push({ icon: "mic", text: "Practice your first mock interview", href: "InterviewSimulator.html" });
  } else if (interview.score < 70) {
    items.push({ icon: "mic", text: "Keep practicing — your interview readiness is below 70", href: "InterviewSimulator.html" });
  }

  if (!skillGap.hasRun) {
    items.push({ icon: "badge-check", text: "Run a skill-gap analysis to see what to learn next", href: "SkillGapAnalysis.html" });
  } else if (skillGap.missingCount) {
    items.push({
      icon: "badge-check",
      text: `Close ${skillGap.missingCount} skill gap${skillGap.missingCount === 1 ? "" : "s"} for your target role`,
      href: "SkillGapAnalysis.html",
    });
  }

  items.push({ icon: "compass", text: "Explore career paths that match your profile", href: "CareerDiscovery.html" });

  const shown = items.slice(0, 3);

  container.innerHTML = shown
    .map(
      (item) => `
        <a class="list-card" href="${item.href}">
          <div class="list-left"><i data-lucide="${item.icon}"></i> ${item.text}</div>
          <i data-lucide="chevron-right"></i>
        </a>`
    )
    .join("");

  window.lucide?.createIcons();
}

function formatUpcomingWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderUpcoming(upcoming) {
  const title = document.getElementById("upcomingTitle");
  const when = document.getElementById("upcomingWhen");
  const btn = document.getElementById("upcomingActionBtn");
  if (!title || !when || !btn) return;

  if (!upcoming) {
    title.textContent = "Nothing on your planner yet";
    when.textContent = "Add a reminder or goal to stay on track";
    btn.textContent = "Add a Reminder or Goal";
    return;
  }

  const typeLabel = upcoming.type === "goal" ? "Goal" : "Reminder";
  const whenLabel = formatUpcomingWhen(upcoming.when);

  title.textContent = upcoming.title;
  when.textContent = upcoming.isOverdue
    ? `${typeLabel} · Overdue, was due ${whenLabel}`
    : `${typeLabel} · ${whenLabel}`;
  btn.textContent = "Open Planner";
}

loadUserGreeting();
