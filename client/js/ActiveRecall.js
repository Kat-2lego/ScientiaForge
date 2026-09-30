/* SkillForge · NSC Active Recall session
   ActiveRecall.html?paper=ID    start a new session on a paper
   ActiveRecall.html?session=ID  resume / view results
   ActiveRecall.html?retry=ID    retry the incorrect answers of a finished session */
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const { api, esc, safeUrl, icons, paperName, sessionLabel, formatMarks, param } = window.NSC;
  window.NSC.initSidebar();

  const root = document.getElementById("arRoot");
  const progressWrap = document.getElementById("arProgressWrap");
  const segmentsEl = document.getElementById("arSegments");
  const counterEl = document.getElementById("arCounter");
  const tallyEl = document.getElementById("arTally");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = { session: null, paper: null, questions: [], index: 0, busy: false, reviewFilter: "incorrect" };

  /* ------------------------------------------------------------------ helpers */
  const q = () => state.questions[state.index];
  const needsAction = (item) => !item.attempt || item.attempt.is_correct === null;

  function outcome(item) {
    const a = item.attempt;
    if (!a) return "unanswered";
    if (a.is_correct === null) return "pending";
    if (a.is_correct) return "correct";
    if (a.marking_method === "skipped") return "skipped";
    return a.marks_awarded > 0 ? "partial" : "incorrect";
  }

  const OUTCOME_LABEL = {
    unanswered: "not answered yet",
    pending: "waiting for you to mark it",
    correct: "correct",
    partial: "partly right",
    incorrect: "incorrect",
    skipped: "skipped",
  };

  function showMessage(title, body, actions = "") {
    progressWrap.hidden = true;
    root.innerHTML = `<div class="nsc-message"><h1>${esc(title)}</h1><p>${esc(body)}</p>${actions}</div>`;
    icons(root);
  }

  function focusHeading(id) {
    const h = document.getElementById(id);
    if (h) h.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  /* ------------------------------------------------------------------ load */
  async function start() {
    const sessionId = param("session");
    const paperId = param("paper");
    const retryOf = param("retry");
    try {
      let data;
      if (sessionId) {
        data = await api(`/sessions/${encodeURIComponent(sessionId)}`);
      } else if (retryOf) {
        data = await api("/sessions", { method: "POST", body: { retry_of: retryOf } });
      } else if (paperId && /^\d+$/.test(paperId)) {
        data = await api("/sessions", { method: "POST", body: { paper_id: Number(paperId) } });
      } else {
        showMessage("Choose a past paper first", "Open a paper in the Study Hub and start an Active Recall session from there.",
          `<a class="nsc-btn nsc-btn-primary" href="StudyHub.html">Browse past papers</a>`);
        return;
      }
      if (!sessionId) history.replaceState(null, "", `${location.pathname}?session=${encodeURIComponent(data.session.id)}`);
      load(data);
    } catch (err) {
      const back = paperId ? `PastPaper.html?id=${encodeURIComponent(paperId)}` : "StudyHub.html";
      showMessage(
        err.status === 401 ? "Sign in to start Active Recall" : "Couldn't open this session",
        err.message,
        `<a class="nsc-btn nsc-btn-primary" href="${back}">Back</a>`
      );
    }
  }

  function load(data) {
    state.session = data.session;
    state.paper = data.paper;
    state.questions = data.questions;

    const back = document.getElementById("arBack");
    back.href = `PastPaper.html?id=${encodeURIComponent(data.session.paper_id)}`;
    const title = `${paperName(data.session.paper)}, ${sessionLabel(data.session.paper)}`;
    document.getElementById("arTitle").textContent = data.session.mode === "retry" ? `${title} (retry)` : title;
    document.title = `Active Recall: ${title} | SkillForge`;

    if (state.session.status === "completed") return renderResults();
    const first = state.questions.findIndex(needsAction);
    state.index = first < 0 ? 0 : first;
    renderQuestion();
  }

  /* ------------------------------------------------------------------ progress */
  function renderProgress() {
    const total = state.questions.length;
    progressWrap.hidden = false;
    counterEl.textContent = `Question ${state.index + 1} of ${total}`;
    const correct = state.questions.filter((x) => outcome(x) === "correct").length;
    const answered = state.questions.filter((x) => x.attempt).length;
    tallyEl.textContent = answered ? `${correct} correct so far` : "";
    segmentsEl.innerHTML = state.questions
      .map((item, i) => {
        const o = outcome(item);
        const current = i === state.index ? " is-current" : "";
        return `<li><button type="button" class="ar-seg is-${o}${current}" data-index="${i}"
                 aria-label="Question ${i + 1}, ${esc(item.question_number)}: ${OUTCOME_LABEL[o]}"
                 ${i === state.index ? 'aria-current="step"' : ""}></button></li>`;
      })
      .join("");
  }

  segmentsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".ar-seg");
    if (!btn || state.busy) return;
    state.index = Number(btn.dataset.index);
    renderQuestion();
  });

  /* ------------------------------------------------------------------ question */
  function inputHtml(item) {
    const disabled = item.attempt ? "disabled" : "";
    const given = item.attempt ? item.attempt.user_answer : "";
    switch (item.answer_input) {
      case "choice": {
        const wide = item.options.some((o) => String(o.label).length > 1);
        return `
          <fieldset class="ar-options ${wide ? "is-wide" : ""}">
            <legend class="sr-only">Choose one answer</legend>
            ${item.options
              .map(
                (o) => `
              <label class="ar-option">
                <input type="radio" name="answer" value="${esc(o.label)}" ${disabled} ${given === o.label ? "checked" : ""} />
                ${wide ? "" : `<span class="ar-key" aria-hidden="true">${esc(o.label)}</span>`}
                <span class="ar-opt-text">${wide ? "" : `<span class="sr-only">${esc(o.label)}: </span>`}${esc(o.text)}</span>
              </label>`
              )
              .join("")}
          </fieldset>`;
      }
      case "boolean":
        return `
          <fieldset class="ar-options ar-bool">
            <legend class="sr-only">True or false</legend>
            ${["True", "False"]
              .map(
                (v) => `
              <label class="ar-option">
                <input type="radio" name="answer" value="${v}" ${disabled} ${given === v ? "checked" : ""} />
                <span class="ar-opt-text">${v}</span>
              </label>`
              )
              .join("")}
          </fieldset>`;
      case "number":
        return `
          <label class="ar-label" for="arInput">Your answer</label>
          <input id="arInput" class="ar-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
                 placeholder="e.g. 12,5" maxlength="200" value="${esc(given)}" ${disabled} aria-describedby="arHint" />
          <p class="ar-hint" id="arHint">Units are optional. 5, 5.0 and 5,00 are all accepted.</p>`;
      case "short":
        return `
          <label class="ar-label" for="arInput">Your answer</label>
          <input id="arInput" class="ar-input" type="text" autocomplete="off" maxlength="300"
                 value="${esc(given)}" ${disabled} aria-describedby="arHint" />
          <p class="ar-hint" id="arHint">A word or short phrase. Small spelling slips are fine.</p>`;
      case "working":
        return `
          <label class="ar-label" for="arInput">Your working and answer</label>
          <textarea id="arInput" class="ar-input ar-textarea" rows="5" maxlength="4000" ${disabled}
                    aria-describedby="arHint">${esc(given)}</textarea>
          <p class="ar-hint" id="arHint">Show your working if you like. Put your final answer on the last line.
            <span class="ar-kbd">Ctrl + Enter</span> submits.</p>`;
      default:
        return `
          <label class="ar-label" for="arInput">Your answer</label>
          <textarea id="arInput" class="ar-input ar-textarea" rows="6" maxlength="4000" ${disabled}
                    aria-describedby="arHint">${esc(given)}</textarea>
          <p class="ar-hint" id="arHint">Answer from memory, then compare with the memo and mark yourself.
            <span class="ar-kbd">Ctrl + Enter</span> submits.</p>`;
    }
  }

  function renderQuestion() {
    const item = q();
    const total = state.questions.length;
    const context = item.context_text || "";
    const pageLink =
      item.page_number && state.paper && state.paper.question_paper_url
        ? `<a class="nsc-link" href="${esc(safeUrl(state.paper.question_paper_url))}#page=${encodeURIComponent(item.page_number)}"
              target="_blank" rel="noopener">See it on page ${esc(item.page_number)} of the paper<i data-lucide="external-link"></i></a>`
        : "";

    root.innerHTML = `
      <article class="ar-card" aria-labelledby="arQHeading">
        <div class="ar-card-top">
          <h1 id="arQHeading" class="ar-q-heading" tabindex="-1">Question ${state.index + 1} <span>of ${total}</span></h1>
          <div class="nsc-chips">
            ${item.section ? `<span class="nsc-chip nsc-chip-plain">${esc(item.section)}</span>` : ""}
            <span class="nsc-chip nsc-chip-plain">${item.marking === "auto" ? "Marked for you" : "You mark it"}</span>
          </div>
        </div>
        ${
          context
            ? `<details class="ar-context" ${context.length <= 450 ? "open" : ""}>
                 <summary>Context from the paper</summary>
                 <div class="ar-serif ar-pre">${esc(context)}</div>
               </details>`
            : ""
        }
        <div class="ar-question">
          <span class="ar-num">${esc(item.question_number)}</span>
          <div class="ar-text ar-serif ar-pre">${esc(item.question_text)}</div>
          <span class="ar-marks" title="${item.marks} marks">(${esc(formatMarks(item.marks))})</span>
        </div>
        <form class="ar-answer" id="arForm" novalidate>
          ${inputHtml(item)}
          <p class="ar-error" id="arError" role="alert" hidden></p>
          ${
            item.attempt
              ? ""
              : `<div class="ar-actions">
                   <button type="button" class="nsc-btn nsc-btn-ghost" id="arSkip">I don't know</button>
                   <button type="submit" class="nsc-btn nsc-btn-primary" id="arSubmit">Submit answer</button>
                 </div>`
          }
        </form>
        <div id="arFeedback" aria-live="polite"></div>
        <p class="ar-source">${
          item.has_figure
            ? `<span class="ar-figure-note"><i data-lucide="image"></i>This question sits in a part of the paper with a diagram, table or passage. If it doesn't make sense on its own, open it in the paper.</span>`
            : ""
        }${pageLink}</p>
      </article>`;

    renderProgress();
    if (item.attempt) renderFeedback(item);
    icons(root);

    const form = document.getElementById("arForm");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submit(false);
    });
    const skip = document.getElementById("arSkip");
    skip && skip.addEventListener("click", () => submit(true));
    const input = document.getElementById("arInput");
    input &&
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submit(false);
        }
      });

    focusHeading("arQHeading");
    if (!item.attempt && input && window.matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });
  }

  function currentAnswer() {
    const form = document.getElementById("arForm");
    const checked = form.querySelector('input[name="answer"]:checked');
    if (checked) return checked.value;
    const input = document.getElementById("arInput");
    return input ? input.value.trim() : "";
  }

  async function submit(gaveUp) {
    const item = q();
    if (state.busy || item.attempt) return;
    const answer = gaveUp ? "" : currentAnswer();
    const errorEl = document.getElementById("arError");
    if (!gaveUp && !answer) {
      errorEl.textContent = "Type or choose an answer first, or press \u201cI don't know\u201d to see the memo.";
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    state.busy = true;
    const buttons = root.querySelectorAll(".ar-actions button");
    buttons.forEach((b) => (b.disabled = true));
    const submitBtn = document.getElementById("arSubmit");
    if (submitBtn && !gaveUp) submitBtn.textContent = "Marking…";

    try {
      const res = await api(`/sessions/${encodeURIComponent(state.session.id)}/answers`, {
        method: "POST",
        body: { question_id: item.id, answer, gave_up: gaveUp },
      });
      item.attempt = { ...res.attempt, user_answer: res.attempt.user_answer ?? answer };
      item.memo = res.memo;
      state.session = res.session;
      renderQuestion(); // re-render read-only with feedback
      const fb = document.getElementById("arFeedback");
      fb && fb.querySelector("button, a") && fb.querySelector("button, a").focus({ preventScroll: true });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      buttons.forEach((b) => (b.disabled = false));
      if (submitBtn) submitBtn.textContent = "Submit answer";
    } finally {
      state.busy = false;
    }
  }

  /* ------------------------------------------------------------------ feedback */
  function memoBlock(item) {
    if (!item.memo) return `<div><dt>Memo</dt><dd>The memo answer for this question isn't available.</dd></div>`;
    const memoLink =
      item.memo.memo_page_number && state.paper && state.paper.memorandum_url
        ? `<a class="nsc-link" href="${esc(safeUrl(state.paper.memorandum_url))}#page=${encodeURIComponent(item.memo.memo_page_number)}"
              target="_blank" rel="noopener">Memo page ${esc(item.memo.memo_page_number)}<i data-lucide="external-link"></i></a>`
        : "";
    return `<div><dt>Memo ${memoLink}</dt><dd class="ar-serif ar-pre">${esc(item.memo.answer_text)}</dd></div>`;
  }

  function nextButton() {
    const done = state.session.status === "completed";
    const pendingElsewhere = state.questions.some((x, i) => i !== state.index && needsAction(x));
    if (done) return `<button type="button" class="nsc-btn nsc-btn-primary" data-action="results">See your results</button>`;
    if (!pendingElsewhere) return "";
    return `<button type="button" class="nsc-btn nsc-btn-primary" data-action="next">Next question<i data-lucide="arrow-right"></i></button>`;
  }

  function renderFeedback(item) {
    const fb = document.getElementById("arFeedback");
    const a = item.attempt;
    const o = outcome(item);
    const marks = `${formatMarks(a.marks_awarded ?? 0)}/${formatMarks(a.max_marks)}`;
    const TITLES = {
      correct: ["check-circle-2", "Correct"],
      incorrect: ["x-circle", "Not quite"],
      partial: ["circle-dot", "Partly right"],
      skipped: ["book-open", "Here's what the memo expects"],
      pending: ["scale", "Mark your answer"],
    };
    const [icon, title] = TITLES[o];
    const yourAnswer =
      a.marking_method === "skipped"
        ? `<div><dt>Your answer</dt><dd class="ar-muted">You chose \u201cI don't know\u201d</dd></div>`
        : `<div><dt>Your answer</dt><dd class="ar-pre">${esc(a.user_answer)}</dd></div>`;

    let controls = "";
    if (o === "pending") {
      const max = a.max_marks;
      const partial =
        max > 1
          ? `<button type="button" class="nsc-btn nsc-btn-ghost" data-action="partial" aria-expanded="false" aria-controls="arPartial">Partly right</button>`
          : "";
      const steps = [];
      for (let m = 1; m < max; m++) steps.push(m);
      controls = `
        <div class="ar-selfmark" role="group" aria-labelledby="arSelfTitle">
          <p id="arSelfTitle">Compare your answer with the memo. How did you do?</p>
          <div class="ar-selfmark-buttons">
            <button type="button" class="nsc-btn ar-btn-correct" data-marks="${max}"><i data-lucide="check"></i>Got it right (${formatMarks(max)}/${formatMarks(max)})</button>
            ${partial}
            <button type="button" class="nsc-btn ar-btn-incorrect" data-marks="0"><i data-lucide="x"></i>Got it wrong (0/${formatMarks(max)})</button>
          </div>
          <div class="ar-partial" id="arPartial" hidden>
            <p>How many of the ${formatMarks(max)} marks would the memo give you?</p>
            <div class="ar-steps">${steps.map((m) => `<button type="button" class="nsc-btn nsc-btn-ghost" data-marks="${m}">${m}</button>`).join("")}</div>
          </div>
          <p class="ar-error" id="arMarkError" role="alert" hidden></p>
        </div>`;
    } else {
      controls = `<div class="ar-next">${nextButton()}</div>`;
    }

    fb.innerHTML = `
      <section class="ar-result is-${o}">
        <p class="ar-result-title"><i data-lucide="${icon}"></i>${title}${o === "pending" ? "" : `<span class="ar-result-marks">${marks}</span>`}</p>
        ${o === "pending" && a.marking_method === "self" && item.marking === "auto"
          ? `<p class="ar-result-note">Your answer is close to the memo but not an exact match, so you decide.</p>`
          : ""}
        <dl class="ar-compare">${yourAnswer}${memoBlock(item)}</dl>
        ${controls}
      </section>`;
    icons(fb);

    fb.querySelectorAll("[data-marks]").forEach((btn) => btn.addEventListener("click", () => selfMark(Number(btn.dataset.marks))));
    const partialBtn = fb.querySelector('[data-action="partial"]');
    partialBtn &&
      partialBtn.addEventListener("click", () => {
        const panel = document.getElementById("arPartial");
        panel.hidden = !panel.hidden;
        partialBtn.setAttribute("aria-expanded", String(!panel.hidden));
        if (!panel.hidden) panel.querySelector("button").focus();
      });
    const next = fb.querySelector('[data-action="next"]');
    next && next.addEventListener("click", goNext);
    const results = fb.querySelector('[data-action="results"]');
    results && results.addEventListener("click", renderResults);
  }

  async function selfMark(marks) {
    const item = q();
    if (state.busy) return;
    state.busy = true;
    document.querySelectorAll(".ar-selfmark button").forEach((b) => (b.disabled = true));
    try {
      const res = await api(
        `/sessions/${encodeURIComponent(state.session.id)}/answers/${encodeURIComponent(item.id)}/self-mark`,
        { method: "POST", body: { marks_awarded: marks } }
      );
      item.attempt = { ...item.attempt, ...res.attempt };
      state.session = res.session;
      renderQuestion();
      const fb = document.getElementById("arFeedback");
      const btn = fb && fb.querySelector("button");
      btn && btn.focus({ preventScroll: true });
    } catch (err) {
      const e = document.getElementById("arMarkError");
      if (e) {
        e.textContent = err.message;
        e.hidden = false;
      }
      document.querySelectorAll(".ar-selfmark button").forEach((b) => (b.disabled = false));
    } finally {
      state.busy = false;
    }
  }

  function goNext() {
    const n = state.questions.length;
    for (let step = 1; step <= n; step++) {
      const i = (state.index + step) % n;
      if (needsAction(state.questions[i])) {
        state.index = i;
        return renderQuestion();
      }
    }
    if (state.session.status === "completed") renderResults();
  }

  /* keyboard: A–D picks an option, T/F picks true/false (not while typing) */
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !state.questions.length) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "radio") return;
    const item = q();
    if (!item || item.attempt) return;
    const key = e.key.toUpperCase();
    let value = null;
    if (item.answer_input === "choice" && /^[A-D]$/.test(key)) value = key;
    if (item.answer_input === "boolean" && (key === "T" || key === "F")) value = key === "T" ? "True" : "False";
    if (!value) return;
    const radio = root.querySelector(`input[name="answer"][value="${value}"]`);
    if (radio) {
      radio.checked = true;
      radio.focus();
      e.preventDefault();
    }
  });

  /* ------------------------------------------------------------------ results */
  function renderResults() {
    const s = state.session;
    progressWrap.hidden = false;
    counterEl.textContent = s.mode === "retry" ? "Retry finished" : "Session finished";
    tallyEl.textContent = "";
    state.index = -1;
    segmentsEl.innerHTML = state.questions
      .map((item, i) => {
        const o = outcome(item);
        return `<li><span class="ar-seg is-${o}" role="img" aria-label="Question ${i + 1}: ${OUTCOME_LABEL[o]}"></span></li>`;
      })
      .join("");

    const toReview = state.questions.filter((x) => ["incorrect", "partial", "skipped"].includes(outcome(x)));
    const pct = s.percentage === null ? 0 : Math.round(s.percentage);
    const minutes = s.completed_at ? Math.max(1, Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 60000)) : null;

    root.innerHTML = `
      <section class="ar-results" aria-labelledby="arResultsTitle">
        <div class="ar-results-hero">
          <div>
            <p class="ar-results-kicker">${esc(paperName(s.paper))}, ${esc(sessionLabel(s.paper))}</p>
            <h1 id="arResultsTitle" tabindex="-1">${s.correct_count}<span>/${s.question_count} correct</span></h1>
            <p class="ar-results-sub">${
              pct >= 80 ? "Strong recall. Retry the ones you missed while they're fresh."
              : pct >= 50 ? "Good base. The questions below are where the marks are."
              : "Now you know where to focus. Review the memo answers below, then retry them."
            }</p>
          </div>
          <div class="ar-score-meter" style="--pct:${pct}" role="img" aria-label="${pct} percent">
            <span>${pct}%</span>
          </div>
        </div>
        <dl class="ar-stats">
          <div class="ar-stat"><dt>Marks</dt><dd>${formatMarks(s.score)}<small>/${formatMarks(s.max_score)}</small></dd></div>
          <div class="ar-stat is-correct"><dt>Correct</dt><dd>${s.correct_count}</dd></div>
          <div class="ar-stat is-incorrect"><dt>Incorrect</dt><dd>${s.incorrect_count}</dd></div>
          ${minutes ? `<div class="ar-stat"><dt>Time</dt><dd>${minutes}<small> min</small></dd></div>` : ""}
        </dl>
        <div class="ar-results-actions">
          ${toReview.length ? `<button type="button" class="nsc-btn nsc-btn-ghost" data-action="review"><i data-lucide="list-checks"></i>Review incorrect</button>` : ""}
          ${
            toReview.length
              ? `<a class="nsc-btn nsc-btn-primary" href="ActiveRecall.html?retry=${encodeURIComponent(s.id)}"><i data-lucide="rotate-ccw"></i>Retry incorrect (${toReview.length})</a>`
              : `<span class="ar-perfect"><i data-lucide="party-popper"></i>Nothing to retry. Every answer was right.</span>`
          }
          <a class="nsc-btn nsc-btn-ghost" href="PastPaper.html?id=${encodeURIComponent(s.paper_id)}"><i data-lucide="file-text"></i>Back to past paper</a>
        </div>

        <section class="ar-review" id="arReview" aria-labelledby="arReviewTitle">
          <div class="pp-section-head">
            <h2 id="arReviewTitle">${toReview.length ? "Questions to review" : "All questions"}</h2>
            <div class="pp-toggle" role="tablist" aria-label="Which questions">
              <button type="button" role="tab" data-filter="incorrect" aria-selected="${toReview.length ? "true" : "false"}" ${toReview.length ? "" : "disabled"}>To review (${toReview.length})</button>
              <button type="button" role="tab" data-filter="all" aria-selected="${toReview.length ? "false" : "true"}">All (${state.questions.length})</button>
            </div>
          </div>
          <div id="arReviewList"></div>
        </section>
      </section>`;

    state.reviewFilter = toReview.length ? "incorrect" : "all";
    renderReviewList();
    icons(root);

    root.querySelectorAll(".ar-review .pp-toggle button").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.reviewFilter = btn.dataset.filter;
        root.querySelectorAll(".ar-review .pp-toggle button").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
        renderReviewList();
      })
    );
    const review = root.querySelector('[data-action="review"]');
    review &&
      review.addEventListener("click", () => {
        state.reviewFilter = "incorrect";
        renderReviewList();
        const first = root.querySelector(".ar-review-item");
        if (first) {
          first.open = true;
          first.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
          first.querySelector("summary").focus({ preventScroll: true });
        }
      });
    focusHeading("arResultsTitle");
  }

  function renderReviewList() {
    const listEl = document.getElementById("arReviewList");
    const items = state.questions.filter(
      (x) => state.reviewFilter === "all" || ["incorrect", "partial", "skipped"].includes(outcome(x))
    );
    listEl.innerHTML = items
      .map((item) => {
        const o = outcome(item);
        const a = item.attempt || {};
        return `
          <details class="ar-review-item is-${o}">
            <summary>
              <span class="ar-num">${esc(item.question_number)}</span>
              <span class="ar-review-q">${esc(item.question_text)}</span>
              <span class="ar-review-badge">${formatMarks(a.marks_awarded ?? 0)}/${formatMarks(item.marks)}</span>
            </summary>
            <div class="ar-review-body">
              ${item.context_text ? `<p class="ar-review-context ar-serif ar-pre">${esc(item.context_text)}</p>` : ""}
              <p class="ar-serif ar-pre">${esc(item.question_text)}</p>
              ${
                item.options
                  ? `<ul class="ar-review-options">${item.options.map((op) => `<li><strong>${esc(op.label)}</strong> ${esc(op.label === op.text ? "" : op.text)}</li>`).join("")}</ul>`
                  : ""
              }
              <dl class="ar-compare">
                <div><dt>Your answer</dt><dd class="ar-pre">${a.marking_method === "skipped" ? "<span class='ar-muted'>Skipped</span>" : esc(a.user_answer)}</dd></div>
                ${memoBlock(item)}
              </dl>
            </div>
          </details>`;
      })
      .join("");
    icons(listEl);
  }

  start();
});
