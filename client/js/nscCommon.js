/* ScientiaForge · Study Hub · shared helpers for the NSC pages (window.NSC). */
(function () {
  "use strict";

  const API = typeof API_BASE !== "undefined" ? API_BASE : "/api";
  const BASE = `${API}/study-hub/nsc`;

  /* ---------------------------------------------------------------- auth
     Uses, in order: window.getAuthHeaders() (define it in auth.js if you have
     one), a Supabase client on window, or a token saved in localStorage. */
  async function authHeaders() {
    try {
      if (typeof window.getAuthHeaders === "function") {
        const h = await window.getAuthHeaders();
        if (h && Object.keys(h).length) return h;
      }
      const client =
        window.supabaseClient || window.sbClient || (window.supabase && window.supabase.auth ? window.supabase : null);
      if (client && client.auth && typeof client.auth.getSession === "function") {
        const { data } = await client.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (token) return { Authorization: `Bearer ${token}` };
      }
      for (const key of ["token", "access_token", "accessToken", "authToken", "sb_token"]) {
        const v = localStorage.getItem(key);
        if (v) return { Authorization: `Bearer ${v.replace(/^"|"$/g, "")}` };
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (/^sb-.+-auth-token$/.test(key)) {
          const v = JSON.parse(localStorage.getItem(key) || "null");
          const token = v && (v.access_token || (v.currentSession && v.currentSession.access_token));
          if (token) return { Authorization: `Bearer ${token}` };
        }
      }
    } catch (err) {
      console.warn("[NSC] could not read auth token:", err);
    }
    return {};
  }

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
      const err = new Error(
        res.status === 401 ? "Please sign in to use Active Recall." : data.error || `Request failed (${res.status})`
      );
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ---------------------------------------------------------------- output */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(value) {
    return value === null || value === undefined ? "" : String(value).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  /** Only http(s) links are ever written into href attributes. */
  function safeUrl(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#";
    } catch {
      return "#";
    }
  }

  function icons(root) {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons(root ? { root } : undefined);
    }
  }

  const dateFmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  function formatDate(iso) {
    return iso ? dateFmt.format(new Date(iso)) : "";
  }

  function paperName(p) {
    return p ? `${p.subject} Paper ${p.paper_number}` : "Past paper";
  }

  function sessionLabel(p) {
    return p ? `${p.exam_session} ${p.year}` : "";
  }

  function formatMarks(n) {
    const v = Number(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /* ---------------------------------------------------------------- sidebar
     Same behaviour as the Study Hub page; does nothing on pages without one. */
  function initSidebar() {
    const menuBtn = document.getElementById("menuBtn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (!menuBtn || !sidebar) return;

    const open = () => {
      sidebar.classList.add("open");
      overlay && overlay.classList.add("visible");
      menuBtn.setAttribute("aria-expanded", "true");
      document.body.classList.add("no-scroll");
    };
    const close = () => {
      sidebar.classList.remove("open");
      overlay && overlay.classList.remove("visible");
      menuBtn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("no-scroll");
    };
    menuBtn.addEventListener("click", () => (sidebar.classList.contains("open") ? close() : open()));
    overlay && overlay.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) close();
    });
    sidebar.querySelectorAll(".nav-item").forEach((link) =>
      link.addEventListener("click", () => {
        if (window.innerWidth <= 768) close();
      })
    );
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) close();
    });
  }

  const UNAVAILABLE = {
    scanned: {
      short: "Download only: scanned paper",
      long: "This paper was published as a scanned image, so its questions can't be read automatically. Download it and work through it on paper.",
    },
    no_memo: {
      short: "Download only: no memo published",
      long: "No usable memorandum was published with this paper, so answers can't be checked. You can still download the paper.",
    },
    few_questions: {
      short: "Download only for now",
      long: "Too few of its questions could be matched to the memo reliably (common with equations and diagrams). You can still download both files.",
    },
  };
  function unavailableText(reason, kind = "short") {
    return (UNAVAILABLE[reason] || UNAVAILABLE.few_questions)[kind];
  }

  window.NSC = {
    unavailableText, API, BASE, api, authHeaders, esc, safeUrl, icons, formatDate, paperName, sessionLabel, formatMarks, param, initSidebar };
})();
