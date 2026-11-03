/* ScientiaForge · Study Hub "My readiness"
   A dashboard built from every Exam Arena sitting on this device:
   - headline numbers: exams sat, average, best level, day streak, hours in the exam room
   - a 12-week activity heatmap
   - three insights: strongest subject, needs focus, most improved
   - every subject with a predicted NSC level (from the last three attempts), a trend line,
     and a one-click jump back into that subject's papers
   - subjects you have not touched yet, so nothing gets ignored
   Load AFTER StudyHub.js and nscCommon.js. No backend changes needed. */
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const { esc, icons, formatDate, api } = window.NSC;
  const S = window.NSCStore;
  if (!S) {
    console.error("[My readiness] readinessStore.js must be loaded before ReadinessPanel.js");
    return;
  }
  const tabBar = document.querySelector(".sh-tabs");
  const anchorPanel = document.getElementById("historyPanel") || document.getElementById("papersPanel");
  if (!tabBar || !anchorPanel) return;

  const LEVELS = [[80, 7, "Outstanding"], [70, 6, "Meritorious"], [60, 5, "Substantial"], [50, 4, "Adequate"], [40, 3, "Moderate"], [30, 2, "Elementary"], [0, 1, "Not achieved"]];
  const levelOf = (pct) => LEVELS.find((l) => pct >= l[0]);
  const tierOf = (lvl) => (lvl >= 6 ? "high" : lvl >= 4 ? "mid" : lvl === 3 ? "low" : "risk");
  const OTHER_PANELS = ["papersPanel", "historyPanel", "videosPanel", "applyPanel"];

  const readLog = () => S.attempts();
  const syncLabel = () => {
    const { signedIn, pending, error } = S.syncInfo();
    if (!signedIn) return "Saved on this device only. Sign in to keep it on your account.";
    if (error) return `Your exams are safe on this device, but could not sync to your account yet (${error}).`;
    return pending ? `${pending} ${pending === 1 ? "exam is" : "exams are"} waiting to sync to your account.` : "Synced to your account.";
  };
  const avg = (a) => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0);
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const spark = (vals, w = 110, h = 32) => {
    if (vals.length < 2) return `<span class="rd-spark-empty">One more attempt shows a trend</span>`;
    const step = w / (vals.length - 1);
    const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - 3 - (v / 100) * (h - 6)).toFixed(1)}`).join(" ");
    const last = vals[vals.length - 1], first = vals[0];
    return `<svg class="rd-spark ${last >= first ? "is-up" : "is-down"}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };

  /* subject list for the "not tried yet" section; declared first so a #readiness deep link can use it */
  let allSubjects = null;
  const subjectsPromise = api("/filters").then((f) => (allSubjects = f.subjects || [])).catch(() => (allSubjects = []));

  /* ---------------------------------------------------------------- tab + panel */
  const panel = document.createElement("section");
  panel.id = "readinessPanel";
  panel.className = "rd-panel";
  panel.style.display = "none";
  panel.setAttribute("aria-labelledby", "rdTitle");
  anchorPanel.insertAdjacentElement("afterend", panel);

  const tab = document.createElement("button");
  tab.type = "button";
  const first = tabBar.querySelector(".cp-tab");
  tab.className = first ? first.className.replace(/\bactive\b/, "").trim() : "cp-tab";
  tab.dataset.readiness = "1";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "readinessPanel");
  tab.textContent = "My readiness";
  const historyTab = tabBar.querySelector('[data-panel="historyPanel"]');
  (historyTab || first || tabBar.lastElementChild).insertAdjacentElement("afterend", tab);

  const allTabs = () => [...tabBar.querySelectorAll(".cp-tab")];
  function openReadiness(updateHash = true) {
    allTabs().forEach((t) => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    OTHER_PANELS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    panel.style.display = "";
    render();
    if (updateHash) history.replaceState(null, "", `${location.pathname}${location.search}#readiness`);
  }
  function closeReadiness() {
    panel.style.display = "none";
    tab.classList.remove("active");
    tab.setAttribute("aria-selected", "false");
  }
  tab.addEventListener("click", () => openReadiness());
  allTabs().forEach((t) => {
    if (t !== tab) t.addEventListener("click", closeReadiness);
  });
  if (location.hash === "#readiness") openReadiness(false);
  /* cloud data arriving, or a sync finishing, refreshes the dashboard if it is open */
  S.onChange(() => {
    if (panel.style.display !== "none") render();
  });

  /* ---------------------------------------------------------------- data */
  function analyse(log) {
    const bySubject = new Map();
    log.forEach((e) => {
      const key = e.subject || "Earlier attempts";
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push(e);
    });
    const subjects = [...bySubject.entries()].map(([name, list]) => {
      list.sort((a, b) => new Date(a.at) - new Date(b.at));
      const pcts = list.map((e) => e.pct);
      const recent = avg(pcts.slice(-3));
      const prior = pcts.length > 3 ? avg(pcts.slice(-6, -3)) : pcts.length > 1 ? pcts[0] : null;
      return {
        name, list, pcts, n: list.length,
        latest: pcts[pcts.length - 1],
        recent: Math.round(recent),
        level: levelOf(Math.round(recent)),
        change: prior == null ? null : Math.round(recent - prior),
        gain: pcts.length > 1 ? pcts[pcts.length - 1] - pcts[0] : null,
      };
    });
    const real = subjects.filter((s) => s.name !== "Earlier attempts");
    const days = new Set(log.map((e) => dayKey(new Date(e.at))));
    let streak = 0;
    const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return { subjects, real, days, streak };
  }

  /* ---------------------------------------------------------------- render */
  function heatmap(log) {
    const counts = {};
    log.forEach((e) => {
      const k = dayKey(new Date(e.at));
      counts[k] = (counts[k] || 0) + 1;
    });
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // Monday = 0
    const start = new Date(today);
    start.setDate(today.getDate() - (11 * 7 + dow));
    const cells = [];
    for (let i = 0; i <= 11 * 7 + dow; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const c = counts[dayKey(d)] || 0;
      const label = `${c} ${c === 1 ? "exam" : "exams"} on ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
      cells.push(`<i class="rd-cell rd-l${Math.min(c, 3)}" title="${esc(label)}" aria-label="${esc(label)}"></i>`);
    }
    return `<div class="rd-heat" role="img" aria-label="Exam activity over the last 12 weeks">${cells.join("")}</div>`;
  }

  async function render() {
    await S.ready;
    const log = readLog();
    if (!log.length) {
      panel.innerHTML = `
        <div class="rd-empty">
          <div class="rd-empty-icon" aria-hidden="true"><i data-lucide="gauge"></i></div>
          <h3 id="rdTitle">Your readiness picture starts with one exam</h3>
          <p>Open any past paper and press <strong>Enter the exam hall</strong>. Every timed exam you sit builds this page: your predicted NSC level per subject, your streak, and where to focus next.</p>
          <button type="button" class="nsc-btn nsc-btn-primary nsc-btn-lg" id="rdBrowse"><i data-lucide="search"></i>Browse past papers</button>
        </div>`;
      icons(panel);
      panel.querySelector("#rdBrowse").addEventListener("click", () => document.querySelector('.sh-tabs .cp-tab[data-panel="papersPanel"]')?.click());
      return;
    }

    const { subjects, real, days, streak } = analyse(log);
    const overall = Math.round(avg(log.map((e) => e.pct)));
    const bestLevel = Math.max(...log.map((e) => e.level));
    const hours = log.reduce((n, e) => n + (e.usedMin || 0), 0) / 60;
    const ranked = [...real].sort((a, b) => a.recent - b.recent);
    const weakest = ranked[0];
    const strongest = ranked.length > 1 ? ranked[ranked.length - 1] : null;
    const improved = [...real].filter((s) => s.gain != null && s.gain > 0).sort((a, b) => b.gain - a.gain)[0];

    const tile = (icon, value, label) => `
      <div class="rd-tile"><i data-lucide="${icon}" aria-hidden="true"></i><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
    const insight = (icon, tone, head, s, text) => s ? `
      <article class="rd-insight rd-${tone}"><i data-lucide="${icon}" aria-hidden="true"></i>
        <div><p class="rd-insight-head">${esc(head)}</p><h4>${esc(s.name)}</h4><p>${esc(text)}</p></div></article>` : "";

    const cards = [...subjects].sort((a, b) => a.recent - b.recent).map((s) => {
      const [, lvl, lab] = s.level, tier = tierOf(lvl);
      const delta = s.change == null ? "" : s.change === 0 ? `<span class="rd-delta">No change</span>` : `<span class="rd-delta ${s.change > 0 ? "is-up" : "is-down"}">${s.change > 0 ? "+" : ""}${s.change} points</span>`;
      const link = s.name === "Earlier attempts" ? "" : `<a class="nsc-btn nsc-btn-ghost" href="StudyHub.html?subject=${encodeURIComponent(s.name)}"><i data-lucide="play"></i>Sit another ${esc(s.name)} paper</a>`;
      return `
        <article class="rd-subject">
          <div class="rd-subject-top">
            <h4>${esc(s.name)}</h4>
            <span class="ex-pill ex-${tier}">Level ${lvl}</span>
          </div>
          <p class="rd-subject-meta">${esc(lab)} · ${esc(s.recent)}% average ${s.n > 3 ? "of your last 3" : `over ${s.n} ${s.n === 1 ? "exam" : "exams"}`} ${delta}</p>
          <div class="rd-meter" aria-hidden="true"><i class="ex-${tier}" style="width:${Math.max(3, s.recent)}%"></i></div>
          <div class="rd-subject-foot">${spark(s.pcts.slice(-8))}${link}</div>
        </article>`;
    }).join("");

    const recent = [...log].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6).map((e) => `
      <li><span class="ex-pill ex-${tierOf(e.level)}">Level ${esc(e.level)}</span>
        <strong>${esc(e.subject || "Past paper")}${e.paperNumber ? `, Paper ${esc(e.paperNumber)}` : ""}</strong>
        <span>${esc(e.score)}/${esc(e.marks)} · ${esc(e.pct)}%</span>
        <time>${esc(formatDate(e.at))}</time></li>`).join("");

    panel.innerHTML = `
      <div class="nsc-head"><div>
        <h3 id="rdTitle">My readiness</h3>
        <p>Built from every timed exam you sit in Exam Arena on this device. The more you sit, the sharper the picture.</p>
      </div></div>

      <div class="rd-tiles">
        ${tile("clipboard-check", log.length, log.length === 1 ? "exam sat" : "exams sat")}
        ${tile("percent", `${overall}%`, "average score")}
        ${tile("award", `Level ${bestLevel}`, "best level")}
        ${tile("flame", streak, "day streak")}
        ${tile("hourglass", hours < 10 ? hours.toFixed(1) : Math.round(hours), "hours in the exam room")}
      </div>

      <div class="rd-two">
        <section class="rd-card"><h4>Last 12 weeks</h4>${heatmap(log)}
          <p class="rd-note">${days.size} ${days.size === 1 ? "day" : "days"} with an exam. ${streak > 0 ? `You're on a ${streak}-day streak.` : "Sit one today to start a streak."}</p></section>
        <section class="rd-card"><h4>Recent exams</h4><ul class="rd-recent">${recent}</ul></section>
      </div>

      ${real.length ? `<div class="rd-insights">
        ${insight("crosshair", "focus", "Needs focus", weakest, `${weakest.recent}% recently, which is Level ${weakest.level[1]}. A Level ${Math.min(7, weakest.level[1] + 1)} is within reach with one more sitting.`)}
        ${insight("shield-check", "strong", "Strongest subject", strongest, `${strongest && strongest.recent}% recently, Level ${strongest && strongest.level[1]}. Keep it warm with a paper every couple of weeks.`)}
        ${insight("trending-up", "up", "Most improved", improved, `Up ${improved && improved.gain} points since your first attempt.`)}
      </div>` : ""}

      <h4 class="rd-h">Subjects and predicted levels</h4>
      <div class="rd-subjects">${cards}</div>

      <div id="rdUntouched"></div>
      <p class="rd-foot">${esc(syncLabel())} <button type="button" class="rd-link" id="rdClear">Clear my exam history</button></p>`;
    icons(panel);

    panel.querySelector("#rdClear").addEventListener("click", async () => {
      if (confirm("Clear all your exam history? This removes it from your account too and cannot be undone.")) {
        await S.clearAttempts();
        render();
      }
    });

    /* subjects not yet attempted */
    await subjectsPromise;
    const slot = panel.querySelector("#rdUntouched");
    if (slot && allSubjects && allSubjects.length) {
      const done = new Set(real.map((s) => s.name));
      const left = allSubjects.filter((s) => !done.has(s));
      if (left.length) {
        slot.innerHTML = `
          <section class="rd-card rd-untouched"><h4>Not tried yet</h4>
            <p class="rd-note">${left.length} ${left.length === 1 ? "subject has" : "subjects have"} no timed exam so far. Pick one to widen the picture.</p>
            <div class="rd-chips">${left.slice(0, 12).map((s) => `<a class="nsc-chip" href="StudyHub.html?subject=${encodeURIComponent(s)}">${esc(s)}</a>`).join("")}</div></section>`;
      }
    }
  }
});