/* ScientiaForge · Exam Arena (PastPaper page)
   Sit a real NSC paper under exam-hall conditions, then get a proper report card.

   BEFORE   pick your target level, extra time, reading time, invigilator voice, hall ticking
   READING  10 minutes of reading time, just like the hall (no writing)
   WRITING  countdown sized to the paper (1.2 min per mark), live pacing against the marks you
            have actually finished, a question tracker, a scratchpad, spoken time calls, "pens down"
   REVIEW   memo opens beside the paper, you mark each question
   REPORT   NSC level 1-7, marks needed for the next level, where the marks went, time vs marks,
            badges, a shareable result image, and a one-tap jump into Active Recall

   Everything is stored in the browser (localStorage) so it works with the existing API untouched.
   Mounted from PastPaper.js:  window.NSCExam && window.NSCExam.mount(root, paper);  */
(function () {
  "use strict";
  const N = window.NSC;
  if (!N) return;
  const { esc, safeUrl, icons, formatDate, sessionLabel } = N;
  const S = window.NSCStore;
  if (!S) {
    console.error("[Exam Arena] readinessStore.js must be loaded before ExamMode.js");
    return;
  }

  const MIN_PER_MARK = 1.2; // 150 marks = 3 hours, the NSC convention
  const READING_MIN = 10;
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

  /* ------------------------------------------------------------ helpers */
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
  const pctOf = (score, marks) => Math.round((score / marks) * 100);
  /* fewest marks that still round up to a given percentage */
  const marksFor = (thr, marks) => (thr <= 0 ? 0 : Math.ceil(((thr - 0.5) / 100) * marks - 1e-9));
  const getActive = (id) => S.getActive(id);
  const spark = (vals, w = 120, h = 34) => {
    if (vals.length < 2) return "";
    const step = w / (vals.length - 1);
    const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - 3 - (v / 100) * (h - 6)).toFixed(1)}`).join(" ");
    return `<svg class="ex-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };

  /* ------------------------------------------------------------ sound and voice */
  let actx = null;
  function audio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch {
      /* no audio available */
    }
    return actx;
  }
  function tone(freq, at, dur, vol = 0.12) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  const chime = () => (tone(659, 0, 0.5), tone(880, 0.18, 0.8));
  const tick = () => tone(1800, 0, 0.03, 0.025);
  function say(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      const v = (speechSynthesis.getVoices() || []).find((x) => /en[-_](ZA|GB)/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {
      /* speech not available */
    }
  }

  /* ------------------------------------------------------------ confetti */
  function confetti(host) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.createElement("canvas");
    c.className = "ex-confetti";
    host.appendChild(c);
    const ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
    const W = (c.width = innerWidth * dpr), H = (c.height = innerHeight * dpr);
    const colors = ["#38bdf8", "#4ade80", "#fbbf24", "#f472b6", "#a78bfa", "#ffffff"];
    const ps = Array.from({ length: 160 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.32,
      vx: (Math.random() - 0.5) * 18 * dpr,
      vy: (-Math.random() * 16 - 4) * dpr,
      s: (4 + Math.random() * 7) * dpr,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      ps.forEach((p) => {
        p.vy += 0.35 * dpr;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - el / 3200);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      });
      el < 3200 ? requestAnimationFrame(frame) : c.remove();
    })(t0);
  }

  /* ------------------------------------------------------------ share card (PNG) */
  async function makeCard(e) {
    try {
      await document.fonts.load("800 64px 'Plus Jakarta Sans'");
      await document.fonts.load("600 32px 'Plus Jakarta Sans'");
    } catch {
      /* fall back to system fonts */
    }
    const W = 1080, H = 1350;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const F = '"Plus Jakarta Sans","Inter",system-ui,sans-serif';
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0b1220");
    bg.addColorStop(0.55, "#0c3a5c");
    bg.addColorStop(1, "#0e7490");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const glow = (x, y, r, col) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    };
    glow(920, 180, 520, "rgba(56,189,248,.30)");
    glow(140, 1220, 540, "rgba(74,222,128,.15)");

    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    g.font = `800 46px ${F}`;
    g.fillStyle = "#ffffff";
    g.fillText("Scientia", 72, 118);
    const sw = g.measureText("Scientia").width;
    g.fillStyle = "#38bdf8";
    g.fillText("Forge", 72 + sw, 118);
    g.textAlign = "right";
    g.font = `700 24px ${F}`;
    g.fillStyle = "rgba(255,255,255,.65)";
    g.fillText("TIMED EXAM", W - 72, 116);

    /* subject, wrapped to two lines */
    g.textAlign = "left";
    g.font = `800 78px ${F}`;
    g.fillStyle = "#ffffff";
    const words = String(e.subject || "NSC paper").split(" ");
    const lines = [];
    let cur = "";
    words.forEach((w) => {
      const t = cur ? `${cur} ${w}` : w;
      if (g.measureText(t).width > W - 144 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    });
    lines.push(cur);
    lines.slice(0, 2).forEach((l, i) => g.fillText(l, 72, 270 + i * 90));
    const subY = 270 + Math.min(lines.length, 2) * 90 + 6;
    g.font = `600 36px ${F}`;
    g.fillStyle = "rgba(255,255,255,.75)";
    g.fillText(`Paper ${e.paperNumber} · ${e.session || ""}`, 72, subY);

    /* ring */
    const tier = tierOf(e.level);
    const col = { high: "#4ade80", mid: "#38bdf8", low: "#fbbf24", risk: "#f87171" }[tier];
    const cx = W / 2, cy = 800, r = 250;
    g.lineWidth = 40;
    g.strokeStyle = "rgba(255,255,255,.12)";
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = col;
    g.lineCap = "round";
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * e.pct) / 100);
    g.stroke();
    g.textAlign = "center";
    g.fillStyle = "#ffffff";
    g.font = `800 190px ${F}`;
    g.fillText(`${e.pct}%`, cx, cy + 40);
    g.font = `700 50px ${F}`;
    g.fillStyle = col;
    g.fillText(`Level ${e.level}`, cx, cy + 128);
    g.font = `700 60px ${F}`;
    g.fillStyle = "#ffffff";
    g.fillText(levelOf(e.pct)[2], cx, 1150);

    /* stats */
    const stats = [
      [`${e.score}/${e.marks}`, "MARKS"],
      [human(e.usedMin), "TIME USED"],
      [formatDate(e.at), "DATE"],
    ];
    stats.forEach(([v, l], i) => {
      const x = 180 + i * 360;
      g.font = `800 44px ${F}`;
      g.fillStyle = "#ffffff";
      g.fillText(v, x, 1235);
      g.font = `700 22px ${F}`;
      g.fillStyle = "rgba(255,255,255,.6)";
      g.fillText(l, x, 1272);
    });
    g.font = `600 26px ${F}`;
    g.fillStyle = "rgba(255,255,255,.55)";
    g.fillText("Sit your own timed exam on ScientiaForge Study Hub", cx, 1322);
    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  /* ================================================================ mount */
  function mount(root, paper) {
    root.querySelector(".pp-exam")?.remove();
    const marks = Number(paper.total_marks) || 150;
    const baseMin = Math.round(marks * MIN_PER_MARK);
    const qUrl = safeUrl(paper.question_paper_url);
    const mUrl = paper.memorandum_url ? safeUrl(paper.memorandum_url) : "";
    const sess = sessionLabel(paper);
    const opts = Object.assign({ extra: false, reading: true, voice: true, sound: false, target: 5 }, S.getPrefs());

    const sec = document.createElement("section");
    sec.className = "pp-exam";
    sec.setAttribute("aria-labelledby", "ppExamTitle");
    const anchor = root.querySelector(".pp-recall");
    anchor ? anchor.insertAdjacentElement("afterend", sec) : root.prepend(sec);

    const logAll = () => S.attempts();
    const myLog = () => logAll().filter((e) => String(e.paperId) === String(paper.id));
    const minutesFor = () => (opts.extra ? Math.round(baseMin * 1.25) : baseMin);

    /* ------------------------------------------------ the card on the page */
    function render() {
      const active = getActive(paper.id);
      const mine = myLog();
      const best = mine.length ? Math.max(...mine.map((e) => e.pct)) : null;
      const tPct = LEVELS.find((l) => l[1] === opts.target)[0];
      const left = active ? (active.endsAt - Date.now()) / 1000 : 0;
      const review = active && (active.phase === "review" || left <= 0);
      const minutes = minutesFor();

      sec.innerHTML = `
        <div class="ex-card-head">
          <div class="ex-card-ring" aria-hidden="true">
            <svg viewBox="0 0 44 44"><circle class="ex-ring-bg" cx="22" cy="22" r="19"/><circle class="ex-ring-fg" cx="22" cy="22" r="19" stroke-dasharray="${RING}" stroke-dashoffset="${RING * 0.28}"/></svg>
            <i data-lucide="timer"></i>
          </div>
          <div>
            <p class="ex-eyebrow">Exam Arena</p>
            <h2 id="ppExamTitle">Sit this paper like the real exam</h2>
            <p>Reading time, a running clock, spoken time calls and a pacing guide that tracks the marks you have actually finished.
               Then mark yourself and get a full report card: your NSC level, what to fix first, and a result you can share.</p>
          </div>
        </div>

        <div class="nsc-chips">
          <span class="nsc-chip"><i data-lucide="clock"></i>${esc(human(minutes))} writing${opts.reading ? ` + ${READING_MIN} min reading` : ""}</span>
          <span class="nsc-chip nsc-chip-plain">${esc(marks)} marks</span>
          <span class="nsc-chip nsc-chip-plain"><i data-lucide="target"></i>Level ${esc(opts.target)} needs ${esc(marksFor(tPct, marks))} marks</span>
          ${best != null ? `<span class="nsc-chip nsc-chip-accent"><i data-lucide="trophy"></i>Personal best ${best}%</span>` : ""}
        </div>

        ${
          active
            ? `<div class="ex-card-actions">
                 <button type="button" class="nsc-btn nsc-btn-primary nsc-btn-lg" data-resume>
                   <i data-lucide="${review ? "check-check" : "play"}"></i>${review ? "Finish marking your paper" : `Resume exam (${esc(clock(left))} left)`}</button>
                 <button type="button" class="nsc-btn nsc-btn-ghost" data-abandon>Abandon</button>
               </div>`
            : `<div class="ex-opts" role="group" aria-label="Exam options">
                 <label class="ex-opt"><input type="checkbox" data-opt="reading" ${opts.reading ? "checked" : ""}>
                   <span><strong>${READING_MIN} minutes reading time</strong><small>Read, plan, don't write, like the hall</small></span></label>
                 <label class="ex-opt"><input type="checkbox" data-opt="voice" ${opts.voice ? "checked" : ""}>
                   <span><strong>Invigilator voice</strong><small>Spoken time calls and "pens down"</small></span></label>
                 <label class="ex-opt"><input type="checkbox" data-opt="sound" ${opts.sound ? "checked" : ""}>
                   <span><strong>Exam hall ticking</strong><small>A soft clock tick for the pressure</small></span></label>
                 <label class="ex-opt"><input type="checkbox" data-opt="extra" ${opts.extra ? "checked" : ""}>
                   <span><strong>Extra time (+25%)</strong><small>For learners with concessions</small></span></label>
                 <label class="ex-opt ex-opt-select"><span><strong>Target level</strong><small>You get told if you hit it</small></span>
                   <select data-opt="target">${[4, 5, 6, 7].map((l) => `<option value="${l}" ${opts.target === l ? "selected" : ""}>Level ${l}</option>`).join("")}</select></label>
               </div>
               <div class="ex-card-actions">
                 <button type="button" class="nsc-btn nsc-btn-primary nsc-btn-lg" data-start><i data-lucide="play"></i>Enter the exam hall</button>
               </div>`
        }

        ${
          mine.length
            ? `<div class="ex-log">
                 <div class="ex-log-head"><h3>Your attempts</h3>${mine.length > 1 ? `<span class="ex-spark-wrap" title="Your scores over time">${spark(mine.slice(-8).map((e) => e.pct))}</span>` : ""}</div>
                 <ul>${mine
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
        const rd = opts.reading ? READING_MIN : 0;
        const state = {
          paperId: paper.id,
          phase: rd ? "reading" : "writing",
          readingMin: rd,
          readingTotal: rd,
          extra: opts.extra,
          startedAt: now + rd * 60000,
          endsAt: now + rd * 60000 + minutes * 60000,
          duration: minutes,
          voice: opts.voice,
          sound: opts.sound,
          target: opts.target,
          questions: [],
          notes: "",
          leaves: 0,
          tracked: false,
          said: [],
          announced: false,
        };
        S.setActive(state);
        openExam(state);
      });
      sec.querySelector("[data-resume]")?.addEventListener("click", () => openExam(active));
      sec.querySelector("[data-abandon]")?.addEventListener("click", () => {
        if (confirm("Abandon this exam? Your timer and everything you logged will be cleared.")) {
          S.clearActive(paper.id);
          render();
        }
      });
      sec.querySelectorAll("[data-opt]").forEach((el) =>
        el.addEventListener("change", () => {
          const k = el.dataset.opt;
          opts[k] = k === "target" ? Number(el.value) : el.checked;
          S.setPrefs(opts);
          render();
          sec.querySelector(`[data-opt="${k}"]`)?.focus();
        })
      );
    }

    /* ================================================ the exam overlay */
    function openExam(state) {
      const total = state.duration * 60;
      const perMark = state.duration / marks; // minutes per mark for this sitting
      const tPct = LEVELS.find((l) => l[1] === state.target)[0];
      const tMarks = marksFor(tPct, marks);
      audio(); // created inside the click so the browser lets us play sound later

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
      const save = () => S.setActive(state);
      const close = () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVis);
        try { speechSynthesis.cancel(); } catch { /* none */ }
        ov.remove();
        document.documentElement.classList.remove("ex-lock");
        behind.forEach((c) => (c.inert = false));
        render();
        sec.querySelector("[data-start], [data-resume]")?.focus();
      };
      const onVis = () => {
        if (document.hidden && (state.phase === "reading" || state.phase === "writing") && window.innerWidth > 820) {
          state.leaves++;
          state.tracked = true;
          save();
          const f = ov.querySelector("#exFocus");
          if (f) f.textContent = `You have left this tab ${state.leaves} ${state.leaves === 1 ? "time" : "times"}.`;
        }
      };
      document.addEventListener("visibilitychange", onVis);

      const title = `<div class="ex-title"><strong>${esc(paper.subject)} · Paper ${esc(paper.paper_number)}</strong><span>${esc(sess)}</span></div>`;
      const frameBlock = (src, label, openLabel) => `
        <div class="ex-frame-wrap">
          <iframe class="ex-frame" id="exFrame" title="${esc(label)}" src="${esc(src)}#view=FitH"></iframe>
          <a class="nsc-btn nsc-btn-primary nsc-btn-lg ex-open-pdf" href="${esc(src)}" target="_blank" rel="noopener"><i data-lucide="file-text"></i>${esc(openLabel)}</a>
        </div>`;

      /* ---------------------------------------------- writing / reading shell */
      function showShell() {
        const checkpoints = [0.25, 0.5, 0.75, 1].map((f) => ({ f, marks: Math.round(marks * f), left: clock(total * (1 - f)) }));
        ov.innerHTML = `
          <header class="ex-bar">
            ${title}
            <div class="ex-timer" role="timer">
              <svg class="ex-ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="ex-ring-bg" cx="22" cy="22" r="19"/>
                <circle class="ex-ring-fg" id="exFg" cx="22" cy="22" r="19" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
              <div class="ex-timebox"><span class="ex-phase" id="exPhase"></span><span class="ex-time" id="exTime"></span></div>
            </div>
            <div class="ex-actions">
              <button type="button" class="nsc-btn nsc-btn-ghost" id="exSkip" hidden>Start writing now</button>
              <button type="button" class="nsc-btn nsc-btn-ghost" id="exLeave">Leave</button>
              <button type="button" class="nsc-btn nsc-btn-primary" id="exFinish"><i data-lucide="flag"></i>Hand in</button>
            </div>
          </header>
          <div class="ex-body">
            ${frameBlock(qUrl, "Question paper", "Open the question paper")}
            <aside class="ex-side" aria-label="Exam tools">
              <div class="ex-tabs" role="tablist" aria-label="Exam tools">
                <button type="button" role="tab" aria-selected="true" data-tab="Pace">Pace</button>
                <button type="button" role="tab" aria-selected="false" data-tab="Q">Questions</button>
                <button type="button" role="tab" aria-selected="false" data-tab="Notes">Notes</button>
              </div>

              <div class="ex-pane" data-pane="Pace">
                <p class="ex-target"><i data-lucide="target"></i>Target Level ${esc(state.target)}: ${esc(tMarks)} of ${esc(marks)} marks</p>
                <div class="ex-status" id="exStatus"></div>
                <div class="ex-meter"><span>Time used</span><div class="ex-bar-track" aria-hidden="true"><i id="exTimeBar"></i></div></div>
                <div class="ex-meter"><span>Marks finished</span><div class="ex-bar-track ex-bar-marks" aria-hidden="true"><i id="exMarkBar"></i></div></div>
                <ol class="ex-checkpoints">
                  ${checkpoints.map((c, i) => `<li data-f="${c.f}" id="exCp${i}"><strong>${esc(c.marks)} marks</strong><span>${esc(c.left)} left</span></li>`).join("")}
                </ol>
                <p class="ex-tip">About ${perMark.toFixed(1)} minutes per mark. Stuck? Flag it and move on. Come back at the end.</p>
                <p class="ex-note" id="exNote" role="status"></p>
                <p class="ex-focus" id="exFocus"></p>
              </div>

              <div class="ex-pane" data-pane="Q" hidden>
                <form id="exQForm" class="ex-qform" autocomplete="off">
                  <label>Question<input id="exQLabel" type="text" maxlength="8" placeholder="1.1" required></label>
                  <label>Marks<input id="exQMarks" type="number" inputmode="numeric" min="1" max="${esc(marks)}" required></label>
                  <button type="submit" class="nsc-btn nsc-btn-primary">Add</button>
                </form>
                <p class="ex-tip">Add each question as you start it. Tick it when it's done. This is what the pacing guide measures.</p>
                <p class="ex-qsum" id="exQSum"></p>
                <ul id="exQList" class="ex-qlist"></ul>
              </div>

              <div class="ex-pane" data-pane="Notes" hidden>
                <label class="ex-notes-label" for="exNotes">Scratchpad (saved automatically)</label>
                <textarea id="exNotes" class="ex-notes" placeholder="Plan your order of attack, jot formulas, list questions to revisit...">${esc(state.notes || "")}</textarea>
              </div>
            </aside>
          </div>`;
        icons(ov);
        ov.focus();

        /* tabs */
        const tabs = [...ov.querySelectorAll(".ex-tabs [role=tab]")];
        tabs.forEach((t) =>
          t.addEventListener("click", () => {
            tabs.forEach((x) => x.setAttribute("aria-selected", String(x === t)));
            ov.querySelectorAll(".ex-pane").forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
          })
        );

        /* buttons */
        ov.querySelector("#exFinish").addEventListener("click", () => {
          if (confirm("Hand in now? You'll go on to mark yourself against the memorandum.")) finish("handed");
        });
        ov.querySelector("#exLeave").addEventListener("click", () => {
          if (confirm("Leave the exam room? The clock keeps running. You can resume from the paper page until time runs out.")) close();
        });
        ov.querySelector("#exSkip").addEventListener("click", () => startWriting(true));

        /* notes */
        let nt = null;
        ov.querySelector("#exNotes").addEventListener("input", (e) => {
          state.notes = e.target.value;
          clearTimeout(nt);
          nt = setTimeout(save, 400);
        });

        /* question tracker */
        const qMarks = ov.querySelector("#exQMarks"), qLabel = ov.querySelector("#exQLabel");
        const nextLabel = () => {
          qLabel.value = String(state.questions.length + 1);
          qMarks.value = state.lastMarks || "";
        };
        ov.querySelector("#exQForm").addEventListener("submit", (e) => {
          e.preventDefault();
          const m = Math.round(Number(qMarks.value));
          if (!m || m < 1) return;
          state.questions.push({ label: qLabel.value.trim(), marks: Math.min(m, marks), status: "todo", doneAt: null });
          state.lastMarks = m;
          save();
          renderQs();
          nextLabel();
          qMarks.focus();
          update();
        });
        ov.querySelector("#exQList").addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-act]");
          const li = e.target.closest("li[data-i]");
          if (!btn || !li) return;
          const i = Number(li.dataset.i), q = state.questions[i];
          if (btn.dataset.act === "del") state.questions.splice(i, 1);
          else if (btn.dataset.act === "done") {
            q.status = q.status === "done" ? "todo" : "done";
            q.doneAt = q.status === "done" ? Date.now() : null;
          } else if (btn.dataset.act === "flag") q.status = q.status === "flag" ? "todo" : "flag";
          save();
          renderQs();
          update();
        });
        function renderQs() {
          const qs = state.questions;
          ov.querySelector("#exQList").innerHTML = qs
            .map(
              (q, i) => `
            <li class="ex-q is-${q.status}" data-i="${i}">
              <span class="ex-q-label">Q${esc(q.label)}</span><span class="ex-q-marks">${esc(q.marks)} marks</span>
              <button type="button" data-act="done" aria-pressed="${q.status === "done"}" aria-label="Mark Q${esc(q.label)} done"><i data-lucide="check"></i></button>
              <button type="button" data-act="flag" aria-pressed="${q.status === "flag"}" aria-label="Flag Q${esc(q.label)} to revisit"><i data-lucide="flag"></i></button>
              <button type="button" data-act="del" aria-label="Remove Q${esc(q.label)}"><i data-lucide="x"></i></button>
            </li>`
            )
            .join("");
          icons(ov.querySelector("#exQList"));
          const logged = qs.reduce((n, q) => n + q.marks, 0);
          const done = qs.filter((q) => q.status === "done").reduce((n, q) => n + q.marks, 0);
          const flagged = qs.filter((q) => q.status === "flag").length;
          ov.querySelector("#exQSum").textContent = qs.length
            ? `${logged} marks logged · ${done} finished${flagged ? ` · ${flagged} flagged` : ""}`
            : "No questions logged yet.";
        }
        renderQs();
        nextLabel();

        /* fresh start: announce */
        if (!state.announced) {
          state.announced = true;
          save();
          chime();
          if (state.voice) {
            say(state.phase === "reading"
              ? `Candidates, you may now read the paper. You have ${state.readingMin} minutes of reading time. Please do not write.`
              : "Candidates, you may now begin writing. Good luck.");
          }
        }
        update();
        timer = setInterval(update, 1000);
      }

      function startWriting(skipped) {
        const now = Date.now();
        if (skipped) {
          state.startedAt = now;
          state.endsAt = now + state.duration * 60000;
        }
        state.phase = "writing";
        state.readingMin = 0;
        save();
        chime();
        if (state.voice) say("Reading time is over. You may now begin writing.");
        ov.querySelector("#exNote").textContent = "Writing time has started.";
        update();
      }

      /* one pass of the clock: runs every second */
      function update() {
        const now = Date.now();
        const reading = state.phase === "reading";
        if (reading && now >= state.startedAt) return startWriting(false);
        const left = ((reading ? state.startedAt : state.endsAt) - now) / 1000;
        if (!reading && left <= 0) {
          chime();
          if (state.voice) say("Time is up. Pens down.");
          return finish("time");
        }
        const span = reading ? state.readingMin * 60 : total;
        const frac = Math.max(0, Math.min(1, left / span));

        const timerEl = ov.querySelector(".ex-timer");
        ov.querySelector("#exTime").textContent = clock(left);
        ov.querySelector("#exPhase").textContent = reading ? "Reading time" : "Writing time";
        ov.querySelector("#exFg").style.strokeDashoffset = String(RING * (1 - frac));
        timerEl.classList.toggle("is-read", reading);
        timerEl.classList.toggle("is-warn", !reading && frac <= 0.25 && left > 600);
        timerEl.classList.toggle("is-late", !reading && left <= 600);
        ov.querySelector("#exSkip").hidden = !reading;
        ov.querySelector("#exFinish").hidden = reading;

        const status = ov.querySelector("#exStatus");
        if (reading) {
          status.className = "ex-status is-read";
          status.innerHTML = `<strong>Reading time</strong><span>Read the whole paper. Decide where to start: take the questions you know best first. No writing yet.</span>`;
          ov.querySelector("#exTimeBar").style.width = "0%";
        } else {
          if (state.sound) tick();
          const elapsedMin = (total - left) / 60;
          const should = Math.min(marks, Math.floor(elapsedMin / perMark));
          const done = state.questions.filter((q) => q.status === "done").reduce((n, q) => n + q.marks, 0);
          let cls = "ok", head = "Settle in", body = "Log your questions in the Questions tab and this guide will compare you with the clock.";
          if (state.questions.length) {
            const diff = done - should;
            if (diff >= 5) [cls, head, body] = ["ok", "Ahead of pace", `You have finished ${done} marks and the clock says about ${should}. Use the spare time to check your work.`];
            else if (diff >= -5) [cls, head, body] = ["ok", "On pace", `${done} marks finished against about ${should} expected by now.`];
            else [cls, head, body] = [diff < -20 ? "late" : "warn", `Behind by ${-diff} marks`, `${done} marks finished against about ${should} expected. Flag the slow ones and move on.`];
          }
          status.className = `ex-status is-${cls}`;
          status.innerHTML = `<strong>${esc(head)}</strong><span>${esc(body)}</span>`;
          ov.querySelector("#exTimeBar").style.width = `${((1 - frac) * 100).toFixed(1)}%`;
          ov.querySelector("#exMarkBar").style.width = `${Math.min(100, (done / marks) * 100).toFixed(1)}%`;
          ov.querySelectorAll(".ex-checkpoints li").forEach((li) => li.classList.toggle("is-done", 1 - frac >= Number(li.dataset.f)));

          for (const m of [60, 30, 15, 10, 5, 1]) {
            if (left <= m * 60 && m * 60 < total && !state.said.includes(m)) {
              state.said.push(m);
              save();
              const msg = `${m} ${m === 1 ? "minute" : "minutes"} remaining.`;
              ov.querySelector("#exNote").textContent = msg;
              if (state.voice) say(msg);
            }
          }
        }
        const f = ov.querySelector("#exFocus");
        if (f && state.tracked) f.textContent = `You have left this tab ${state.leaves} ${state.leaves === 1 ? "time" : "times"}.`;
        if (!ov.querySelector("#exMarkBar").style.width) ov.querySelector("#exMarkBar").style.width = "0%";
      }

      function finish(reason) {
        clearInterval(timer);
        const used = Math.max(0, Math.min(total, (Date.now() - state.startedAt) / 1000));
        state.phase = "review";
        state.reason = reason;
        state.usedSec = reason === "time" ? total : used;
        save();
        showReview();
      }

      /* ---------------------------------------------- review: mark yourself */
      function showReview() {
        const qs = state.questions;
        const logged = qs.reduce((n, q) => n + q.marks, 0);
        const room = Math.max(0, marks - logged);
        const usedMin = Math.round((state.usedSec / 60) * 10) / 10;
        const heading = state.reason === "time" ? "Time's up. Pens down." : state.reason === "handed" ? "Paper handed in" : "Time ran out";
        const rows = qs
          .map(
            (q, i) => `
          <label class="ex-mrow"><span>Q${esc(q.label)}</span>
            <input type="number" inputmode="decimal" min="0" max="${esc(q.marks)}" step="1" data-q="${i}" placeholder="0" aria-label="Marks for Q${esc(q.label)} out of ${esc(q.marks)}"><em>/ ${esc(q.marks)}</em></label>`
          )
          .join("");
        const otherRow = !qs.length
          ? `<label class="ex-mrow ex-mrow-total"><span>Total marks</span><input type="number" inputmode="decimal" min="0" max="${esc(marks)}" step="1" data-other placeholder="0" required aria-label="Total marks scored"><em>/ ${esc(marks)}</em></label>`
          : room > 0
          ? `<label class="ex-mrow"><span>Other marks</span><input type="number" inputmode="decimal" min="0" max="${esc(room)}" step="1" data-other placeholder="0" aria-label="Marks from questions you did not log"><em>/ ${esc(room)}</em></label>`
          : "";

        ov.innerHTML = `
          <header class="ex-bar">${title}<span class="ex-badge">${esc(heading)}</span>
            <div class="ex-actions"><button type="button" class="nsc-btn nsc-btn-ghost" id="exClose">Close for now</button></div></header>
          <div class="ex-body">
            <div class="ex-frame-wrap">
              <div class="ex-toggle" role="tablist" aria-label="Choose document">
                <button type="button" role="tab" aria-selected="${mUrl ? "true" : "false"}" ${mUrl ? "" : "hidden"} data-src="${esc(mUrl)}">Memorandum</button>
                <button type="button" role="tab" aria-selected="${mUrl ? "false" : "true"}" data-src="${esc(qUrl)}">Question paper</button>
              </div>
              <iframe class="ex-frame" id="exFrame" title="${mUrl ? "Memorandum" : "Question paper"}" src="${esc(mUrl || qUrl)}#view=FitH"></iframe>
              <a class="nsc-btn nsc-btn-primary nsc-btn-lg ex-open-pdf" id="exOpen" href="${esc(mUrl || qUrl)}" target="_blank" rel="noopener"><i data-lucide="file-check"></i>${mUrl ? "Open the memorandum" : "Open the question paper"}</a>
            </div>
            <aside class="ex-side" id="exSide">
              <h2>Mark yourself</h2>
              <p>You used <strong>${esc(human(usedMin))}</strong> of ${esc(human(state.duration))}.
                 ${mUrl ? "Mark each question honestly against the memorandum." : "The memorandum isn't available for this paper, so enter your best estimate."}</p>
              <form id="exScore" class="ex-form">
                <div class="ex-mrows">${rows}${otherRow}</div>
                <div class="ex-live" id="exLive" aria-live="polite"></div>
                <p class="ex-error" id="exErr" role="alert"></p>
                <button type="submit" class="nsc-btn nsc-btn-primary nsc-btn-lg">See my report card</button>
              </form>
            </aside>
          </div>`;
        icons(ov);
        ov.focus();
        ov.querySelector("#exClose").addEventListener("click", close);

        const frame = ov.querySelector("#exFrame"), open = ov.querySelector("#exOpen");
        ov.querySelectorAll(".ex-toggle button").forEach((b) =>
          b.addEventListener("click", () => {
            ov.querySelectorAll(".ex-toggle button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
            frame.src = `${b.dataset.src}#view=FitH`;
            frame.title = b.textContent;
            open.href = b.dataset.src;
          })
        );

        const inputs = [...ov.querySelectorAll("#exScore input")];
        const totalNow = () => Math.min(marks, inputs.reduce((n, i) => n + (Number(i.value) || 0), 0));
        const live = () => {
          const t = totalNow(), p = pctOf(t, marks), [, lvl, lab] = levelOf(p);
          ov.querySelector("#exLive").innerHTML = `<strong>${esc(t)} / ${esc(marks)}</strong><span>${esc(p)}%</span><span class="ex-pill ex-${tierOf(lvl)}">Level ${esc(lvl)} · ${esc(lab)}</span>`;
        };
        inputs.forEach((i) => i.addEventListener("input", live));
        live();
        ov.querySelector("#exScore").addEventListener("submit", (e) => {
          e.preventDefault();
          for (const i of inputs) {
            const v = i.value === "" ? 0 : Number(i.value);
            if (!Number.isFinite(v) || v < 0 || v > Number(i.max)) {
              ov.querySelector("#exErr").textContent = `Each mark must be between 0 and ${i.max}.`;
              i.focus();
              return;
            }
          }
          qs.forEach((q, idx) => {
            const inp = ov.querySelector(`[data-q="${idx}"]`);
            q.scored = Number(inp.value) || 0;
          });
          showReport(totalNow(), usedMin);
        });
        inputs[0] && inputs[0].focus();
      }

      /* ---------------------------------------------- the report card */
      function showReport(score, usedMin) {
        const qs = state.questions;
        const pct = pctOf(score, marks);
        const [, level, label] = levelOf(pct);
        const tier = tierOf(level);
        const prior = myLog();
        const prevBest = prior.reduce((m, e) => Math.max(m, e.pct), -1);
        const firstEver = logAll().length === 0;

        const entry = {
          paperId: paper.id, subject: paper.subject, paperNumber: paper.paper_number, session: sess,
          marks, score, pct, level, usedMin, duration: state.duration, target: state.target,
          leaves: state.tracked ? state.leaves : null,
          readingMin: state.readingTotal || 0,
          extra: !!state.extra,
          startedAt: new Date(state.startedAt).toISOString(),
          badges: [],
          questions: qs.slice(0, 80).map((q) => ({ label: q.label, marks: q.marks, scored: q.scored ?? null, status: q.status })),
          at: new Date().toISOString(),
        };

        /* narrative bits */
        const spare = state.duration - usedMin;
        const pace = spare >= 5 ? `finished with ${human(spare)} to spare` : spare > 0 ? "used almost all your time" : "used the full time";
        const compare = prevBest < 0 ? "your first attempt: this is your baseline"
          : pct > prevBest ? `a new personal best, up ${pct - prevBest} points from ${prevBest}%`
          : pct === prevBest ? `you matched your best of ${prevBest}%`
          : `your best is ${prevBest}%, so you can beat it`;
        const above = LEVELS.filter((l) => l[0] > pct).pop();
        const nextText = level === 7
          ? "You're at the top level. Now make it consistent."
          : `${Math.max(1, marksFor(above[0], marks) - score)} more ${marksFor(above[0], marks) - score === 1 ? "mark reaches" : "marks reach"} Level ${above[1]} (${above[0]}% and up).`;
        const targetText = level >= state.target
          ? `Target Level ${state.target} reached.`
          : `${tMarks - score} ${tMarks - score === 1 ? "mark" : "marks"} short of your Level ${state.target} target.`;

        /* badges */
        const badges = [];
        if (firstEver) badges.push(["sparkles", "First exam sat"]);
        if (prevBest >= 0 && pct > prevBest) badges.push(["trophy", "New personal best"]);
        if (level >= 6) badges.push(["award", `Level ${level} club`]);
        if (level >= state.target) badges.push(["target", "Target reached"]);
        if (state.tracked && state.leaves === 0 && state.duration >= 60) badges.push(["eye", "Iron focus"]);
        if (spare >= 10 && pct >= 50) badges.push(["gauge", "Time to spare"]);

        /* save: instantly on this device, then to the learner's account in the background */
        entry.badges = badges.map((b) => b[1]);
        S.addAttempt(entry);
        S.clearActive(paper.id);

        /* where the marks went */
        const scored = qs.filter((q) => q.scored != null);
        let lostHtml = `<p class="ex-empty">Log your questions during the exam (Questions tab) and you'll see exactly where marks were lost.</p>`;
        if (scored.length) {
          const rows = [...scored].sort((a, b) => b.marks - b.scored - (a.marks - a.scored)).slice(0, 8);
          const maxM = Math.max(...rows.map((q) => q.marks));
          const revisit = rows.filter((q) => q.marks - q.scored > 0).slice(0, 3).map((q) => `Q${q.label}`);
          lostHtml = `
            ${revisit.length ? `<p class="ex-revisit"><i data-lucide="crosshair"></i>Revisit first: <strong>${esc(revisit.join(", "))}</strong></p>` : `<p class="ex-revisit"><i data-lucide="party-popper"></i>No marks lost on the questions you logged.</p>`}
            <ul class="ex-bars">${rows
              .map((q) => {
                const r = q.scored / q.marks;
                const t = r >= 0.8 ? "high" : r >= 0.5 ? "mid" : "risk";
                return `<li><span class="ex-bars-l">Q${esc(q.label)}</span>
                  <span class="ex-bars-t" style="width:${((q.marks / maxM) * 100).toFixed(1)}%"><i class="ex-${t}" style="width:${(r * 100).toFixed(1)}%"></i></span>
                  <span class="ex-bars-v">${esc(q.scored)}/${esc(q.marks)}</span></li>`;
              })
              .join("")}</ul>`;
        }

        /* time against marks */
        const timed = qs.filter((q) => q.doneAt).sort((a, b) => a.doneAt - b.doneAt);
        let timeHtml = `<p class="ex-empty">Tick questions off as you finish them and you'll see which ones ate your time.</p>`;
        if (timed.length >= 2) {
          let prev = state.startedAt;
          const rows = timed.map((q) => {
            const mins = Math.max(0, (q.doneAt - prev) / 60000);
            prev = q.doneAt;
            return { q, mins, ratio: mins / Math.max(0.5, q.marks * perMark) };
          });
          const slow = [...rows].sort((a, b) => b.ratio - a.ratio)[0];
          timeHtml = `
            ${slow.ratio > 1.3 ? `<p class="ex-revisit"><i data-lucide="hourglass"></i>Slowest against its marks: <strong>Q${esc(slow.q.label)}</strong>, ${slow.ratio.toFixed(1)}× its time budget.</p>` : `<p class="ex-revisit"><i data-lucide="gauge"></i>Your time matched the marks well.</p>`}
            <ul class="ex-bars">${rows
              .map((r) => `<li><span class="ex-bars-l">Q${esc(r.q.label)}</span>
                <span class="ex-bars-t" style="width:${Math.min(100, (r.ratio / 2.5) * 100).toFixed(1)}%"><i class="${r.ratio > 1.3 ? "ex-risk" : "ex-mid"}" style="width:100%"></i></span>
                <span class="ex-bars-v">${esc(Math.round(r.mins))} min</span></li>`)
              .join("")}</ul>
            <p class="ex-tip">Bar length is time spent compared with the time that question's marks deserve.</p>`;
        }

        ov.innerHTML = `
          <header class="ex-bar">${title}<span class="ex-badge">Report card</span>
            <div class="ex-actions"><button type="button" class="nsc-btn nsc-btn-ghost" id="exDone">Close</button></div></header>
          <div class="ex-report">
            <section class="ex-hero">
              <div class="ex-score-ring">
                <svg viewBox="0 0 44 44" aria-hidden="true"><circle class="ex-ring-bg" cx="22" cy="22" r="19"/>
                  <circle class="ex-ring-fg ex-${tier}" id="exScoreFg" cx="22" cy="22" r="19" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg>
                <strong><span id="exPct">0</span>%</strong>
              </div>
              <div class="ex-hero-text">
                <p class="ex-kicker">${esc(paper.subject)} · Paper ${esc(paper.paper_number)} · ${esc(sess)}</p>
                <h2><span class="ex-pill ex-${tier}">Level ${level}</span> ${esc(label)}</h2>
                <p>${esc(score)} out of ${esc(marks)} marks. You ${esc(pace)}, and ${esc(compare)}.</p>
                <p class="ex-next"><i data-lucide="trending-up"></i>${esc(nextText)} ${esc(targetText)}</p>
                ${state.tracked ? `<p class="ex-tip">You left the exam tab ${state.leaves} ${state.leaves === 1 ? "time" : "times"}.</p>` : ""}
                ${badges.length ? `<ul class="ex-badges">${badges.map(([ic, t]) => `<li><i data-lucide="${ic}"></i>${esc(t)}</li>`).join("")}</ul>` : ""}
              </div>
            </section>

            <div class="ex-grid">
              <section class="ex-panel"><h3>Where the marks went</h3>${lostHtml}</section>
              <section class="ex-panel"><h3>Time against marks</h3>${timeHtml}</section>
            </div>

            <section class="ex-panel ex-share">
              <div>
                <h3>Share your result</h3>
                <p>A ready-made image of this result. Post it, send it to your study group, or challenge them to beat it.</p>
                <div class="ex-share-actions">
                  <button type="button" class="nsc-btn nsc-btn-primary" id="exShare"><i data-lucide="share-2"></i>Share</button>
                  <button type="button" class="nsc-btn nsc-btn-ghost" id="exSave"><i data-lucide="download"></i>Save image</button>
                </div>
              </div>
              <img id="exShareImg" class="ex-share-img" alt="Your result card" hidden>
            </section>

            <div class="ex-result-actions">
              ${paper.recall_available ? `<a class="nsc-btn nsc-btn-primary nsc-btn-lg" href="ActiveRecall.html?paper=${encodeURIComponent(paper.id)}"><i data-lucide="brain"></i>Drill this paper with Active Recall</a>` : ""}
              <button type="button" class="nsc-btn nsc-btn-ghost nsc-btn-lg" id="exAgain"><i data-lucide="rotate-ccw"></i>Sit it again</button>
            </div>
            <p class="ex-tip ex-foot">Levels follow the NSC achievement scale: 7 is 80% and above, 4 is 50 to 59%, 3 is 40 to 49%.</p>
          </div>`;
        icons(ov);
        ov.querySelector("#exDone").addEventListener("click", close);
        ov.querySelector("#exAgain").addEventListener("click", close);
        ov.focus();

        /* animate the ring and number */
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const pctEl = ov.querySelector("#exPct");
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            ov.querySelector("#exScoreFg").style.strokeDashoffset = String(RING * (1 - pct / 100));
          })
        );
        if (reduce) pctEl.textContent = pct;
        else {
          const t0 = performance.now();
          (function count(t) {
            const k = Math.min(1, (t - t0) / 1200);
            pctEl.textContent = Math.round(pct * (1 - Math.pow(1 - k, 3)));
            if (k < 1) requestAnimationFrame(count);
          })(t0);
        }
        if (level >= 6 || (prevBest >= 0 && pct > prevBest)) confetti(ov);
        chime();

        /* share image */
        let blob = null;
        makeCard(entry).then((b) => {
          blob = b;
          if (!b) return;
          const img = ov.querySelector("#exShareImg");
          if (img) {
            img.src = URL.createObjectURL(b);
            img.hidden = false;
          }
        }).catch(() => {
          /* canvas unavailable: the report card still works without the share image */
        });
        const fileName = `${paper.subject}-paper-${paper.paper_number}-level-${level}.png`.replace(/\s+/g, "-").toLowerCase();
        ov.querySelector("#exSave").addEventListener("click", () => {
          if (!blob) return;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          a.click();
        });
        ov.querySelector("#exShare").addEventListener("click", async () => {
          if (!blob) return;
          const file = new File([blob], fileName, { type: "image/png" });
          const text = `I got Level ${level} (${pct}%) in ${paper.subject} Paper ${paper.paper_number} on ScientiaForge. Can you beat it?`;
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], text }); } catch { /* cancelled */ }
          } else ov.querySelector("#exSave").click();
        });
      }

      /* ---------------------------------------------- open in the right phase */
      if (state.phase === "review" || (state.phase === "writing" && Date.now() >= state.endsAt)) {
        if (state.phase !== "review") {
          state.phase = "review";
          state.reason = "away";
          state.usedSec = total;
          save();
        }
        showReview();
      } else {
        showShell();
      }
    }

    render();
    icons(sec);

    /* when the account's data arrives (history, preferences, an exam started on another device), redraw the card */
    const refresh = () => {
      if (!document.querySelector(".ex-overlay")) {
        Object.assign(opts, S.getPrefs());
        render();
      }
    };
    S.ready.then(refresh);
    S.pullActive(paper.id).then((a) => a && refresh());
  }

  window.NSCExam = { mount };
})();