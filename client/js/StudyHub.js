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

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      Object.entries(panels).forEach(([id, el]) => {
        el.style.display = id === tab.dataset.panel ? "" : "none";
      });
    });
  });

  /* ---------- Subjects for both filter dropdowns ---------- */

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