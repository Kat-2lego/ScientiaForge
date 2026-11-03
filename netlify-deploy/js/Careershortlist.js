/* ==========================================================================
 * ScientiaForge AI - Career Shortlist Studio
 *
 * Turns "Saved Career Paths" from a list into a decision tool:
 *
 *   Shortlist   your saved careers as cards
 *   Decide      radar chart + weight sliders. The ranking re-sorts live as you
 *               drag, and it tells you what would flip the answer
 *   Skill Leverage   the skills that unlock the most of your saved careers
 *   90-day plan one click drafts a goal in your Planner for the front-runner
 *
 * Loaded AFTER CareerDiscovery.js. It uses window.SkillForgeDiscovery and
 * does no scoring of O*NET data itself: fit comes from the engine's own
 * match_score, everything else is derived from job zone and the occupation
 * detail endpoint the page already calls.
 * ======================================================================== */
(function () {
  "use strict";

  const SNAP_KEY = "sf_shortlist_snapshots";
  const MAX_COMPARE = 5;
  const ROW_H = 92;
  const COLORS = ["#2563eb", "#06b6d4", "#f97316", "#8b5cf6", "#10b981"];

  // Mirrors SALARY_ESTIMATES_ZAR (config.py) and ROADMAP_BY_JOB_ZONE
  // (CareerDiscovery.js). Planning estimates, not O*NET data.
  const ZONE = {
    1: { salary: "R6,000 - R12,000", mid: 9000, study: "1-2 months", months: 1.5 },
    2: { salary: "R12,000 - R22,000", mid: 17000, study: "2-4 months", months: 3 },
    3: { salary: "R20,000 - R38,000", mid: 29000, study: "4-8 months", months: 6 },
    4: { salary: "R32,000 - R65,000", mid: 48500, study: "6-12 months", months: 9 },
    5: { salary: "R55,000 - R110,000", mid: 82500, study: "1-2 years", months: 18 }
  };

  const CRITERIA = [
    { key: "fit", label: "Your fit", axis: "Your fit",
      hint: "The match score from your questionnaire" },
    { key: "earning", label: "Earning potential", axis: "Earning",
      hint: "Typical monthly range for the career's job zone" },
    { key: "speed", label: "Speed to enter", axis: "Speed to enter",
      hint: "How soon you could be job-ready" },
    { key: "overlap", label: "Skill overlap", axis: "Skill overlap",
      hint: "How much it shares with your other saved careers, so switching stays cheap" }
  ];

  const S = {
    rows: [],
    details: new Map(),
    included: new Set(),
    weights: { fit: 70, earning: 50, speed: 50, overlap: 40 },
    tab: "shortlist",
    loaded: false,
    ready: null,
    token: 0,
    items: [],
    colors: new Map(),
    leader: null,
    rankKey: ""
  };

  /* ---------------------------------------------------------------- utils */

  const D = () => window.SkillForgeDiscovery || {};
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function say(message) {
    if (typeof D().announce === "function") D().announce(message);
  }

  function safeUrl(url) {
    return /^https?:\/\//i.test(url || "") ? url : "";
  }

  const reduceMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------- score snapshots */
  // The saved-careers endpoint returns title, zone and image, but not the
  // match score the person saw. Remember it on this device at the moment of
  // saving so the Decide tab can use "Your fit" for careers saved earlier.

  function loadSnaps() {
    try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }

  function storeSnaps(snaps) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); }
    catch (e) { /* best-effort */ }
  }

  function captureSnapshot() {
    const selected = (D().state || {}).selected;
    if (!selected || !selected.onetsoc_code || selected.match_score == null) return;
    const snaps = loadSnaps();
    snaps[selected.onetsoc_code] = {
      match_score: selected.match_score,
      confidence: selected.confidence || null,
      savedAt: Date.now()
    };
    storeSnaps(snaps);
  }

  function fitFor(row) {
    const st = D().state || {};
    const live = (st.matches || []).concat(st.related || [])
      .find((m) => m.onetsoc_code === row.onetsoc_code);
    if (live && live.match_score != null) return Number(live.match_score);
    const snap = loadSnaps()[row.onetsoc_code];
    return snap && snap.match_score != null ? Number(snap.match_score) : null;
  }

  /* -------------------------------------------------------------- metrics */

  function earningScore(zone) {
    return ZONE[zone] ? Math.round((ZONE[zone].mid / 82500) * 100) : null;
  }

  function speedScore(zone) {
    return ZONE[zone] ? Math.round(100 - (ZONE[zone].months / 18) * 95) : null;
  }

  async function ensureDetails(rows) {
    const todo = rows.filter((r) => !S.details.has(r.onetsoc_code));
    const names = (list) =>
      (list || []).map((x) => (typeof x === "string" ? x : x && x.name)).filter(Boolean);

    await Promise.all(todo.map(async (row) => {
      try {
        const d = await D().api("/api/discovery/occupation/" + encodeURIComponent(row.onetsoc_code));
        S.details.set(row.onetsoc_code, {
          skills: names(d.top_skills),
          knowledge: names(d.top_knowledge),
          tools: names(d.technologies)
        });
      } catch (error) {
        S.details.set(row.onetsoc_code, { skills: [], knowledge: [], tools: [], failed: true });
      }
    }));
  }

  function metrics() {
    const included = S.rows.filter((r) => S.included.has(r.onetsoc_code));
    const sets = new Map();
    included.forEach((r) => {
      const d = S.details.get(r.onetsoc_code) || { skills: [], knowledge: [] };
      sets.set(r.onetsoc_code,
        new Set(d.skills.concat(d.knowledge).map((n) => n.toLowerCase())));
    });

    S.colors = new Map();
    included.forEach((r, i) => S.colors.set(r.onetsoc_code, COLORS[i % COLORS.length]));

    return included.map((row) => {
      const mine = sets.get(row.onetsoc_code);
      let overlap = null;
      if (included.length > 1 && mine.size) {
        const others = new Set();
        included.forEach((o) => {
          if (o !== row) sets.get(o.onetsoc_code).forEach((n) => others.add(n));
        });
        let hits = 0;
        mine.forEach((n) => { if (others.has(n)) hits += 1; });
        overlap = Math.round((hits / mine.size) * 100);
      }
      return {
        row: row,
        color: S.colors.get(row.onetsoc_code),
        values: {
          fit: fitFor(row),
          earning: earningScore(row.job_zone),
          speed: speedScore(row.job_zone),
          overlap: overlap
        }
      };
    });
  }

  const val = (v) => (v == null ? 50 : v);

  function totalFor(item) {
    const w = S.weights;
    const sum = CRITERIA.reduce((a, c) => a + w[c.key], 0);
    if (sum === 0) {
      return CRITERIA.reduce((a, c) => a + val(item.values[c.key]), 0) / CRITERIA.length;
    }
    return CRITERIA.reduce((a, c) => a + w[c.key] * val(item.values[c.key]), 0) / sum;
  }

  /* ----------------------------------------------------------- entry point */

  function render(rows) {
    const panel = $("#savedCareersOverlay .saved-panel");
    if (panel) panel.classList.add("is-studio");

    S.rows = rows || [];
    S.tab = "shortlist";
    S.loaded = false;
    S.rankKey = "";

    const known = new Set(S.rows.map((r) => r.onetsoc_code));
    S.included = new Set(Array.from(S.included).filter((c) => known.has(c)));
    if (!S.included.size) {
      S.rows.slice(0, MAX_COMPARE).forEach((r) => S.included.add(r.onetsoc_code));
    }

    const list = $("#savedCareersList");
    if (!list) return;

    if (!S.rows.length) {
      list.innerHTML = [
        '<div class="studio-empty">',
        "  <h3>Your shortlist is empty</h3>",
        "  <p>Run the questionnaire, open a career you like and press <strong>Save Career Path</strong>. ",
        "  Once you have two or three saved, this space compares them and tells you which one to chase first.</p>",
        "</div>"
      ].join("");
      return;
    }

    list.innerHTML = [
      '<div class="studio">',
      '  <div class="studio-tabs" role="tablist" aria-label="Shortlist views">',
      '    <button type="button" class="studio-tab" role="tab" data-tab="shortlist">Shortlist</button>',
      '    <button type="button" class="studio-tab" role="tab" data-tab="decide">Decide</button>',
      '    <button type="button" class="studio-tab" role="tab" data-tab="leverage">Skill leverage</button>',
      "  </div>",
      '  <div class="studio-body" id="studioBody"></div>',
      "</div>"
    ].join("");

    $$(".studio-tab", list).forEach((btn) => {
      btn.addEventListener("click", () => showTab(btn.dataset.tab));
    });

    S.ready = ensureDetails(S.rows).then(() => { S.loaded = true; });
    showTab("shortlist");
  }

  async function showTab(name) {
    S.tab = name;
    const token = ++S.token;

    $$(".studio-tab").forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", String(on));
    });

    const body = $("#studioBody");
    if (!body) return;

    if (name === "shortlist") {
      paintShortlist(body);
      return;
    }

    if (!S.loaded) {
      body.innerHTML =
        '<div class="studio-loading" role="status"><div class="spinner" aria-hidden="true"></div>' +
        "<p>Reading the skills behind each career...</p></div>";
      await S.ready;
      if (token !== S.token) return;
    }

    if (name === "decide") paintDecide(body);
    else paintLeverage(body);
  }

  /* ------------------------------------------------------------- shortlist */

  function paintShortlist(body) {
    const n = S.rows.length;
    const lead = n === 1
      ? "One career saved. Save one or two more and the Decide tab can compare them."
      : "You have " + n + " careers saved. Open Decide to see which one fits what you care about.";

    body.innerHTML = [
      '<div class="studio-intro">',
      "  <p>" + esc(lead) + "</p>",
      n > 1 ? '  <button type="button" class="studio-cta" data-go="decide">Find my front-runner</button>' : "",
      "</div>",
      '<div class="sl-grid">',
      S.rows.map(cardHtml).join(""),
      "</div>"
    ].join("");

    $$(".sl-hero", body).forEach((el) => {
      const url = safeUrl(el.dataset.img);
      if (url) el.style.backgroundImage = 'url("' + url + '")';
    });

    const go = $("[data-go]", body);
    if (go) go.addEventListener("click", () => showTab(go.dataset.go));

    $$(".sl-open", body).forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = S.rows[Number(btn.dataset.index)];
        if (typeof D().openSavedCareer === "function") D().openSavedCareer(row);
      });
    });

    $$(".sl-plan", body).forEach((btn) => {
      btn.addEventListener("click", () => draftPlan(S.rows[Number(btn.dataset.index)], btn));
    });
  }

  function cardHtml(row, index) {
    const zone = ZONE[row.job_zone];
    const fit = fitFor(row);
    const facts = [
      fit != null ? '<span class="sl-fact is-fit">' + fit + "% match</span>" : "",
      zone ? '<span class="sl-fact">Study ' + esc(zone.study) + "</span>" : "",
      zone ? '<span class="sl-fact">' + esc(zone.salary) + " / month, estimate</span>" : ""
    ].join("");

    return [
      '<article class="sl-card">',
      '  <div class="sl-hero" data-img="' + esc(row.image_url || "") + '"></div>',
      '  <div class="sl-body">',
      "    <h4>" + esc(row.title || "Saved career") + "</h4>",
      '    <p class="sl-sub">' + (row.job_zone ? "Job zone " + esc(row.job_zone) : "Job zone not published") + "</p>",
      '    <div class="sl-facts">' + facts + "</div>",
      '    <div class="sl-actions">',
      '      <button type="button" class="sl-open" data-index="' + index + '">Open</button>',
      '      <button type="button" class="sl-plan" data-index="' + index + '">Draft 90-day plan</button>',
      "    </div>",
      "  </div>",
      "</article>"
    ].join("");
  }

  /* ---------------------------------------------------------------- decide */

  function paintDecide(body) {
    body.innerHTML = [
      '<div class="decide">',
      '  <div class="decide-top">',
      '    <section class="radar-card" aria-label="Comparison chart">',
      '      <div class="radar-legend" id="radarLegend"></div>',
      '      <svg id="radar" viewBox="0 0 400 360" role="img" aria-label="Radar chart comparing your saved careers"></svg>',
      '      <p class="radar-note" id="radarNote"></p>',
      "    </section>",
      '    <section class="weights-card" aria-labelledby="weightsHeading">',
      '      <h4 id="weightsHeading">What matters most to you?</h4>',
      '      <p class="weights-sub">Drag a slider. The ranking re-sorts as you go.</p>',
      CRITERIA.map((c) => [
        '<div class="weight-row">',
        '  <label for="w_' + c.key + '"><span>' + esc(c.label) + '</span><output id="o_' + c.key + '">' +
          S.weights[c.key] + "</output></label>",
        '  <input type="range" id="w_' + c.key + '" min="0" max="100" step="5" value="' + S.weights[c.key] + '" />',
        '  <small>' + esc(c.hint) + "</small>",
        "</div>"
      ].join("")).join(""),
      "    </section>",
      "  </div>",
      '  <section class="winner" id="winner" aria-live="polite"></section>',
      '  <div class="rank-list" id="rankList" role="list" aria-label="Ranking of your saved careers"></div>',
      '  <div class="flip-notes" id="flipNotes"></div>',
      '  <p class="decide-foot">A dash means we have no data for that measure yet, so it counts as a neutral 50. ' +
        "Fit is remembered from the moment you saved a career, so save careers right after scoring them.</p>",
      "</div>"
    ].join("");

    CRITERIA.forEach((c) => {
      const input = $("#w_" + c.key);
      input.addEventListener("input", () => {
        S.weights[c.key] = Number(input.value);
        $("#o_" + c.key).textContent = input.value;
        renderRanking(false);
      });
    });

    refreshDecide();
  }

  function refreshDecide() {
    S.items = metrics();
    renderLegend();
    renderRadar();
    renderRanking(true);
  }

  function renderLegend() {
    const legend = $("#radarLegend");
    if (!legend) return;
    legend.innerHTML = S.rows.map((row) => {
      const on = S.included.has(row.onetsoc_code);
      const color = on ? S.colors.get(row.onetsoc_code) : "";
      return '<button type="button" class="legend-chip' + (on ? " on" : "") + '" aria-pressed="' + on +
        '" data-code="' + esc(row.onetsoc_code) + '">' +
        '<span class="legend-dot"' + (color ? ' style="background:' + color + '"' : "") + "></span>" +
        esc(row.title) + "</button>";
    }).join("");

    $$(".legend-chip", legend).forEach((chip) => {
      chip.addEventListener("click", () => {
        const code = chip.dataset.code;
        if (S.included.has(code)) {
          if (S.included.size === 1) { say("Keep at least one career selected."); return; }
          S.included.delete(code);
        } else {
          if (S.included.size >= MAX_COMPARE) {
            say("You can compare up to " + MAX_COMPARE + " careers at once.");
            return;
          }
          S.included.add(code);
        }
        refreshDecide();
      });
    });
  }

  function renderRadar() {
    const svg = $("#radar");
    if (!svg) return;
    const cx = 200, cy = 180, R = 100;
    const angle = (k) => (-90 + k * 90) * (Math.PI / 180);
    const pt = (k, v) => [cx + R * (v / 100) * Math.cos(angle(k)), cy + R * (v / 100) * Math.sin(angle(k))];
    const pts = (arr) => arr.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

    let out = "";
    [25, 50, 75, 100].forEach((ring) => {
      out += '<polygon class="radar-ring" points="' + pts(CRITERIA.map((_, k) => pt(k, ring))) + '"/>';
    });
    CRITERIA.forEach((c, k) => {
      const end = pt(k, 100);
      out += '<line class="radar-axis" x1="' + cx + '" y1="' + cy + '" x2="' + end[0].toFixed(1) +
        '" y2="' + end[1].toFixed(1) + '"/>';
      const lp = pt(k, 100);
      const dx = k === 1 ? 14 : k === 3 ? -14 : 0;
      const dy = k === 0 ? -12 : k === 2 ? 22 : 4;
      const anchor = k === 1 ? "start" : k === 3 ? "end" : "middle";
      out += '<text class="radar-label" x="' + (lp[0] + dx).toFixed(1) + '" y="' + (lp[1] + dy).toFixed(1) +
        '" text-anchor="' + anchor + '">' + esc(c.axis) + "</text>";
    });

    S.items.forEach((item, i) => {
      const points = CRITERIA.map((c, k) => pt(k, val(item.values[c.key])));
      out += '<g class="radar-shape" style="animation-delay:' + (i * 70) + 'ms">' +
        '<polygon points="' + pts(points) + '" fill="' + item.color + '" fill-opacity="0.14" stroke="' +
        item.color + '" stroke-width="2.2" stroke-linejoin="round"/>';
      points.forEach((p, k) => {
        const v = item.values[CRITERIA[k].key];
        out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.6" fill="' + item.color +
          '"><title>' + esc(item.row.title + ": " + CRITERIA[k].axis + " " + (v == null ? "no data" : v)) + "</title></circle>";
      });
      out += "</g>";
    });
    svg.innerHTML = out;

    const note = $("#radarNote");
    if (note) {
      note.textContent = S.items.length < 2
        ? "Add a second career from the chips above to compare shapes and unlock skill overlap."
        : "A bigger shape means a stronger all-rounder. A lopsided one is a specialist bet.";
    }
  }

  function renderRanking(rebuild) {
    const list = $("#rankList");
    if (!list) return;

    const scored = S.items
      .map((item) => ({ item: item, total: totalFor(item) }))
      .sort((a, b) => b.total - a.total || a.item.row.title.localeCompare(b.item.row.title));

    const key = scored.map((s) => s.item.row.onetsoc_code).sort().join("|");
    if (rebuild || key !== S.rankKey) {
      S.rankKey = key;
      list.style.height = scored.length * ROW_H + "px";
      list.innerHTML = scored.map((s) => rowHtml(s.item)).join("");
    }

    scored.forEach((s, pos) => {
      const el = $('.rank-row[data-code="' + CSS.escape(s.item.row.onetsoc_code) + '"]', list);
      if (!el) return;
      el.style.transform = "translateY(" + pos * ROW_H + "px)";
      el.classList.toggle("is-leader", pos === 0);
      $(".rank-pos", el).textContent = pos + 1;
      $(".rank-fill", el).style.width = Math.round(s.total) + "%";
      $(".rank-score", el).textContent = Math.round(s.total);
    });

    renderWinner(scored);
    renderFlips(scored);
  }

  function rowHtml(item) {
    const m = CRITERIA.map((c) => {
      const v = item.values[c.key];
      return "<span>" + esc(c.axis) + " <b>" + (v == null ? "-" : v) + "</b></span>";
    }).join("");
    const zone = ZONE[item.row.job_zone];
    return [
      '<div class="rank-row" role="listitem" data-code="' + esc(item.row.onetsoc_code) + '" style="--c:' + item.color + '">',
      '  <span class="rank-pos"></span>',
      '  <div class="rank-main">',
      '    <div class="rank-title"><strong>' + esc(item.row.title) + "</strong>" +
        (zone ? '<span class="rank-zone">Study ' + esc(zone.study) + "</span>" : "") + "</div>",
      '    <div class="rank-track"><span class="rank-fill"></span></div>',
      '    <div class="rank-metrics">' + m + "</div>",
      "  </div>",
      '  <span class="rank-score"></span>',
      "</div>"
    ].join("");
  }

  function renderWinner(scored) {
    const box = $("#winner");
    if (!box || !scored.length) return;
    const top = scored[0];
    const second = scored[1];
    const gap = second ? Math.round(top.total - second.total) : null;

    let verdict = "It is the only career in the comparison.";
    if (second) {
      verdict = gap >= 6
        ? "Ahead of " + second.item.row.title + " by " + gap + " points."
        : "Too close to call against " + second.item.row.title + " (" + gap +
          " points apart). Let the 90-day plan break the tie.";
    }

    const changed = S.leader !== top.item.row.onetsoc_code;
    S.leader = top.item.row.onetsoc_code;

    box.innerHTML = [
      '<div class="winner-copy">',
      '  <p class="winner-kicker">Your front-runner right now</p>',
      "  <h3>" + esc(top.item.row.title) + "</h3>",
      "  <p>" + esc(verdict) + "</p>",
      "</div>",
      '<button type="button" class="winner-cta" id="winnerPlan">Build my 90-day launch plan</button>'
    ].join("");

    if (changed && !reduceMotion()) {
      box.classList.remove("pulse");
      void box.offsetWidth;
      box.classList.add("pulse");
    }
    $("#winnerPlan").addEventListener("click", (e) => draftPlan(top.item.row, e.currentTarget));
  }

  function renderFlips(scored) {
    const box = $("#flipNotes");
    if (!box || scored.length < 2) { if (box) box.innerHTML = ""; return; }

    const leader = scored[0].item.row.onetsoc_code;
    const flips = [];
    CRITERIA.forEach((c) => {
      const best = S.items.slice().sort((a, b) =>
        val(b.values[c.key]) - val(a.values[c.key]) || a.row.title.localeCompare(b.row.title))[0];
      if (best.row.onetsoc_code !== leader &&
          val(best.values[c.key]) > val(scored[0].item.values[c.key])) {
        flips.push({ c: c, who: best.row.title });
      }
    });

    if (!flips.length) {
      box.innerHTML = '<div class="flip is-solid"><strong>A robust choice.</strong> ' +
        esc(scored[0].item.row.title) + " stays on top however you weigh these four things.</div>";
      return;
    }
    box.innerHTML = '<h4>What would change the answer</h4>' + flips.map((f) =>
      '<div class="flip">If <strong>' + esc(f.c.label.toLowerCase()) + "</strong> were all that mattered, <strong>" +
      esc(f.who) + "</strong> would take the lead.</div>").join("");
  }

  /* -------------------------------------------------------- skill leverage */

  function paintLeverage(body) {
    const total = S.rows.length;
    const map = new Map();

    S.rows.forEach((row) => {
      const d = S.details.get(row.onetsoc_code) || { skills: [], knowledge: [] };
      d.skills.map((n) => [n, "Skill"]).concat(d.knowledge.map((n) => [n, "Knowledge"]))
        .forEach((pair) => {
          const id = pair[0].toLowerCase();
          if (!map.has(id)) map.set(id, { name: pair[0], kind: pair[1], careers: [] });
          const entry = map.get(id);
          if (entry.careers.indexOf(row.title) === -1) entry.careers.push(row.title);
        });
    });

    const all = Array.from(map.values())
      .sort((a, b) => b.careers.length - a.careers.length || a.name.localeCompare(b.name));
    const shared = all.filter((e) => e.careers.length > 1);
    const shown = (shared.length ? shared : all).slice(0, 10);

    if (!shown.length) {
      body.innerHTML = '<div class="studio-empty"><h3>Learning detail is unavailable</h3>' +
        "<p>We could not read skill data for these careers just now. Try again in a moment.</p></div>";
      return;
    }

    let headline;
    if (total < 2) {
      headline = "Save a second career to see which skills carry across both.";
    } else if (shared.length) {
      const top = shared.slice(0, 3).map((e) => e.name);
      const list = top.length > 1 ? top.slice(0, -1).join(", ") + " and " + top[top.length - 1] : top[0];
      headline = "Start with " + list + ". " + (top.length > 1 ? "They show" : "It shows") +
        " up across your shortlist, so you learn once and use it in several careers.";
    } else {
      headline = "Your saved careers draw on different skills, so each one is a separate bet. That is useful to know before you commit.";
    }

    body.innerHTML = [
      '<div class="leverage">',
      '  <div class="leverage-head"><h3>Skill leverage</h3><p>' + esc(headline) + "</p></div>",
      '  <div class="lev-list">',
      shown.map((e) => {
        const pct = Math.round((e.careers.length / total) * 100);
        return [
          '<div class="lev-row">',
          '  <div class="lev-name"><strong>' + esc(e.name) + '</strong><span class="lev-kind">' + esc(e.kind) + "</span></div>",
          '  <div class="lev-track" aria-hidden="true"><span style="width:' + pct + '%"></span></div>',
          '  <div class="lev-count">' + e.careers.length + " of " + total + "</div>",
          '  <div class="lev-who">' + e.careers.map(esc).join(", ") + "</div>",
          "</div>"
        ].join("");
      }).join(""),
      "  </div>",
      "</div>"
    ].join("");
  }

  /* --------------------------------------------------------- 90-day plan */

  const pad = (n) => String(n).padStart(2, "0");
  function localStamp(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
      "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  async function draftPlan(row, button) {
    if (!row) return;
    const label = button ? button.textContent : "";
    if (button) { button.disabled = true; button.textContent = "Drafting..."; }

    try {
      await ensureDetails([row]);
      const d = S.details.get(row.onetsoc_code) || { skills: [], knowledge: [], tools: [] };
      const pick = (arr, from, count) =>
        arr.slice(from, from + count).join(", ") || "the core fundamentals";

      const description = [
        "90-day launch plan for " + row.title + ", drafted by ScientiaForge Career Discovery.",
        "",
        "Weeks 1-2, foundations: " + pick(d.skills, 0, 2),
        "Weeks 3-6, go deeper: " + pick(d.skills, 2, 2) +
          (d.knowledge.length ? ". Study " + d.knowledge.slice(0, 2).join(" and ") : ""),
        "Weeks 7-10, build proof: one small project using " + pick(d.tools, 0, 2),
        "Weeks 11-12, portfolio: polish the project, talk to two people working as " +
          row.title + ", then apply or enrol."
      ].join("\n").slice(0, 2000);

      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 90);
      end.setHours(17, 0, 0, 0);
      const remind = new Date(start);
      remind.setHours(8, 30, 0, 0);

      const draft = {
        title: ("Launch plan: " + row.title).slice(0, 150),
        description: description,
        starts_at: localStamp(start),
        ends_at: localStamp(end),
        remind_at: localStamp(remind)
      };

      if (!openPlannerWith(draft)) {
        try { await navigator.clipboard.writeText(draft.title + "\n\n" + draft.description); } catch (e) { /* ignore */ }
        say("The planner is not available on this page. The plan was copied to your clipboard instead.");
      }
    } finally {
      if (button) { button.disabled = false; button.textContent = label; }
    }
  }

  function openPlannerWith(draft) {
    const plannerBtn = $("#plannerBtn");
    const form = $("#plannerEventForm");
    if (!plannerBtn || !form) return false;

    if (typeof D().closeSavedCareersOverlay === "function") D().closeSavedCareersOverlay();
    plannerBtn.click();

    window.setTimeout(() => {
      const calendarTab = $('.planner-tab[data-tab="calendar"]');
      if (calendarTab) calendarTab.click();

      const type = form.elements.type;
      if (type) {
        type.value = "goal";
        type.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // If the planner's own type switch did not reveal the goal fields,
      // do it here so the draft is never submitted with hidden required inputs.
      const goal = $("#goalFields");
      const reminder = $("#reminderFields");
      if (goal && (goal.hidden || goal.disabled)) {
        goal.hidden = false; goal.disabled = false;
        if (reminder) { reminder.hidden = true; reminder.disabled = true; }
      }

      ["title", "description", "starts_at", "ends_at", "remind_at"].forEach((name) => {
        const field = form.elements[name];
        if (!field) return;
        field.value = draft[name];
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });

      form.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      say("Your 90-day plan is drafted. Review it and press Save entry.");
    }, 160);

    return true;
  }

  /* ------------------------------------------------------------------ init */

  const saveBtn = $("#saveCareerBtn");
  if (saveBtn) saveBtn.addEventListener("click", captureSnapshot);

  window.SkillForgeShortlist = { render: render };
})();