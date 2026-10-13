/**
 * SkillForge - background CV analysis tracker
 *
 * Add this to EVERY dashboard page (before the page's own script):
 *   script tag with src="../js/cvAnalysisTracker.js"
 *
 * It checks for a running CV analysis on every page load, shows a small
 * status card in the corner while it runs, and tells the user when the
 * results are ready, whichever page they are on.
 *
 * The CV Analyzer page uses it like this:
 *   await CvAnalysis.start(file, targetRole);        // returns immediately
 *   CvAnalysis.onComplete((analysis) => renderAnalysis(analysis));
 *   CvAnalysis.onFailed((message) => showError(message));
 *   CvAnalysis.onProgress((job) => showAnalysingState(job));
 */
(() => {
  // Already loaded on this page? Don't run twice.
  if (window.CvAnalysis) return;

  // ------------------------------------------------------------
  // Settings - match these to your project
  // ------------------------------------------------------------
  const CONFIG = {
    // Same base URL your CV page currently uses for /upload, /latest etc.
    apiBase: window.SKILLFORGE_CV_API || "http://localhost:5001/api/cv",

    // Where the "View results" link goes
    cvPageUrl: window.SKILLFORGE_CV_PAGE || "../pages/CvDashboard.html",

    pollMs: 3000, // how often to check the job
    maxPollMs: 15000, // slowest polling when the network is struggling
  };

  /**
   * Auth header for API calls.
   * Default: reads the Supabase session that supabase-js keeps in localStorage.
   * If your pages already have a helper for the token, call it here instead.
   */
  async function getAuthHeaders() {
    if (typeof window.getSkillForgeAuthHeaders === "function") {
      return window.getSkillForgeAuthHeaders();
    }

    try {
      // SkillForge pages keep the token here (same as CvDashboard.html)
      const savedToken = localStorage.getItem("sb-access-token");
      if (savedToken) return { Authorization: `Bearer ${savedToken}` };

      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      if (!key) return {};

      const session = JSON.parse(localStorage.getItem(key));
      const token = session?.access_token || session?.currentSession?.access_token;

      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  const STORAGE_KEY = "skillforge:cvJob";

  const listeners = {
    complete: new Set(),
    failed: new Set(),
    progress: new Set(),
  };

  let activeJob = null;
  let pollTimer = null;
  let elapsedTimer = null;
  let pendingResult = null; // finished result a page hasn't picked up yet
  let pendingFailure = null;

  const remember = (jobId) => {
    try { localStorage.setItem(STORAGE_KEY, jobId); } catch { /* storage unavailable */ }
  };
  const forget = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  };
  const remembered = () => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  };

  const safeCall = (callback, value) => {
    try { callback(value); } catch (err) { console.error("CvAnalysis listener error:", err); }
  };

  // ------------------------------------------------------------
  // API
  // ------------------------------------------------------------
  async function api(path, options = {}) {
    const headers = { ...(await getAuthHeaders()), ...(options.headers || {}) };
    const response = await fetch(`${CONFIG.apiBase}${path}`, { ...options, headers });

    let body = null;
    try { body = await response.json(); } catch { /* empty body */ }

    if (!response.ok) {
      const err = new Error(body?.error || `Request failed (${response.status})`);
      err.status = response.status;
      err.code = body?.code;
      err.body = body;
      throw err;
    }

    return body;
  }

  // ------------------------------------------------------------
  // Status card
  // ------------------------------------------------------------
  let card = null;

  function injectStyles() {
    if (document.getElementById("sf-cvjob-styles")) return;

    const style = document.createElement("style");
    style.id = "sf-cvjob-styles";
    style.textContent = `
      .sf-cvjob {
        --sf-cvjob-bg: #ffffff;
        --sf-cvjob-text: #1f2933;
        --sf-cvjob-muted: #5f6b7a;
        --sf-cvjob-border: #d9dee5;
        --sf-cvjob-accent: #1a3c8f;
        --sf-cvjob-success: #15803d;
        --sf-cvjob-danger: #b42318;

        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 9999;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        width: min(340px, calc(100vw - 32px));
        padding: 14px 16px;
        background: var(--sf-cvjob-bg);
        color: var(--sf-cvjob-text);
        border: 1px solid var(--sf-cvjob-border);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
        font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-size: 14px;
        line-height: 1.4;
      }
      @media (max-width: 480px) {
        .sf-cvjob { right: 16px; bottom: 16px; }
      }
      .sf-cvjob[hidden] { display: none; }
      .sf-cvjob__icon {
        flex: 0 0 18px;
        width: 18px;
        height: 18px;
        margin-top: 1px;
        border-radius: 50%;
      }
      .sf-cvjob--processing .sf-cvjob__icon {
        border: 2px solid var(--sf-cvjob-border);
        border-top-color: var(--sf-cvjob-accent);
        animation: sf-cvjob-spin 0.9s linear infinite;
      }
      .sf-cvjob--done .sf-cvjob__icon { background: var(--sf-cvjob-success); }
      .sf-cvjob--failed .sf-cvjob__icon { background: var(--sf-cvjob-danger); }
      .sf-cvjob__body { flex: 1; min-width: 0; }
      .sf-cvjob__title { margin: 0; font-weight: 600; }
      .sf-cvjob__detail {
        margin: 2px 0 0;
        color: var(--sf-cvjob-muted);
        overflow-wrap: anywhere;
      }
      .sf-cvjob__link {
        display: inline-block;
        margin-top: 8px;
        color: var(--sf-cvjob-accent);
        font-weight: 600;
        text-decoration: none;
      }
      .sf-cvjob__link:hover { text-decoration: underline; }
      .sf-cvjob__close {
        flex: 0 0 auto;
        margin: -4px -6px 0 0;
        padding: 2px 6px;
        border: 0;
        background: none;
        color: var(--sf-cvjob-muted);
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        border-radius: 4px;
      }
      .sf-cvjob__close:hover { color: var(--sf-cvjob-text); }
      .sf-cvjob a:focus-visible,
      .sf-cvjob button:focus-visible {
        outline: 2px solid var(--sf-cvjob-accent);
        outline-offset: 2px;
      }
      @keyframes sf-cvjob-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .sf-cvjob--processing .sf-cvjob__icon { animation-duration: 3s; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureCard() {
    if (card) return card;

    injectStyles();

    const root = document.createElement("div");
    root.className = "sf-cvjob";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.hidden = true;

    const icon = document.createElement("span");
    icon.className = "sf-cvjob__icon";
    icon.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "sf-cvjob__body";

    const title = document.createElement("p");
    title.className = "sf-cvjob__title";

    const detail = document.createElement("p");
    detail.className = "sf-cvjob__detail";

    const link = document.createElement("a");
    link.className = "sf-cvjob__link";
    link.href = CONFIG.cvPageUrl;
    link.textContent = "View results";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "sf-cvjob__close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", hideCard);

    body.append(title, detail, link);
    root.append(icon, body, close);
    document.body.appendChild(root);

    card = { root, title, detail, link, close };
    return card;
  }

  let autoHideTimer = null;

  function setCard({ state, title, detail, showLink = false, closable = true, autoHideMs = 0 }) {
    const c = ensureCard();

    clearTimeout(autoHideTimer);
    c.root.className = `sf-cvjob sf-cvjob--${state}`;
    c.title.textContent = title;
    c.detail.textContent = detail || "";
    c.detail.hidden = !detail;
    c.link.hidden = !showLink;
    c.close.hidden = !closable;
    c.root.hidden = false;

    if (autoHideMs) {
      autoHideTimer = setTimeout(hideCard, autoHideMs);
    }
  }

  function hideCard() {
    clearTimeout(autoHideTimer);
    if (card) card.root.hidden = true;
  }

  const formatElapsed = (startedAt) => {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  function showProcessing(job) {
    const render = () =>
      setCard({
        state: "processing",
        title: "Analysing your CV",
        detail: `${job.fileName || "Your CV"}, ${formatElapsed(job.startedAt)} so far. You can keep using SkillForge.`,
        closable: false,
      });

    render();
    clearInterval(elapsedTimer);
    elapsedTimer = setInterval(render, 1000);
  }

  // ------------------------------------------------------------
  // Polling
  // ------------------------------------------------------------
  function stopPolling() {
    clearTimeout(pollTimer);
    clearInterval(elapsedTimer);
    pollTimer = null;
    elapsedTimer = null;
  }

  function startPolling(job) {
    stopPolling();

    activeJob = job;
    remember(job.jobId);
    showProcessing(job);
    listeners.progress.forEach((cb) => safeCall(cb, job));

    let delay = CONFIG.pollMs;

    const tick = async () => {
      try {
        const result = await api(`/jobs/${encodeURIComponent(job.jobId)}`);
        delay = CONFIG.pollMs;

        if (result.status === "processing") {
          pollTimer = setTimeout(tick, delay);
          return;
        }

        handleFinished(result);
      } catch (err) {
        if (err.status === 404 || err.status === 401) {
          // Job gone or user logged out: stop quietly
          stopPolling();
          activeJob = null;
          forget();
          hideCard();
          return;
        }

        // Network hiccup: keep trying, a bit slower each time
        delay = Math.min(delay * 2, CONFIG.maxPollMs);
        pollTimer = setTimeout(tick, delay);
      }
    };

    pollTimer = setTimeout(tick, delay);
  }

  function handleFinished(result) {
    stopPolling();
    activeJob = null;
    forget();

    if (result.status === "completed") {
      const onCvPage = listeners.complete.size > 0;

      if (onCvPage) {
        listeners.complete.forEach((cb) => safeCall(cb, result.analysis));
      } else {
        pendingResult = result.analysis;
      }

      setCard({
        state: "done",
        title: "Your CV analysis is ready",
        detail: result.fileName || "",
        showLink: !onCvPage,
        autoHideMs: onCvPage ? 5000 : 0,
      });
      return;
    }

    const message = result.error || "The CV analysis failed. Please upload your CV again.";

    if (listeners.failed.size > 0) {
      listeners.failed.forEach((cb) => safeCall(cb, message));
    } else {
      pendingFailure = message;
    }

    setCard({
      state: "failed",
      title: "CV analysis failed",
      detail: message,
    });
  }

  // ------------------------------------------------------------
  // On every page load: pick up a running or just-finished job
  // ------------------------------------------------------------
  async function init() {
    try {
      const { job } = await api("/active");

      if (job) {
        startPolling(job);
        return;
      }

      // Finished while the user was between pages? Show the result once.
      const jobId = remembered();
      if (!jobId) return;

      const result = await api(`/jobs/${encodeURIComponent(jobId)}`);

      if (result.status === "processing") {
        startPolling(result);
      } else {
        handleFinished(result);
      }
    } catch (err) {
      if (err.status === 404) forget();
      // Not logged in or offline: nothing to show
    }
  }

  // ------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------
  window.CvAnalysis = {
    /**
     * Upload a CV and start the analysis. Resolves as soon as the server
     * has accepted it; the result arrives later through onComplete.
     */
    async start(file, targetRole) {
      const form = new FormData();
      form.append("file", file);
      if (targetRole) form.append("targetRole", targetRole);

      try {
        const job = await api("/upload", { method: "POST", body: form });
        startPolling(job);
        return job;
      } catch (err) {
        // Already running: follow that job instead
        if (err.code === "ANALYSIS_IN_PROGRESS" && err.body?.job) {
          startPolling(err.body.job);
        }
        throw err;
      }
    },

    /** Called with the full analysis object when a job completes. */
    onComplete(callback) {
      listeners.complete.add(callback);

      if (pendingResult) {
        const result = pendingResult;
        pendingResult = null;
        safeCall(callback, result);
        if (card) card.link.hidden = true;
      }

      return () => listeners.complete.delete(callback);
    },

    /** Called with an error message when a job fails. */
    onFailed(callback) {
      listeners.failed.add(callback);

      if (pendingFailure) {
        const message = pendingFailure;
        pendingFailure = null;
        safeCall(callback, message);
      }

      return () => listeners.failed.delete(callback);
    },

    /** Called with the job while it is running (also on page load). */
    onProgress(callback) {
      listeners.progress.add(callback);
      if (activeJob) safeCall(callback, activeJob);
      return () => listeners.progress.delete(callback);
    },

    /** The running job, or null. */
    getActiveJob: () => activeJob,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();