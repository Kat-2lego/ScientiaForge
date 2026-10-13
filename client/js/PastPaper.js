/* SkillForge · NSC past paper details: downloads, preview, Active Recall entry point. */
document.addEventListener("DOMContentLoaded", async () => {
  "use strict";
  const { api, esc, safeUrl, icons, formatDate, paperName, sessionLabel, param } = window.NSC;
  const root = document.getElementById("paperRoot");
  window.NSC.initSidebar();

  const message = (title, body, action = "") => `
    <div class="nsc-message">
      <h1>${esc(title)}</h1>
      <p>${esc(body)}</p>
      ${action}
    </div>`;

  const id = param("id");
  if (!id || !/^\d+$/.test(id)) {
    root.innerHTML = message("Paper not found", "This link doesn't point to a past paper.",
      `<a class="nsc-btn nsc-btn-primary" href="StudyHub.html">Browse past papers</a>`);
    return;
  }

  let paper;
  try {
    ({ paper } = await api(`/papers/${id}`));
  } catch (err) {
    root.innerHTML = message(err.status === 404 ? "Paper not found" : "Couldn't load this paper", err.message,
      `<a class="nsc-btn nsc-btn-primary" href="StudyHub.html">Back to past papers</a>`);
    return;
  }

  document.title = `${paperName(paper)}, ${sessionLabel(paper)} | SkillForge Study Hub`;
  const n = paper.recall_session_size;
  const article = /^(8|11|18)/.test(String(n)) ? "an" : "a"; // an 8-, an 11-, an 18-question
  const selfCount = Math.max(0, paper.recall_question_count - paper.auto_markable_count);
  const browseLink = `StudyHub.html?subject=${encodeURIComponent(paper.subject)}`;

  root.innerHTML = `
    <nav class="nsc-crumbs" aria-label="Breadcrumb">
      <a href="StudyHub.html">Study Hub</a><span aria-hidden="true">/</span>
      <a href="${browseLink}">${esc(paper.subject)}</a><span aria-hidden="true">/</span>
      <span aria-current="page">Paper ${esc(paper.paper_number)}, ${esc(sessionLabel(paper))}</span>
    </nav>

    <header class="pp-header">
      <p class="pp-kicker">National Senior Certificate, Grade ${esc(paper.grade)}</p>
      <h1>${esc(paper.subject)} <span>Paper ${esc(paper.paper_number)}</span></h1>
      <div class="nsc-chips">
        <span class="nsc-chip">${esc(sessionLabel(paper))}</span>
        ${paper.total_marks ? `<span class="nsc-chip">${esc(paper.total_marks)} marks</span>` : ""}
        ${paper.page_count ? `<span class="nsc-chip">${esc(paper.page_count)} pages</span>` : ""}
        <span class="nsc-chip">${esc(paper.language || "English")}</span>
      </div>
      <div class="pp-downloads">
        <a class="nsc-btn nsc-btn-ghost" href="${esc(safeUrl(paper.question_paper_download_url))}" download>
          <i data-lucide="download"></i>Download question paper</a>
        ${
          paper.memorandum_download_url
            ? `<a class="nsc-btn nsc-btn-ghost" href="${esc(safeUrl(paper.memorandum_download_url))}" download>
                 <i data-lucide="file-check"></i>Download memorandum</a>`
            : `<span class="nsc-btn nsc-btn-ghost is-disabled" aria-disabled="true"><i data-lucide="file-x"></i>Memo not available</span>`
        }
        ${paper.source_url ? `<a class="nsc-link" href="${esc(safeUrl(paper.source_url))}" target="_blank" rel="noopener">Original on the DBE website<i data-lucide="external-link"></i></a>` : ""}
      </div>
    </header>

    <section class="pp-recall ${paper.recall_available ? "" : "is-unavailable"}" aria-labelledby="ppRecallTitle">
      <div class="pp-recall-icon" aria-hidden="true"><i data-lucide="brain"></i></div>
      <div class="pp-recall-body">
        ${
          paper.recall_available
            ? `<h2 id="ppRecallTitle">Turn this past paper into ${article} ${n}-question Active Recall session</h2>
               <p>Answer real questions from this paper one at a time, from memory. The memo stays hidden until you submit,
                  then you see exactly what the examiners expected.</p>
               <div class="nsc-chips">
                 <span class="nsc-chip nsc-chip-plain"><i data-lucide="check-check"></i>${esc(paper.auto_markable_count)} marked for you</span>
                 <span class="nsc-chip nsc-chip-plain"><i data-lucide="scale"></i>${esc(selfCount)} you mark against the memo</span>
               </div>
               <div class="pp-recall-actions" id="ppRecallActions">
                 <a class="nsc-btn nsc-btn-primary nsc-btn-lg" href="ActiveRecall.html?paper=${encodeURIComponent(paper.id)}">
                   <i data-lucide="play"></i>Start session</a>
               </div>`
            : `<h2 id="ppRecallTitle">Active Recall isn't available for this paper</h2>
               <p>${esc(window.NSC.unavailableText(paper.recall_unavailable_reason, "long"))}</p>`
        }
      </div>
    </section>

    <section class="pp-preview" aria-labelledby="ppPreviewTitle">
      <div class="pp-section-head">
        <h2 id="ppPreviewTitle">Preview</h2>
        <div class="pp-toggle" role="tablist" aria-label="Choose document">
          <button type="button" role="tab" aria-selected="true" data-src="${esc(safeUrl(paper.question_paper_url))}">Question paper</button>
          ${paper.memorandum_url ? `<button type="button" role="tab" aria-selected="false" data-src="${esc(safeUrl(paper.memorandum_url))}">Memorandum</button>` : ""}
        </div>
      </div>
      <div class="pp-frame">
        <iframe id="ppFrame" title="Question paper preview" loading="lazy" src="${esc(safeUrl(paper.question_paper_url))}#view=FitH"></iframe>
      </div>
      <p class="pp-mobile-open">
        <a class="nsc-btn nsc-btn-ghost" id="ppOpen" href="${esc(safeUrl(paper.question_paper_url))}" target="_blank" rel="noopener">
          <i data-lucide="file-text"></i>Open the PDF</a>
      </p>
    </section>

    <section class="pp-sessions" aria-labelledby="ppSessionsTitle" hidden>
      <div class="pp-section-head"><h2 id="ppSessionsTitle">Your sessions on this paper</h2></div>
      <div id="ppSessionList" class="nsc-history-list"></div>
    </section>`;
  icons(root);

  /* preview toggle */
  const frame = document.getElementById("ppFrame");
  const openLink = document.getElementById("ppOpen");
  root.querySelectorAll(".pp-toggle button").forEach((btn) =>
    btn.addEventListener("click", () => {
      root.querySelectorAll(".pp-toggle button").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      frame.src = `${btn.dataset.src}#view=FitH`;
      frame.title = `${btn.textContent} preview`;
      openLink.href = btn.dataset.src;
    })
  );

  /* previous sessions + resume */
  try {
    const { sessions } = await api(`/sessions?paper_id=${encodeURIComponent(paper.id)}&limit=10`);
    if (!sessions.length) return;
    const section = root.querySelector(".pp-sessions");
    section.hidden = false;
    document.getElementById("ppSessionList").innerHTML = sessions
      .map((s) => {
        const done = s.status === "completed";
        return `
          <article class="nsc-history-item">
            <div class="nsc-history-main">
              <h3>${s.mode === "retry" ? "Retry of incorrect answers" : `${s.question_count}-question session`}</h3>
              <div class="nsc-chips"><span class="nsc-chip nsc-chip-plain">${done ? "Finished" : "Started"} ${esc(formatDate(done ? s.completed_at : s.started_at))}</span></div>
            </div>
            <div class="nsc-history-score ${done ? "" : "is-progress"}">
              <strong>${done ? `${s.correct_count}/${s.question_count}` : `${s.answered_count}/${s.question_count}`}</strong>
              <span>${done ? `${Math.round(s.percentage)}%` : "answered"}</span>
            </div>
            <a class="nsc-btn ${done ? "nsc-btn-ghost" : "nsc-btn-primary"}" href="ActiveRecall.html?session=${encodeURIComponent(s.id)}">
              ${done ? "View results" : "Resume"}</a>
          </article>`;
      })
      .join("");

    const open = sessions.find((s) => s.status === "in_progress" && s.mode === "full");
    const actions = document.getElementById("ppRecallActions");
    if (open && actions) {
      actions.innerHTML = `
        <a class="nsc-btn nsc-btn-primary nsc-btn-lg" href="ActiveRecall.html?session=${encodeURIComponent(open.id)}">
          <i data-lucide="play"></i>Resume session (${open.answered_count} of ${open.question_count} answered)</a>
        <a class="nsc-btn nsc-btn-ghost" href="ActiveRecall.html?paper=${encodeURIComponent(paper.id)}">Start a new session</a>`;
    }
    icons(root);
  } catch {
    /* not signed in, or history unavailable: the page still works */
  }
});
