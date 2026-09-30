document.addEventListener("DOMContentLoaded", () => {
  const API = (typeof API_BASE !== "undefined" ? API_BASE : "http://localhost:5001/api");

  const subjectSelect = document.getElementById("subjectSelect");
  const levelSelect = document.getElementById("levelSelect");
  const addSubjectBtn = document.getElementById("addSubjectBtn");
  const mySubjectsList = document.getElementById("mySubjectsList");
  const careerSelect = document.getElementById("careerSelect");
  const typeFilter = document.getElementById("typeFilter");
  const provinceFilter = document.getElementById("provinceFilter");
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
      subjectSelect.innerHTML =
        '<option value="">Select a subject…</option>' +
        subjects.map((s) => `<option value="${s.subject_id}">${s.name}</option>`).join("");
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

  async function loadBursaries() {
    try {
      const { bursaries } = await fetchJSON("/career-pathfinder/bursaries");
      renderBursaries(bursaries);
    } catch (err) {
      bursaryList.innerHTML = `<p class="empty-state">Couldn't load bursaries right now.</p>`;
    }
  }

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
      let payload;
      let results;

      if (mode === "subjects") {
        if (mySubjects.size === 0) {
          resultsList.innerHTML = `<p class="empty-state">Add at least one subject and level above, then try again.</p>`;
          return;
        }
        payload = {
          subjects: Array.from(mySubjects.entries()).map(([subject_id, v]) => ({
            subject_id,
            level: v.level,
          })),
          province: provinceFilter.value || undefined,
          institution_type: typeFilter.value || undefined,
        };
        const data = await fetchJSON("/career-pathfinder/match", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        results = data.results;
      } else {
        const params = new URLSearchParams();
        if (careerSelect.value) params.set("career_id", careerSelect.value);
        if (provinceFilter.value) params.set("province", provinceFilter.value);
        if (typeFilter.value) params.set("institution_type", typeFilter.value);
        const data = await fetchJSON(`/career-pathfinder/programmes?${params.toString()}`);
        results = data.programmes.map((p) => ({ ...p, qualifies: null, requirement_status: [] }));
      }

      renderResults(results);
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
              ${statusBadge}
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

  function renderBursaries(bursaries) {
    if (!bursaries || bursaries.length === 0) {
      bursaryList.innerHTML = `<p class="empty-state">No bursaries listed yet.</p>`;
      return;
    }

    bursaryList.innerHTML = bursaries
      .map(
        (b, i) => `
        <div class="bursary-item" id="bursary-${i}">
          <div class="bursary-summary" data-target="bursary-${i}">
            <div>
              <h4>${b.name}</h4>
              <span class="provider">${b.provider || ""}${b.field_of_study ? ` · ${b.field_of_study}` : ""}</span>
            </div>
            <i data-lucide="chevron-down"></i>
          </div>
          <div class="bursary-details">
            <p>${b.description || ""}</p>
            <div class="bursary-detail-row"><strong>Requirements</strong><span>${b.eligibility_requirements || "See official site."}</span></div>
            <div class="bursary-detail-row"><strong>Covers</strong><span>${b.coverage || "See official site."}</span></div>
            <div class="bursary-detail-row"><strong>Opens</strong><span>${
              b.application_open_date ? new Date(b.application_open_date).toLocaleDateString("en-ZA") : "Check official site"
            }</span></div>
            <div class="bursary-detail-row"><strong>Closes</strong><span>${
              b.application_close_date ? new Date(b.application_close_date).toLocaleDateString("en-ZA") : "Check official site"
            }</span></div>
            <a class="bursary-apply-btn" href="${b.redirect_url}" target="_blank" rel="noopener">Apply now →</a>
          </div>
        </div>`
      )
      .join("");

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