/* ScientiaForge · Study Hub search
   Type in the top search bar -> see matching NSC past papers in a dropdown.
   - Matches by keyword ("contains"): subject, year, exam session, paper number, grade.
     "accounting", "acc 2023", "maths paper 2", "physical november" all work.
   - Clicking a paper opens PastPaper.html?id=...
   - Clicking a subject (or "See all") applies the filters to the main paper list.
   Needs nscCommon.js loaded first. Load AFTER StudyHub.js. */
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const { esc, icons, sessionLabel, api } = window.NSC;

  let input = document.getElementById("searchInput");
  const host = input && (input.closest(".topbar-left") || input.closest(".topbar") || input.parentElement);
  if (!input || !host) {
    console.warn("[StudyHubSearch] #searchInput or its topbar was not found, search is off.");
    return;
  }
  console.info("[StudyHubSearch] ready, listening on #searchInput");

  const STOP = new Set(["paper", "papers", "past", "exam", "exams", "question", "memo", "memorandum", "grade", "gr", "the", "and", "of", "for", "a"]);
  const MAX_SUBJECTS = 5;

  /* ---------- markup ---------- */
  input.placeholder = "Search past papers, e.g. Accounting 2023";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", "nscSearchPop");

  const pop = document.createElement("div");
  pop.id = "nscSearchPop";
  pop.className = "nsc-search-pop";
  pop.setAttribute("role", "listbox");
  pop.setAttribute("aria-label", "Past paper results");
  pop.hidden = true;
  document.body.appendChild(pop); // body + position:fixed, so no header can clip or rebuild it

  /* ---------- filter metadata (subjects, years, sessions) ---------- */
  let metaPromise = null;
  const getMeta = () =>
    (metaPromise ||= api("/filters").catch(() => ({ subjects: [], years: [], sessions: [], paper_numbers: [] })));

  /* ---------- query parsing ---------- */
  function parse(q, meta) {
    const subjects = meta.subjects || [];
    const f = {};
    let rest = q.toLowerCase().trim();

    rest = rest.replace(/\b(?:paper|p)\s*([1-9])\b/g, (_, n) => ((f.paper = n), " "));
    rest = rest.replace(/\b(?:grade|gr)\s*(\d{1,2})\b/g, (_, n) => ((f.grade = n), " "));
    const years = (meta.years || []).map(String);
    rest = rest.replace(/\b(?:19|20)\d{2}\b/g, (y) => (years.includes(y) ? ((f.year = y), " ") : y));

    const subjectLower = subjects.map((s) => String(s).toLowerCase());
    const tokens = rest.split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
    const words = [];
    for (const t of tokens) {
      if (subjectLower.some((s) => s.includes(t))) {
        words.push(t);
        continue;
      }
      const sess = (meta.sessions || []).find((s) => t.length >= 3 && String(s).toLowerCase().includes(t));
      if (sess && !f.session) f.session = sess;
    }

    let matched = [];
    if (words.length) {
      matched = subjects.filter((s, i) => words.every((w) => subjectLower[i].includes(w)));
      if (!matched.length) matched = subjects.filter((s, i) => words.some((w) => subjectLower[i].includes(w)));
      matched.sort((a, b) => {
        const A = String(a).toLowerCase().startsWith(words[0]) ? 0 : 1;
        const B = String(b).toLowerCase().startsWith(words[0]) ? 0 : 1;
        return A - B || String(a).localeCompare(String(b));
      });
    }
    const hasFilter = Object.keys(f).length > 0;
    const unmatchedWords = tokens.length > words.length && !words.length && !hasFilter;
    return { f, words, subjects: matched.slice(0, MAX_SUBJECTS), moreSubjects: Math.max(0, matched.length - MAX_SUBJECTS), hasFilter, unmatchedWords };
  }

  /* ---------- fetching ---------- */
  async function search(q) {
    const meta = await getMeta();
    const p = parse(q, meta);
    console.debug("[StudyHubSearch] query", q, { subjects: (meta.subjects || []).length, parsed: p });
    if (p.unmatchedWords || (!p.subjects.length && !p.hasFilter)) return { ...p, papers: [], groups: [] };

    const targets = p.subjects.length ? p.subjects : [null];
    const perCall = targets.length === 1 ? 8 : 4;
    const groups = await Promise.all(
      targets.map(async (subject) => {
        const params = new URLSearchParams(p.f);
        if (subject) params.set("subject", subject);
        params.set("limit", perCall);
        params.set("offset", 0);
        const data = await api(`/papers?${params}`);
        return { subject, total: data.total || 0, papers: data.papers || [] };
      })
    );
    const papers = groups.flatMap((g) => g.papers).sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    return { ...p, papers, groups, total: groups.reduce((n, g) => n + g.total, 0) };
  }

  /* ---------- rendering ---------- */
  function mark(text, words) {
    const t = String(text ?? "");
    if (!words.length) return esc(t);
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
    return t.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join("");
  }

  let optionCount = 0;
  const optId = () => `nscOpt-${optionCount++}`;

  function render(res, q) {
    optionCount = 0;
    const words = res.words || [];
    if (!res.papers.length) {
      pop.innerHTML = `
        <div class="nsc-search-empty">
          <p><strong>No papers match “${esc(q)}”.</strong></p>
          <p>Try a subject name, a year, or both: “Accounting”, “Maths 2023”.</p>
        </div>`;
      return;
    }

    const subjectRows = res.groups
      .filter((g) => g.subject)
      .map(
        (g) => `
        <button type="button" role="option" id="${optId()}" class="nsc-search-row nsc-search-subject" data-subject="${esc(g.subject)}">
          <i data-lucide="book-open"></i>
          <span class="nsc-search-main"><span class="nsc-search-title">${mark(g.subject, words)}</span>
          <span class="nsc-search-meta">${g.total} ${g.total === 1 ? "paper" : "papers"}</span></span>
          <span class="nsc-search-go">Show all</span>
        </button>`
      )
      .join("");

    const paperRows = res.papers
      .map(
        (p) => `
        <a role="option" id="${optId()}" class="nsc-search-row" href="PastPaper.html?id=${encodeURIComponent(p.id)}">
          <i data-lucide="file-text"></i>
          <span class="nsc-search-main"><span class="nsc-search-title">${mark(p.subject, words)}, Paper ${esc(p.paper_number)}</span>
          <span class="nsc-search-meta">${esc(sessionLabel(p))} · Grade ${esc(p.grade)}${p.memorandum_download_url ? " · Memo included" : ""}</span></span>
          <span class="nsc-search-go">Open</span>
        </a>`
      )
      .join("");

    const single = res.groups.length === 1 ? res.groups[0] : null;
    const seeAll = single && single.total > res.papers.length
      ? `<button type="button" role="option" id="${optId()}" class="nsc-search-all" data-seeall="1">See all ${single.total} papers</button>`
      : "";
    const more = res.moreSubjects ? `<p class="nsc-search-note">${res.moreSubjects} more ${res.moreSubjects === 1 ? "subject matches" : "subjects match"}. Add a word to narrow it down.</p>` : "";

    pop.innerHTML = `
      ${subjectRows ? `<div class="nsc-search-group" role="presentation"><p class="nsc-search-label">Subjects</p>${subjectRows}</div>` : ""}
      <div class="nsc-search-group" role="presentation"><p class="nsc-search-label">Past papers</p>${paperRows}</div>
      ${seeAll}${more}`;
    pop._res = res;
    icons(pop);
  }

  /* ---------- open / close / state ---------- */
  let active = -1;
  let reqId = 0;
  let timer = null;

  const options = () => [...pop.querySelectorAll('[role="option"]')];
  function setActive(i) {
    const opts = options();
    opts.forEach((o) => o.classList.remove("is-active"));
    active = opts.length ? (i + opts.length) % opts.length : -1;
    if (active >= 0) {
      opts[active].classList.add("is-active");
      opts[active].scrollIntoView({ block: "nearest" });
      input.setAttribute("aria-activedescendant", opts[active].id);
    } else input.removeAttribute("aria-activedescendant");
  }
  function place() {
    const anchor = input.closest("label") || input;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(580, window.innerWidth - 16);
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.max(8, Math.min(Math.round(r.left), window.innerWidth - w - 8))}px`;
    pop.style.width = `${w}px`;
  }
  window.addEventListener("resize", () => !pop.hidden && place());
  function open() {
    place();
    pop.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function close() {
    pop.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  async function run() {
    const q = input.value.trim();
    if (q.length < 2) return close();
    const mine = ++reqId;
    pop.innerHTML = `<div class="nsc-search-empty" role="status"><p>Searching…</p></div>`;
    open();
    try {
      const res = await search(q);
      if (mine !== reqId) return;
      render(res, q);
      setActive(-1);
    } catch (err) {
      if (mine !== reqId) return;
      pop.innerHTML = `<div class="nsc-search-empty"><p><strong>Couldn't search right now.</strong></p><p>${esc(err.message)}</p></div>`;
    }
  }

  /* apply a subject (plus any parsed year/session/etc.) to the main browse list */
  function showInList(subject, f = {}) {
    const ids = { subject: "nscSubject", grade: "nscGrade", year: "nscYear", session: "nscSession", paper: "nscPaper" };
    Object.values(ids).forEach((id) => {
      const s = document.getElementById(id);
      if (s) s.value = "";
    });
    const wanted = { ...f, ...(subject ? { subject } : {}) };
    let last = null;
    Object.entries(wanted).forEach(([k, v]) => {
      const s = document.getElementById(ids[k]);
      if (s && [...s.options].some((o) => o.value === String(v))) {
        s.value = String(v);
        last = s;
      }
    });
    document.querySelector('.sh-tabs .cp-tab[data-panel="papersPanel"]')?.click();
    (last || document.getElementById("nscSubject"))?.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("nscPaperList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    close();
    input.blur();
  }

  /* ---------- events ---------- */
  const onInput = (e) => {
    if (e.target.id !== "searchInput") return;
    input = e.target;
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  };
  window.addEventListener("input", onInput, true);
  document.addEventListener("focusin", (e) => {
    if (e.target.id !== "searchInput") return;
    if (input.value.trim().length >= 2 && pop.innerHTML) open();
  });
  const onKey = (e) => {
    if (e.target.id !== "searchInput") return;
    if (pop.hidden && e.key === "ArrowDown" && input.value.trim().length >= 2) return run();
    if (pop.hidden) return;
    if (e.key === "ArrowDown") (e.preventDefault(), setActive(active + 1));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive(active - 1));
    else if (e.key === "Escape") close();
    else if (e.key === "Enter") {
      e.preventDefault();
      const opts = options();
      if (active >= 0) return opts[active].click();
      const res = pop._res;
      if (res && res.groups.length === 1 && res.groups[0].subject) showInList(res.groups[0].subject, res.f);
      else if (opts[0]) opts[0].click();
    }
  };
  window.addEventListener("keydown", onKey, true);

  pop.addEventListener("click", (e) => {
    const sub = e.target.closest("[data-subject]");
    const all = e.target.closest("[data-seeall]");
    const res = pop._res;
    if (sub) showInList(sub.dataset.subject, res && res.f);
    else if (all && res) showInList(res.groups[0].subject, res.f);
  });
  pop.addEventListener("mousemove", (e) => {
    const o = e.target.closest('[role="option"]');
    if (o) setActive(options().indexOf(o));
  });
  document.addEventListener("pointerdown", (e) => {
    if (!pop.contains(e.target) && e.target !== input && !(input.closest("label") || input).contains(e.target)) close();
  });

  /* "/" focuses the search from anywhere on the page */
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !["input", "textarea", "select"].includes(tag) && !e.target.isContentEditable) {
      e.preventDefault();
      input.focus();
    }
  });
});