/* ScientiaForge · readinessStore.js  (window.NSCStore)
   One place that owns Exam Arena and readiness data. ExamMode.js and ReadinessPanel.js read and write
   through it, so they never touch localStorage or the API directly.

   - Reads are instant and synchronous, from a local cache.
   - Writes land in the cache first, then sync to Supabase through /api/readiness in the background.
     If the learner is offline or the session expired, writes wait in an outbox and go up later.
   - Cache and outbox are kept per learner (keyed by the user id inside the access token), so two people
     sharing one browser never see or upload each other's exams.
   - Browser history from before this existed (or saved while signed out) is claimed by whoever signs in
     next on that browser, uploaded, then removed from the old key.
   - THE LOCAL COPY IS NEVER OVERWRITTEN BY THE SERVER: a pull only adds to it. An exam leaves the
     "waiting to sync" outbox only once the server list actually contains it.
   - A running exam is saved to the account too, so it can be resumed from another device.

   Load order:  nscCommon.js, readinessStore.js, then ExamMode.js / ReadinessPanel.js. */
(function () {
  "use strict";

  /* same server as the NSC papers API (".../api/study-hub/nsc"), so use its base; otherwise fall back to /api */
  const API_ROOT = (() => {
    const nsc = window.NSC && window.NSC.API;
    if (nsc && /\/study-hub\/nsc\/?$/.test(nsc)) return nsc.replace(/\/study-hub\/nsc\/?$/, "");
    return typeof API_BASE !== "undefined" ? API_BASE : "/api";
  })();
  const ROOT = API_ROOT + "/readiness";
  const K = {
    log: "sf-exam-log-v1",
    active: "sf-exam-active-v2",
    prefs: "sf-exam-opts-v1",
    outbox: "sf-exam-outbox-v1",
    cleared: "sf-exam-cleared-v1",
  };
  let lastError = null; // the most recent sync problem, shown on the dashboard and in the console
  const MAX_LOG = 300;

  /* ------------------------------------------------------------ storage helpers */
  const read = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked: the app keeps working for this visit */
    }
  };
  const token = () => localStorage.getItem("sb-access-token");
  function uid() {
    const t = token();
    if (!t) return null;
    try {
      const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(p.padEnd(p.length + ((4 - (p.length % 4)) % 4), "="))).sub || null;
    } catch {
      return null;
    }
  }
  /* signed in -> per-learner key; signed out -> the plain key (local-only mode) */
  const key = (base) => (uid() ? `${base}:${uid()}` : base);

  /* ------------------------------------------------------------ change events */
  const listeners = [];
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* a listener failed */ } });

  /* ------------------------------------------------------------ network */
  async function remote(path, opts = {}) {
    const t = token();
    if (!t) throw Object.assign(new Error("Not signed in"), { status: 401 });
    const res = await fetch(ROOT + path, {
      method: opts.method || "GET",
      headers: { Authorization: `Bearer ${t}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      keepalive: !!opts.keepalive,
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw Object.assign(new Error(b.error || `Request failed (${res.status})`), { status: res.status });
    }
    return res.status === 204 ? null : res.json();
  }

  /* ------------------------------------------------------------ attempts */
  const refOf = (e) => e.ref || e.at;
  const attempts = () => read(key(K.log), []);
  const attemptsForPaper = (id) => attempts().filter((e) => String(e.paperId) === String(id));
  const outbox = () => read(key(K.outbox), []);

  function addAttempt(entry) {
    const log = attempts();
    log.push(entry);
    write(key(K.log), log.slice(-MAX_LOG));
    if (uid()) {
      const ob = outbox();
      ob.push(entry);
      write(key(K.outbox), ob.slice(-MAX_LOG));
      flush();
    }
    emit();
  }

  const MAX_TRIES = 6; // stop re-sending an entry the server keeps refusing; it stays on this device
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      try {
        if (!uid()) return;
        const todo = outbox().filter((e) => (e._tries || 0) < MAX_TRIES);
        if (!todo.length) return;
        /* small batches: the server's JSON body limit is 100 kb by default */
        for (let i = 0; i < todo.length; i += 40) {
          const batch = todo.slice(i, i + 40);
          const sent = new Set(batch.map(refOf));
          const res = await remote("/import", { method: "POST", body: { log: batch.map(({ _tries, ...e }) => e) } });
          if (res && res.added === 0) console.info("[readiness] server reported 0 new exams (already stored, or refused):", batch.length, "sent");
          write(key(K.outbox), outbox().map((e) => (sent.has(refOf(e)) ? { ...e, _tries: (e._tries || 0) + 1 } : e)));
        }
        lastError = null;
        await pullAttempts(); // confirm what the server really holds
      } catch (err) {
        lastError = err.message || "Could not reach the server";
        console.warn("[readiness] sync failed:", lastError);
      } finally {
        flushing = null;
        emit();
      }
    })();
    return flushing;
  }

  /* ADD the server's exams to the local copy. Never replaces or removes local exams. */
  async function pullAttempts() {
    const { attempts: server } = await remote(`/attempts?limit=${MAX_LOG}`);
    const have = new Set(server.map(refOf));
    write(key(K.outbox), outbox().filter((e) => !have.has(refOf(e)) && (e._tries || 0) < MAX_TRIES));
    const localOnly = attempts().filter((e) => !have.has(refOf(e)));
    write(key(K.log), [...server, ...localOnly].sort((a, b) => new Date(a.at) - new Date(b.at)).slice(-MAX_LOG));
  }

  /* history saved before accounts, or while signed out: whoever signs in next claims it */
  function claimLegacy() {
    if (!uid()) return;
    const legacy = read(K.log, []);
    if (Array.isArray(legacy) && legacy.length) {
      const have = new Set(attempts().map(refOf));
      const fresh = legacy.filter((e) => e && e.at && !have.has(refOf(e)));
      if (fresh.length) {
        write(key(K.log), [...attempts(), ...fresh].sort((a, b) => new Date(a.at) - new Date(b.at)).slice(-MAX_LOG));
        write(key(K.outbox), [...outbox(), ...fresh].slice(-MAX_LOG));
      }
    }
    localStorage.removeItem(K.log);
  }

  async function clearAttempts() {
    write(key(K.log), []);
    write(key(K.outbox), []);
    emit();
    if (uid()) {
      try {
        await remote("/attempts", { method: "DELETE" });
      } catch {
        /* could not reach the server: history is cleared here, and will reappear on the next sync */
      }
    }
  }

  /* ------------------------------------------------------------ preferences */
  const getPrefs = () => read(key(K.prefs), read(K.prefs, {}));
  let prefsTimer = null;
  function setPrefs(p) {
    write(key(K.prefs), p);
    if (!uid()) return;
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => remote("/preferences", { method: "PUT", body: { preferences: p } }).catch(() => {}), 800);
  }
  async function pullPrefs() {
    const { preferences } = await remote("/preferences");
    if (preferences) write(key(K.prefs), preferences);
  }

  /* ------------------------------------------------------------ running exam */
  const getActive = (paperId) => {
    const a = read(key(K.active), null);
    return a && String(a.paperId) === String(paperId) ? a : null;
  };
  let activeTimer = null;
  const pushActive = (state, keepalive) =>
    remote(`/active/${encodeURIComponent(state.paperId)}`, { method: "PUT", body: { state }, keepalive }).catch(() => {});
  function setActive(state) {
    write(key(K.active), state);
    if (!uid()) return;
    clearTimeout(activeTimer);
    activeTimer = setTimeout(() => pushActive(state), 1500);
  }
  function clearActive(paperId) {
    const cur = getActive(paperId);
    clearTimeout(activeTimer);
    if (cur) {
      /* remember it ended, so a stale copy on the server is never resurrected */
      const c = read(K.cleared, {});
      c[paperId] = cur.startedAt;
      write(K.cleared, c);
    }
    localStorage.removeItem(key(K.active));
    if (uid()) remote(`/active/${encodeURIComponent(paperId)}`, { method: "DELETE" }).catch(() => {});
  }
  async function pullActive(paperId) {
    if (!uid()) return null;
    try {
      const { state } = await remote(`/active/${encodeURIComponent(paperId)}`);
      if (!state) return getActive(paperId);
      const ended = read(K.cleared, {})[paperId];
      if (ended != null && state.startedAt <= ended) {
        remote(`/active/${encodeURIComponent(paperId)}`, { method: "DELETE" }).catch(() => {});
        return getActive(paperId);
      }
      if (read(key(K.active), null)) return getActive(paperId); // never overwrite an exam already running here
      write(key(K.active), state);
      return state;
    } catch {
      return getActive(paperId);
    }
  }
  /* last-second save when the tab closes mid-exam */
  window.addEventListener("pagehide", () => {
    if (!uid()) return;
    const a = read(key(K.active), null);
    if (a) pushActive(a, true);
  });

  /* ------------------------------------------------------------ start-up */
  const ready = (async () => {
    if (!uid()) return;
    try {
      claimLegacy();
      await flush();
      await pullAttempts();
      await pullPrefs();
      lastError = null;
    } catch (err) {
      lastError = err.message || "Could not reach the server";
      console.warn("[readiness] start-up sync failed:", lastError, "(your exams are safe on this device)");
    }
    emit();
  })();
  window.addEventListener("online", () => flush().then(() => uid() && pullAttempts().then(emit).catch(() => {})));

  window.NSCStore = {
    ready,
    userId: uid,
    attempts,
    attemptsForPaper,
    addAttempt,
    clearAttempts,
    getPrefs,
    setPrefs,
    getActive,
    setActive,
    clearActive,
    pullActive,
    flush,
    onChange: (fn) => listeners.push(fn),
    /* for a small "synced / waiting / this device only" label */
    syncInfo: () => ({ signedIn: !!uid(), pending: uid() ? outbox().length : 0, error: lastError }),
    /* run NSCStore.debug() in the browser console to see exactly where the data is */
    debug: () => ({
      signedInAs: uid(),
      apiRoot: ROOT,
      examsOnThisDevice: attempts().length,
      waitingToSync: outbox().length,
      oldUnclaimedExams: read(K.log, []).length,
      lastError,
      storageKeys: Object.keys(localStorage).filter((k) => k.startsWith("sf-exam")),
    }),
  };
})();