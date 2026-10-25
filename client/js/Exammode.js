/* ScientiaForge · Exam Mode (PastPaper page)
   Sit a real NSC paper under exam conditions:
   - countdown sized to the paper (1.2 min per mark, so 150 marks = 3 hours), optional +25% extra time
   - live pacing guide ("by now you should be around 60 marks in")
   - at the end the memo opens beside the paper, you mark yourself, and get your NSC achievement level (1-7)
   - the timer survives a refresh, results are kept per paper so you can beat your personal best
   Mounted from PastPaper.js:  window.NSCExam && window.NSCExam.mount(root, paper);  */
(function () {
  "use strict";
  const N = window.NSC;
  if (!N) return;
  const { esc, safeUrl, icons, formatDate, sessionLabel } = N;

  const KEY_LOG = "sf-exam-log-v1";
  const KEY_ACTIVE = "sf-exam-active-v1";
  const MIN_PER_MARK = 1.2;
  const LEVELS = [
    [80, 7, "Outstanding"],
    [70, 6, "Meritorious"],
    [60, 5, "Substantial"],
    [50, 4, "Adequate"],
    [40, 3, "Moderate"],
    [30, 2, "Elementary"],
    [0, 1, "Not achieved"],
  ];
  const RING = 2 * Math.PI * 19;

  const read = (k, d) => {
    try {
      const v = JSON.parse(localStorage.getItem(k));
      return v == null ? d : v;
    } catch {
      return d;
    }
  };
  const write = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage blocked: exam still works for this visit */
    }
  };
  const pad = (n) => String(n).padStart(2, "0");
  const clock = (s) => {
    s = Math.max(0, Math.ceil(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  };
  const human = (min) => {
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  };
  const levelOf = (pct) => LEVELS.find((l) => pct >= l[0]);
  const tierOf = (lvl) => (lvl >= 6 ? "high" : lvl >= 4 ? "mid" : lvl === 3 ? "low" : "risk");
  const getActive = (id) => {
    const a = read(KEY_ACTIVE, null);
    return a && String(a.paperId) === String(id) ? a : null;
  };

  function mount(root, paper) {
    root.querySelector(".pp-exam")?.remove();
    const marks = Number(paper.total_marks) || 150;
    const baseMin = Math.round(marks * MIN_PER_MARK);
    const qUrl = safeUrl(paper.question_paper_url);
    const mUrl = paper.memorandum_url ? safeUrl(paper.memorandum_url) : "";
    let extra = false;

    const sec = document.createElement("section");
    sec.className = "pp-exam";
    sec.setAttribute("aria-labelledby", "ppExamTitle");
    const anchor = root.querySelector(".pp-recall");
    anchor ? anchor.insertAdjacentElement("afterend", sec) : root.prepend(sec);

    const myLog = () => read(KEY_LOG, []).filter((e) => String(e.paperId) === String(paper.id));

    /* ------------------------------------------------ the card on the page */
    function render() {
      const active = getActive(paper.id);
      const mine = myLog();
      const best = mine.length ? Math.max(...mine.map((e) => e.pct)) : null;
      const expired = active && active.endsAt <= Date.now();
      const minutes = extra ? Math.round(baseMin * 1.25) : baseMin;

      sec.innerHTML = `
        <div class="ex-card-head">
          <div class="ex-card-ring" aria-hidden="true">
            <svg viewBox="0 0 44 44"><circle class="ex-ring-bg" cx="22" cy="22" r="19"/><circle class="ex-ring-fg" cx="22" cy="22" r="19" stroke-dasharray="${RING}" stroke-dashoffset="${RING * 0.28}"/></svg>
            <i data-lucide="timer"></i>
          </div>
          <div>
            <h2 id="ppExamTitle">Sit this paper like the real exam</h2>
            <p>One sitting, a running clock and no memo until you hand in. You get a pacing guide while you write,
               then your NSC achievement level (1 to 7) when you mark yourself.</p>
          </div>
        </div>
        <div class="nsc-chips">
          <span class="nsc-chip"><i data-lucide="clock"></i>${esc(human(minutes))}</span>
          <span class="nsc-chip nsc-chip-plain">${esc(marks)} marks</span>
          ${best != null ? `<span class="nsc-chip nsc-chip-accent"><i data-lucide="trophy"></i>Personal best ${best}%</span>` : ""}
        </div>
        <div class="ex-card-actions">
          ${
            active
              ? `<button type="button" class="nsc-btn nsc-btn-primary nsc-btn-lg" data-resume>
                   <i data-lucide="${expired ? "check-check" : "play"}"></i>${expired ? "Time is up: record your result" : `Resume exam (${esc(clock((active.endsAt - Date.now()) / 1000))} left)`}</button>
                 <button type="button" class="nsc-btn nsc-btn-ghost" data-abandon>Abandon</button>`
              : `<button type="button" class="nsc-btn nsc-btn-primary nsc-btn-lg" data-start><i data-lucide="play"></i>Start exam</button>
                 <label class="ex-extra"><input type="checkbox" ${extra ? "checked" : ""} data-extra> Extra time (+25%)</label>`
          }
        </div>
        ${
          mine.length
            ? `<div class="ex-log"><h3>Your attempts</h3><ul>${mine
                .slice(-5)
                .reverse()
                .map((e) => {
                  const tier = tierOf(e.level);
                  return `<li><span class="ex-pill ex-${tier}">Level ${e.level}</span>
                    <strong>${esc(e.score)}/${esc(e.marks)}</strong><span>${esc(e.pct)}%</span>
                    <span class="ex-log-meta">${esc(human(e.usedMin))} used · ${esc(formatDate(e.at))}</span></li>`;
                })
                .join("")}</ul></div>`
            : ""
        }`;
      icons(sec);

      sec.querySelector("[data-start]")?.addEventListener("click", () => {
        const now = Date.now();
        const state = { paperId: paper.id, startedAt: now, duration: minutes, endsAt: now + minutes * 60000 };
        write(KEY_ACTIVE, state);
        openExam(state, false);
      });
      sec.querySelector("[data-resume]")?.addEventListener("click", () => openExam(active, active.endsAt <= Date.now()));
      sec.querySelector("[data-abandon]")?.addEventListener("click", () => {
        if (confirm("Abandon this exam? Your timer and progress will be cleared.")) {
          localStorage.removeItem(KEY_ACTIVE);
          render();
        }
      });
      sec.querySelector("[data-extra]")?.addEventListener("change", (e) => {
        extra = e.target.checked;
        render();
        sec.querySelector("[data-extra]")?.focus();
      });
    }

    /* ------------------------------------------------ the exam overlay */
    function openExam(state, startInReview) {
      const total = state.duration * 60;
      const perMark = state.duration / marks; // minutes per mark for this sitting
      const ov = document.createElement("div");
      ov.className = "ex-overlay";
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");
      ov.setAttribute("aria-label", `${paper.subject} exam`);
      ov.tabIndex = -1;
      document.body.appendChild(ov);
      document.documentElement.classList.add("ex-lock");
      const behind = [...document.body.children].filter((c) => c !== ov && c.tagName !== "SCRIPT");
      behind.forEach((c) => (c.inert = true));

      let timer = null;
      const said = new Set();

      const close = () => {
        clearInterval(timer);
        ov.remove();
        document.documentElement.classList.remove("ex-lock");
        behind.forEach((c) => (c.inert = false));
        render();
        sec.querySelector("[data-start], [data-resume]")?.focus();
      };

      const title = `<div class="ex-title"><strong>${esc(paper.subject)} · Paper ${esc(paper.paper_number)}</strong><span>${esc(sessionLabel(paper))}</span></div>`;

      /* ---- phase 1: writing ---- */
      function showExam() {
        const checkpoints = [0.25, 0.5, 0.75, 1].map((f) => ({ f, marks: Math.round(marks * f), left: clock(total * (1 - f)) }));
        ov.innerHTML = `
          <header class="ex-bar">
            ${title}
            <div class="ex-timer" role="timer">
              <svg class="ex-ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="ex-ring-bg" cx="22" cy="22" r="19"/>
                <circle class="ex-ring-fg" id="exFg" cx="22" cy="22" r="19" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
              <span class="ex-time" id="exTime">${clock(total)}</span>
            </div>
            <div class="ex-actions">
              <button type="button" class="nsc-btn nsc-btn-ghost" id="exLeave">Leave</button>
              <button type="button" class="nsc-btn nsc-btn-primary" id="exFinish"><i data-lucide="flag"></i>Hand in</button>
            </div>
          </header>
          <div class="ex-body">
            <div class="ex-frame-wrap">
              <iframe class="ex-frame" title="Question paper" src="${esc(qUrl)}#view=FitH"></iframe>
              <a class="nsc-btn nsc-btn-primary nsc-btn-lg ex-open-pdf" href="${esc(qUrl)}" target="_blank" rel="noopener">
                <i data-lucide="file-text"></i>Open the question paper</a>
            </div>
            <aside class="ex-side" aria-label="Pacing guide">
              <h2>Pacing guide</h2>
              <p class="ex-pace-now" id="exPace"></p>
              <div class="ex-bar-track" aria-hidden="true"><i id="exBar"></i></div>
              <ol class="ex-checkpoints">
                ${checkpoints
                  .map((c, i) => `<li data-f="${c.f}" id="exCp${i}"><strong>${esc(c.marks)} marks</strong><span>${esc(c.left)} left</span></li>`)
                  .join("")}
              </ol>
              <p class="ex-tip">About ${perMark.toFixed(1)} minutes per mark. If you are stuck, mark the question and move on. Come back at the end.</p>
              <p class="ex-note" id="exNote" role="status"></p>
            </aside>
          </div>`;
        icons(ov);
        ov.focus();
        ov.querySelector("#exFinish").addEventListener("click", () => {
          if (confirm("Hand in now? You'll be taken to the memorandum.")) finish("handed");
        });
        ov.querySelector("#exLeave").addEventListener("click", () => {
          if (confirm("Leave the exam? Your timer keeps running. You can resume from the paper page until time runs out.")) close();
        });
        tick();
        timer = setInterval(tick, 1000);
      }

      function tick() {
        const left = (state.endsAt - Date.now()) / 1000;
        if (left <= 0) return finish("time");
        const frac = left / total;
        const ring = ov.querySelector(".ex-timer");
        ov.querySelector("#exTime").textContent = clock(left);
        ov.querySelector("#exFg").style.strokeDashoffset = String(RING * (1 - frac));
        ring.classList.toggle("is-warn", frac <= 0.25 && left > 600);
        ring.classList.toggle("is-late", left <= 600);

        const elapsedMin = (total - left) / 60;
        const covered = Math.min(marks, Math.floor(elapsedMin / perMark));
        ov.querySelector("#exPace").textContent =
          covered < 1 ? "Settle in. Read the instructions, then start with the questions you know best."
                      : `By now you should have worked through about ${covered} of ${marks} marks.`;
        ov.querySelector("#exBar").style.width = `${((1 - frac) * 100).toFixed(1)}%`;
        ov.querySelectorAll(".ex-checkpoints li").forEach((li) => li.classList.toggle("is-done", 1 - frac >= Number(li.dataset.f)));

        for (const m of [60, 30, 10, 5, 1]) {
          if (left <= m * 60 && m * 60 < total && !said.has(m)) {
            said.add(m);
            ov.querySelector("#exNote").textContent = `${m} ${m === 1 ? "minute" : "minutes"} remaining.`;
          }
        }
      }

      function finish(reason) {
        clearInterval(timer);
        localStorage.removeItem(KEY_ACTIVE);
        const used = Math.min(total, (Date.now() - state.startedAt) / 1000);
        showReview(reason, used);
      }

      /* ---- phase 2: memo + self-marking + result ---- */
      function showReview(reason, usedSec) {
        const usedMin = Math.round((usedSec / 60) * 10) / 10;
        const heading = reason === "time" ? "Time's up" : reason === "away" ? "Your time ran out" : "Paper handed in";
        ov.innerHTML = `
          <header class="ex-bar">
            ${title}
            <span class="ex-badge">${esc(heading)}</span>
            <div class="ex-actions"><button type="button" class="nsc-btn nsc-btn-ghost" id="exClose">Close</button></div>
          </header>
          <div class="ex-body">
            <div class="ex-frame-wrap">
              <div class="pp-toggle ex-toggle" role="tablist" aria-label="Choose document">
                <button type="button" role="tab" aria-selected="${mUrl ? "false" : "true"}" data-src="${esc(qUrl)}">Question paper</button>
                ${mUrl ? `<button type="button" role="tab" aria-selected="true" data-src="${esc(mUrl)}">Memorandum</button>` : ""}
              </div>
              <iframe class="ex-frame" id="exFrame" title="${mUrl ? "Memorandum" : "Question paper"}" src="${esc(mUrl || qUrl)}#view=FitH"></iframe>
              <a class="nsc-btn nsc-btn-primary nsc-btn-lg ex-open-pdf" href="${esc(mUrl || qUrl)}" target="_blank" rel="noopener">
                <i data-lucide="file-check"></i>${mUrl ? "Open the memorandum" : "Open the question paper"}</a>
            </div>
            <aside class="ex-side" id="exSide">
              <h2>${esc(heading)}</h2>
              <p>${reason === "away" ? "The timer ended while you were away." : `You used <strong>${esc(human(usedMin))}</strong> of ${esc(human(state.duration))}.`}</p>
              <p>${mUrl ? "Use the memorandum to mark yourself honestly, then enter your total." : "The memorandum isn't available for this paper. Enter your best estimate of your total."}</p>
              <form id="exScore" class="ex-form">
                <label>Marks scored, out of ${esc(marks)}
                  <input id="exScoreInput" type="number" inputmode="numeric" min="0" max="${esc(marks)}" step="1" required></label>
                <p class="ex-error" id="exErr" role="alert"></p>
                <button type="submit" class="nsc-btn nsc-btn-primary nsc-btn-lg">See my result</button>
              </form>
            </aside>
          </div>`;
        icons(ov);
        ov.focus();
        ov.querySelector("#exClose").addEventListener("click", close);
        const frame = ov.querySelector("#exFrame");
        const open = ov.querySelector(".ex-open-pdf");
        ov.querySelectorAll(".ex-toggle button").forEach((b) =>
          b.addEventListener("click", () => {
            ov.querySelectorAll(".ex-toggle button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
            frame.src = `${b.dataset.src}#view=FitH`;
            frame.title = b.textContent;
            open.href = b.dataset.src;
          })
        );
        ov.querySelector("#exScore").addEventListener("submit", (e) => {
          e.preventDefault();
          const score = Number(ov.querySelector("#exScoreInput").value);
          if (!Number.isFinite(score) || score < 0 || score > marks) {
            ov.querySelector("#exErr").textContent = `Enter a number from 0 to ${marks}.`;
            return;
          }
          showResult(score, usedMin);
        });
        ov.querySelector("#exScoreInput").focus();
      }

      function showResult(score, usedMin) {
        const pct = Math.round((score / marks) * 100);
        const [, level, label] = levelOf(pct);
        const prevBest = myLog().reduce((m, e) => Math.max(m, e.pct), -1);
        const log = read(KEY_LOG, []);
        log.push({ paperId: paper.id, marks, score, pct, level, usedMin, at: new Date().toISOString() });
        write(KEY_LOG, log.slice(-200));

        const spare = state.duration - usedMin;
        const compare = prevBest < 0 ? "That's your first attempt on this paper. It's your baseline."
          : pct > prevBest ? `A new personal best, up ${pct - prevBest} points from ${prevBest}%.`
          : pct === prevBest ? `You matched your personal best of ${prevBest}%.`
          : `Your personal best is ${prevBest}%. You can beat it.`;
        const pace = spare >= 5 ? `You finished with ${human(spare)} to spare.` : spare > 0 ? "You used almost all of your time." : "You used the full time.";
        const tier = tierOf(level);

        ov.querySelector("#exSide").innerHTML = `
          <h2>Your result</h2>
          <div class="ex-result">
            <div class="ex-score-ring">
              <svg viewBox="0 0 44 44" aria-hidden="true"><circle class="ex-ring-bg" cx="22" cy="22" r="19"/>
                <circle class="ex-ring-fg ex-${tier}" id="exScoreFg" cx="22" cy="22" r="19" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg>
              <strong>${pct}%</strong>
            </div>
            <p class="ex-level"><span class="ex-pill ex-${tier}">Level ${level}</span> ${esc(label)}</p>
            <p>${esc(score)} out of ${esc(marks)} marks. ${esc(pace)}</p>
            <p>${esc(compare)}</p>
          </div>
          <div class="ex-result-actions">
            ${paper.recall_available ? `<a class="nsc-btn nsc-btn-primary nsc-btn-lg" href="ActiveRecall.html?paper=${encodeURIComponent(paper.id)}"><i data-lucide="brain"></i>Drill this paper with Active Recall</a>` : ""}
            <button type="button" class="nsc-btn nsc-btn-ghost" id="exDone">Done</button>
          </div>
          <p class="ex-tip">Levels follow the NSC achievement scale: 7 is 80% and above, 4 is 50 to 59%, 3 is 40 to 49%.</p>`;
        icons(ov);
        ov.querySelector("#exDone").addEventListener("click", close);
        ov.querySelector("#exDone").focus();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            ov.querySelector("#exScoreFg").style.strokeDashoffset = String(RING * (1 - pct / 100));
          })
        );
      }

      startInReview ? showReview("away", total) : showExam();
    }

    render();
    icons(sec);
  }

  window.NSCExam = { mount };
})();