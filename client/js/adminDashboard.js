// adminDashboard.js — powers Admin.html. Requires adminGuard.js (for
// AdminAPI/showToast/animateCount/formatRelativeTime/activityItemHtml) and
// the Chart.js + lucide CDN tags to already be loaded on the page before
// this script runs.

const charts = {};

// Global date range every date-aware chart shares. Either {days: N} (a
// preset, ending today) or {from, to} (an explicit range from the custom
// date inputs — the same date for both means a single day).
let currentRange = { days: 7 };

function rangeQueryString() {
  if (currentRange.from && currentRange.to) {
    return `from=${currentRange.from}&to=${currentRange.to}`;
  }
  return `days=${currentRange.days}`;
}

function updateDateRangeSummary() {
  const el = document.getElementById("dateRangeSummary");
  if (!el) return;
  el.textContent = currentRange.from
    ? currentRange.from === currentRange.to
      ? `Showing ${currentRange.from}`
      : `Showing ${currentRange.from} to ${currentRange.to}`
    : "";
}

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

const FEATURE_LABELS = {
  interview_simulator: "Interview Simulator",
  cv_analyzer: "CV Analyzer",
  skill_gap: "Skill-Gap Analysis",
  career_discovery: "Career Discovery",
};

const FEATURE_COLORS = ["--primary", "--orange", "--cyan", "--admin-purple"];

function renderFeatureTimelineChart(canvas, days, series) {
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: days.map(formatShortDate),
      datasets: series.map((s, i) => ({
        label: FEATURE_LABELS[s.feature] || s.feature,
        data: s.counts,
        borderColor: cssVar(FEATURE_COLORS[i % FEATURE_COLORS.length]),
        backgroundColor: hexToRgba(cssVar(FEATURE_COLORS[i % FEATURE_COLORS.length]), 0.12),
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "end", labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } },
        tooltip: CHART_TOOLTIP_STYLE,
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: cssVar("--border-light") } },
      },
    },
  });
}

function renderInterviewUsageChart(canvas, days) {
  return new Chart(canvas, {
    data: {
      labels: days.map((d) => formatShortDate(d.day)),
      datasets: [
        {
          type: "bar",
          label: "Completed",
          data: days.map((d) => d.completed),
          backgroundColor: hexToRgba(cssVar("--primary"), 0.65),
          borderRadius: 6,
          maxBarThickness: 22,
          yAxisID: "y",
          order: 2,
        },
        {
          type: "line",
          label: "Avg. duration (min)",
          data: days.map((d) => d.avgDurationMinutes),
          borderColor: cssVar("--orange"),
          backgroundColor: hexToRgba(cssVar("--orange"), 0.12),
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2,
          yAxisID: "y1",
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
        y: { position: "left", beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: cssVar("--border-light") } },
        y1: { position: "right", beginAtZero: true, grid: { display: false }, ticks: { font: { size: 10 } } },
      },
    },
  });
}

function renderAgeBracketChart(canvas, ageBrackets) {
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: ageBrackets.map((b) => b.label),
      datasets: [
        {
          label: "Users",
          data: ageBrackets.map((b) => b.count),
          backgroundColor: hexToRgba(cssVar("--primary"), 0.75),
          borderRadius: 6,
          maxBarThickness: 44,
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

function renderGenderChart(canvas, genders) {
  return new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: genders.map((g) => g.label),
      datasets: [
        {
          data: genders.map((g) => g.count),
          backgroundColor: [cssVar("--primary"), cssVar("--orange"), cssVar("--cyan"), cssVar("--admin-purple")],
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

async function loadCharts() {
  const rq = rangeQueryString();
  updateDateRangeSummary();

  try {
    const [growth, activity, peakHours, featureUsage, featureTimeline, interviewUsage, demographics] = await Promise.all([
      AdminAPI.get(`/admin/stats/growth?${rq}`),
      AdminAPI.get(`/admin/stats/activity?${rq}`),
      AdminAPI.get(`/admin/stats/peak-hours?${rq}`),
      AdminAPI.get("/admin/stats/feature-usage"), // all-time totals — not range-dependent
      AdminAPI.get(`/admin/stats/feature-timeline?${rq}`),
      AdminAPI.get(`/admin/stats/interview-usage?${rq}`),
      AdminAPI.get("/admin/stats/demographics"), // profile data — not range-dependent
    ]);

    if (charts.growth) charts.growth.destroy();
    charts.growth = renderGrowthChart(document.getElementById("growthChart"), growth.days);

    if (charts.activity) charts.activity.destroy();
    charts.activity = renderActivityChart(document.getElementById("activityChart"), activity.days);

    if (charts.peak) charts.peak.destroy();
    charts.peak = renderPeakHoursChart(document.getElementById("peakChart"), peakHours.hours);

    if (charts.featureTimeline) charts.featureTimeline.destroy();
    charts.featureTimeline = renderFeatureTimelineChart(
      document.getElementById("featureTimelineChart"),
      featureTimeline.days,
      featureTimeline.series
    );

    if (charts.interviewUsage) charts.interviewUsage.destroy();
    charts.interviewUsage = renderInterviewUsageChart(
      document.getElementById("interviewUsageChart"),
      interviewUsage.days
    );

    const summaryEl = document.getElementById("interviewUsageSummary");
    if (summaryEl) {
      summaryEl.textContent = interviewUsage.totalCompleted
        ? `${interviewUsage.totalCompleted} completed \u00b7 avg ${interviewUsage.overallAvgMinutes}m`
        : "No completed interviews in this range";
    }

    // All-time totals — only need drawing once, not on every range change.
    if (!charts.feature) {
      charts.feature = renderFeatureUsageChart(document.getElementById("featureChart"), featureUsage);
      const cvEl = document.getElementById("kpiCvAnalyses");
      const ivEl = document.getElementById("kpiInterviews");
      const sgEl = document.getElementById("kpiSkillGap");
      if (cvEl) cvEl.textContent = featureUsage.cvAnalyses.toLocaleString();
      if (ivEl) ivEl.textContent = `${featureUsage.interviewsCompleted}/${featureUsage.interviewsStarted}`;
      if (sgEl) sgEl.textContent = featureUsage.skillGapRuns.toLocaleString();
    }

    if (!charts.ageBracket) {
      charts.ageBracket = renderAgeBracketChart(document.getElementById("ageBracketChart"), demographics.ageBrackets);
      const ageSummaryEl = document.getElementById("ageBracketSummary");
      if (ageSummaryEl) {
        ageSummaryEl.textContent = demographics.totalWithAge
          ? `Most common: ${demographics.mostCommonAgeBracket} \u00b7 ${demographics.totalWithAge} reported`
          : "No data yet";
      }
    }

    if (!charts.gender) {
      charts.gender = renderGenderChart(document.getElementById("genderChart"), demographics.genders);
      const genderSummaryEl = document.getElementById("genderSummary");
      if (genderSummaryEl) {
        genderSummaryEl.textContent = demographics.totalWithGender
          ? `${demographics.totalWithGender} reported`
          : "No data yet";
      }
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
  loadCharts();
  loadActivityFeed();

  const presetsContainer = document.getElementById("dateRangePresets");
  const fromInput = document.getElementById("dateRangeFrom");
  const toInput = document.getElementById("dateRangeTo");
  const applyBtn = document.getElementById("applyDateRange");

  if (presetsContainer) {
    presetsContainer.querySelectorAll("button[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        presetsContainer.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (fromInput) fromInput.value = "";
        if (toInput) toInput.value = "";
        currentRange = { days: Number(btn.dataset.preset) };
        loadCharts();
      });
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const from = fromInput?.value;
      const to = toInput?.value;

      if (!from || !to) {
        showToast("Pick both a start and end date first.", "error");
        return;
      }

      presetsContainer?.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      currentRange = { from, to };
      loadCharts();
    });
  }

  // Keep "online now" fresh-ish without hammering the server.
  setInterval(loadOverview, 20000);
  setInterval(loadActivityFeed, 30000);
});