document.addEventListener('DOMContentLoaded', () => {

  const fileInput = document.getElementById('cvFileInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const analyzeBtn2 = document.getElementById('analyzeBtn2');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadBtn2 = document.getElementById('downloadBtn2');
  const jobDesc = document.getElementById('jobDesc');

  const searchInput = document.getElementById('searchInput');
  const emptyState = document.getElementById('emptyState');
  const sections = document.querySelectorAll('.searchable');

  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');

  /* ================= SIDEBAR ================= */
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  /* ================= SEARCH ================= */
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const value = searchInput.value.toLowerCase();
      let visible = 0;

      sections.forEach(sec => {
        const match = sec.textContent.toLowerCase().includes(value);
        sec.style.display = match ? '' : 'none';
        if (match) visible++;
      });

      if (emptyState) {
        emptyState.classList.toggle('hidden', visible !== 0);
      }
    });
  }

  /* ================= FILE PICKER FIX ================= */
  const openFilePicker = () => {
    if (!fileInput) return;
    fileInput.value = ""; // prevents double file selection bug
    fileInput.click();
  };

  if (analyzeBtn) analyzeBtn.addEventListener('click', openFilePicker);
  if (analyzeBtn2) analyzeBtn2.addEventListener('click', openFilePicker);

  /* ================= API ================= */
  const API_URL = "http://localhost:5000/api/cv/upload";

  /* ================= UPLOAD ================= */
  if (fileInput) {
    fileInput.addEventListener('change', async () => {

      const file = fileInput.files[0];
      if (!file) return;

      console.log("📂 File selected:", file.name);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('job_desc', jobDesc?.value || '');

      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        console.log("Backend response:", data);

        if (!res.ok) {
          throw new Error(data.error || "Server error");
        }

        /* ================= SAFE VALUES ================= */
        const overall = data.score ?? 0;
        const prev = data.prev_score ?? 0;
        const match = data.match ?? 0;

        const ats = data.ats ?? 0;
        const content = data.content ?? 0;
        const formatting = data.formatting ?? 0;

        // FIX: skills must be array-safe
        const skills = Array.isArray(data.skills) ? data.skills : [];

        /* ================= CV SCORE ================= */
        const scoreText = document.querySelector('.cv-score-value');
        const scoreInner = document.querySelector('.cv-score-inner');

        if (scoreText) scoreText.textContent = overall + '%';
        if (scoreInner) scoreInner.textContent = overall + '%';

        /* ================= JOB MATCH ================= */
        const matchText = document.querySelector('.job-match-percent');
        const missingText = document.querySelector('.job-match-missing');

        const missingCount = Math.max(0, 5 - skills.length);

        if (matchText) matchText.textContent = `Match ${match}%`;
        if (missingText) missingText.textContent = `${missingCount} Key skills missing`;

        /* ================= BREAKDOWN ================= */
        const setBar = (clsScore, clsBar, value) => {
          const scoreEl = document.querySelector(clsScore);
          const barEl = document.querySelector(clsBar);

          if (scoreEl) scoreEl.textContent = value + '%';
          if (barEl) barEl.style.width = value + '%';
        };

        setBar('.ats-score', '.ats-bar', ats);
        setBar('.content-score', '.content-bar', content);
        setBar('.format-score', '.format-bar', formatting);

        /* ================= PROGRESS ================= */
        const prevBar = document.querySelector('.progress-fill.previous');
        const currBar = document.querySelector('.progress-fill.current');

        if (prevBar) prevBar.style.width = prev + '%';
        if (currBar) currBar.style.width = overall + '%';

        /* ================= DOWNLOAD ================= */
        const handleDownload = async () => {
          const res = await fetch("http://localhost:5000/download_cv", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              improved: `AI Improved CV Score: ${overall}%`
            })
          });

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = 'improved_cv.pdf';
          a.click();
        };

        if (downloadBtn) downloadBtn.onclick = handleDownload;
        if (downloadBtn2) downloadBtn2.onclick = handleDownload;

        alert("Upload complete ✅ CV analyzed");

      } catch (err) {
        console.error("UPLOAD ERROR:", err);
        alert("Backend not running or CV analysis failed");
      }
    });
  }

});