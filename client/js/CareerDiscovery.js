/* ==========================================================================
 * ScientiaForge AI - Career Discovery
 *
 * The browser collects choices and renders results. It never scores anything:
 * questions come from the API, answers go back as (question_id, option_id) and
 * the backend recalculates everything (§49).
 *
 * There is no Math.random() in this file.
 * ======================================================================== */
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
  
(function () {
  "use strict";

  const CONFIG = {
    // An empty string is a VALID value: it means "same origin", which is what
    // we want when Express proxies /api/discovery to the Python API. Using ||
    // here would treat "" as unset and silently fall back to port 8000.
    API_BASE:
      typeof window.SKILLFORGE_API_BASE === "string"
        ? window.SKILLFORGE_API_BASE
        : "http://127.0.0.1:8000",
    MAX_DOMAINS: 3,
    SEARCH_DEBOUNCE_MS: 250,
    SEARCH_MIN_CHARS: 2,
    LOADING_STAGES: [
      "Analyzing your career profile...",
      "Comparing your interests...",
      "Evaluating O*NET career profiles...",
      "Ranking your best-fit careers..."
    ],
    STAGE_INTERVAL_MS: 750
  };

  const state = {
    domains: [],
    background: [],
    subjects: [],
    deepScan: false,
    questions: [],
    answers: [],
    index: 0,
    matches: [],
    related: [],
    profile: null,
    sessionId: null,
    selected: null,
    searchTimer: null,
    searchSeq: 0
  };

  /* ---------------------------------------------------------------- utils */

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  class ApiError extends Error {
    constructor(code, message, status) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  function authToken() {
    // Supabase stores its session under a project-scoped key.
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || key.indexOf("-auth-token") === -1) continue;
        const parsed = JSON.parse(localStorage.getItem(key) || "{}");
        if (parsed && parsed.access_token) return parsed.access_token;
        if (parsed && parsed.currentSession && parsed.currentSession.access_token) {
          return parsed.currentSession.access_token;
        }
      }
    } catch (error) {
      console.warn("Could not read the Supabase session:", error);
    }
    return localStorage.getItem("sf_access_token") || null;
  }

  async function api(path, options) {
    const settings = Object.assign({ method: "GET" }, options || {});
    settings.headers = Object.assign(
      { "Content-Type": "application/json" },
      settings.headers || {}
    );
    const token = authToken();
    if (token) settings.headers.Authorization = "Bearer " + token;

    let response;
    try {
      response = await fetch(CONFIG.API_BASE + path, settings);
    } catch (networkError) {
      // A dead server and a CORS rejection look the same here, so say both.
      throw new ApiError(
        "NETWORK_ERROR",
        "Could not reach the ScientiaForge engine. Check that the API is running on " +
          CONFIG.API_BASE + ".",
        0
      );
    }

    let body = null;
    try {
      body = await response.json();
    } catch (parseError) {
      body = null;
    }

    if (!response.ok || (body && body.error)) {
      const code = (body && body.code) || "SERVER_ERROR";
      const message =
        (body && body.message) || "The server could not complete that request.";
      throw new ApiError(code, message, response.status);
    }
    return body;
  }

  /* ------------------------------------------------------------ selection */

  function setupDomainChips() {
    $$(".chip").forEach((chip) => {
      chip.setAttribute("role", "button");
      chip.setAttribute("tabindex", "0");
      chip.setAttribute("aria-pressed", "false");

      const toggle = () => {
        const selected = chip.classList.contains("selected");
        if (!selected && $$(".chip.selected").length >= CONFIG.MAX_DOMAINS) {
          announce("You can select up to " + CONFIG.MAX_DOMAINS + " domains.");
          return;
        }
        chip.classList.toggle("selected");
        chip.setAttribute("aria-pressed", String(chip.classList.contains("selected")));
        state.domains = $$(".chip.selected").map((c) => c.dataset.domain);
      };

      chip.addEventListener("click", toggle);
      chip.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    });
  }

  function readSelections() {
    state.domains = $$(".chip.selected").map((chip) => chip.dataset.domain);

    const backgroundSelect = $("#backgroundSelect");
    state.background = backgroundSelect
      ? Array.from(backgroundSelect.selectedOptions).map((o) => o.value)
      : [];

    const subjectsSelect = $("#subjectsSelect");
    state.subjects = subjectsSelect
      ? Array.from(subjectsSelect.selectedOptions).map((o) => o.value)
      : [];

    const toggle = $("#personalityToggle");
    state.deepScan = Boolean(toggle && toggle.checked);
  }

  function announce(message) {
    const region = $("#sfAnnouncer");
    if (region) region.textContent = message;
    const banner = $("#sfNotice");
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
      window.clearTimeout(announce._timer);
      announce._timer = window.setTimeout(() => {
        banner.hidden = true;
      }, 6000);
    }
  }

  /* ------------------------------------------------------------ questions */

  async function startQuestionnaire() {
    readSelections();
    if (state.domains.length === 0) {
      announce("Select at least one core domain to begin.");
      return;
    }

    const wrapper = $("#questionnaireWrapper");
    wrapper.innerHTML = loadingBlock("Building your questionnaire...");

    try {
      const data = await api("/api/discovery/questionnaire", {
        method: "POST",
        body: JSON.stringify({
          core_domains: state.domains,
          deep_scan_enabled: state.deepScan
        })
      });
      state.questions = data.questions;
      state.answers = [];
      state.index = 0;
      renderQuestion();
    } catch (error) {
      renderError(error);
    }
  }

  function renderQuestion() {
    const wrapper = $("#questionnaireWrapper");
    const question = state.questions[state.index];
    if (!question) return runAnalysis();

    const answered = state.answers.length;
    const percent = Math.round((state.index / state.questions.length) * 100);
    const chosen = state.answers[state.index];

    wrapper.innerHTML = [
      '<div class="quiz-container-modern">',
      '  <div class="quiz-meta">',
      '    <span class="quiz-step">Question ' + (state.index + 1) + " of " +
           state.questions.length + "</span>",
      question.deep_scan
        ? '    <span class="quiz-tag">Deep personality scan</span>'
        : '    <span class="quiz-tag">' + escapeHtml(sectionLabel(question)) + "</span>",
      "  </div>",
      '  <div class="quiz-progress-bar" role="progressbar" aria-valuemin="0" ' +
        'aria-valuemax="100" aria-valuenow="' + percent + '">',
      '    <div class="progress-fill" style="width:' + percent + '%"></div>',
      "  </div>",
      '  <h3 class="quiz-question" id="quizQuestion">' + escapeHtml(question.text) + "</h3>",
      '  <div class="quiz-options" role="group" aria-labelledby="quizQuestion">',
      question.options
        .map(
          (option) =>
            '<button type="button" class="quiz-option-btn' +
            (chosen && chosen.option_id === option.option_id ? " selected" : "") +
            '" data-option="' + escapeHtml(option.option_id) + '">' +
            "<span>" + escapeHtml(option.text) + "</span>" +
            '<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
            "</button>"
        )
        .join(""),
      "  </div>",
      '  <div class="quiz-nav">',
      '    <button type="button" class="quiz-back" id="quizBack"' +
        (state.index === 0 ? " disabled" : "") +
        '><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Back</button>',
      '    <span class="quiz-answered">' + answered + " answered</span>",
      "  </div>",
      "</div>"
    ].join("");

    wrapper.querySelectorAll(".quiz-option-btn").forEach((button) => {
      button.addEventListener("click", () => selectOption(button.dataset.option));
    });
    const back = $("#quizBack");
    if (back) {
      back.addEventListener("click", () => {
        if (state.index > 0) {
          state.index -= 1;
          renderQuestion();
        }
      });
    }
    const firstOption = wrapper.querySelector(".quiz-option-btn");
    if (firstOption) firstOption.focus();
    updateProgressDots();
  }

  function sectionLabel(question) {
    if (question.section === "core") return "Core profile";
    return (question.domain || question.section).replace(/^\w/, (c) => c.toUpperCase());
  }

  function selectOption(optionId) {
    const question = state.questions[state.index];
    state.answers[state.index] = {
      question_id: question.question_id,
      option_id: optionId
    };
    state.index += 1;
    if (state.index < state.questions.length) {
      renderQuestion();
    } else {
      runAnalysis();
    }
  }

  function updateProgressDots() {
    const dots = $$(".q-progress .dot");
    if (!dots.length || !state.questions.length) return;
    const ratio = state.index / state.questions.length;
    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i <= Math.floor(ratio * (dots.length - 1)));
    });
  }

  /* ------------------------------------------------------------- analysis */

  function loadingBlock(message) {
    return [
      '<div class="ai-processing" role="status" aria-live="polite">',
      '  <div class="spinner" aria-hidden="true"></div>',
      '  <h3 id="loadingStage">' + escapeHtml(message) + "</h3>",
      "  <p>Your answers are being compared against the O*NET occupational database.</p>",
      "</div>"
    ].join("");
  }

  async function runAnalysis() {
    const wrapper = $("#questionnaireWrapper");
    wrapper.innerHTML = loadingBlock(CONFIG.LOADING_STAGES[0]);

    // Stages advance while the request is genuinely in flight; nothing is
    // padded with artificial delay.
    let stage = 0;
    const timer = window.setInterval(() => {
      stage = Math.min(stage + 1, CONFIG.LOADING_STAGES.length - 1);
      const node = $("#loadingStage");
      if (node) node.textContent = CONFIG.LOADING_STAGES[stage];
    }, CONFIG.STAGE_INTERVAL_MS);

    try {
      const data = await api("/api/discovery/generate-matches", {
        method: "POST",
        body: JSON.stringify({
          core_domains: state.domains,
          academic_background: state.background,
          school_subjects: state.subjects,
          deep_scan_enabled: state.deepScan,
          questionnaire_answers: state.answers.filter(Boolean),
          persist: true
        })
      });

      window.clearInterval(timer);
      const node = $("#loadingStage");
      if (node) node.textContent = "Analysis complete.";

      state.matches = data.matches || [];
      state.related = data.related_careers || [];
      state.profile = data.profile || null;
      state.sessionId = data.session_id || null;

      if (!state.matches.length) {
        renderEmpty(data.result_note);
        return;
      }
      renderResults(data);
    } catch (error) {
      window.clearInterval(timer);
      renderError(error);
    }
  }

  /* -------------------------------------------------------------- results */

  function renderResults(data) {
    const profile = data.profile || {};
    const riasec = profile.riasec || {};
    const topInterests = Object.keys(riasec)
      .sort((a, b) => riasec[b] - riasec[a])
      .filter((key) => riasec[key] > 0)
      .slice(0, 3);

    $("#questionnaireWrapper").innerHTML = [
      '<div class="result-card-pro">',
      '  <div class="result-glow" aria-hidden="true"></div>',
      '  <div class="result-header"><span class="ai-badge">Analysis complete</span></div>',
      '  <h2 class="result-main">Your strongest career direction is <span>' +
        escapeHtml(profile.headline || "") + "</span></h2>",
      '  <p class="result-desc">Ranked against ' +
        escapeHtml(String(data.candidates_considered || 0)) +
        " O*NET occupations using your " +
        escapeHtml(String(profile.answers_used || 0)) + " answers" +
        (profile.deep_scan_enabled ? ", including the deep personality scan" : "") +
        ".</p>",
      topInterests.length
        ? '  <div class="result-chips">' +
          topInterests
            .map(
              (key) =>
                '<span class="result-chip">' + escapeHtml(capitalise(key)) + " " +
                escapeHtml(String(riasec[key])) + "</span>"
            )
            .join("") +
          "</div>"
        : "",
      data.result_note
        ? '  <p class="result-note">' + escapeHtml(data.result_note) + "</p>"
        : "",
      data.warnings && data.warnings.length
        ? '  <p class="result-note">' + escapeHtml(data.warnings.join(" ")) + "</p>"
        : "",
      '  <button type="button" class="btn-secondary result-reset" id="resetBtn">',
      '    Start over <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>',
      "  </button>",
      "</div>"
    ].join("");

    const reset = $("#resetBtn");
    if (reset) reset.addEventListener("click", () => window.location.reload());

    renderCards(state.matches);
    renderRelated(state.related);
    selectCareer(state.matches[0]);
    const heading = $("#suggestedHeading");
    if (heading) heading.textContent = "Your ranked careers";
  }

  function capitalise(value) {
    return String(value).replace(/^\w/, (c) => c.toUpperCase());
  }

  function renderCards(matches) {
    const grid = $("#resultsGrid");
    if (!grid) return;
    grid.innerHTML = "";                     // placeholder cards go away (§30)

    matches.forEach((match, index) => {
      const card = document.createElement("article");
      card.className = "career-card" + (index === 0 ? " active" : "");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute(
        "aria-label",
        match.title + ", " + match.match_score + " percent match, " +
          match.confidence + " confidence"
      );

      card.innerHTML = [
        '<div class="card-top">',
        "  <h4>" + escapeHtml(match.title) + "</h4>",
        '  <span class="match-badge">' + match.match_score + "% match</span>",
        "</div>",
        '<div class="card-band">' + escapeHtml(match.match_band) + " &middot; " +
          escapeHtml(match.confidence) + " confidence</div>",
        '<div class="salary">' + escapeHtml(match.salary) +
          "<span>/mo (estimate)</span></div>",
        '<div class="skills-tags">' +
          (match.tech_skills || [])
            .slice(0, 3)
            .map((skill) => "<span>" + escapeHtml(skill) + "</span>")
            .join("") +
          "</div>",
        '<p class="card-reason">' + escapeHtml(match.match_reason) + "</p>",
        '<div class="card-image" style="background-image:url(\'' +
          escapeHtml(match.image_url) + "')\"></div>",
        '<div class="card-footer">',
        '  <span class="group-tag">' + escapeHtml(match.group) + "</span>",
        '  <span class="demand">' + escapeHtml(match.technology_demand) + "</span>",
        "</div>"
      ].join("");

      const activate = () => {
        $$("#resultsGrid .career-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        selectCareer(match);
      };
      card.addEventListener("click", activate);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });

      const image = new Image();
      image.onerror = () => {
        const node = card.querySelector(".card-image");
        if (node) node.style.backgroundImage = "none";
      };
      image.src = match.image_url;

      grid.appendChild(card);
    });
  }

  function renderRelated(related) {
    const grid = $("#relatedGrid");
    const section = $("#relatedSection");
    if (!grid || !section) return;

    if (!related.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    grid.innerHTML = "";

    related.forEach((match) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "related-card";
      card.innerHTML = [
        '<div class="r-icon blue-bg"><i class="fa-solid fa-compass" aria-hidden="true"></i></div>',
        '<div class="r-info">',
        "  <h4>" + escapeHtml(match.title) + "</h4>",
        "  <p>" + match.match_score + "% match</p>",
        "</div>",
        '<i class="fa-solid fa-chevron-right arrow" aria-hidden="true"></i>'
      ].join("");
      card.addEventListener("click", () => selectCareer(match));
      grid.appendChild(card);
    });
  }

  /* ---------------------------------------------------------- right panel */

  async function selectCareer(match) {
    if (!match) return;
    state.selected = match;

    setText("#panelTitle", match.title);
    setText("#panelDesc", match.description);
    setText("#panelSalary", match.salary);
    setText("#panelMatch", match.match_score + "% match");
    setText("#panelConfidence", match.confidence + " confidence");
    setText("#panelReason", match.match_reason);
    setText(
      "#panelJobZone",
      match.job_zone
        ? "Job zone " + match.job_zone + " - " + match.job_zone_label
        : "Job zone not published for this occupation"
    );
    setText("#panelDemand", match.technology_demand);

    const hero = $("#panelHero");
    if (hero) {
      hero.style.backgroundImage = match.image_url
        ? "url('" + match.image_url + "')"
        : "none";
    }

    const tech = $("#panelTech");
    if (tech) {
      const skills = match.tech_skills || [];
      tech.innerHTML = skills.length
        ? skills.map((s) => "<span>" + escapeHtml(s) + "</span>").join("")
        : '<span class="muted">No technology data published for this occupation</span>';
    }

    renderFactors(match.top_factors || []);
    renderBreakdown(match.score_breakdown || {});
    await loadRoadmap(match.onetsoc_code);
  }

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value == null ? "" : String(value);
  }

  function renderFactors(factors) {
    const list = $("#panelFactors");
    if (!list) return;
    list.innerHTML = factors
      .map((factor) => "<li>" + escapeHtml(factor) + "</li>")
      .join("");
  }

  const BREAKDOWN_LABELS = {
    domain: "Domain relevance",
    interests: "Interests (RIASEC)",
    abilities: "Abilities",
    knowledge: "Knowledge",
    skills: "Skills",
    work_activities: "Work activities",
    work_styles: "Work styles",
    technology: "Technology",
    academic_background: "Academic background",
    job_zone: "Education level",
    personality: "Personality"
  };

  function renderBreakdown(breakdown) {
    const container = $("#panelBreakdown");
    if (!container) return;
    const keys = Object.keys(BREAKDOWN_LABELS).filter((k) => k in breakdown);
    container.innerHTML = keys
      .map((key) => {
        const value = Math.max(0, Math.min(100, breakdown[key]));
        return [
          '<div class="breakdown-row">',
          '  <span class="breakdown-label">' + escapeHtml(BREAKDOWN_LABELS[key]) + "</span>",
          '  <span class="breakdown-track"><span class="breakdown-fill" style="width:' +
            value + '%"></span></span>',
          '  <span class="breakdown-value">' + value + "</span>",
          "</div>"
        ].join("");
      })
      .join("");
  }

  async function loadRoadmap(code) {
    const container = $("#panelRoadmapDetail");
    if (!container) return;
    container.innerHTML = '<p class="muted">Loading learning signals...</p>';
    try {
      const detail = await api("/api/discovery/occupation/" + encodeURIComponent(code));
      const skills = (detail.top_skills || []).slice(0, 4);
      const knowledge = (detail.top_knowledge || []).slice(0, 3);
      container.innerHTML = [
        skills.length
          ? "<p><strong>Skills to build:</strong> " +
            skills.map((s) => escapeHtml(s.name)).join(", ") + "</p>"
          : "",
        knowledge.length
          ? "<p><strong>Knowledge areas:</strong> " +
            knowledge.map((k) => escapeHtml(k.name)).join(", ") + "</p>"
          : "",
        detail.technologies && detail.technologies.length
          ? "<p><strong>Tools:</strong> " +
            detail.technologies.map((t) => escapeHtml(t)).join(", ") + "</p>"
          : ""
      ].join("");
    } catch (error) {
      container.innerHTML =
        '<p class="muted">Learning detail is unavailable right now.</p>';
    }
  }

  /* --------------------------------------------------------------- search */

  function setupSearch() {
    const input = $("#careerSearchInput");
    const clear = $("#careerSearchClear");
    if (!input) return;

    input.addEventListener("input", () => {
      const value = input.value.trim();
      if (clear) clear.hidden = value.length === 0;
      window.clearTimeout(state.searchTimer);

      if (value.length < CONFIG.SEARCH_MIN_CHARS) {
        hideSearchResults();
        return;
      }
      state.searchTimer = window.setTimeout(() => runSearch(value), CONFIG.SEARCH_DEBOUNCE_MS);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideSearchResults();
        input.blur();
      }
      if (event.key === "ArrowDown") {
        const first = $("#careerSearchResults .search-hit");
        if (first) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    if (clear) {
      clear.addEventListener("click", () => {
        input.value = "";
        clear.hidden = true;
        hideSearchResults();
        input.focus();
      });
    }

    document.addEventListener("click", (event) => {
      const panel = $(".career-search");
      if (panel && !panel.contains(event.target)) hideSearchResults();
    });
  }

  function hideSearchResults() {
    const box = $("#careerSearchResults");
    if (box) {
      box.hidden = true;
      box.innerHTML = "";
    }
    const input = $("#careerSearchInput");
    if (input) input.setAttribute("aria-expanded", "false");
  }

  async function runSearch(query) {
    const box = $("#careerSearchResults");
    if (!box) return;

    // Out-of-order responses must not overwrite newer ones.
    const seq = ++state.searchSeq;

    box.hidden = false;
    $("#careerSearchInput").setAttribute("aria-expanded", "true");
    box.innerHTML = '<div class="search-status">Searching...</div>';

    readSelections();
    const body = { query: query, limit: 8 };
    // Send the answers only if the questionnaire is actually finished, so the
    // hits come back with a real match score instead of none.
    const answered = state.answers.filter(Boolean);
    if (answered.length && answered.length === state.questions.length) {
      body.core_domains = state.domains;
      body.academic_background = state.background;
      body.school_subjects = state.subjects;
      body.deep_scan_enabled = state.deepScan;
      body.questionnaire_answers = answered;
    }

    try {
      const data = await api("/api/discovery/search", {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (seq !== state.searchSeq) return;
      renderSearchResults(data);
    } catch (error) {
      if (seq !== state.searchSeq) return;
      box.innerHTML =
        '<div class="search-status">' + escapeHtml(error.message) + "</div>";
    }
  }

  function renderSearchResults(data) {
    const box = $("#careerSearchResults");
    if (!box) return;

    if (!data.count) {
      box.innerHTML =
        '<div class="search-status">No career matches &ldquo;' +
        escapeHtml(data.query) + '&rdquo;. Try a shorter or more general word.</div>';
      return;
    }

    box.innerHTML =
      (data.note ? '<div class="search-note">' + escapeHtml(data.note) + "</div>" : "") +
      data.results
        .map((hit, index) => {
          const score =
            hit.match_score == null
              ? '<span class="search-score muted">No score yet</span>'
              : '<span class="search-score">' + hit.match_score + "% match</span>";
          const zone = hit.job_zone
            ? '<span class="search-zone">Job zone ' + hit.job_zone + "</span>"
            : "";
          return (
            '<button type="button" class="search-hit" role="option" ' +
            'data-index="' + index + '">' +
            '<span class="search-hit-main">' +
            "<strong>" + escapeHtml(hit.title) + "</strong>" +
            '<span class="search-hit-desc">' +
            escapeHtml((hit.description || "").slice(0, 110)) +
            (hit.description && hit.description.length > 110 ? "..." : "") +
            "</span></span>" +
            '<span class="search-hit-meta">' + score + zone + "</span>" +
            "</button>"
          );
        })
        .join("");

    box.querySelectorAll(".search-hit").forEach((button) => {
      button.addEventListener("click", () => {
        const hit = data.results[Number(button.dataset.index)];
        openSearchedCareer(hit, data.scored);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" && button.nextElementSibling) {
          event.preventDefault();
          button.nextElementSibling.focus();
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          const previous = button.previousElementSibling;
          if (previous && previous.classList.contains("search-hit")) previous.focus();
          else $("#careerSearchInput").focus();
        }
      });
    });
  }

  async function openSearchedCareer(hit, scored) {
    hideSearchResults();

    if (scored) {
      // A scored hit has the same shape as a recommendation, so the panel
      // renders it exactly the same way.
      selectCareer(hit);
      announce("Showing " + hit.title + " - " + hit.match_score + "% match.");
      return;
    }

    // Unscored: show what we honestly know and say the score is missing.
    setText("#panelTitle", hit.title);
    setText("#panelDesc", hit.description);
    setText("#panelMatch", "--");
    setText("#panelConfidence", "Complete the questionnaire for your match");
    setText("#panelReason", "");
    setText(
      "#panelJobZone",
      hit.job_zone ? "Job zone " + hit.job_zone + " - " + hit.job_zone_label : ""
    );
    setText("#panelSalary", "--");
    renderFactors([]);
    renderBreakdown({});
    const tech = $("#panelTech");
    if (tech) tech.innerHTML = "";
    state.selected = hit;
    await loadRoadmap(hit.onetsoc_code);
    announce("Showing " + hit.title + ". Complete the questionnaire to see your match.");
  }

  /* --------------------------------------------------------- panel actions */

  async function saveCareerPath() {
    if (!state.selected) {
      announce("Choose a career first.");
      return;
    }
    const button = $("#saveCareerBtn");
    if (button) button.disabled = true;
    try {
      const result = await api("/api/discovery/save-career", {
        method: "POST",
        body: JSON.stringify({
          onetsoc_code: state.selected.onetsoc_code,
          session_id: state.sessionId
        })
      });
      announce("Saved " + (result.title || state.selected.title) + " to your career paths.");
    } catch (error) {
      if (error.code === "AUTH_REQUIRED") {
        announce("Sign in to save this career path.");
      } else {
        announce(error.message);
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  function startLearning() {
    if (!state.selected) {
      announce("Choose a career first.");
      return;
    }
    // The learning path is driven by the selected O*NET occupation (§32).
    sessionStorage.setItem(
      "sf_learning_target",
      JSON.stringify({
        onetsoc_code: state.selected.onetsoc_code,
        title: state.selected.title,
        job_zone: state.selected.job_zone,
        session_id: state.sessionId
      })
    );
    window.location.href =
      "ProgressTracker.html?occupation=" +
      encodeURIComponent(state.selected.onetsoc_code);
  }

  /* ---------------------------------------------------------------- errors */

  const ERROR_HINTS = {
    NETWORK_ERROR: "Start the API with: uvicorn main:app --reload --port 8000",
    DATABASE_ERROR: "The O*NET data in Supabase could not be read.",
    VALIDATION_ERROR: "Adjust your selections and try again.",
    INVALID_QUESTIONNAIRE: "Answer the questions again so the engine has something to score.",
    NO_CANDIDATES: "No usable occupations were found in the career database.",
    AUTH_REQUIRED: "Sign in to continue."
  };

  function renderError(error) {
    const code = error.code || "SERVER_ERROR";
    $("#questionnaireWrapper").innerHTML = [
      '<div class="sf-error" role="alert">',
      '  <div class="sf-error-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>',
      "  <h3>We could not complete the analysis</h3>",
      "  <p>" + escapeHtml(error.message) + "</p>",
      '  <p class="sf-error-code">Error code: ' + escapeHtml(code) + "</p>",
      ERROR_HINTS[code] ? "  <p>" + escapeHtml(ERROR_HINTS[code]) + "</p>" : "",
      '  <button type="button" class="btn-secondary" id="retryBtn">Try again</button>',
      "</div>"
    ].join("");
    const retry = $("#retryBtn");
    if (retry) retry.addEventListener("click", () => window.location.reload());
    console.error("[SkillForge]", code, error);
  }

  function renderEmpty(note) {
    $("#questionnaireWrapper").innerHTML = [
      '<div class="sf-error" role="status">',
      "  <h3>No confident matches yet</h3>",
      "  <p>" +
        escapeHtml(
          note ||
            "The engine could not find occupations that fit this profile. Try adding a second domain or answering the questionnaire again."
        ) +
        "</p>",
      '  <button type="button" class="btn-secondary" id="retryBtn">Start over</button>',
      "</div>"
    ].join("");
    const retry = $("#retryBtn");
    if (retry) retry.addEventListener("click", () => window.location.reload());
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    setupDomainChips();

    setupSearch();

    const generate = $("#generateBtn");
    if (generate) generate.addEventListener("click", startQuestionnaire);

    const save = $("#saveCareerBtn");
    if (save) save.addEventListener("click", saveCareerPath);

    const learn = $("#startLearningBtn");
    if (learn) learn.addEventListener("click", startLearning);

    const toggle = $("#personalityToggle");
    if (toggle) {
      toggle.addEventListener("change", () => {
        state.deepScan = toggle.checked;
        announce(
          toggle.checked
            ? "Deep personality scan on: behavioural questions will be added."
            : "Deep personality scan off."
        );
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exposed for the console and for future pages that reuse the engine.
  window.SkillForgeDiscovery = { state, api, selectCareer };
})();

async function loadUserGreeting() {
  // Get the token saved after login
  const token = localStorage.getItem("sb-access-token");
  if (!token) return window.location.href = "/pages/LogIn.html";
 
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
 
    if (!res.ok) return window.location.href = "/pages/LogIn.html";
 
    const { firstName, email } = await res.json();

    document.querySelector(".profile-name").textContent = firstName;
    document.querySelector(".profile-email").textContent = email;
  } catch (err) {
    console.error("Failed to load user:", err);
  }
}
 
loadUserGreeting();
