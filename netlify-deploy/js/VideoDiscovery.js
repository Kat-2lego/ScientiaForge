/* ScientiaForge · Study Hub · Study videos (Video Discovery)
 *
 * Builds the video search inside #videosPanel. Your existing curated list (videoSubject /
 * searchVideosBtn / videosList) is kept underneath in "ScientiaForge picks".
 * Needs nscCommon.js (window.NSC) loaded first, and this file after StudyHub.js:
 *   <link rel="stylesheet" href="../css/VideoDiscovery.css" />
 *   <script src="../js/VideoDiscovery.js"></script>
 */
(function () {
  "use strict";

  const panel = document.getElementById("videosPanel");
  if (!panel || !window.NSC) return;
  const { API, authHeaders, esc, safeUrl, icons } = window.NSC;
  const BASE = `${API}/video-discovery`;
  const LAST_KEY = "sf-video-filters";

  /* ================================================================ API */
  async function api(path, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json", ...(await authHeaders()) };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      const err = new Error("Can't reach ScientiaForge right now. Check your connection and try again.");
      err.status = 0;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(res.status === 401 ? "Sign in to save videos, rate them and keep your history." : data.error || "Video search is temporarily unavailable. Please try again.");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ================================================================ formatting */
  function duration(sec) {
    if (sec === null || sec === undefined) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }
  function compact(n) {
    if (n === null || n === undefined) return null;
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
    return String(n);
  }
  const whole = new Intl.NumberFormat("en-ZA");
  const monthYear = new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric" });
  const dayMonth = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  const published = (iso) => (iso ? monthYear.format(new Date(iso)) : "");

  /* ================================================================ layout */
  const legacy = document.createElement("details");
  legacy.className = "nsc-other vd-legacy";
  legacy.innerHTML = `<summary><i data-lucide="list-video"></i> ScientiaForge picks: videos from our study list</summary>`;
  const legacyBody = document.createElement("div");
  legacyBody.className = "nsc-other-body";
  while (panel.firstChild) legacyBody.appendChild(panel.firstChild);
  legacy.appendChild(legacyBody);

  const root = document.createElement("section");
  root.className = "vd";
  root.setAttribute("aria-labelledby", "vdHeading");
  root.innerHTML = `
    <header class="vd-head">
      <div>
        <h2 class="vd-heading" id="vdHeading">Find a video for what you're studying</h2>
        <p class="vd-lede">Type what you want to learn, or choose a subject and topic. Videos are ranked by how well they fit your curriculum, grade and time, not by views alone.</p>
      </div>
      <div class="vd-views" role="group" aria-label="Show">
        <button type="button" class="vd-view-btn" data-view="discover" aria-pressed="true"><i data-lucide="compass"></i> Discover</button>
        <button type="button" class="vd-view-btn" data-view="saved" aria-pressed="false"><i data-lucide="bookmark"></i> Saved</button>
        <button type="button" class="vd-view-btn" data-view="history" aria-pressed="false"><i data-lucide="history"></i> History</button>
      </div>
    </header>

    <div class="vd-view" data-view-panel="discover">
      <form class="vd-search" role="search">
        <label class="sr-only" for="vdQ">What do you want to learn?</label>
        <i data-lucide="search" class="vd-search-icon" aria-hidden="true"></i>
        <input id="vdQ" type="search" maxlength="200" autocomplete="off" placeholder="What do you want to learn? For example: solving trig equations" />
        <button class="nsc-btn nsc-btn-primary" type="submit" id="vdGo">Find videos</button>
      </form>

      <details class="vd-filters" id="vdFilters" open>
        <summary><i data-lucide="sliders-horizontal"></i> Filters <span class="vd-filter-sum" id="vdFilterSum"></span></summary>
        <div class="vd-filter-grid">
          <label class="vd-field"><span>Subject</span><select id="vdSubject"></select></label>
          <label class="vd-field" id="vdGradeField"><span>Grade</span><select id="vdGrade"></select></label>
          <label class="vd-field" id="vdCurriculumField"><span>Curriculum</span><select id="vdCurriculum"></select></label>
          <label class="vd-field" id="vdLevelField" hidden><span>Level</span><select id="vdLevel"></select></label>
          <label class="vd-field"><span>Topic</span><select id="vdTopic"></select></label>
          <label class="vd-field" id="vdSubtopicField" hidden><span>Subtopic</span><select id="vdSubtopic"></select></label>
        </div>
        <fieldset class="vd-chipset">
          <legend>What do you want to do?</legend>
          <div class="vd-chips" id="vdTypes"></div>
        </fieldset>
        <fieldset class="vd-chipset">
          <legend>Time I have</legend>
          <div class="vd-chips" id="vdTime"></div>
        </fieldset>
        <details class="vd-extra">
          <summary>More filters</summary>
          <div class="vd-filter-grid">
            <label class="vd-field"><span>Language</span><select id="vdLanguage"></select></label>
            <label class="vd-field"><span>Video length</span><select id="vdLength"></select></label>
          </div>
        </details>
      </details>

      <div class="vd-continue" id="vdContinue" hidden></div>
      <div class="vd-status" id="vdStatus" aria-live="polite"></div>
      <div id="vdResults"></div>
      <div class="vd-more-row"><button type="button" class="nsc-btn nsc-btn-ghost" id="vdMore" hidden>Show more videos</button></div>
    </div>

    <div class="vd-view" data-view-panel="saved" hidden><div id="vdSaved"></div></div>
    <div class="vd-view" data-view-panel="history" hidden><div id="vdHistory"></div></div>

    <dialog class="vd-player" id="vdPlayer" aria-labelledby="vdPlayerTitle">
      <div class="vd-player-frame"><iframe id="vdFrame" title="Video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      <div class="vd-player-body">
        <div class="vd-player-top">
          <div>
            <h3 class="vd-player-title" id="vdPlayerTitle"></h3>
            <p class="vd-player-channel" id="vdPlayerChannel"></p>
          </div>
          <button type="button" class="vd-icon-btn" id="vdClose" aria-label="Close player"><i data-lucide="x"></i></button>
        </div>
        <div class="vd-player-actions">
          <a class="nsc-btn nsc-btn-ghost" id="vdOnYouTube" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Watch on YouTube</a>
          <button type="button" class="nsc-btn nsc-btn-ghost" id="vdPlayerSave" aria-pressed="false"><i data-lucide="bookmark"></i> <span>Save</span></button>
        </div>
        <div class="vd-rate" id="vdRate"></div>
      </div>
    </dialog>`;
  panel.appendChild(root);
  panel.appendChild(legacy);

  const $ = (id) => root.querySelector(`#${id}`);
  const ui = {
    q: $("vdQ"), form: root.querySelector(".vd-search"), filters: $("vdFilters"), sum: $("vdFilterSum"),
    subject: $("vdSubject"), grade: $("vdGrade"), curriculum: $("vdCurriculum"), level: $("vdLevel"),
    topic: $("vdTopic"), subtopic: $("vdSubtopic"), types: $("vdTypes"), time: $("vdTime"),
    language: $("vdLanguage"), length: $("vdLength"),
    gradeField: $("vdGradeField"), curriculumField: $("vdCurriculumField"), levelField: $("vdLevelField"), subtopicField: $("vdSubtopicField"),
    cont: $("vdContinue"), status: $("vdStatus"), results: $("vdResults"), more: $("vdMore"),
    saved: $("vdSaved"), history: $("vdHistory"),
    player: $("vdPlayer"), frame: $("vdFrame"), playerTitle: $("vdPlayerTitle"), playerChannel: $("vdPlayerChannel"),
    onYouTube: $("vdOnYouTube"), playerSave: $("vdPlayerSave"), rate: $("vdRate"), close: $("vdClose"),
  };
  if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) ui.filters.open = false;

  /* ================================================================ state */
  const state = {
    tax: null,
    types: new Set(),
    minutes: null,
    sort: "recommended",
    page: 1,
    flat: false,
    data: null,
    cards: new Map(), // id -> video dto (for the player, save toggles)
    noDetect: false,
    playing: null,
    signedIn: null,
    autoSubject: false, // the subject was worked out from the search words, not chosen
  };

  const subjectOf = (id) => state.tax && state.tax.subjects.find((s) => s.id === id);

  /* ================================================================ filters */
  const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

  function fillSubjects(saved) {
    const school = state.tax.subjects.filter((s) => s.school);
    const other = state.tax.subjects.filter((s) => !s.school);
    ui.subject.innerHTML =
      option("", "Choose a subject", !saved.subject) +
      `<optgroup label="School subjects">${school.map((s) => option(s.id, s.name, s.id === saved.subject)).join("")}</optgroup>` +
      `<optgroup label="Other skills">${other.map((s) => option(s.id, s.name, s.id === saved.subject)).join("")}</optgroup>`;
    ui.curriculum.innerHTML = option("", "Any curriculum") + state.tax.curricula.map((c) => option(c.id, c.name, c.id === (saved.curriculum ?? "NSC"))).join("");
    ui.level.innerHTML = option("", "Any level") + state.tax.levels.map((l) => option(l.id, l.name, l.id === saved.level)).join("");
    ui.language.innerHTML = option("", "Any language") + state.tax.languages.map((l) => option(l.id, l.name)).join("");
    ui.length.innerHTML = option("", "Any length") + state.tax.lengths.map((l) => option(l.id, l.name)).join("");
    ui.types.innerHTML = state.tax.video_types
      .map((t) => `<button type="button" class="vd-chip" data-type="${esc(t.id)}" aria-pressed="false">${esc(t.name)}</button>`)
      .join("");
    ui.time.innerHTML =
      `<button type="button" class="vd-chip" data-minutes="" aria-pressed="true">Any</button>` +
      state.tax.study_times.map((m) => `<button type="button" class="vd-chip" data-minutes="${m}" aria-pressed="false">${m < 60 ? `${m} min` : `${m / 60} hour`}</button>`).join("");
    onSubjectChange(saved);
  }

  function onSubjectChange(saved = {}) {
    const subject = subjectOf(ui.subject.value);
    const school = !subject || subject.school;
    ui.gradeField.hidden = !school;
    ui.curriculumField.hidden = !school;
    ui.levelField.hidden = school;
    const grades = subject && subject.grades.length ? subject.grades : [8, 9, 10, 11, 12];
    const wantGrade = saved.grade ?? ui.grade.value;
    ui.grade.innerHTML = option("", "Any grade") + grades.map((g) => option(g, `Grade ${g}`, String(g) === String(wantGrade))).join("");
    const topics = subject ? subject.topics : [];
    ui.topic.innerHTML = option("", subject ? "All topics" : "Choose a subject first") + topics.map((t) => option(t.id, t.name, t.id === saved.topic)).join("");
    ui.topic.disabled = !subject;
    onTopicChange(saved);
  }

  function onTopicChange(saved = {}) {
    const subject = subjectOf(ui.subject.value);
    const topic = subject && subject.topics.find((t) => t.id === ui.topic.value);
    const subs = topic ? topic.subtopics : [];
    ui.subtopicField.hidden = !subs.length;
    ui.subtopic.innerHTML = option("", "All subtopics") + subs.map((s) => option(s.id, s.name, s.id === saved.subtopic)).join("");
  }

  function currentFilters() {
    const subject = subjectOf(ui.subject.value);
    const school = !subject || subject.school; // no subject yet: the server may detect a school one
    return {
      subject: ui.subject.value,
      grade: school ? ui.grade.value : "",
      curriculum: school ? ui.curriculum.value : "",
      level: subject && !school ? ui.level.value : "",
      topic: ui.topic.value,
      subtopic: ui.subtopicField.hidden ? "" : ui.subtopic.value,
      types: [...state.types].join(","),
      minutes: state.minutes || "",
      length: ui.length.value,
      language: ui.language.value,
      q: ui.q.value.trim(),
      sort: state.sort,
    };
  }

  function summarise() {
    const f = currentFilters();
    const n = ["grade", "curriculum", "level", "topic", "subtopic", "types", "minutes", "length", "language"].filter((k) => f[k]).length;
    ui.sum.textContent = n ? `(${n} set)` : "";
  }

  /* What a video was found under (subject/topic/grade), so watches, saves and ratings are filed
     against what the learner was actually studying, including a topic worked out from their words. */
  const contextOf = (o) => ({ subject: o.subject || null, topic: o.topic || null, subtopic: o.subtopic || null, grade: o.grade || null });
  const ctxFor = (v) => (v && v.ctx) || contextOf(currentFilters());

  function remember(f) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ subject: f.subject, grade: f.grade, curriculum: f.curriculum, level: f.level }));
    } catch {
      /* storage may be off */
    }
  }
  function recall() {
    try {
      return JSON.parse(localStorage.getItem(LAST_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  /* ================================================================ cards */
  const TYPE_ICON = { verified: "badge-check", curriculum: "graduation-cap", grade: "school", topic: "tag", type: "book-open", time: "clock" };

  function badgeList(v) {
    return (v.badges || [])
      .map((b) => `<li class="vd-badge vd-badge--${esc(b.kind)}"><i data-lucide="${TYPE_ICON[b.kind] || "tag"}"></i>${esc(b.label)}</li>`)
      .join("");
  }

  function matchRing(v) {
    return `<span class="vd-match" style="--m:${Number(v.match) || 0}" title="ScientiaForge match: how well this video fits your request">
        <span class="vd-match-num">${Number(v.match) || 0}</span><span class="vd-match-label">ScientiaForge<br />match</span></span>`;
  }

  function whyPanel(v) {
    const b = v.breakdown || {};
    const w = b.weights || {};
    const rows = [
      ["relevance", "Topic match", b.relevance],
      ["curriculum", "Curriculum and grade fit", b.curriculum],
      ["channel", "Channel trust", b.channel],
      ["engagement", "Viewer engagement", b.engagement],
      ["feedback", "ScientiaForge learners' ratings", b.learner_feedback],
      ["freshness", "How recent", b.freshness],
    ]
      .map(([key, label, value]) =>
        value === null || value === undefined
          ? `<div class="vd-bar vd-bar--na"><span class="vd-bar-label">${label}</span><span class="vd-bar-na">${key === "feedback" ? "Not enough ratings yet" : key === "curriculum" ? "No curriculum or grade chosen" : "Not available"}</span></div>`
          : `<div class="vd-bar"><span class="vd-bar-label">${label}<small>counts ${w[key] ?? 0}%</small></span><span class="vd-bar-track"><span style="width:${Math.max(2, value)}%"></span></span><span class="vd-bar-num">${value}</span></div>`
      )
      .join("");
    const yt = v.youtube_stats || {};
    const numbers = [
      yt.views !== null && yt.views !== undefined ? `${whole.format(yt.views)} views` : null,
      yt.likes !== null && yt.likes !== undefined ? `${whole.format(yt.likes)} likes` : "likes hidden",
      yt.comments !== null && yt.comments !== undefined ? `${whole.format(yt.comments)} comments` : null,
    ].filter(Boolean);
    const conf = { high: "High", moderate: "Moderate", low: "Low" }[v.confidence] || "";
    return `
      <div class="vd-why" id="why-${esc(v.id)}" hidden>
        ${v.reasons && v.reasons.length ? `<ul class="vd-reasons">${v.reasons.map((r) => `<li><i data-lucide="check"></i>${esc(r)}</li>`).join("")}</ul>` : ""}
        ${v.cautions && v.cautions.length ? `<ul class="vd-cautions">${v.cautions.map((r) => `<li><i data-lucide="info"></i>${esc(r)}</li>`).join("")}</ul>` : ""}
        <div class="vd-bars">${rows}</div>
        <p class="vd-why-note">Confidence: <strong>${conf}</strong>. The match is ScientiaForge's estimate of fit for your request, not a YouTube figure. From YouTube: ${esc(numbers.join(", ")) || "no statistics"}.</p>
      </div>`;
  }

  function card(v, { why = true } = {}) {
    state.cards.set(v.id, v);
    if (v.unavailable) {
      return `<article class="vd-card vd-card--gone" data-id="${esc(v.id)}">
        <div class="vd-thumb vd-thumb--empty"><i data-lucide="video-off"></i></div>
        <div class="vd-body"><h4 class="vd-card-title">Video details unavailable right now</h4>
          <p class="vd-meta">It may have been removed or made private.</p>
          <div class="vd-foot"><a class="nsc-btn nsc-btn-ghost" href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener">Open on YouTube</a>
          ${v.saved ? `<button type="button" class="vd-icon-btn" data-action="save" aria-pressed="true" aria-label="Remove from saved"><i data-lucide="bookmark-minus"></i></button>` : ""}</div></div>
      </article>`;
    }
    const views = compact(v.youtube_stats && v.youtube_stats.views);
    const fromYouTube = [views ? `${views} YouTube views` : null, v.published_at ? published(v.published_at) : null].filter(Boolean).join(", ");
    return `<article class="vd-card" data-id="${esc(v.id)}">
      <button type="button" class="vd-thumb" data-action="play" aria-label="Play ${esc(v.title)}">
        <img src="${esc(safeUrl(v.thumbnail_url))}" alt="" loading="lazy" width="320" height="180" />
        ${v.duration_seconds ? `<span class="vd-duration">${duration(v.duration_seconds)}</span>` : ""}
        <span class="vd-play" aria-hidden="true"><i data-lucide="play"></i></span>
      </button>
      <div class="vd-body">
        <h4 class="vd-card-title"><button type="button" data-action="play">${esc(v.title)}</button></h4>
        <p class="vd-meta"><span class="vd-channel">${esc(v.channel && v.channel.title)}</span><span class="vd-src">on YouTube</span></p>
        ${fromYouTube ? `<p class="vd-meta vd-meta-yt">${esc(fromYouTube)}</p>` : ""}
        ${v.badges && v.badges.length ? `<ul class="vd-badges">${badgeList(v)}</ul>` : ""}
        <div class="vd-foot">
          ${why && v.match !== undefined ? matchRing(v) : ""}
          <span class="vd-actions">
            <button type="button" class="vd-icon-btn" data-action="save" aria-pressed="${v.saved ? "true" : "false"}" aria-label="${v.saved ? "Remove from saved" : "Save video"}"><i data-lucide="${v.saved ? "bookmark-check" : "bookmark"}"></i></button>
          </span>
        </div>
        ${why && v.match !== undefined ? `<button type="button" class="vd-why-btn" data-action="why" aria-expanded="false" aria-controls="why-${esc(v.id)}">Why this video? <i data-lucide="chevron-down"></i></button>${whyPanel(v)}` : ""}
      </div>
    </article>`;
  }

  const grid = (videos, opts) => `<div class="vd-grid">${videos.map((v) => card(v, opts)).join("")}</div>`;

  /* ================================================================ search */
  function describe(req) {
    const what = [req.subject_name, req.subtopic_name || req.topic_name].filter(Boolean).join(": ");
    return [req.grade ? `Grade ${req.grade}` : null, what].filter(Boolean).join(" ");
  }

  function notice(kind, html) {
    const icon = { info: "sparkles", relaxed: "shuffle", quota: "cloud-off", unavailable: "cloud-off", empty: "search-x" }[kind] || "info";
    return `<div class="vd-notice vd-notice--${esc(kind)}"><i data-lucide="${icon}"></i><div>${html}</div></div>`;
  }

  async function search({ page = 1, append = false } = {}) {
    const f = currentFilters();
    if (!f.subject && !f.q) {
      ui.status.innerHTML = notice("empty", "Type what you want to learn, or choose a subject.");
      ui.q.focus();
      icons(ui.status);
      return;
    }
    remember(f);
    summarise();
    state.page = page;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
    params.set("page", String(page));
    params.set("limit", "12");
    if (state.noDetect) params.set("no_detect", "1");
    if (!append) {
      ui.results.setAttribute("aria-busy", "true");
      ui.results.innerHTML = `<div class="vd-grid">${'<div class="vd-card vd-skeleton" aria-hidden="true"><div class="vd-thumb"></div><div class="vd-body"><span></span><span></span></div></div>'.repeat(6)}</div>`;
      ui.status.textContent = "Finding videos…";
    }
    ui.more.disabled = true;
    try {
      const data = await api(`/search?${params.toString()}`);
      if (data.detected && data.detected.subject_detected) {
        // show the subject we worked out in the menu; a new search works it out again
        ui.subject.value = data.detected.subject;
        onSubjectChange();
        state.autoSubject = true;
        remember(currentFilters());
      }
      const ctx = contextOf(data.request);
      for (const v of [...data.results, ...(data.group_members || [])]) v.ctx = ctx;
      state.data = append ? { ...data, results: [...state.data.results, ...data.results] } : data;
      render(append ? data.results : null);
    } catch (err) {
      ui.results.innerHTML = "";
      ui.status.innerHTML =
        err.status === 400
          ? notice("empty", esc(err.message)) // something to change in the request, not an outage
          : notice("unavailable", `${esc(err.message)} <button type="button" class="vd-link" data-action="retry">Try again</button>`);
      icons(ui.status);
    } finally {
      ui.results.removeAttribute("aria-busy");
      ui.more.disabled = false;
    }
  }

  function render(appended) {
    const d = state.data;
    const req = d.request;
    const notes = [];
    const det = d.detected;
    if (det && det.topic) {
      const what = state.autoSubject ? `${req.subject_name}: ${det.name}` : det.name;
      notes.push(notice("info", `Showing videos on <strong>${esc(what)}</strong>, based on your search. <button type="button" class="vd-link" data-action="no-detect">Search without it</button>`));
    } else if (state.autoSubject) {
      notes.push(notice("info", `Showing <strong>${esc(req.subject_name)}</strong> videos, based on your search. <button type="button" class="vd-link" data-action="pick-subject">Choose a different subject</button>`));
    }
    for (const r of d.relaxed || []) notes.push(notice("relaxed", esc(r.message)));
    for (const n of d.notices || []) {
      if (n.kind === "empty") continue;
      notes.push(notice(n.kind, esc(n.message)));
    }
    const count = d.total === 1 ? "1 video" : `${d.total} videos`;
    ui.status.innerHTML =
      notes.join("") +
      (d.total
        ? `<div class="vd-results-head">
             <p class="vd-summary"><strong>${count}</strong> for ${esc(describe(req))}</p>
             <label class="vd-sort"><span>Sort</span><select id="vdSort">${state.tax.sorts.map((s) => option(s.id, s.name, s.id === state.sort)).join("")}</select></label>
           </div>`
        : "");

    if (!d.total) {
      const related = (d.related_topics || []).slice(0, 4);
      ui.results.innerHTML = `<div class="vd-empty">
        <i data-lucide="search-x"></i>
        <h3>No videos matched all your filters</h3>
        <p>Remove the time limit or video type, or try a related topic.</p>
        <div class="vd-empty-actions">
          ${state.types.size || state.minutes || ui.length.value ? `<button type="button" class="nsc-btn nsc-btn-ghost" data-action="broaden">Clear type, time and length</button>` : ""}
          ${related.map((t) => `<button type="button" class="vd-chip" data-action="related" data-topic="${esc(t.topic)}" data-subtopic="${esc(t.subtopic || "")}">${esc(t.name)}</button>`).join("")}
        </div></div>`;
      ui.more.hidden = true;
      icons(root);
      return;
    }

    if (appended) {
      ui.results.querySelector(".vd-grid:last-child").insertAdjacentHTML("beforeend", appended.map((v) => card(v)).join(""));
    } else if (d.groups && !state.flat) {
      const byId = new Map([...d.results, ...(d.group_members || [])].map((v) => [v.id, v]));
      ui.results.innerHTML =
        d.groups
          .map((g) => `<section class="vd-group vd-group--${esc(g.id)}"><h3 class="vd-group-title">${esc(g.name)}</h3>${grid(g.ids.map((id) => byId.get(id)).filter(Boolean))}</section>`)
          .join("") +
        `<div class="vd-more-row"><button type="button" class="nsc-btn nsc-btn-ghost" data-action="flat">See all ${esc(count)} in one list</button></div>`;
    } else {
      ui.results.innerHTML = grid(d.results);
    }
    const shown = state.flat || !d.groups ? d.results.length : Infinity;
    ui.more.hidden = !(shown < d.total);
    icons(root);
  }

  /* ================================================================ continue learning */
  async function loadContinue() {
    try {
      const { continue: c } = await api("/continue");
      state.signedIn = true;
      if (!c || !c.next || !c.next.length) {
        ui.cont.hidden = true;
        return;
      }
      const v = c.next[0];
      v.ctx = contextOf(c);
      const above = c.label.slice(0, -1); // ["Grade 12", "Mathematics", "Trigonometry"] -> "Grade 12 Mathematics: Trigonometry"
      const grade = /^Grade /.test(above[0] || "") ? above.shift() : null;
      const where = [grade, above.join(": ")].filter(Boolean).join(" ");
      state.cards.set(v.id, v);
      ui.cont.hidden = false;
      ui.cont.innerHTML = `
        <div class="vd-continue-text">
          <p class="vd-continue-kicker">Continue learning</p>
          <h3>${esc(c.label.slice(-1)[0] || "")}</h3>
          <p>${esc(where)}</p>
          <button type="button" class="vd-link" data-action="continue" data-subject="${esc(c.subject)}" data-topic="${esc(c.topic || "")}" data-subtopic="${esc(c.subtopic || "")}" data-grade="${esc(c.grade || "")}">More on this topic</button>
        </div>
        <button type="button" class="vd-continue-next" data-id="${esc(v.id)}" data-action="play">
          <img src="${esc(safeUrl(v.thumbnail_url))}" alt="" loading="lazy" width="160" height="90" />
          <span><small>Up next</small>${esc(v.title)}</span>
        </button>`;
      icons(ui.cont);
    } catch (err) {
      if (err.status === 401) state.signedIn = false;
      ui.cont.hidden = true;
    }
  }

  /* ================================================================ saved + history */
  async function loadSaved() {
    ui.saved.innerHTML = `<p class="vd-loading">Loading your saved videos…</p>`;
    try {
      const data = await api("/saved");
      if (!data.total) {
        ui.saved.innerHTML = `<div class="vd-empty"><i data-lucide="bookmark"></i><h3>No saved videos yet</h3><p>Tap the bookmark on any video to keep it here, grouped by subject and topic.</p></div>`;
      } else {
        data.groups.forEach((g) => g.items.forEach((it) => (it.ctx = contextOf(it))));
        ui.saved.innerHTML = data.groups
          .map((g) => `<section class="vd-group"><h3 class="vd-group-title">${esc(g.subject)}: ${esc(g.topic)}</h3>${grid(g.items, { why: false })}</section>`)
          .join("");
      }
    } catch (err) {
      ui.saved.innerHTML = `<div class="vd-empty"><i data-lucide="lock"></i><h3>${esc(err.message)}</h3></div>`;
    }
    icons(ui.saved);
  }

  async function loadHistory() {
    ui.history.innerHTML = `<p class="vd-loading">Loading your history…</p>`;
    try {
      const { items } = await api("/history");
      if (!items.length) {
        ui.history.innerHTML = `<div class="vd-empty"><i data-lucide="history"></i><h3>No watch history</h3><p>Videos you open here appear in this list. Only you can see it.</p></div>`;
      } else {
        items.forEach((v) => {
          v.ctx = contextOf(v);
          if (!v.unavailable) state.cards.set(v.id, v);
        });
        ui.history.innerHTML = `
          <div class="vd-history-head"><p>Only you can see this list.</p>
            <button type="button" class="nsc-btn nsc-btn-ghost" data-action="clear-history"><i data-lucide="trash-2"></i> Clear history</button></div>
          <ol class="vd-history">${items
            .map(
              (v) => `<li class="vd-history-item" data-id="${esc(v.id)}">
                ${v.unavailable ? `<span class="vd-history-thumb vd-thumb--empty"><i data-lucide="video-off"></i></span>` : `<button type="button" class="vd-history-thumb" data-action="play" aria-label="Play ${esc(v.title)}"><img src="${esc(safeUrl(v.thumbnail_url))}" alt="" loading="lazy" width="120" height="68" /></button>`}
                <div><p class="vd-history-title">${v.unavailable ? "Video details unavailable" : esc(v.title)}</p>
                  <p class="vd-meta">Watched ${esc(dayMonth.format(new Date(v.watched_at)))}${v.channel ? ` <span class="vd-src">${esc(v.channel.title)}</span>` : ""}</p></div>
                <button type="button" class="vd-icon-btn" data-action="forget" aria-label="Remove from history"><i data-lucide="x"></i></button>
              </li>`
            )
            .join("")}</ol>`;
      }
    } catch (err) {
      ui.history.innerHTML = `<div class="vd-empty"><i data-lucide="lock"></i><h3>${esc(err.message)}</h3></div>`;
    }
    icons(ui.history);
  }

  function showView(view) {
    root.querySelectorAll(".vd-view-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
    root.querySelectorAll("[data-view-panel]").forEach((p) => (p.hidden = p.dataset.viewPanel !== view));
    if (view === "saved") loadSaved();
    if (view === "history") loadHistory();
  }

  /* ================================================================ save */
  async function toggleSave(id, button) {
    const v = state.cards.get(id) || { id };
    const saving = button.getAttribute("aria-pressed") !== "true";
    button.disabled = true;
    try {
      const c = ctxFor(v);
      if (saving) await api(`/videos/${encodeURIComponent(id)}/save`, { method: "POST", body: { subject: c.subject, topic: c.topic, grade: c.grade } });
      else await api(`/videos/${encodeURIComponent(id)}/save`, { method: "DELETE" });
      v.saved = saving;
      root.querySelectorAll(`.vd-card[data-id="${CSS.escape(id)}"] [data-action="save"]`).forEach((b) => setSaveButton(b, saving));
      if (state.playing === id) setPlayerSave(saving);
      flash(saving ? "Saved. Find it under Saved." : "Removed from saved.");
      if (!saving && !root.querySelector('[data-view-panel="saved"]').hidden) loadSaved();
    } catch (err) {
      flash(err.message);
    } finally {
      button.disabled = false;
    }
  }

  function setSaveButton(b, saved) {
    b.setAttribute("aria-pressed", String(saved));
    b.setAttribute("aria-label", saved ? "Remove from saved" : "Save video");
    b.innerHTML = `<i data-lucide="${saved ? "bookmark-check" : "bookmark"}"></i>`;
    icons(b);
  }

  let toastTimer;
  function flash(message) {
    let t = root.querySelector(".vd-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "vd-toast";
      t.setAttribute("role", "status");
      root.appendChild(t);
    }
    t.textContent = message;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 2600);
  }

  /* ================================================================ player + feedback */
  function setPlayerSave(saved) {
    ui.playerSave.setAttribute("aria-pressed", String(saved));
    ui.playerSave.innerHTML = `<i data-lucide="${saved ? "bookmark-check" : "bookmark"}"></i> <span>${saved ? "Saved" : "Save"}</span>`;
    icons(ui.playerSave);
  }

  function openPlayer(id) {
    const v = state.cards.get(id);
    if (!v) return;
    state.playing = id;
    ui.frame.src = `${safeUrl(v.embed_url)}?autoplay=1&rel=0`;
    ui.frame.title = `Video: ${v.title}`;
    ui.playerTitle.textContent = v.title;
    ui.playerChannel.textContent = `${(v.channel && v.channel.title) || ""} on YouTube`;
    ui.onYouTube.href = safeUrl(v.url);
    setPlayerSave(Boolean(v.saved));
    renderRate(v);
    if (typeof ui.player.showModal === "function") ui.player.showModal();
    else ui.player.setAttribute("open", "");
    api(`/videos/${encodeURIComponent(id)}/watched`, { method: "POST", body: ctxFor(v) }).catch(() => {}); // history is a convenience: signed-out viewers just watch
  }

  function closePlayer() {
    ui.frame.src = "about:blank"; // stops playback
    if (ui.player.open) ui.player.close();
    state.playing = null;
  }

  function renderRate(v, stage) {
    const mine = v.my_feedback;
    if (stage === "thanks" || (mine && stage !== "change")) {
      ui.rate.innerHTML = `<p class="vd-rate-done"><i data-lucide="${mine && mine.useful ? "thumbs-up" : "thumbs-down"}"></i> Thanks. Your rating helps rank videos for other learners. <button type="button" class="vd-link" data-action="rate-change">Change</button></p>`;
    } else if (stage === "useful" || stage === "not_useful") {
      const reasons = state.tax.feedback_reasons[stage];
      ui.rate.innerHTML = `<p class="vd-rate-q">${stage === "useful" ? "What helped most?" : "What was wrong?"} <span>(optional)</span></p>
        <div class="vd-chips">${reasons.map((r) => `<button type="button" class="vd-chip" data-action="rate-reason" data-useful="${stage === "useful"}" data-reason="${esc(r.id)}">${esc(r.name)}</button>`).join("")}
        <button type="button" class="vd-link" data-action="rate-reason" data-useful="${stage === "useful"}" data-reason="">Skip</button></div>`;
    } else {
      ui.rate.innerHTML = `<p class="vd-rate-q">Was this video useful for what you're studying?</p>
        <div class="vd-rate-btns">
          <button type="button" class="nsc-btn nsc-btn-ghost" data-action="rate" data-useful="true"><i data-lucide="thumbs-up"></i> Yes</button>
          <button type="button" class="nsc-btn nsc-btn-ghost" data-action="rate" data-useful="false"><i data-lucide="thumbs-down"></i> No</button>
        </div>`;
    }
    icons(ui.rate);
  }

  async function sendRating(useful, reason) {
    const id = state.playing;
    const v = state.cards.get(id);
    if (!v) return;
    const c = ctxFor(v);
    try {
      await api(`/videos/${encodeURIComponent(id)}/feedback`, {
        method: "POST",
        body: { useful, reason: reason || null, subject: c.subject, topic: c.topic, grade: c.grade },
      });
      v.my_feedback = { useful, reason: reason || null };
      renderRate(v, "thanks");
    } catch (err) {
      ui.rate.innerHTML = `<p class="vd-rate-done">${esc(err.message)}</p>`;
    }
  }

  /* ================================================================ events */
  ui.form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.noDetect = false;
    state.flat = false;
    if (state.autoSubject) {
      // new words may be about a different subject: let the server work it out again
      ui.subject.value = "";
      onSubjectChange();
      state.autoSubject = false;
    }
    search();
  });
  ui.subject.addEventListener("change", () => {
    state.autoSubject = false;
    onSubjectChange();
    summarise();
  });
  ui.topic.addEventListener("change", () => {
    state.autoSubject = false;
    onTopicChange();
    summarise();
  });
  // what you study: choose, then press Find videos (a new question may use YouTube quota)
  [ui.grade, ui.curriculum, ui.level, ui.subtopic, ui.language].forEach((s) => s.addEventListener("change", summarise));
  // how you want it: re-ranks what's already found, instantly (no quota)
  const rerank = () => {
    summarise();
    if (state.data) search();
  };
  ui.length.addEventListener("change", rerank);
  ui.types.addEventListener("click", (e) => {
    const chip = e.target.closest(".vd-chip");
    if (!chip) return;
    const on = chip.getAttribute("aria-pressed") !== "true";
    chip.setAttribute("aria-pressed", String(on));
    on ? state.types.add(chip.dataset.type) : state.types.delete(chip.dataset.type);
    rerank();
  });
  ui.time.addEventListener("click", (e) => {
    const chip = e.target.closest(".vd-chip");
    if (!chip) return;
    ui.time.querySelectorAll(".vd-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    state.minutes = chip.dataset.minutes ? Number(chip.dataset.minutes) : null;
    rerank();
  });
  ui.more.addEventListener("click", () => {
    state.flat = true;
    search({ page: state.page + 1, append: true });
  });
  ui.close.addEventListener("click", closePlayer);
  ui.player.addEventListener("close", () => {
    ui.frame.src = "about:blank";
    state.playing = null;
  });
  ui.player.addEventListener("click", (e) => {
    if (e.target === ui.player) closePlayer(); // backdrop
  });
  ui.playerSave.addEventListener("click", () => state.playing && toggleSave(state.playing, ui.playerSave));

  root.addEventListener("change", (e) => {
    if (e.target.id === "vdSort") {
      state.sort = e.target.value;
      state.flat = state.sort !== "recommended";
      search();
    }
  });

  let clearArmed = false;
  root.addEventListener("click", async (e) => {
    const view = e.target.closest(".vd-view-btn");
    if (view) return showView(view.dataset.view);
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const holder = el.closest("[data-id]");
    const id = holder && holder.dataset.id;
    switch (el.dataset.action) {
      case "play":
        return openPlayer(id);
      case "save":
        return toggleSave(id, el);
      case "why": {
        const box = root.querySelector(`#why-${CSS.escape(id)}`);
        const open = el.getAttribute("aria-expanded") !== "true";
        el.setAttribute("aria-expanded", String(open));
        box.hidden = !open;
        return;
      }
      case "retry":
        return search();
      case "no-detect":
        state.noDetect = true;
        return search();
      case "flat":
        state.flat = true;
        return render();
      case "broaden":
        state.types.clear();
        state.minutes = null;
        ui.length.value = "";
        ui.types.querySelectorAll(".vd-chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
        ui.time.querySelectorAll(".vd-chip").forEach((c) => c.setAttribute("aria-pressed", String(!c.dataset.minutes)));
        return search();
      case "pick-subject":
        ui.filters.open = true;
        return ui.subject.focus();
      case "related":
        state.autoSubject = false;
        ui.topic.value = el.dataset.topic;
        onTopicChange({ subtopic: el.dataset.subtopic });
        return search();
      case "continue":
        state.autoSubject = false;
        ui.subject.value = el.dataset.subject;
        onSubjectChange({ grade: el.dataset.grade, topic: el.dataset.topic, subtopic: el.dataset.subtopic });
        return search();
      case "rate":
        return renderRate(state.cards.get(state.playing), el.dataset.useful === "true" ? "useful" : "not_useful");
      case "rate-reason":
        return sendRating(el.dataset.useful === "true", el.dataset.reason);
      case "rate-change":
        return renderRate(state.cards.get(state.playing), "change");
      case "forget":
        await api(`/history/${encodeURIComponent(id)}`, { method: "DELETE" }).catch((err) => flash(err.message));
        return loadHistory();
      case "clear-history":
        if (!clearArmed) {
          clearArmed = true;
          el.innerHTML = `<i data-lucide="trash-2"></i> Tap again to clear all`;
          icons(el);
          setTimeout(() => (clearArmed = false), 4000);
          return;
        }
        clearArmed = false;
        await api("/history", { method: "DELETE" }).catch((err) => flash(err.message));
        return loadHistory();
      default:
    }
  });

  // thumbnails that fail to load get a plain placeholder
  root.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (img.tagName !== "IMG" || img.dataset.failed) return;
      img.dataset.failed = "1";
      img.replaceWith(Object.assign(document.createElement("span"), { className: "vd-thumb-fallback", innerHTML: '<i data-lucide="clapperboard"></i>' }));
      icons(root);
    },
    true
  );

  /* ================================================================ start */
  async function init() {
    icons(root);
    try {
      state.tax = await api("/taxonomy");
    } catch (err) {
      ui.status.innerHTML = notice("unavailable", esc(err.message));
      icons(ui.status);
      return;
    }
    const saved = recall();
    fillSubjects(saved);
    summarise();
    loadContinue();
    if (!saved.subject) ui.status.innerHTML = `<p class="vd-hint">Type what you want to learn, or choose a subject. Adding what you want to do and the time you have sharpens the results.</p>`;
  }
  init();
})();
