/*
document.addEventListener("DOMContentLoaded", () => {
  const API = (typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:5001/api");

  const tabs = document.querySelectorAll(".sh-tabs .cp-tab");
  const panels = {
    papersPanel: document.getElementById("papersPanel"),
    videosPanel: document.getElementById("videosPanel"),
    applyPanel: document.getElementById("applyPanel"),
  };

  const paperSubject = document.getElementById("paperSubject");
  const paperGrade = document.getElementById("paperGrade");
  const paperCurriculum = document.getElementById("paperCurriculum");
  const searchPapersBtn = document.getElementById("searchPapersBtn");
  const papersList = document.getElementById("papersList");

  const videoSubject = document.getElementById("videoSubject");
  const searchVideosBtn = document.getElementById("searchVideosBtn");
  const videosList = document.getElementById("videosList");

  const applyUniList = document.getElementById("applyUniList");
  const applyBursaryVideoList = document.getElementById("applyBursaryVideoList");
  const applyBursaryList = document.getElementById("applyBursaryList");

  async function fetchJSON(path) {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  /* ---------- Tabs ---------- */
/*
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      Object.entries(panels).forEach(([id, el]) => {
        el.style.display = id === tab.dataset.panel ? "" : "none";
      });
    });
  });

    const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
 
  /* ================= SIDEBAR ================= */
 /*
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

  /* ---------- Subjects for both filter dropdowns ---------- */
/*
  async function loadSubjectOptions() {
    try {
      const { subjects } = await fetchJSON("/career-pathfinder/subjects");
      const options = subjects.map((s) => `<option value="${s.subject_id}">${s.name}</option>`).join("");
      paperSubject.innerHTML = '<option value="">All subjects</option>' + options;
      videoSubject.innerHTML = '<option value="">All subjects</option>' + options;
    } catch (err) {
      console.warn("Could not load subjects:", err.message);
    }
  }

  /* ---------- Past papers ---------- */
/*
  async function searchPapers() {
    papersList.innerHTML = `<p class="empty-state">Searching…</p>`;
    const params = new URLSearchParams();
    if (paperSubject.value) params.set("subject_id", paperSubject.value);
    if (paperGrade.value) params.set("grade", paperGrade.value);
    if (paperCurriculum.value) params.set("curriculum", paperCurriculum.value);

    try {
      const { papers } = await fetchJSON(`/study-hub/past-papers?${params.toString()}`);
      if (!papers.length) {
        papersList.innerHTML = `<p class="empty-state">No papers indexed for that combination yet — try widening your filters.</p>`;
        return;
      }
      papersList.innerHTML = papers
        .map(
          (p) => `
        <div class="resource-card">
          <div class="resource-main">
            <h4>${p.subjects?.name || "Subject"} — Grade ${p.grade} (${p.curriculum})</h4>
            <span>${p.source || ""}${p.year ? ` · ${p.year}` : ""}</span>
          </div>
          <a class="resource-link" href="${p.file_url}" target="_blank" rel="noopener">Open papers →</a>
        </div>`
        )
        .join("");
    } catch (err) {
      papersList.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  searchPapersBtn.addEventListener("click", searchPapers);

  /* ---------- Study videos ---------- */
/*
  async function searchVideos() {
    videosList.innerHTML = `<p class="empty-state">Searching…</p>`;
    const params = new URLSearchParams({ category: "subject_study" });
    if (videoSubject.value) params.set("subject_id", videoSubject.value);

    try {
      const { videos } = await fetchJSON(`/study-hub/videos?${params.toString()}`);
      renderVideoList(videosList, videos, (v) => v.subjects?.name || "Study video");
    } catch (err) {
      videosList.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  searchVideosBtn.addEventListener("click", searchVideos);

  function renderVideoList(container, videos, subtitleFn) {
    if (!videos || !videos.length) {
      container.innerHTML = `<p class="empty-state">No videos added yet.</p>`;
      return;
    }
    container.innerHTML = videos
      .map(
        (v) => `
      <div class="resource-card">
        <div class="resource-main">
          <h4>${v.title}</h4>
          <span>${subtitleFn(v)}</span>
        </div>
        <a class="resource-link youtube" href="${v.youtube_url}" target="_blank" rel="noopener">
          <i class="fa-brands fa-youtube"></i> Watch
        </a>
      </div>`
      )
      .join("");
  }

  /* ---------- How to apply ---------- */
/*
  async function loadApplyContent() {
    try {
      const { videos: uniVideos } = await fetchJSON(
        "/study-hub/videos?category=how_to_apply_university"
      );
      renderVideoList(applyUniList, uniVideos, (v) => v.institutions?.name || "How to apply");
    } catch (err) {
      applyUniList.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }

    try {
      const { videos: bursaryVideos } = await fetchJSON(
        "/study-hub/videos?category=how_to_apply_bursary"
      );
      renderVideoList(applyBursaryVideoList, bursaryVideos, (v) => v.bursaries?.name || "How to apply");
    } catch (err) {
      applyBursaryVideoList.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }

    try {
      const { bursaries } = await fetchJSON("/study-hub/bursaries");
      applyBursaryList.innerHTML = bursaries
        .map(
          (b) => `
        <div class="resource-card">
          <div class="resource-main">
            <h4>${b.name}</h4>
            <span>${b.provider || ""}</span>
          </div>
          <a class="resource-link" href="${b.redirect_url}" target="_blank" rel="noopener">Apply →</a>
        </div>`
        )
        .join("");
    } catch (err) {
      applyBursaryList.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  loadSubjectOptions();
  searchPapers();
  loadApplyContent();
});
*/
/* ScientiaForge · Study Hub
   - NSC past papers (official DBE papers + memos, Active Recall)
   - My active recall (session history)
   - Study videos, How to apply (unchanged behaviour, now HTML-escaped)
   Needs ../js/nscCommon.js loaded first. */
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const { esc, safeUrl, icons, formatDate, paperName, sessionLabel, api } = window.NSC;
  const API = window.NSC.API;

  const papersPanel = document.getElementById("papersPanel");
  const tabBar = document.querySelector(".sh-tabs");

  async function fetchJSON(path) {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  const emptyState = (msg) => `<p class="empty-state">${esc(msg)}</p>`;

  window.NSC.initSidebar();

  /* ================================================================ layout
     The NSC browser is built inside #papersPanel; the existing portal search
     (IEB / provincial links) is kept underneath in "Other sources". */
  const historyPanel = document.createElement("div");
  historyPanel.id = "historyPanel";
  historyPanel.style.display = "none";
  historyPanel.innerHTML = `
    <section class="nsc-history" aria-labelledby="nscHistoryTitle">
      <div class="nsc-head">
        <div>
          <h3 id="nscHistoryTitle">My active recall</h3>
          <p>Every session is saved after each answer, so you can pick up where you left off.</p>
        </div>
      </div>
      <div id="nscHistoryList" class="nsc-history-list">${emptyState("Loading your sessions…")}</div>
      <button type="button" id="nscHistoryMore" class="nsc-more" hidden>Show older sessions</button>
    </section>`;

  if (papersPanel) {
    const legacy = document.createElement("details");
    legacy.className = "nsc-other";
    legacy.innerHTML = `<summary><i data-lucide="library"></i> Other sources: IEB and provincial portals</summary>`;
    const legacyBody = document.createElement("div");
    legacyBody.className = "nsc-other-body";
    while (papersPanel.firstChild) legacyBody.appendChild(papersPanel.firstChild);
    legacy.appendChild(legacyBody);

    const browse = document.createElement("section");
    browse.className = "nsc-browse";
    browse.setAttribute("aria-labelledby", "nscBrowseTitle");
    browse.innerHTML = `
      <div class="nsc-head">
        <div>
          <h3 id="nscBrowseTitle">NSC past papers</h3>
          <p>Official Grade 12 question papers and memos from the Department of Basic Education.
             Turn any paper into a 20-question Active Recall session.</p>
        </div>
      </div>
      <div class="nsc-filters" role="group" aria-label="Filter past papers">
        <label class="nsc-field"><span>Grade</span><select id="nscGrade"><option value="">All grades</option></select></label>
        <label class="nsc-field nsc-field-wide"><span>Subject</span><select id="nscSubject"><option value="">All subjects</option></select></label>
        <label class="nsc-field"><span>Year</span><select id="nscYear"><option value="">All years</option></select></label>
        <label class="nsc-field"><span>Exam</span><select id="nscSession"><option value="">All exams</option></select></label>
        <label class="nsc-field"><span>Paper</span><select id="nscPaper"><option value="">All papers</option></select></label>
        <button type="button" class="nsc-clear" id="nscClear" hidden>Clear filters</button>
      </div>
      <p class="nsc-count" id="nscCount" aria-live="polite"></p>
      <div class="nsc-paper-grid" id="nscPaperList"></div>
      <button type="button" class="nsc-more" id="nscMore" hidden>Load more papers</button>`;

    papersPanel.appendChild(browse);
    papersPanel.appendChild(legacy);
    papersPanel.insertAdjacentElement("afterend", historyPanel);
  }

  if (tabBar) {
    const first = tabBar.querySelector(".cp-tab");
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = first ? first.className.replace(/\bactive\b/, "").trim() : "cp-tab";
    tab.dataset.panel = "historyPanel";
    tab.textContent = "My active recall";
    first ? first.insertAdjacentElement("afterend", tab) : tabBar.appendChild(tab);
  }

  /* ================================================================ tabs */
  const tabs = document.querySelectorAll(".sh-tabs .cp-tab");
  tabs.forEach((t) => {
    t.setAttribute("role", "tab");
    if (t.dataset.panel) t.setAttribute("aria-controls", t.dataset.panel);
  });
  tabBar && tabBar.setAttribute("role", "tablist");

  let historyLoaded = false;
  function showPanel(id, { updateHash = true } = {}) {
    tabs.forEach((t) => {
      const on = t.dataset.panel === id;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      const panel = document.getElementById(t.dataset.panel);
      if (panel) panel.style.display = on ? "" : "none";
    });
    if (id === "historyPanel" && !historyLoaded) {
      historyLoaded = true;
      loadHistory(true);
    }
    if (updateHash) {
      const hash = id === "historyPanel" ? "#history" : id === "papersPanel" ? "" : `#${id.replace(/Panel$/, "")}`;
      history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
    }
  }
  tabs.forEach((t) => t.addEventListener("click", () => showPanel(t.dataset.panel)));
  if (location.hash === "#history") showPanel("historyPanel", { updateHash: false });

  /* ================================================================ NSC browse */
  const el = (id) => document.getElementById(id);
  const filters = {
    grade: el("nscGrade"),
    subject: el("nscSubject"),
    year: el("nscYear"),
    session: el("nscSession"),
    paper: el("nscPaper"),
  };
  const list = el("nscPaperList");
  const countEl = el("nscCount");
  const moreBtn = el("nscMore");
  const clearBtn = el("nscClear");
  const PAGE = 12;
  let offset = 0;
  let requestId = 0;

  function fill(select, values, label = (v) => v) {
    if (!select) return;
    select.insertAdjacentHTML(
      "beforeend",
      values.map((v) => `<option value="${esc(v)}">${esc(label(v))}</option>`).join("")
    );
  }

  function readQuery() {
    const q = new URLSearchParams(location.search);
    Object.entries(filters).forEach(([key, select]) => {
      const v = q.get(key);
      if (select && v && [...select.options].some((o) => o.value === v)) select.value = v;
    });
  }

  function currentParams() {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([key, select]) => {
      if (select && select.value) p.set(key, select.value);
    });
    return p;
  }

  function paperCard(p) {
    const detail = `PastPaper.html?id=${encodeURIComponent(p.id)}`;
    const recall = p.recall_available
      ? `<p class="nsc-recall-line is-ready"><i data-lucide="brain"></i>${p.recall_session_size}-question Active Recall ready</p>`
      : `<p class="nsc-recall-line"><i data-lucide="file-down"></i>${esc(window.NSC.unavailableText(p.recall_unavailable_reason))}</p>`;
    return `
      <article class="nsc-paper-card">
        <div class="nsc-paper-top">
          <h4><a href="${detail}">${esc(p.subject)}</a></h4>
          <div class="nsc-chips">
            <span class="nsc-chip">Paper ${esc(p.paper_number)}</span>
            <span class="nsc-chip">${esc(sessionLabel(p))}</span>
            <span class="nsc-chip">Grade ${esc(p.grade)}</span>
          </div>
        </div>
        ${recall}
        <div class="nsc-card-actions">
          <a class="nsc-btn nsc-btn-ghost" href="${detail}"><i data-lucide="eye"></i>View paper</a>
          <a class="nsc-btn nsc-btn-ghost" href="${esc(safeUrl(p.question_paper_download_url))}" download
             aria-label="Download ${esc(paperName(p))} question paper"><i data-lucide="download"></i>Download paper</a>
          ${
            p.memorandum_download_url
              ? `<a class="nsc-btn nsc-btn-ghost" href="${esc(safeUrl(p.memorandum_download_url))}" download
                   aria-label="Download ${esc(paperName(p))} memorandum"><i data-lucide="file-check"></i>Download memo</a>`
              : `<span class="nsc-btn nsc-btn-ghost is-disabled" aria-disabled="true"><i data-lucide="file-x"></i>No memo available</span>`
          }
          ${
            p.recall_available
              ? `<a class="nsc-btn nsc-btn-primary" href="ActiveRecall.html?paper=${encodeURIComponent(p.id)}">
                   <i data-lucide="play"></i>Start Active Recall</a>`
              : ""
          }
        </div>
      </article>`;
  }

  async function loadPapers(reset) {
    if (!list) return;
    const mine = ++requestId;
    if (reset) {
      offset = 0;
      list.innerHTML = Array.from({ length: 3 }, () => `<div class="nsc-paper-card is-loading" aria-hidden="true"></div>`).join("");
      list.setAttribute("aria-busy", "true");
    }
    const params = currentParams();
    const hasFilters = [...params.keys()].length > 0;
    clearBtn.hidden = !hasFilters;
    history.replaceState(null, "", `${location.pathname}${hasFilters ? `?${params}` : ""}${location.hash}`);
    params.set("limit", PAGE);
    params.set("offset", offset);
    moreBtn.disabled = true;

    try {
      const data = await api(`/papers?${params}`);
      if (mine !== requestId) return; // a newer filter change won
      const html = data.papers.map(paperCard).join("");
      if (reset) list.innerHTML = html;
      else list.insertAdjacentHTML("beforeend", html);
      offset += data.papers.length;
      countEl.textContent = data.total === 1 ? "1 paper" : `${data.total} papers`;
      moreBtn.hidden = offset >= data.total;
      if (!data.total) {
        list.innerHTML = emptyState(
          hasFilters
            ? "No papers match those filters yet. Try another year or exam."
            : "No NSC papers have been collected yet. Run the collector to add them."
        );
      }
      icons(list);
    } catch (err) {
      if (mine !== requestId) return;
      countEl.textContent = "";
      list.innerHTML = emptyState(err.message);
    } finally {
      if (mine === requestId) {
        list.removeAttribute("aria-busy");
        moreBtn.disabled = false;
      }
    }
  }

  async function initBrowse() {
    if (!list) return;
    try {
      const f = await api("/filters");
      fill(filters.grade, f.grades || [], (g) => `Grade ${g}`);
      fill(filters.subject, f.subjects || []);
      fill(filters.year, f.years || []);
      fill(filters.session, f.sessions || []);
      fill(filters.paper, f.paper_numbers || [], (n) => `Paper ${n}`);
    } catch (err) {
      console.warn("[NSC] filters:", err.message);
    }
    readQuery();
    Object.values(filters).forEach((s) => s && s.addEventListener("change", () => loadPapers(true)));
    clearBtn.addEventListener("click", () => {
      Object.values(filters).forEach((s) => s && (s.value = ""));
      loadPapers(true);
      filters.subject && filters.subject.focus();
    });
    moreBtn.addEventListener("click", () => loadPapers(false));
    loadPapers(true);
  }

  /* ================================================================ history */
  const historyList = el("nscHistoryList");
  const historyMore = el("nscHistoryMore");
  let historyOffset = 0;

  function historyItem(s) {
    const done = s.status === "completed";
    const href = `ActiveRecall.html?session=${encodeURIComponent(s.id)}`;
    const score = done
      ? `<div class="nsc-history-score"><strong>${s.correct_count}/${s.question_count}</strong><span>${Math.round(s.percentage)}%</span></div>`
      : `<div class="nsc-history-score is-progress">
           <strong>${s.answered_count}/${s.question_count}</strong><span>answered</span>
           <div class="nsc-mini-bar" aria-hidden="true"><i style="width:${(100 * s.answered_count) / s.question_count}%"></i></div>
         </div>`;
    return `
      <article class="nsc-history-item">
        <div class="nsc-history-main">
          <h4>${esc(paperName(s.paper))}</h4>
          <div class="nsc-chips">
            <span class="nsc-chip">${esc(sessionLabel(s.paper))}</span>
            ${s.mode === "retry" ? `<span class="nsc-chip nsc-chip-accent">Retry of incorrect</span>` : ""}
            <span class="nsc-chip nsc-chip-plain">${done ? "Finished" : "Started"} ${esc(formatDate(done ? s.completed_at : s.started_at))}</span>
          </div>
        </div>
        ${score}
        <a class="nsc-btn ${done ? "nsc-btn-ghost" : "nsc-btn-primary"}" href="${href}">
          ${done ? `<i data-lucide="list-checks"></i>View results` : `<i data-lucide="play"></i>Resume`}
        </a>
      </article>`;
  }

  async function loadHistory(reset) {
    if (!historyList) return;
    if (reset) historyOffset = 0;
    try {
      const data = await api(`/sessions?limit=10&offset=${historyOffset}`);
      const html = data.sessions.map(historyItem).join("");
      if (reset) historyList.innerHTML = html || emptyState("No sessions yet. Open a past paper and start an Active Recall session.");
      else historyList.insertAdjacentHTML("beforeend", html);
      historyOffset += data.sessions.length;
      historyMore.hidden = historyOffset >= data.total;
      icons(historyList);
    } catch (err) {
      historyList.innerHTML = emptyState(err.status === 401 ? "Sign in to see your Active Recall history." : err.message);
    }
  }
  historyMore && historyMore.addEventListener("click", () => loadHistory(false));

  /* ================================================================ other sources (existing portal list) */
  const paperSubject = el("paperSubject");
  const paperGrade = el("paperGrade");
  const paperCurriculum = el("paperCurriculum");
  const searchPapersBtn = el("searchPapersBtn");
  const papersList = el("papersList");
  const videoSubject = el("videoSubject");
  const searchVideosBtn = el("searchVideosBtn");
  const videosList = el("videosList");
  const applyUniList = el("applyUniList");
  const applyBursaryVideoList = el("applyBursaryVideoList");
  const applyBursaryList = el("applyBursaryList");

  async function loadSubjectOptions() {
    try {
      const { subjects } = await fetchJSON("/career-pathfinder/subjects");
      const options = subjects.map((s) => `<option value="${esc(s.subject_id)}">${esc(s.name)}</option>`).join("");
      if (paperSubject) paperSubject.innerHTML = '<option value="">All subjects</option>' + options;
      if (videoSubject) videoSubject.innerHTML = '<option value="">All subjects</option>' + options;
    } catch (err) {
      console.warn("Could not load subjects:", err.message);
    }
  }

  async function searchPapers() {
    if (!papersList) return;
    papersList.innerHTML = emptyState("Searching…");
    const params = new URLSearchParams();
    if (paperSubject && paperSubject.value) params.set("subject_id", paperSubject.value);
    if (paperGrade && paperGrade.value) params.set("grade", paperGrade.value);
    if (paperCurriculum && paperCurriculum.value) params.set("curriculum", paperCurriculum.value);
    try {
      const { papers } = await fetchJSON(`/study-hub/past-papers?${params.toString()}`);
      if (!papers.length) {
        papersList.innerHTML = emptyState("No portals listed for that combination yet. Try widening your filters.");
        return;
      }
      papersList.innerHTML = papers
        .map(
          (p) => `
        <div class="resource-card">
          <div class="resource-main">
            <h4>${esc(p.subjects?.name || "Subject")}: Grade ${esc(p.grade)} (${esc(p.curriculum)})</h4>
            <span>${esc(p.source || "")}${p.year ? ` (${esc(p.year)})` : ""}</span>
          </div>
          <a class="resource-link" href="${esc(safeUrl(p.file_url))}" target="_blank" rel="noopener">Open papers</a>
        </div>`
        )
        .join("");
    } catch (err) {
      papersList.innerHTML = emptyState(err.message);
    }
  }
  searchPapersBtn && searchPapersBtn.addEventListener("click", searchPapers);

  /* ================================================================ study videos */
  function renderVideoList(container, videos, subtitleFn) {
    if (!container) return;
    if (!videos || !videos.length) {
      container.innerHTML = emptyState("No videos added yet.");
      return;
    }
    container.innerHTML = videos
      .map(
        (v) => `
      <div class="resource-card">
        <div class="resource-main">
          <h4>${esc(v.title)}</h4>
          <span>${esc(subtitleFn(v))}</span>
        </div>
        <a class="resource-link youtube" href="${esc(safeUrl(v.youtube_url))}" target="_blank" rel="noopener">
          <i class="fa-brands fa-youtube"></i> Watch
        </a>
      </div>`
      )
      .join("");
  }

  async function searchVideos() {
    if (!videosList) return;
    videosList.innerHTML = emptyState("Searching…");
    const params = new URLSearchParams({ category: "subject_study" });
    if (videoSubject && videoSubject.value) params.set("subject_id", videoSubject.value);
    try {
      const { videos } = await fetchJSON(`/study-hub/videos?${params.toString()}`);
      renderVideoList(videosList, videos, (v) => v.subjects?.name || "Study video");
    } catch (err) {
      videosList.innerHTML = emptyState(err.message);
    }
  }
  searchVideosBtn && searchVideosBtn.addEventListener("click", searchVideos);

  /* ================================================================ how to apply */
  async function loadApplyContent() {
    try {
      const { videos } = await fetchJSON("/study-hub/videos?category=how_to_apply_university");
      renderVideoList(applyUniList, videos, (v) => v.institutions?.name || "How to apply");
    } catch (err) {
      if (applyUniList) applyUniList.innerHTML = emptyState(err.message);
    }
    try {
      const { videos } = await fetchJSON("/study-hub/videos?category=how_to_apply_bursary");
      renderVideoList(applyBursaryVideoList, videos, (v) => v.bursaries?.name || "How to apply");
    } catch (err) {
      if (applyBursaryVideoList) applyBursaryVideoList.innerHTML = emptyState(err.message);
    }
    try {
      const { bursaries } = await fetchJSON("/study-hub/bursaries");
      if (applyBursaryList) {
        applyBursaryList.innerHTML = bursaries
          .map(
            (b) => `
          <div class="resource-card">
            <div class="resource-main">
              <h4>${esc(b.name)}</h4>
              <span>${esc(b.provider || "")}</span>
            </div>
            <a class="resource-link" href="${esc(safeUrl(b.redirect_url))}" target="_blank" rel="noopener">Apply</a>
          </div>`
          )
          .join("");
      }
    } catch (err) {
      if (applyBursaryList) applyBursaryList.innerHTML = emptyState(err.message);
    }
  }

  icons();
  initBrowse();
  loadSubjectOptions();
  searchPapers();
  loadApplyContent();
});
