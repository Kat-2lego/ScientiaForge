/**
 * ReportGenerator.js
 * Generates a detailed, downloadable PDF interview report.
 * Uses jsPDF (loaded from CDN) + Chart.js for the radar chart.
 *
 * Usage:
 *   const gen = new ReportGenerator(reportData);
 *   await gen.download();                   // saves PDF
 *   const dataUrl = await gen.toDataURL();  // for preview
 */

import { analyzeFillerWords, analyzeSTAR } from "./BehaviorAnalyzer.js";

export class ReportGenerator {
  /**
   * @param {Object} data
   * @param {string}   data.candidateName
   * @param {string}   data.personaName
   * @param {string}   data.personaTitle
   * @param {string}   data.interviewType
   * @param {string}   data.targetRole
   * @param {Date}     data.date
   * @param {number}   data.overallScore       — 0–10
   * @param {Object}   data.breakdown          — { confidence, clarity, structure }
   * @param {Array}    data.perQuestion        — [{ question, answer, feedback, score }]
   * @param {string[]} data.tips
   * @param {Object}   [data.behaviorReport]   — from BehaviorAnalyzer.getReport()
   */
  constructor(data) {
    this.data = data;
  }

  // ─── Build the in-page HTML report (shown inside the feedbackUI) ──────────

  /**
   * Renders the full report into a given container element.
   * @param {HTMLElement} container
   */
  renderHTML(container) {
    const d = this.data;

    // Compute enriched analytics per answer
    const enriched = (d.perQuestion || []).map((q) => ({
      ...q,
      fillerAnalysis: analyzeFillerWords(q.answer || ""),
      starAnalysis:   analyzeSTAR(q.answer || ""),
    }));

    // Aggregate filler words
    const totalFillers = enriched.reduce((s, e) => s + e.fillerAnalysis.count, 0);
    const fillerScore  = enriched.length
      ? Math.round(enriched.reduce((s, e) => s + e.fillerAnalysis.score, 0) / enriched.length)
      : 10;

    // STAR aggregate
    const starScores   = enriched.map((e) => e.starAnalysis.score);
    const avgStar      = starScores.length
      ? Math.round(starScores.reduce((a, b) => a + b, 0) / starScores.length)
      : 0;

    const bReport      = d.behaviorReport || null;

    container.innerHTML = `
      <div class="rpt-root">

        <!-- Header -->
        <div class="rpt-header">
          <div class="rpt-logo">Skill<span>Forge</span> <em>AI</em></div>
          <div class="rpt-meta">
            <strong>${d.candidateName || "Candidate"}</strong>
            <span>${d.interviewType} Interview · ${d.targetRole || "General"}</span>
            <span>Interviewer: ${d.personaName} — ${d.personaTitle}</span>
            <span class="rpt-date">${new Date(d.date || Date.now()).toLocaleDateString("en-ZA", { dateStyle: "long" })}</span>
          </div>
        </div>

        <!-- Score band -->
        <div class="rpt-score-band">
          <div class="rpt-score-circle ${_scoreClass(d.overallScore)}">
            <span class="rpt-score-num">${d.overallScore ?? "–"}</span>
            <span class="rpt-score-denom">/10</span>
          </div>
          <div class="rpt-score-labels">
            <h2>${_scoreLabel(d.overallScore)}</h2>
            <p>${_scoreDesc(d.overallScore)}</p>
          </div>
        </div>

        <!-- Radar chart -->
        <div class="rpt-section">
          <h3 class="rpt-section-title">Competency Radar</h3>
          <div class="rpt-radar-wrap">
            <canvas id="radarChart" width="320" height="320"></canvas>
          </div>
        </div>

        <!-- KPI grid -->
        <div class="rpt-kpi-grid">
          ${_kpi("Confidence",  d.breakdown?.confidence, "💪")}
          ${_kpi("Clarity",     d.breakdown?.clarity,    "🎯")}
          ${_kpi("Structure",   d.breakdown?.structure,  "📐")}
          ${_kpi("STAR Method", avgStar,                 "⭐")}
          ${_kpi("Fluency",     fillerScore,             "🗣️")}
          ${bReport ? _kpi("Eye Contact", Math.round(bReport.eyeContact / 10), "👁️") : ""}
          ${bReport ? _kpi("Presence",    Math.round(bReport.score      / 10), "🧍") : ""}
        </div>

        <!-- Filler word analysis -->
        <div class="rpt-section">
          <h3 class="rpt-section-title">Speech Analysis</h3>
          <div class="rpt-speech-grid">
            <div class="rpt-speech-item">
              <span class="rpt-speech-val ${totalFillers > 10 ? "warn" : "good"}">${totalFillers}</span>
              <span class="rpt-speech-label">Filler words used</span>
            </div>
            <div class="rpt-speech-item">
              <span class="rpt-speech-val">${fillerScore}/10</span>
              <span class="rpt-speech-label">Fluency score</span>
            </div>
          </div>
          ${_topFillers(enriched)}
        </div>

        <!-- Webcam behaviour (conditional) -->
        ${bReport ? `
        <div class="rpt-section">
          <h3 class="rpt-section-title">Body Language & Presence</h3>
          <div class="rpt-kpi-grid">
            <div class="rpt-kpi-card">
              <div class="rpt-kpi-val">${bReport.eyeContact}%</div>
              <div class="rpt-kpi-label">Eye contact</div>
              <div class="rpt-kpi-bar"><div class="rpt-kpi-fill" style="width:${bReport.eyeContact}%;background:${bReport.eyeContact>65?'#10b981':'#f59e0b'}"></div></div>
            </div>
            <div class="rpt-kpi-card">
              <div class="rpt-kpi-val">${bReport.presence}%</div>
              <div class="rpt-kpi-label">Camera presence</div>
              <div class="rpt-kpi-bar"><div class="rpt-kpi-fill" style="width:${bReport.presence}%"></div></div>
            </div>
            <div class="rpt-kpi-card">
              <div class="rpt-kpi-val">${bReport.blinkRate}/s</div>
              <div class="rpt-kpi-label">Blink rate</div>
            </div>
          </div>
        </div>` : ""}

        <!-- Per-question breakdown -->
        <div class="rpt-section">
          <h3 class="rpt-section-title">Question-by-Question Breakdown</h3>
          ${enriched.map((q, i) => _questionCard(q, i)).join("")}
        </div>

        <!-- Tips -->
        <div class="rpt-section rpt-tips">
          <h3 class="rpt-section-title">Key Improvement Tips from ${d.personaName}</h3>
          <ul class="rpt-tips-list">
            ${(d.tips || []).map((t) => `<li>${t}</li>`).join("")}
          </ul>
        </div>

        <!-- Download button -->
        <div class="rpt-actions">
          <button class="rpt-dl-btn" id="downloadPdfBtn">
            ⬇ Download PDF Report
          </button>
        </div>

      </div>
    `;

    // Draw radar after DOM is ready
    requestAnimationFrame(() => {
      this._drawRadar({
        confidence: d.breakdown?.confidence ?? 0,
        clarity:    d.breakdown?.clarity    ?? 0,
        structure:  d.breakdown?.structure  ?? 0,
        star:       avgStar,
        fluency:    fillerScore,
        ...(bReport ? { eyeContact: Math.round(bReport.eyeContact / 10) } : {}),
      });

      document.getElementById("downloadPdfBtn")?.addEventListener("click", () => this.download());
    });
  }

  // ─── Radar chart ──────────────────────────────────────────────────────────

  _drawRadar(scores) {
    const canvas = document.getElementById("radarChart");
    if (!canvas) return;

    const labels = Object.keys(scores).map((k) =>
      k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())
    );
    const values = Object.values(scores);

    // Load Chart.js if not present
    const draw = () => {
      new Chart(canvas, {
        type: "radar",
        data: {
          labels,
          datasets: [{
            label:           "Your Performance",
            data:            values,
            backgroundColor: "rgba(0,51,160,0.15)",
            borderColor:     "#0033a0",
            pointBackgroundColor: "#0033a0",
            pointRadius:     4,
            borderWidth:     2,
          }],
        },
        options: {
          scales: {
            r: {
              min: 0, max: 10,
              ticks:    { stepSize: 2, font: { size: 11 }, color: "#64748b" },
              grid:     { color: "rgba(0,0,0,0.08)" },
              pointLabels: { font: { size: 12, weight: "600" }, color: "#334155" },
            },
          },
          plugins: { legend: { display: false } },
        },
      });
    };

    if (window.Chart) {
      draw();
    } else {
      const s   = document.createElement("script");
      s.src     = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
      s.onload  = draw;
      document.head.appendChild(s);
    }
  }

  // ─── PDF download ─────────────────────────────────────────────────────────

  async download() {
    await _loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
    await _loadScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js");

    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ unit: "mm", format: "a4" });
    const d     = this.data;
    const W     = doc.internal.pageSize.getWidth();
    let   y     = 0;

    const nl = (h = 6) => { y += h; };
    const checkPage = (needed = 20) => {
      if (y + needed > 270) { doc.addPage(); y = 15; }
    };

    // ── Cover ──────────────────────────────────────────────────────────────
    doc.setFillColor(0, 43, 92);
    doc.rect(0, 0, W, 50, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26); doc.setFont("helvetica", "bold");
    doc.text("SkillForge AI", 15, 22);

    doc.setFontSize(13); doc.setFont("helvetica", "normal");
    doc.text("Interview Performance Report", 15, 32);

    doc.setFontSize(10);
    doc.text(`${d.interviewType} · ${d.targetRole || "General Role"} · ${d.personaName}`, 15, 42);
    doc.text(new Date(d.date || Date.now()).toLocaleDateString("en-ZA", { dateStyle: "long" }), W - 15, 42, { align: "right" });

    y = 62;

    // ── Overall score ──────────────────────────────────────────────────────
    doc.setTextColor(0, 43, 92); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(`Overall Score: ${d.overallScore ?? "–"}/10 — ${_scoreLabel(d.overallScore)}`, 15, y);
    nl(8);

    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 116, 139);
    doc.text(_scoreDesc(d.overallScore), 15, y, { maxWidth: W - 30 });
    nl(14);

    // ── Competency table ───────────────────────────────────────────────────
    doc.autoTable({
      startY: y,
      head:   [["Competency", "Score / 10", "Rating"]],
      body:   [
        ["Confidence",  d.breakdown?.confidence ?? "–", _ratingLabel(d.breakdown?.confidence)],
        ["Clarity",     d.breakdown?.clarity    ?? "–", _ratingLabel(d.breakdown?.clarity)],
        ["Structure",   d.breakdown?.structure  ?? "–", _ratingLabel(d.breakdown?.structure)],
      ],
      headStyles: { fillColor: [0, 43, 92], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      styles: { fontSize: 10 },
    });
    y = doc.lastAutoTable.finalY + 10;

    // ── Per-question ───────────────────────────────────────────────────────
    checkPage(20);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0, 43, 92);
    doc.text("Question-by-Question Review", 15, y); nl(8);

    for (const [i, q] of (d.perQuestion || []).entries()) {
      checkPage(40);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 43, 92);
      doc.text(`Q${i + 1}: ${_wrap(q.question, 90)}`, 15, y);
      nl(6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(51, 65, 85);
      if (q.answer) {
        const ansLines = doc.splitTextToSize(`Your answer: ${q.answer}`, W - 30);
        doc.text(ansLines, 15, y); y += ansLines.length * 4.5;
      }
      if (q.feedback) {
        doc.setTextColor(100, 116, 139);
        const fbLines = doc.splitTextToSize(`Feedback: ${q.feedback}`, W - 30);
        doc.text(fbLines, 15, y); y += fbLines.length * 4.5;
      }

      // STAR indicator
      const star = analyzeSTAR(q.answer || "");
      doc.setTextColor(0, 51, 160);
      doc.text(`STAR completeness: ${star.completeness}  (${star.score}/10)`, 15, y); nl(8);
    }

    // ── Tips ───────────────────────────────────────────────────────────────
    checkPage(30);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0, 43, 92);
    doc.text("Key Improvement Tips", 15, y); nl(7);

    for (const tip of (d.tips || [])) {
      checkPage(12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(`• ${tip}`, W - 30);
      doc.text(lines, 15, y); y += lines.length * 5 + 3;
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(8); doc.setTextColor(148, 163, 184);
      doc.text(`SkillForge AI · Confidential · Page ${p} of ${pages}`, W / 2, 290, { align: "center" });
    }

    doc.save(`SkillForge_Interview_Report_${Date.now()}.pdf`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _scoreClass(s) {
  if (s >= 8) return "excellent";
  if (s >= 6) return "good";
  if (s >= 4) return "average";
  return "weak";
}

function _scoreLabel(s) {
  if (s >= 8) return "Excellent Performance";
  if (s >= 6) return "Strong Candidate";
  if (s >= 4) return "Room for Growth";
  return "Needs Significant Practice";
}

function _scoreDesc(s) {
  if (s >= 8) return "You demonstrated strong communication, clear structure, and confident delivery. You're well-prepared for this role.";
  if (s >= 6) return "Solid answers with good examples. Focus on tightening your structure and reducing filler words to stand out further.";
  if (s >= 4) return "You covered the basics but struggled with depth and structure. Review the STAR method and practise with timed responses.";
  return "Significant preparation is needed. Focus on one competency at a time and book regular mock sessions.";
}

function _ratingLabel(s) {
  if (!s && s !== 0) return "–";
  if (s >= 7) return "Strong";
  if (s >= 4) return "Average";
  return "Needs Work";
}

function _kpi(label, value, icon) {
  const pct  = Math.min((value ?? 0) * 10, 100);
  const cls  = value >= 7 ? "good" : value >= 4 ? "avg" : "low";
  return `
    <div class="rpt-kpi-card">
      <div class="rpt-kpi-icon">${icon}</div>
      <div class="rpt-kpi-val ${cls}">${value ?? "–"}/10</div>
      <div class="rpt-kpi-label">${label}</div>
      <div class="rpt-kpi-bar"><div class="rpt-kpi-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function _topFillers(enriched) {
  const map = {};
  enriched.forEach((e) => {
    (e.fillerAnalysis.words || []).forEach(({ word, count }) => {
      map[word] = (map[word] || 0) + count;
    });
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!sorted.length) return `<p class="rpt-good-msg">✓ No significant filler word use detected. Great work!</p>`;
  return `<div class="rpt-filler-chips">${sorted.map(([w, c]) =>
    `<span class="rpt-filler-chip">"${w}" ×${c}</span>`).join("")}</div>`;
}

function _questionCard(q, i) {
  const star = q.starAnalysis;
  const fl   = q.fillerAnalysis;
  const comp = [
    star.situation ? "✓ Situation" : "✗ Situation",
    star.task      ? "✓ Task"      : "✗ Task",
    star.action    ? "✓ Action"    : "✗ Action",
    star.result    ? "✓ Result"    : "✗ Result",
  ];
  return `
    <div class="rpt-qa-card">
      <div class="rpt-qa-header">
        <span class="rpt-qa-num">Q${i + 1}</span>
        <span class="rpt-qa-score ${_scoreClass(q.score)}">${q.score ?? "–"}/10</span>
      </div>
      <p class="rpt-qa-q">${q.question}</p>
      ${q.answer
        ? `<p class="rpt-qa-a"><em>Your answer:</em> ${q.answer}</p>`
        : `<p class="rpt-qa-skip">Skipped</p>`}
      ${q.feedback ? `<p class="rpt-qa-fb">${q.feedback}</p>` : ""}

      <div class="rpt-star-row">
        ${comp.map((c) => `<span class="rpt-star-chip ${c.startsWith("✓") ? "hit" : "miss"}">${c}</span>`).join("")}
      </div>

      ${fl.count > 0 ? `<p class="rpt-filler-note">Filler words: ${fl.count} detected — score ${fl.score}/10</p>` : ""}
    </div>`;
}

function _wrap(text, maxLen) {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

async function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src   = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}