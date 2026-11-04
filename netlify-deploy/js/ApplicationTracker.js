(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const STATUSES = ["saved", "applied", "interview", "offer", "rejected"];
  const STATUS_LABEL = {
    saved: "Saved",
    applied: "Applied",
    interview: "Interview",
    offer: "Offer",
    rejected: "Rejected",
  };

  const state = {
    applications: [],
    detailId: null,
    addMode: "description",
  };

  /* ================= AUTH ================= */

  function authToken() {
    return localStorage.getItem("sb-access-token") || null;
  }

  function authHeaders() {
    if (window.getAuthHeaders) return window.getAuthHeaders();
    const token = authToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function api(path, options) {
    const token = authToken();
    if (!token) {
      window.location.href = "LogIn.html";
      throw new Error("Not logged in.");
    }

    const response = await fetch("/api/applications" + path, {
      ...(options || {}),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...((options && options.headers) || {}),
      },
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      /* no body */
    }

    if (response.status === 401) {
      window.location.href = "LogIn.html";
      throw new Error("Session expired.");
    }

    if (!response.ok) {
      const error = new Error((body && body.error) || "Something went wrong.");
      error.code = body && body.code;
      error.status = response.status;
      throw error;
    }

    return body;
  }

  async function loadUserGreeting() {
    const token = authToken();
    if (!token) return;
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const { firstName, email } = await res.json();
      const name = $(".profile-name");
      if (name) name.textContent = firstName || "";
      const mail = $(".profile-email");
      if (mail) mail.textContent = email || "";
    } catch (err) {
      console.error("Failed to load user:", err);
    }
  }

  /* ================= SIDEBAR ================= */

  function setupSidebar() {
    const menuBtn = $("#menuBtn");
    const sidebar = $("#sidebar");
    const overlay = $("#sidebarOverlay");
    if (!menuBtn || !sidebar) return;

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

    menuBtn.addEventListener("click", () => {
      sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });
    overlay?.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) closeSidebar();
    });
    sidebar.querySelectorAll(".nav-item").forEach((link) => {
      link.addEventListener("click", () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) closeSidebar();
    });
  }

  /* ================= SEARCH (filters cards by title/company) ================= */

  function setupSearch() {
    const input = $("#searchInput");
    if (!input) return;
    input.addEventListener("input", () => {
      renderBoard(input.value.trim().toLowerCase());
    });
  }

  /* ================= HELPERS ================= */

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function matchRingClass(score) {
    if (typeof score !== "number") return "";
    if (score >= 70) return "ring-high";
    if (score >= 40) return "ring-mid";
    return "ring-low";
  }

  function deadlineInfo(deadline) {
    if (!deadline) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(deadline + "T00:00:00");
    if (Number.isNaN(due.getTime())) return null;
    const diffDays = Math.round((due - today) / 86_400_000);

    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, cls: "deadline-urgent" };
    if (diffDays === 0) return { text: "Due today", cls: "deadline-urgent" };
    if (diffDays <= 3) return { text: `${diffDays}d left`, cls: "deadline-urgent" };
    if (diffDays <= 7) return { text: `${diffDays}d left`, cls: "deadline-soon" };
    return { text: `${diffDays}d left`, cls: "deadline-ok" };
  }

  function findApplication(id) {
    return state.applications.find((a) => a.id === id);
  }

  /* ================= LOAD ================= */

  async function loadApplications() {
    const data = await api("/");
    state.applications = data.applications || [];
    renderBoard();
  }

  document.addEventListener("application:updated", async () => {
  await loadApplications();
  await loadInsights();
});
  async function loadQuota() {
    const strip = $("#quotaStrip");
    if (!strip) return;
    try {
      const usage = await api("/quota");
      if (usage.unlimited) {
        strip.textContent = `${usage.planName} plan - unlimited job analyses`;
        strip.className = "quota-strip";
        return;
      }
      const remaining = Math.max(0, usage.limit - usage.used);
      strip.textContent = `${usage.used} of ${usage.limit} job analyses used this month (${usage.planName} plan)`;
      strip.className =
        "quota-strip" + (remaining === 0 ? " quota-blocked" : remaining <= 1 ? " quota-warning" : "");
    } catch {
      strip.classList.add("hidden");
    }
  }

  async function loadInsights() {
    const statsEl = $("#insightsStats");
    const extraEl = $("#insightsExtra");
    try {
      const data = await api("/insights");

      if (!data.ready) {
        statsEl?.classList.add("hidden");
        extraEl?.classList.add("hidden");
        return;
      }
      statsEl?.classList.remove("hidden");
      extraEl?.classList.remove("hidden");

      setText("#statTotal", data.total);
      setText("#statInterviews", data.interviews);
      setText("#statOffers", data.offers);
      setText("#statResponseRate", data.responseRate === null ? "—" : `${data.responseRate}%`);
      setText("#statTotalSub", `${data.applied} applied`);
      setText("#statInterviewsSub", data.interviews ? "Moving forward" : "None yet");
      setText("#statOffersSub", data.offers ? "Nice work" : "Keep going");
      setText(
        "#statResponseRateSub",
        data.responseRate === null ? "Apply to see this" : "of applications reach an interview"
      );

      renderMatchByCategory(data.matchByCategory || []);
      renderTopMissingSkill(data.topMissingSkill);
    } catch {
      statsEl?.classList.add("hidden");
      extraEl?.classList.add("hidden");
    }
  }

  function setText(sel, text) {
    const el = $(sel);
    if (el) el.textContent = text;
  }

  function renderMatchByCategory(rows) {
    const el = $("#matchByCategory");
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<p class="insights-empty">Match scores will show up here once your jobs have a category.</p>';
      return;
    }
    el.innerHTML = rows
      .slice(0, 6)
      .map(
        (row) => `
        <div class="category-row">
          <span class="category-label">${escapeHtml(row.category)}</span>
          <span class="category-bar-track"><span class="category-bar-fill" style="width:${row.averageMatch}%"></span></span>
          <span class="category-pct">${row.averageMatch}%</span>
        </div>`
      )
      .join("");
  }

  function renderTopMissingSkill(top) {
    const el = $("#topMissingSkill");
    if (!el) return;
    if (!top) {
      el.innerHTML = '<p class="insights-empty">No recurring skill gaps yet - nice.</p>';
      return;
    }
    el.innerHTML = `
      <div class="missing-skill-hero">
        <div class="missing-skill-icon"><i data-lucide="alert-triangle"></i></div>
        <div>
          <div class="missing-skill-name">${escapeHtml(top.skill)}</div>
          <div class="missing-skill-sub">Missing from ${top.count} job${top.count === 1 ? "" : "s"} you're tracking</div>
        </div>
      </div>
      <p class="insights-empty" style="margin-top:10px;">
        <a href="SkillGapAnalysis.html">Check your Skill Gap Analysis</a> or
        <a href="StudyHub.html">browse Study Hub</a> to close it.
      </p>`;
    window.lucide?.createIcons();
  }

  /* ================= BOARD ================= */

  function cardHtml(app) {
    const ring = matchRingClass(app.matchScore);
    const ringValue = typeof app.matchScore === "number" ? `${app.matchScore}%` : "—";
    const deadline = deadlineInfo(app.deadline);

    return `
      <article class="app-card" draggable="true" data-id="${app.id}" tabindex="0" role="button"
                aria-label="${escapeHtml(app.jobTitle)}, open details">
        <div class="app-card-top">
          <div class="match-ring ${ring}"><span>${ringValue}</span></div>
          <div class="app-card-title">
            <h4>${escapeHtml(app.jobTitle)}</h4>
            <p>${escapeHtml(app.company || "Unknown company")}</p>
          </div>
        </div>
        <div class="app-card-meta">
          ${deadline ? `<span class="deadline-chip ${deadline.cls}"><i data-lucide="clock"></i>${deadline.text}</span>` : ""}
          ${app.roleCategory ? `<span class="role-chip">${escapeHtml(app.roleCategory)}</span>` : ""}
        </div>
        <div class="app-card-footer">
          <select class="app-move-select" data-move-id="${app.id}" aria-label="Move ${escapeHtml(app.jobTitle)} to">
            ${STATUSES.map((s) => `<option value="${s}" ${s === app.status ? "selected" : ""}>Move to ${STATUS_LABEL[s]}</option>`).join("")}
          </select>
        </div>
      </article>`;
  }

  function renderBoard(filterText) {
    const filtered = filterText
      ? state.applications.filter((a) =>
          `${a.jobTitle} ${a.company || ""}`.toLowerCase().includes(filterText)
        )
      : state.applications;

    const empty = $("#emptyState");
    if (empty) empty.classList.toggle("hidden", !filterText || filtered.length > 0);

    STATUSES.forEach((status) => {
      const zone = $(`#column${capitalize(status)}`);
      const count = $(`#count${capitalize(status)}`);
      const rows = filtered.filter((a) => a.status === status);
      if (count) count.textContent = rows.length;
      if (!zone) return;

      zone.innerHTML = rows.length
        ? rows.map(cardHtml).join("")
        : `<p class="kanban-empty-hint">${filterText ? "No matches here." : "Nothing here yet."}</p>`;
    });

    window.lucide?.createIcons();
    bindCardEvents();

    const boardEmpty = $("#boardEmpty");
    const board = $("#kanbanBoard");
    const noneAtAll = state.applications.length === 0;
    boardEmpty?.classList.toggle("hidden", !noneAtAll);
    board?.classList.toggle("hidden", noneAtAll);
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function bindCardEvents() {
    $$(".app-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".app-move-select")) return;
        openDetail(card.dataset.id);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail(card.dataset.id);
        }
      });
      card.addEventListener("dragstart", (e) => {
        card.classList.add("dragging");
        e.dataTransfer.setData("text/plain", card.dataset.id);
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
    });

    $$(".app-move-select").forEach((select) => {
      select.addEventListener("click", (e) => e.stopPropagation());
      select.addEventListener("change", () => {
        updateStatus(select.dataset.moveId, select.value);
      });
    });

    $$(".kanban-dropzone").forEach((zone) => {
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain");
        if (id) updateStatus(id, zone.dataset.status);
      });
    });
  }

  async function updateStatus(id, status) {
    const app = findApplication(id);
    if (!app || app.status === status) return;
    const previous = app.status;
    app.status = status; // optimistic
    renderBoard($("#searchInput")?.value.trim().toLowerCase());

    try {
      const data = await api(`/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      Object.assign(app, fromApi(data.application));
      loadInsights();
    } catch (error) {
      app.status = previous; // revert
      renderBoard();
      alert(error.message || "Couldn't move that card. Please try again.");
    }
  }

  function fromApi(application) {
    return application;
  }

  /* ================= ADD JOB ================= */

  function setupAddJobModal() {
    const overlay = $("#addJobOverlay");
    const openBtns = [$("#addJobBtn"), $("#boardEmptyAddBtn")].filter(Boolean);
    const closeBtn = $("#closeAddJobBtn");
    const form = $("#addJobForm");
    const message = $("#addJobMessage");
    const submitBtn = $("#addJobSubmit");
    if (!overlay || !form) return;

    function open() {
      overlay.classList.remove("hidden");
      message.textContent = "";
      message.className = "add-job-message";
      form.reset();
      $('textarea[name="jobDescription"]')?.focus();
    }
    function close() {
      overlay.classList.add("hidden");
    }

    openBtns.forEach((btn) => btn.addEventListener("click", open));
    closeBtn?.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) close();
    });

    $$(".add-job-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        state.addMode = tab.dataset.mode;
        $$(".add-job-tab").forEach((t) => {
          t.classList.toggle("active", t === tab);
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        });
        $$(".add-job-field").forEach((field) => {
          field.classList.toggle("hidden", field.dataset.modeField !== state.addMode);
        });
      });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const jobDescription = $('textarea[name="jobDescription"]').value.trim();
      const jobUrl = $('input[name="jobUrl"]').value.trim();

      if (state.addMode === "description" && jobDescription.length < 100) {
        message.textContent = "Paste a bit more of the job description (at least 100 characters).";
        message.className = "add-job-message is-error";
        return;
      }
      if (state.addMode === "url" && !jobUrl) {
        message.textContent = "Paste a job posting link.";
        message.className = "add-job-message is-error";
        return;
      }

      submitBtn.disabled = true;
      message.textContent = "Reading the posting and matching it to your CV...";
      message.className = "add-job-message is-loading";

      try {
        const payload =
          state.addMode === "description" ? { jobDescription } : { jobUrl };
        const data = await api("/", { method: "POST", body: JSON.stringify(payload) });

        state.applications.unshift(data.application);
        renderBoard();
        loadInsights();
        loadQuota();
        close();
        markOnboardingSeen();
      } catch (error) {
        if (error.code === "NO_CV") {
          message.innerHTML =
            'Upload your CV first so jobs can be matched against it. <a href="cvDashboard.html">Go to CV Analyzer</a>';
        } else {
          message.textContent = error.message || "Couldn't add that job. Please try again.";
        }
        message.className = "add-job-message is-error";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ================= DETAIL MODAL ================= */

  function setupDetailModal() {
    const overlay = $("#detailOverlay");
    const closeBtn = $("#closeDetailBtn");
    if (!overlay) return;

    closeBtn?.addEventListener("click", closeDetail);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDetail();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeDetail();
    });

    $("#detailStatusSelect")?.addEventListener("change", (e) => {
      if (state.detailId) updateStatus(state.detailId, e.target.value);
    });

    $("#saveNotesBtn")?.addEventListener("click", async () => {
      if (!state.detailId) return;
      const notes = $("#detailNotes").value;
      try {
        const data = await api(`/${state.detailId}/notes`, {
          method: "PATCH",
          body: JSON.stringify({ notes }),
        });
        Object.assign(findApplication(state.detailId) || {}, data.application);
        const saved = $("#notesSavedMsg");
        saved.classList.remove("hidden");
        window.setTimeout(() => saved.classList.add("hidden"), 2500);
      } catch (error) {
        alert(error.message || "Couldn't save that note.");
      }
    });

    $("#deleteApplicationBtn")?.addEventListener("click", async () => {
      if (!state.detailId) return;
      if (!confirm("Remove this application from your tracker? This can't be undone.")) return;
      try {
        await api(`/${state.detailId}`, { method: "DELETE" });
        state.applications = state.applications.filter((a) => a.id !== state.detailId);
        closeDetail();
        renderBoard();
        loadInsights();
      } catch (error) {
        alert(error.message || "Couldn't remove that application.");
      }
    });
  }

  function openDetail(id) {
    const app = findApplication(id);
    if (!app) return;
    state.detailId = id;

    setText("#detailTitle", app.jobTitle);
    setText("#detailCompany", app.company || "Company not stated");

    const ringEl = $("#detailRing");
    ringEl.className = "match-ring " + matchRingClass(app.matchScore);
    setText("#detailRingValue", typeof app.matchScore === "number" ? `${app.matchScore}%` : "—");

    const deadline = deadlineInfo(app.deadline);
    const deadlineEl = $("#detailDeadline");
    deadlineEl.textContent = deadline ? deadline.text : "";
    deadlineEl.className = "deadline-chip" + (deadline ? ` ${deadline.cls}` : "");

    setText("#detailRoleCategory", app.roleCategory || "");

    $("#detailRequiredSkills").innerHTML = (app.requiredSkills || [])
      .map((s) => `<span>${escapeHtml(s)}</span>`)
      .join("");
    $("#detailMissingSkills").innerHTML = (app.missingSkills || [])
      .map((s) => `<span>${escapeHtml(s)}</span>`)
      .join("");
    $("#detailTips").innerHTML = (app.tailoringTips || [])
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("") || "<li>No tips recorded.</li>";

    $("#detailNotes").value = app.notes || "";
    $("#notesSavedMsg").classList.add("hidden");

    const select = $("#detailStatusSelect");
    select.innerHTML = STATUSES.map(
      (s) => `<option value="${s}" ${s === app.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`
    ).join("");

    $("#detailOverlay").classList.remove("hidden");
  }

  function closeDetail() {
    $("#detailOverlay").classList.add("hidden");
    state.detailId = null;
  }

  /* ================= ONBOARDING HINT ================= */

  function markOnboardingSeen() {
    try {
      localStorage.setItem("sf_apptracker_onboarded", "1");
    } catch {
      /* ignore */
    }
  }

  function maybeShowOnboarding() {
    let seen = false;
    try {
      seen = localStorage.getItem("sf_apptracker_onboarded") === "1";
    } catch {
      /* ignore */
    }
    if (seen || state.applications.length > 0) return;

    const hero = $(".hero");
    if (!hero || $("#onboardingHint")) return;

    const hint = document.createElement("div");
    hint.className = "onboarding-hint";
    hint.id = "onboardingHint";
    hint.innerHTML = `
      <i data-lucide="sparkles"></i>
      <div>
        <p><strong>New here?</strong> Paste a job description or link with "Add Job" and we'll pull out
        the role, deadline and required skills, and score it against your latest CV - all in one go.
        Then just drag the card as you move through Applied, Interview, Offer or Rejected.</p>
        <button type="button" id="dismissOnboarding">Got it</button>
      </div>`;
    hero.insertAdjacentElement("afterend", hint);
    window.lucide?.createIcons();

    $("#dismissOnboarding")?.addEventListener("click", () => {
      hint.remove();
      markOnboardingSeen();
    });
  }

  /* ================= INIT ================= */

  document.addEventListener("DOMContentLoaded", () => {
    window.lucide?.createIcons();
    setupSidebar();
    setupSearch();
    setupAddJobModal();
    setupDetailModal();

    loadApplications()
      .then(() => {
        maybeShowOnboarding();
        loadInsights();
        loadQuota();
      })
      .catch((error) => {
        console.error("Application tracker load error:", error);
        const board = $("#kanbanBoard");
        if (board) {
          board.innerHTML = `<p class="kanban-empty-hint" style="grid-column:1/-1;">Couldn't load your applications. Refresh to try again.</p>`;
        }
      });
  });

  loadUserGreeting();
})();
