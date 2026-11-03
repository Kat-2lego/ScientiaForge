// adminSupport.js: powers AdminSupport.html. Requires adminGuard.js (AdminAPI,
// showToast, escapeHtml, initials, formatRelativeTime, adminReady,
// refreshSupportNavBadge) plus the Chart.js and lucide CDN tags.

(function () {
  "use strict";

  const CATEGORY_ICONS = {
    general_inquiry: "message-circle",
    technical_support: "wrench",
    partnership_business: "briefcase",
    feature_suggestion: "lightbulb",
    feedback: "star",
  };

  const STATUS_LABEL = { open: "Needs reply", answered: "Answered", closed: "Closed" };

  const FEATURE_LABELS = {
    general: "General",
    dashboard: "Dashboard",
    career_discovery: "Career Discovery",
    application_tracker: "Job Tracker",
    cv_analyzer: "CV Analyzer",
    interview_simulator: "Interview Simulator",
    articulation: "Articulation Coach",
    english_coach: "English Coach",
    skill_gap: "Skill Gap Analysis",
    career_pathfinder: "Career Pathfinder",
    study_hub: "Study Hub",
  };

  const THREAD_PAGE_SIZE = 20;
  const RATING_PAGE_SIZE = 8;

  const $ = (id) => document.getElementById(id);

  const state = {
    tab: "inbox",
    category: "",
    status: "",
    search: "",
    page: 1,
    total: 0,
    activeId: null,
    lastMessageId: null,
    ratingDays: 30,
    ratingPage: 1,
    ratingFeature: "",
    ratingValue: "",
    commentsOnly: false,
    ratingsLoaded: false,
  };

  const charts = {};
  let searchTimer = null;

  /* =========================================================
     HELPERS
  ========================================================= */

  const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

  const personName = (user) => (user && (user.name || user.email)) || "Unknown user";

  function formatMsgTime(iso) {
    return new Date(iso).toLocaleString("en-ZA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function shortDay(isoDay) {
    return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-ZA", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  const themeColor = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  function alpha(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  const TOOLTIP = { backgroundColor: "#0f172a", padding: 10, cornerRadius: 8, titleFont: { size: 11 }, bodyFont: { size: 11 } };

  /* =========================================================
     TABS
  ========================================================= */

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".sp-tab").forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    $("tabInbox").hidden = tab !== "inbox";
    $("tabRatings").hidden = tab !== "ratings";

    if (tab === "ratings" && !state.ratingsLoaded) loadRatings();
  }

  /* =========================================================
     CATEGORIES
  ========================================================= */

  function renderCategoryTiles(categories, totals) {
    const tiles = [
      { key: "", label: "All messages", icon: "inbox", total: totals.total, open: totals.open, unread: totals.unread },
      ...categories.map((c) => ({
        key: c.key,
        label: c.label,
        icon: CATEGORY_ICONS[c.key] || "message-circle",
        total: c.total,
        open: c.open,
        unread: c.unread,
      })),
    ];

    $("categoryTiles").innerHTML = tiles
      .map(
        (t) => `
        <button type="button" class="sp-cat-tile ${state.category === t.key ? "active" : ""}" data-category="${escapeHtml(t.key)}">
          <span class="sp-cat-icon"><i data-lucide="${t.icon}"></i></span>
          <span class="sp-cat-text">
            <span class="sp-cat-label">${escapeHtml(t.label)}</span>
            <span class="sp-cat-sub">${t.total} total &middot; ${t.open} need a reply</span>
          </span>
          ${t.unread ? `<span class="sp-badge" title="Unread messages">${t.unread}</span>` : ""}
        </button>`
      )
      .join("");

    const badge = $("inboxBadge");
    badge.textContent = totals.unread > 99 ? "99+" : String(totals.unread);
    badge.hidden = totals.unread <= 0;

    lucide.createIcons();
  }

  async function loadCategories() {
    try {
      const { categories, totals } = await AdminAPI.get("/support/admin/categories");
      renderCategoryTiles(categories, totals);
      if (typeof refreshSupportNavBadge === "function") refreshSupportNavBadge();
    } catch (err) {
      $("categoryTiles").innerHTML = `<div class="table-empty">Could not load categories: ${escapeHtml(err.message)}</div>`;
    }
  }

  /* =========================================================
     THREAD LIST
  ========================================================= */

  function threadItem(t) {
    return `
      <button type="button" class="sp-thread ${t.id === state.activeId ? "active" : ""} ${t.unread ? "unread" : ""}" data-id="${escapeHtml(t.id)}">
        <div class="sp-thread-top">
          <span class="sp-thread-who">${escapeHtml(personName(t.user))}</span>
          <span class="sp-thread-time">${formatRelativeTime(t.lastMessageAt)}</span>
        </div>
        <div class="sp-thread-subject">${escapeHtml(t.subject)}</div>
        <div class="sp-thread-meta">
          <span class="sp-chip">${escapeHtml(t.categoryLabel)}</span>
          <span class="sp-pill ${escapeHtml(t.status)}">${STATUS_LABEL[t.status] || escapeHtml(t.status)}</span>
          ${t.unread ? `<span class="sp-badge">${t.unread}</span>` : ""}
        </div>
      </button>`;
  }

  async function loadThreads() {
    const list = $("threadList");
    try {
      const params = new URLSearchParams({ page: String(state.page), pageSize: String(THREAD_PAGE_SIZE) });
      if (state.category) params.set("category", state.category);
      if (state.status) params.set("status", state.status);
      if (state.search) params.set("search", state.search);

      const result = await AdminAPI.get(`/support/admin/threads?${params.toString()}`);
      state.total = result.total;

      list.innerHTML = result.threads.length
        ? result.threads.map(threadItem).join("")
        : '<div class="table-empty">No conversations match these filters.</div>';

      const totalPages = Math.max(1, Math.ceil(result.total / THREAD_PAGE_SIZE));
      $("threadPageInfo").textContent = `Page ${result.page} of ${totalPages} · ${result.total} conversation${result.total === 1 ? "" : "s"}`;
      $("threadPrev").disabled = state.page <= 1;
      $("threadNext").disabled = state.page >= totalPages;
    } catch (err) {
      list.innerHTML = `<div class="table-empty">Could not load conversations: ${escapeHtml(err.message)}</div>`;
    }
  }

  /* =========================================================
     CHAT
  ========================================================= */

  function renderChatHead(thread) {
    const name = personName(thread.user);
    const email = thread.user?.email || "";
    const closed = thread.status === "closed";

    $("chatHead").innerHTML = `
      <div class="cell-avatar">${escapeHtml(initials((thread.user?.name || "").split(" ")[0], (thread.user?.name || "").split(" ")[1], email))}</div>
      <div class="sp-chat-head-text">
        <div class="sp-chat-head-name">${escapeHtml(name)}</div>
        <div class="sp-chat-head-sub">${escapeHtml(email)}${thread.user?.plan ? ` &middot; ${escapeHtml(thread.user.plan)} plan` : ""}</div>
        <div class="sp-chat-head-tags">
          <span class="sp-chip">${escapeHtml(thread.categoryLabel)}</span>
          <span class="sp-pill ${escapeHtml(thread.status)}">${STATUS_LABEL[thread.status] || escapeHtml(thread.status)}</span>
        </div>
      </div>
      <button type="button" class="btn-chip ${closed ? "promote" : "demote"}" data-action="${closed ? "open" : "closed"}">
        ${closed ? "Reopen" : "Close conversation"}
      </button>`;
  }

  function renderMessages(messages, { forceScroll }) {
    const box = $("chatMessages");
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    let lastAdminIndex = -1;
    messages.forEach((m, i) => {
      if (m.sender === "admin") lastAdminIndex = i;
    });

    box.innerHTML = messages
      .map((m, i) => {
        const seen = i === lastAdminIndex && m.readAt ? " · Seen" : "";
        return `<div class="sp-msg-row ${m.sender}"><div class="sp-msg ${m.sender}"><div class="sp-msg-body">${escapeHtml(m.body)}</div><div class="sp-msg-meta">${escapeHtml(formatMsgTime(m.createdAt))}${seen}</div></div></div>`;
      })
      .join("");

    if (forceScroll || nearBottom) box.scrollTop = box.scrollHeight;
  }

  async function openThread(id, { background = false } = {}) {
    try {
      const data = await AdminAPI.get(`/support/admin/threads/${id}`);
      const lastId = data.messages.length ? data.messages[data.messages.length - 1].id : null;
      const switched = state.activeId !== id;
      const changed = switched || state.lastMessageId !== lastId;

      state.activeId = id;
      state.lastMessageId = lastId;

      $("chatEmpty").hidden = true;
      $("chatBody").hidden = false;
      renderChatHead(data.thread);
      if (changed) renderMessages(data.messages, { forceScroll: switched });

      document.querySelectorAll(".sp-thread").forEach((btn) => {
        const isActive = btn.dataset.id === id;
        btn.classList.toggle("active", isActive);
        if (isActive) {
          btn.classList.remove("unread");
          btn.querySelector(".sp-badge")?.remove();
        }
      });

      if (!background) {
        loadCategories();
        if (window.innerWidth < 960) $("chatPane").scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (err) {
      if (!background) showToast(err.message, "error");
    }
  }

  async function sendReply() {
    const input = $("replyInput");
    const body = input.value.trim();
    if (!body || !state.activeId) return;

    const btn = $("replySend");
    btn.disabled = true;

    try {
      await AdminAPI.post(`/support/admin/threads/${state.activeId}/messages`, { body });
      input.value = "";
      await openThread(state.activeId, { background: true });
      loadCategories();
      loadThreads();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }

  async function setThreadStatus(status) {
    if (!state.activeId) return;
    try {
      await AdminAPI.post(`/support/admin/threads/${state.activeId}/status`, { status });
      showToast(status === "closed" ? "Conversation closed." : "Conversation reopened.", "success");
      await openThread(state.activeId, { background: true });
      loadCategories();
      loadThreads();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  /* =========================================================
     RATINGS
  ========================================================= */

  function destroyCharts() {
    Object.keys(charts).forEach((key) => {
      charts[key].destroy();
      delete charts[key];
    });
  }

  function drawRatingCharts(stats) {
    destroyCharts();

    const primary = themeColor("--primary", "#2563eb");
    const orange = themeColor("--orange", "#f59e0b");
    const green = themeColor("--admin-green", "#16a34a");
    const red = themeColor("--admin-red", "#ef4444");
    const cyan = themeColor("--cyan", "#06b6d4");
    const grid = themeColor("--border-light", "rgba(128, 128, 128, 0.2)");

    const base = { responsive: true, maintainAspectRatio: false };

    charts.dist = new Chart($("ratingDistChart"), {
      type: "bar",
      data: {
        labels: stats.distribution.map((d) => `${d.rating}★`),
        datasets: [
          {
            label: "Ratings",
            data: stats.distribution.map((d) => d.count),
            backgroundColor: [red, orange, "#eab308", green, green].map((c) => alpha(c, 0.78)),
            borderRadius: 6,
            maxBarThickness: 52,
          },
        ],
      },
      options: {
        ...base,
        plugins: { legend: { display: false }, tooltip: TOOLTIP },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: grid } },
        },
      },
    });

    charts.trend = new Chart($("ratingTrendChart"), {
      data: {
        labels: stats.daily.map((d) => shortDay(d.day)),
        datasets: [
          {
            type: "bar",
            label: "Ratings",
            data: stats.daily.map((d) => d.count),
            backgroundColor: alpha(cyan, 0.45),
            borderRadius: 4,
            maxBarThickness: 18,
            yAxisID: "y1",
            order: 2,
          },
          {
            type: "line",
            label: "Average rating",
            data: stats.daily.map((d) => (d.average == null ? null : Number(d.average))),
            borderColor: primary,
            backgroundColor: alpha(primary, 0.12),
            spanGaps: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2.5,
            yAxisID: "y",
            order: 1,
          },
        ],
      },
      options: {
        ...base,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 10, usePointStyle: true, font: { size: 11 } } },
          tooltip: TOOLTIP,
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { position: "left", min: 1, max: 5, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: grid } },
          y1: { position: "right", beginAtZero: true, grid: { display: false }, ticks: { precision: 0, font: { size: 10 } } },
        },
      },
    });

    const features = stats.byFeature;
    charts.feature = new Chart($("ratingFeatureChart"), {
      type: "bar",
      data: {
        labels: features.map((f) => `${FEATURE_LABELS[f.feature] || f.feature} (${f.count})`),
        datasets: [
          {
            label: "Average rating",
            data: features.map((f) => Number(f.average)),
            backgroundColor: features.map((f) => alpha(Number(f.average) >= 4 ? green : Number(f.average) >= 3 ? orange : red, 0.78)),
            borderRadius: 6,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        ...base,
        indexAxis: "y",
        plugins: { legend: { display: false }, tooltip: TOOLTIP },
        scales: {
          x: { min: 0, max: 5, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: grid } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  function renderRatingKpis(stats) {
    const avg = stats.average == null ? null : Number(stats.average);
    $("kpiAvgRating").textContent = avg == null ? "—" : avg.toFixed(2);
    $("kpiAvgStars").textContent = avg == null ? "No ratings yet" : stars(Math.round(avg));
    $("kpiRatingTotal").textContent = Number(stats.total).toLocaleString();

    const shown = stats.prompts?.shown || 0;
    const submitted = stats.prompts?.submitted || 0;
    $("kpiResponseRate").textContent = shown ? `${Math.round((submitted / shown) * 100)}%` : "—";
    $("kpiResponseSub").textContent = shown ? `${submitted} of ${shown} prompts answered` : "No prompts shown yet";

    const low = (stats.distribution[0]?.count || 0) + (stats.distribution[1]?.count || 0);
    $("kpiLowRatings").textContent = String(low);

    $("ratingRangeLabel").textContent = `Last ${stats.days} days (SAST)`;
  }

  function ratingItem(r) {
    return `
      <div class="sp-rating-item">
        <div class="sp-rating-head">
          <span class="sp-stars" aria-label="${r.rating} out of 5">${stars(r.rating)}</span>
          <span class="sp-chip">${escapeHtml(r.featureLabel)}</span>
          <span class="sp-chip">${r.trigger === "random" ? "Random prompt" : "After use"}</span>
          <span class="sp-rating-time">${formatRelativeTime(r.createdAt)}</span>
        </div>
        ${r.comment ? `<div class="sp-rating-comment">${escapeHtml(r.comment)}</div>` : ""}
        <div class="sp-rating-user">${escapeHtml(personName(r.user))}</div>
      </div>`;
  }

  async function loadRatingList() {
    const list = $("ratingList");
    try {
      const params = new URLSearchParams({ page: String(state.ratingPage), pageSize: String(RATING_PAGE_SIZE) });
      if (state.ratingFeature) params.set("feature", state.ratingFeature);
      if (state.ratingValue) params.set("rating", state.ratingValue);
      if (state.commentsOnly) params.set("commentsOnly", "1");

      const result = await AdminAPI.get(`/support/admin/ratings?${params.toString()}`);

      list.innerHTML = result.ratings.length
        ? result.ratings.map(ratingItem).join("")
        : '<div class="table-empty">No ratings match these filters.</div>';

      const totalPages = Math.max(1, Math.ceil(result.total / RATING_PAGE_SIZE));
      $("ratingPageInfo").textContent = `Page ${result.page} of ${totalPages} · ${result.total} rating${result.total === 1 ? "" : "s"}`;
      $("ratingPrev").disabled = state.ratingPage <= 1;
      $("ratingNext").disabled = state.ratingPage >= totalPages;
    } catch (err) {
      list.innerHTML = `<div class="table-empty">Could not load ratings: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadRatings() {
    state.ratingsLoaded = true;
    try {
      const stats = await AdminAPI.get(`/support/admin/ratings/stats?days=${state.ratingDays}`);
      renderRatingKpis(stats);
      drawRatingCharts(stats);
    } catch (err) {
      showToast(`Could not load rating stats: ${err.message}`, "error");
    }
    loadRatingList();
  }

  /* =========================================================
     LIVE REFRESH
  ========================================================= */

  function tick() {
    if (document.hidden || state.tab !== "inbox") return;
    loadCategories();
    loadThreads();
    if (state.activeId) openThread(state.activeId, { background: true });
  }

  /* =========================================================
     INIT
  ========================================================= */

  document.addEventListener("DOMContentLoaded", async () => {
    lucide.createIcons();

    const me = await adminReady;
    if (!me) return; // adminGuard.js already redirected away

    const featureSelect = $("ratingFeatureFilter");
    Object.entries(FEATURE_LABELS).forEach(([key, label]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      featureSelect.appendChild(option);
    });

    document.querySelectorAll(".sp-tab").forEach((btn) =>
      btn.addEventListener("click", () => switchTab(btn.dataset.tab))
    );

    $("categoryTiles").addEventListener("click", (event) => {
      const tile = event.target.closest("[data-category]");
      if (!tile) return;
      state.category = tile.dataset.category;
      state.page = 1;
      document.querySelectorAll(".sp-cat-tile").forEach((t) =>
        t.classList.toggle("active", t.dataset.category === state.category)
      );
      loadThreads();
    });

    $("threadSearch").addEventListener("input", (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = event.target.value.trim();
        state.page = 1;
        loadThreads();
      }, 300);
    });

    $("statusFilter").addEventListener("change", (event) => {
      state.status = event.target.value;
      state.page = 1;
      loadThreads();
    });

    $("threadPrev").addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        loadThreads();
      }
    });
    $("threadNext").addEventListener("click", () => {
      state.page += 1;
      loadThreads();
    });

    $("threadList").addEventListener("click", (event) => {
      const item = event.target.closest(".sp-thread");
      if (item) openThread(item.dataset.id);
    });

    $("chatHead").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn) setThreadStatus(btn.dataset.action);
    });

    $("replySend").addEventListener("click", sendReply);
    $("replyInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        sendReply();
      }
    });

    // Ratings tab controls
    $("ratingRangePresets").querySelectorAll("button[data-days]").forEach((btn) =>
      btn.addEventListener("click", () => {
        $("ratingRangePresets").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.ratingDays = Number(btn.dataset.days);
        loadRatings();
      })
    );

    featureSelect.addEventListener("change", (event) => {
      state.ratingFeature = event.target.value;
      state.ratingPage = 1;
      loadRatingList();
    });
    $("ratingValueFilter").addEventListener("change", (event) => {
      state.ratingValue = event.target.value;
      state.ratingPage = 1;
      loadRatingList();
    });
    $("ratingCommentsOnly").addEventListener("change", (event) => {
      state.commentsOnly = event.target.checked;
      state.ratingPage = 1;
      loadRatingList();
    });
    $("ratingPrev").addEventListener("click", () => {
      if (state.ratingPage > 1) {
        state.ratingPage -= 1;
        loadRatingList();
      }
    });
    $("ratingNext").addEventListener("click", () => {
      state.ratingPage += 1;
      loadRatingList();
    });

    await Promise.all([loadCategories(), loadThreads()]);
    setInterval(tick, 20000);
  });
})();