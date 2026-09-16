// adminDashboard.js — powers Admin.html. Requires adminGuard.js (for
// AdminAPI/showToast/animateCount/formatRelativeTime) and the Chart.js +
// lucide CDN tags to already be loaded on the page before this script runs.

const charts = {};

/* =========================================================
   SMALL HELPERS
========================================================= */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatShortDate(isoDay) {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString("en-ZA", { month: "short", day: "numeric", timeZone: "UTC" });
}

function setKpi(id, value) {
  const el = document.getElementById(id);
  if (el) animateCount(el, value || 0);
}

function setDelta(id, percent) {
  const el = document.getElementById(id);
  if (!el) return;
  const sign = percent > 0 ? "+" : "";
  el.textContent = `${sign}${percent}% vs last week`;
  el.className = `stat-delta ${percent > 0 ? "positive" : percent < 0 ? "negative" : "neutral"}`;
}

const CHART_TOOLTIP_STYLE = { backgroundColor: "#0f172a", padding: 10, cornerRadius: 8, titleFont: { size: 11 }, bodyFont: { size: 11 } };

/* =========================================================
   CHART RENDERERS
========================================================= */

function renderGrowthChart(canvas, days) {
  const primary = cssVar("--primary");
  const cyan = cssVar("--cyan");

  return new Chart(canvas, {
    data: {
      labels: days.map((d) => formatShortDate(d.day)),
      datasets: [
        {
          type: "bar",
          label: "New signups",
          data: days.map((d) => d.newUsers),
          backgroundColor: hexToRgba(cyan, 0.55),
          borderRadius: 6,
          maxBarThickness: 22,
          yAxisID: "y1",
          order: 2,
        },
        {
          type: "line",
          label: "Total users",
          data: days.map((d) => d.cumulativeUsers),
          borderColor: primary,
          backgroundColor: hexToRgba(primary, 0.12),
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2.5,
          yAxisID: "y",
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "end", labels: { boxWidth: 10, usePointStyle: true, font: { size: 11 } } },
        tooltip: CHART_TOOLTIP_STYLE,
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { position: "left", grid: { color: cssVar("--border-light") }, ticks: { font: { size: 10 } } },
        y1: { position: "right", grid: { display: false }, ticks: { font: { size: 10 }, precision: 0 } },
      },
    },
  });
}

function renderActivityChart(canvas, days) {
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: days.map((d) => formatShortDate(d.day)),
      datasets: [
        {
          label: "Active users",
          data: days.map((d) => d.activeUsers),
          backgroundColor: hexToRgba(cssVar("--primary"), 0.75),
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: CHART_TOOLTIP_STYLE },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: cssVar("--border-light") } },
      },
    },
  });
}

function renderFeatureUsageChart(canvas, usage) {
  return new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["CV Analyses", "Interviews Completed", "Skill-Gap Runs"],
      datasets: [
        {
          data: [usage.cvAnalyses, usage.interviewsCompleted, usage.skillGapRuns],
          backgroundColor: [cssVar("--primary"), cssVar("--orange"), cssVar("--cyan")],
          borderWidth: 0,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true, font: { size: 11 }, padding: 14 } },
        tooltip: CHART_TOOLTIP_STYLE,
      },
    },
  });
}

function renderPeakHoursChart(canvas, hours) {
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: hours.map((h) => `${h.hour}:00`),
      datasets: [
        {
          label: "Sessions",
          data: hours.map((h) => h.sessions),
          backgroundColor: hexToRgba(cssVar("--orange"), 0.75),
          borderRadius: 4,
          maxBarThickness: 16,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: CHART_TOOLTIP_STYLE },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: cssVar("--border-light") } },
      },
    },
  });
}

/* =========================================================
   ACTIVITY FEED
========================================================= */

function renderActivityFeed(container, entries) {
  if (!entries.length) {
    container.innerHTML = '<div class="table-empty">No activity recorded yet.</div>';
    return;
  }

  container.innerHTML = entries.map(activityItemHtml).join("");
  lucide.createIcons();
}

/* =========================================================
   DATA LOADING
========================================================= */

async function loadOverview() {
  try {
    const stats = await AdminAPI.get("/admin/stats/overview");

    setKpi("kpiTotalUsers", stats.totalUsers);
    setKpi("kpiOnlineNow", stats.onlineNow);
    setKpi("kpiNewWeek", stats.newThisWeek);

    const avgEl = document.getElementById("kpiAvgSession");
    if (avgEl) avgEl.textContent = stats.avgSessionMinutes ? `${stats.avgSessionMinutes}m` : "—";

    const delta = stats.newLastWeek > 0
      ? Math.round(((stats.newThisWeek - stats.newLastWeek) / stats.newLastWeek) * 100)
      : stats.newThisWeek > 0 ? 100 : 0;
    setDelta("kpiNewWeekDelta", delta);

    const adminsEl = document.getElementById("kpiTotalAdmins");
    if (adminsEl) adminsEl.textContent = stats.totalAdmins;
  } catch (err) {
    console.error("overview load failed:", err.message);
  }
}

async function loadCharts(days) {
  try {
    const [growth, activity, peakHours, featureUsage] = await Promise.all([
      AdminAPI.get(`/admin/stats/growth?days=${days}`),
      AdminAPI.get("/admin/stats/activity?days=14"),
      AdminAPI.get("/admin/stats/peak-hours"),
      AdminAPI.get("/admin/stats/feature-usage"),
    ]);

    if (charts.growth) charts.growth.destroy();
    charts.growth = renderGrowthChart(document.getElementById("growthChart"), growth.days);

    if (!charts.activity) {
      charts.activity = renderActivityChart(document.getElementById("activityChart"), activity.days);
    }

    if (!charts.feature) {
      charts.feature = renderFeatureUsageChart(document.getElementById("featureChart"), featureUsage);
      const cvEl = document.getElementById("kpiCvAnalyses");
      const ivEl = document.getElementById("kpiInterviews");
      const sgEl = document.getElementById("kpiSkillGap");
      if (cvEl) cvEl.textContent = featureUsage.cvAnalyses.toLocaleString();
      if (ivEl) ivEl.textContent = `${featureUsage.interviewsCompleted}/${featureUsage.interviewsStarted}`;
      if (sgEl) sgEl.textContent = featureUsage.skillGapRuns.toLocaleString();
    }

    if (!charts.peak) {
      charts.peak = renderPeakHoursChart(document.getElementById("peakChart"), peakHours.hours);
    }
  } catch (err) {
    console.error("charts load failed:", err.message);
    showToast("Could not load some dashboard charts.", "error");
  }
}

async function loadActivityFeed() {
  const container = document.getElementById("activityFeed");
  if (!container) return;

  try {
    const result = await AdminAPI.get("/admin/audit-log?pageSize=12");
    if (result.unavailable) {
      container.innerHTML = `<div class="table-empty">${escapeHtml(result.note || "Live activity isn't available yet.")}</div>`;
      return;
    }
    renderActivityFeed(container, result.entries);
  } catch (err) {
    container.innerHTML = '<div class="table-empty">Could not load recent activity.</div>';
  }
}

/* =========================================================
   INIT
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();

  const me = await adminReady;
  if (!me) return; // adminGuard.js already redirected away

  loadOverview();
  loadCharts(30);
  loadActivityFeed();

  document.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-range]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadCharts(Number(btn.dataset.range));
    });
  });

  // Keep "online now" fresh-ish without hammering the server.
  setInterval(loadOverview, 20000);
  setInterval(loadActivityFeed, 30000);
});