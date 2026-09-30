document.addEventListener("DOMContentLoaded", () => {
  const API = typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:5001/api";

  const subjectSearchInput = document.getElementById("subjectSearchInput");
  const subjectOptionsList = document.getElementById("subjectOptions");
  const subjectSelect = document.getElementById("subjectSelect"); // hidden input holding subject_id
  const levelSelect = document.getElementById("levelSelect");
  const addSubjectBtn = document.getElementById("addSubjectBtn");
  const mySubjectsList = document.getElementById("mySubjectsList");
  const careerSelect = document.getElementById("careerSelect");
  const typeFilter = document.getElementById("typeFilter");
  const findMatchesBtn = document.getElementById("findMatchesBtn");
  const resultsHeading = document.getElementById("resultsHeading");
  const resultsList = document.getElementById("resultsList");
  const bursaryList = document.getElementById("bursaryList");
  const subjectsPanel = document.getElementById("subjectsPanel");
  const careerPanel = document.getElementById("careerPanel");
  const tabs = document.querySelectorAll(".cp-tab");

  let mode = "subjects";
  let allSubjects = [];
  const mySubjects = new Map(); // subject_id -> { name, level }

  function authHeaders() {
    const token = localStorage.getItem("sb-access-token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchJSON(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

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
  /* ---------- Tabs ---------- */

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      mode = tab.dataset.mode;
      subjectsPanel.style.display = mode === "subjects" ? "" : "none";
      careerPanel.style.display = mode === "career" ? "" : "none";
    });
  });

  /* ---------- Load reference data ---------- */

  async function loadSubjects() {
    try {
      const { subjects } = await fetchJSON("/career-pathfinder/subjects");
      allSubjects = subjects;
    } catch (err) {
      console.warn("Could not load subjects:", err.message);
    }
  }

  async function loadCareers() {
    try {
      const { careers } = await fetchJSON("/career-pathfinder/careers");
      careerSelect.innerHTML =
        '<option value="">Select a career…</option>' +
        careers.map((c) => `<option value="${c.career_id}">${c.name}</option>`).join("");
    } catch (err) {
      console.warn("Could not load careers:", err.message);
    }
  }

  async function loadBursaries(careerIds = []) {
    try {
      const qs = careerIds.length ? `?career_ids=${careerIds.join(",")}` : "";
      const { bursaries } = await fetchJSON(`/career-pathfinder/bursaries${qs}`);
      renderBursaries(bursaries, careerIds.length > 0);
    } catch (err) {
      bursaryList.innerHTML = `<p class="empty-state">Couldn't load bursaries right now.</p>`;
    }
  }

  function getRelevantCareerIds(results) {
    if (mode === "career") {
      return careerSelect.value ? [Number(careerSelect.value)] : [];
    }
    const ids = new Set();
    (results || []).forEach((p) => {
      if (p.qualifies !== true) return;
      const links = p.qualifications?.qualification_careers || [];
      links.forEach((qc) => {
        if (qc.careers?.career_id) ids.add(qc.careers.career_id);
      });
    });
    return Array.from(ids);
  }

  /* ---------- Searchable subject picker ---------- */

  let highlightedIndex = -1;
  let currentMatches = [];

  function renderSubjectOptions(query) {
    const q = query.trim().toLowerCase();
    currentMatches = q ? allSubjects.filter((s) => s.name.toLowerCase().includes(q)) : allSubjects;

    if (currentMatches.length === 0) {
      subjectOptionsList.innerHTML = `<div class="subject-option-empty">No subjects match "${query}"</div>`;
    } else {
      subjectOptionsList.innerHTML = currentMatches
        .map(
          (s, i) => `
          <div class="subject-option${i === highlightedIndex ? " highlighted" : ""}" data-id="${s.subject_id}" role="option">
            <span>${s.name}</span>
            ${s.category ? `<span class="subject-option-category">${s.category}</span>` : ""}
          </div>`
        )
        .join("");
    }

    subjectOptionsList.hidden = false;
    subjectSearchInput.setAttribute("aria-expanded", "true");
  }

  function closeSubjectOptions() {
    subjectOptionsList.hidden = true;
    subjectSearchInput.setAttribute("aria-expanded", "false");
    highlightedIndex = -1;
  }

  function selectSubject(subject) {
    subjectSelect.value = subject.subject_id;
    subjectSearchInput.value = subject.name;
    closeSubjectOptions();
  }

  subjectSearchInput.addEventListener("input", () => {
    subjectSelect.value = ""; // typing invalidates the previous pick until they choose again
    highlightedIndex = -1;
    renderSubjectOptions(subjectSearchInput.value);
  });

  subjectSearchInput.addEventListener("focus", () => {
    renderSubjectOptions(subjectSearchInput.value);
  });

  subjectSearchInput.addEventListener("keydown", (e) => {
    if (subjectOptionsList.hidden && e.key !== "ArrowDown") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (subjectOptionsList.hidden) return renderSubjectOptions(subjectSearchInput.value);
      highlightedIndex = Math.min(highlightedIndex + 1, currentMatches.length - 1);
      renderSubjectOptions(subjectSearchInput.value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      renderSubjectOptions(subjectSearchInput.value);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && currentMatches[highlightedIndex]) {
        selectSubject(currentMatches[highlightedIndex]);
      } else if (currentMatches.length === 1) {
        selectSubject(currentMatches[0]);
      }
    } else if (e.key === "Escape") {
      closeSubjectOptions();
    }
  });

  subjectOptionsList.addEventListener("click", (e) => {
    const optionEl = e.target.closest(".subject-option");
    if (!optionEl) return;
    const subject = allSubjects.find((s) => String(s.subject_id) === optionEl.dataset.id);
    if (subject) selectSubject(subject);
  });

  document.addEventListener("click", (e) => {
    if (!document.getElementById("subjectCombobox").contains(e.target)) {
      closeSubjectOptions();
    }
  });

  /* ---------- Subject chips ---------- */

  addSubjectBtn.addEventListener("click", () => {
    const subjectId = subjectSelect.value;
    const level = levelSelect.value;
    if (!subjectId || !level) return;

    const subject = allSubjects.find((s) => String(s.subject_id) === subjectId);
    if (!subject) return;

    mySubjects.set(Number(subjectId), { name: subject.name, level: Number(level) });
    renderSubjectChips();
    subjectSelect.value = "";
    subjectSearchInput.value = "";
    levelSelect.value = "";
  });

  function renderSubjectChips() {
    mySubjectsList.innerHTML = "";
    mySubjects.forEach((val, subjectId) => {
      const chip = document.createElement("div");
      chip.className = "subject-chip";
      chip.innerHTML = `${val.name} — Level ${val.level} <button data-id="${subjectId}">✕</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        mySubjects.delete(subjectId);
        renderSubjectChips();
      });
      mySubjectsList.appendChild(chip);
    });
  }

  /* ---------- Find matches ---------- */

  findMatchesBtn.addEventListener("click", async () => {
    resultsHeading.style.display = "block";
    resultsList.innerHTML = `<p class="empty-state">Searching…</p>`;

    try {
      let results;

      if (mode === "subjects") {
        if (mySubjects.size === 0) {
          resultsList.innerHTML = `<p class="empty-state">Add at least one subject and level above, then try again.</p>`;
          return;
        }
        const payload = {
          subjects: Array.from(mySubjects.entries()).map(([subject_id, v]) => ({
            subject_id,
            level: v.level,
          })),
          institution_type: typeFilter.value || undefined,
          career_id: careerSelect.value || undefined,
        };
        const data = await fetchJSON("/career-pathfinder/match", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        results = data.results;
      } else {
        const params = new URLSearchParams();
        if (careerSelect.value) params.set("career_id", careerSelect.value);
        if (typeFilter.value) params.set("institution_type", typeFilter.value);
        const data = await fetchJSON(`/career-pathfinder/programmes?${params.toString()}`);
        results = data.programmes.map((p) => ({ ...p, qualifies: null, requirement_status: [] }));
      }

      renderResults(results);
      const relevantCareerIds = getRelevantCareerIds(results);
      loadBursaries(relevantCareerIds);
    } catch (err) {
      resultsList.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  });

  function renderResults(results) {
    if (!results || results.length === 0) {
      resultsList.innerHTML = `<p class="empty-state">No programmes matched. Try widening your filters.</p>`;
      return;
    }

    resultsList.innerHTML = results
      .map((p) => {
        const qual = p.qualifications;
        const inst = p.institutions;
        const hasStatus = p.qualifies !== null;
        const statusClass = hasStatus ? (p.qualifies ? "qualifies" : "not-qualifies") : "";
        const statusBadge = hasStatus
          ? `<span class="status-badge ${statusClass}">${p.qualifies ? "You qualify" : "Not yet"}</span>`
          : "";

        const apsBadge =
          hasStatus && p.aps_min
            ? `<span class="aps-badge ${p.aps_met ? "met" : "unmet"}">APS ${p.aps_min}+ ${p.aps_met ? "✓" : "✕"}</span>`
            : "";

        const reqPills = (p.requirement_status || [])
          .map(
            (r) =>
              `<span class="requirement-pill ${r.met ? "met" : "unmet"}">${r.subject} ≥ ${r.min_level}${
                r.have_level ? ` (you: ${r.have_level})` : ""
              }</span>`
          )
          .join("");

        const applyOpen = p.application_open_date
          ? `Opens ${new Date(p.application_open_date).toLocaleDateString("en-ZA")}`
          : "";
        const applyClose = p.application_close_date
          ? `Closes ${new Date(p.application_close_date).toLocaleDateString("en-ZA")}`
          : "";

        return `
          <div class="programme-card ${statusClass}">
            <div class="programme-top">
              <div>
                <h3>${qual?.name || "Programme"}</h3>
                <div class="programme-meta">${inst?.name || ""} · ${inst?.city || ""}, ${inst?.province || ""}${
                  p.aps_min ? ` · APS ${p.aps_min}+` : ""
                }</div>
              </div>
              <div class="programme-badges">${statusBadge}${apsBadge}</div>
            </div>
            ${reqPills ? `<div class="requirement-list">${reqPills}</div>` : ""}
            <div class="programme-footer">
              ${applyOpen ? `<span>${applyOpen}</span>` : ""}
              ${applyClose ? `<span>${applyClose}</span>` : ""}
              ${p.info_url ? `<a href="${p.info_url}" target="_blank" rel="noopener">View programme page →</a>` : ""}
            </div>
          </div>`;
      })
      .join("");
  }

  /* ---------- Bursaries accordion ---------- */

  function statusBadgeHTML(status) {
    const map = {
      open: { label: "Open now", cls: "status-open" },
      opening_soon: { label: "Opening soon", cls: "status-soon" },
      closed: { label: "Closed", cls: "status-closed" },
    };
    const s = map[status] || map.open;
    return `<span class="bursary-status ${s.cls}">${s.label}</span>`;
  }

  function closingSoonHTML(b) {
    if (!b.closing_soon) return "";
    const dayLabel = b.days_until_close === 0 ? "Closes today" : `Closes in ${b.days_until_close}d`;
    return `<span class="bursary-urgent">⏳ ${dayLabel}</span>`;
  }

  function bursaryItemHTML(b, i) {
    const matchLine =
      b.matched && b.matched_fields?.length
        ? `<div class="bursary-match-tag"><i data-lucide="check-circle-2"></i> Matches: ${b.matched_fields.join(", ")}</div>`
        : "";

    return `
    <div class="bursary-item ${b.closing_soon ? "urgent" : ""}" id="bursary-${i}">
      <div class="bursary-summary" data-target="bursary-${i}">
        <div>
          <h4>${b.name}</h4>
          <span class="provider">${b.provider || ""}${b.field_of_study ? ` · ${b.field_of_study}` : ""}</span>
          ${matchLine}
        </div>
        <div class="bursary-summary-right">
          ${closingSoonHTML(b)}
          ${statusBadgeHTML(b.application_status)}
          <i data-lucide="chevron-down"></i>
        </div>
      </div>
      <div class="bursary-details">
        <p>${b.description || ""}</p>
        <div class="bursary-detail-row"><strong>Requirements</strong><span>${
          b.eligibility_requirements || "See official site."
        }</span></div>
        <div class="bursary-detail-row"><strong>Covers</strong><span>${b.coverage || "See official site."}</span></div>
        <div class="bursary-detail-row"><strong>Opens</strong><span>${
          b.application_open_date ? new Date(b.application_open_date).toLocaleDateString("en-ZA") : "Check official site"
        }</span></div>
        <div class="bursary-detail-row"><strong>Closes</strong><span>${
          b.application_close_date ? new Date(b.application_close_date).toLocaleDateString("en-ZA") : "Check official site"
        }</span></div>
        <a class="bursary-apply-btn" href="${b.redirect_url}" target="_blank" rel="noopener">Apply now →</a>
      </div>
    </div>`;
  }

  function renderBursaries(bursaries, isFiltered) {
    if (!bursaries || bursaries.length === 0) {
      bursaryList.innerHTML = `<p class="empty-state">No bursaries listed yet.</p>`;
      return;
    }

    const sorted = [...bursaries].sort((a, b) => {
      if (a.closing_soon !== b.closing_soon) return a.closing_soon ? -1 : 1;
      return 0;
    });

    let html = "";
    let idx = 0;

    const urgent = sorted.filter((b) => b.closing_soon);
    const rest = sorted.filter((b) => !b.closing_soon);

    if (urgent.length) {
      html += `<h3 class="bursary-group-heading">⏳ Closing soon</h3>`;
      html += urgent.map((b) => bursaryItemHTML(b, idx++)).join("");
    }

    if (isFiltered) {
      const suggested = rest.filter((b) => b.matched);
      const general = rest.filter((b) => !b.matched);

      if (suggested.length) {
        html += `<h3 class="bursary-group-heading">🎯 Suggested for you</h3>`;
        html += suggested.map((b) => bursaryItemHTML(b, idx++)).join("");
      }
      if (general.length) {
        html += `<h3 class="bursary-group-heading">Open to all fields</h3>`;
        html += general.map((b) => bursaryItemHTML(b, idx++)).join("");
      }
    } else {
      html += rest.map((b) => bursaryItemHTML(b, idx++)).join("");
    }

    bursaryList.innerHTML = html;

    document.querySelectorAll(".bursary-summary").forEach((el) => {
      el.addEventListener("click", () => {
        document.getElementById(el.dataset.target).classList.toggle("open");
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  loadSubjects();
  loadCareers();
  loadBursaries();
});