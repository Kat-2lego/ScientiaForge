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

  const openFilePicker = () => {
    if (fileInput) fileInput.click();
  };

  if (analyzeBtn) analyzeBtn.addEventListener('click', openFilePicker);
  if (analyzeBtn2) analyzeBtn2.addEventListener('click', openFilePicker);

  /* ================= CV UPLOAD ================= */
  if (fileInput) {
    fileInput.addEventListener('change', async () => {

      const file = fileInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('cv_file', file);
      formData.append('job_desc', jobDesc?.value || '');

      try {
        const res = await fetch('http://127.0.0.1:5000/analyze_cv', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        console.log("Backend response:", data);

        /* ================= SAFE VALUES ================= */
        const overall = data.overall ?? 0;
        const prev = data.prev_score ?? 0;
        const match = data.match ?? 0;

        const ats = data.ats ?? 0;
        const content = data.content ?? 0;
        const formatting = data.formatting ?? 0;
        const skills = data.skills ?? 0;

        /* ================= CV SCORE ================= */
        const scoreText = document.querySelector('.cv-score-value');
        const scoreInner = document.querySelector('.cv-score-inner');
        const circle = document.querySelector('.cv-score-circle');

        if (scoreText) scoreText.textContent = overall + '%';
        if (scoreInner) scoreInner.textContent = overall + '%';

        if (circle) {
          circle.style.setProperty('--score', overall);
        }

        /* ================= JOB MATCH ================= */
        const matchText = document.querySelector('.job-match-percent');
        const missingText = document.querySelector('.job-match-missing');

        if (matchText) matchText.textContent = `Match ${match}%`;
        if (missingText) missingText.textContent = `${data.missing_skills ?? 0} Key skills missing`;

        /* ================= CV BREAKDOWN ================= */

        const setBar = (clsScore, clsBar, value) => {
          const scoreEl = document.querySelector(clsScore);
          const barEl = document.querySelector(clsBar);

          if (scoreEl) scoreEl.textContent = value + '%';
          if (barEl) barEl.style.width = value + '%';
        };

        setBar('.ats-score', '.ats-bar', ats);
        setBar('.content-score', '.content-bar', content);
        setBar('.format-score', '.format-bar', formatting);
        setBar('.skills-score', '.skills-bar', skills);

        /* ================= PROGRESS TRACKER ================= */

        const prevScoreText = document.querySelector('.prev-score');
        const prevScoreText2 = document.querySelector('.prev-score-text');
        const prevBar = document.querySelector('.progress-fill.previous');

        const currScoreText = document.querySelector('.curr-score');
        const currScoreText2 = document.querySelector('.curr-score-text');
        const currBar = document.querySelector('.progress-fill.current');

        if (prevScoreText) prevScoreText.textContent = prev + '%';
        if (prevScoreText2) prevScoreText2.textContent = prev + '%';
        if (prevBar) prevBar.style.width = prev + '%';

        if (currScoreText) currScoreText.textContent = overall + '%';
        if (currScoreText2) currScoreText2.textContent = overall + '%';
        if (currBar) currBar.style.width = overall + '%';

        /* ================= PLOTLY GRAPH ================= */

        const chart = document.getElementById('progressChart');

        if (chart && typeof Plotly !== "undefined") {
          Plotly.newPlot('progressChart', [{
            x: ['Previous CV', 'Current CV'],
            y: [prev, overall],
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#4d8dff' },
            marker: { size: 8 }
          }], {
            title: 'CV Progress Tracker',
            yaxis: { range: [0, 100] },
            margin: { t: 40, l: 40, r: 20, b: 40 }
          });
        }

        /* ================= DOWNLOAD ================= */

        const handleDownload = async () => {
          const res = await fetch('http://127.0.0.1:5000/download_cv', {
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

      } catch (err) {
        console.error(err);
        alert('Backend not running or CV analysis failed');
      }
    });
  }

});

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

    document.querySelector(".hero h1").textContent = `Welcome, ${firstName}!`;
    document.querySelector(".profile-name").textContent = firstName;
    document.querySelector(".profile-email").textContent = email;
  } catch (err) {
    console.error("Failed to load user:", err);
  }
}

loadUserGreeting();