/* supportWidgets.js: user-side messages inbox (the mail icon) and rating pop-ups.
   Add as the LAST script on every logged-in user page:
     <script src="../js/supportWidgets.js"></script>
   Needs a button with id="mailBtn" for the inbox (rating pop-ups work without it).
   Opt a page out of random rating pop-ups with <body data-sf-no-random-rating>. */
(function () {
  "use strict";

  if (window.__sfSupportWidgets) return;
  window.__sfSupportWidgets = true;

  const API = "/api/support";
  const UNREAD_POLL_MS = 30000;
  const THREAD_POLL_MS = 8000;

  const getToken = () => {
    try {
      return localStorage.getItem("sb-access-token");
    } catch (_) {
      return null;
    }
  };
  if (!getToken()) return; // not logged in

  const CATEGORIES = [
    { value: "general_inquiry", label: "General Inquiry" },
    { value: "technical_support", label: "Technical Support" },
    { value: "partnership_business", label: "Partnership/Business" },
    { value: "feature_suggestion", label: "Feature Suggestion" },
    { value: "feedback", label: "Feedback" },
  ];

  const STATUS_TEXT = { open: "Awaiting reply", answered: "Replied", closed: "Closed" };

  // Which feature a page belongs to, for contextual random prompts.
  const PAGE_FEATURE = {
    "dashboard.html": "dashboard",
    "careerdiscovery.html": "career_discovery",
    "applicationtracker.html": "application_tracker",
    "cvdashboard.html": "cv_analyzer",
    "interviewsimulator.html": "interview_simulator",
    "articulation.html": "articulation",
    "skillgapanalysis.html": "skill_gap",
    "careerpathfinder.html": "career_pathfinder",
    "studyhub.html": "study_hub",
  };

  const RATING_HINTS = ["Poor", "Could be better", "Good", "Great", "Excellent"];

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function ago(iso) {
    if (!iso) return "";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  }

  const clock = (iso) =>
    new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* empty body */
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status}).`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* =========================================================
     STYLES
     Dark mode: add your theme's dark selector to the second rule,
     or map the --sfm-* variables to your own variables.
  ========================================================= */

  const CSS = `
#mailBtn{position:relative}
.sfm-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ef4444;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center;pointer-events:none}
.sfm-badge[hidden]{display:none}
#mailBtn.sfm-ring svg{animation:sfm-ring .8s ease}
@keyframes sfm-ring{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}40%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(5deg)}}

.sfm-scope{--sfm-bg:#fff;--sfm-soft:#f1f5f9;--sfm-text:#0f172a;--sfm-muted:#64748b;--sfm-line:#e2e8f0;--sfm-brand:var(--primary,#2563eb)}
html[data-theme=dark] .sfm-scope,html.dark .sfm-scope,body.dark .sfm-scope,body.dark-mode .sfm-scope,body.dark-theme .sfm-scope,body[data-theme=dark] .sfm-scope{--sfm-bg:#0f172a;--sfm-soft:#1e293b;--sfm-text:#e2e8f0;--sfm-muted:#94a3b8;--sfm-line:#334155}

.sfm-overlay{position:fixed;inset:0;z-index:10000;display:flex;justify-content:flex-end;background:rgba(15,23,42,.45)}
.sfm-overlay[hidden]{display:none}
.sfm-panel{display:flex;flex-direction:column;width:min(440px,100%);height:100%;background:var(--sfm-bg);color:var(--sfm-text);font-family:inherit;box-shadow:-12px 0 40px rgba(0,0,0,.22);animation:sfm-in .22s ease}
@keyframes sfm-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
.sfm-head{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--sfm-line)}
.sfm-head h2{flex:1;margin:0;font-size:17px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfm-ib{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:inherit;font-size:18px;cursor:pointer}
.sfm-ib:hover{background:var(--sfm-soft)}
.sfm-ib[hidden]{display:none}
.sfm-view{flex:1;display:flex;flex-direction:column;min-height:0;padding:14px 16px;gap:10px}
.sfm-view[hidden]{display:none}
.sfm-primary{padding:10px 16px;border:0;border-radius:10px;background:var(--sfm-brand);color:#fff;font:600 14px/1.2 inherit;cursor:pointer}
.sfm-primary:disabled{opacity:.6;cursor:default}
.sfm-ib:focus-visible,.sfm-primary:focus-visible,.sfm-thread:focus-visible,.sfr-star:focus-visible{outline:2px solid var(--sfm-brand);outline-offset:2px}

.sfm-threads{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin:0 -6px;padding:0 6px}
.sfm-thread{position:relative;display:block;width:100%;padding:12px 38px 12px 12px;border:1px solid var(--sfm-line);border-radius:12px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.sfm-thread:hover{background:var(--sfm-soft)}
.sfm-thread.unread{border-color:var(--sfm-brand);background:color-mix(in srgb,var(--sfm-brand) 8%,transparent)}
.sfm-thread-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--sfm-muted)}
.sfm-thread-subject{margin:4px 0;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfm-thread-prev{font-size:13px;color:var(--sfm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfm-thread .sfm-count{position:absolute;top:12px;right:12px;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#ef4444;color:#fff;font:700 11px/20px system-ui,sans-serif;text-align:center}
.sfm-empty{margin:auto;padding:24px 8px;text-align:center;color:var(--sfm-muted);font-size:14px;line-height:1.5}

.sfm-chat-meta{font-size:12px;color:var(--sfm-muted)}
.sfm-msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:4px 2px}
.sfm-row{display:flex;flex-direction:column;align-items:flex-start}
.sfm-row.me{align-items:flex-end}
.sfm-from{margin:0 4px 3px;font-size:11px;font-weight:600;color:var(--sfm-muted)}
.sfm-bubble{max-width:84%;padding:9px 13px;border-radius:16px;background:var(--sfm-soft);line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}
.sfm-row.me .sfm-bubble{background:var(--sfm-brand);color:#fff;border-bottom-right-radius:4px}
.sfm-row:not(.me) .sfm-bubble{border-bottom-left-radius:4px}
.sfm-time{margin:3px 4px 0;font-size:11px;color:var(--sfm-muted)}
.sfm-note{padding:8px 10px;border-radius:10px;background:var(--sfm-soft);color:var(--sfm-muted);font-size:12px}
.sfm-composer{display:flex;gap:8px;align-items:flex-end;padding-top:6px;border-top:1px solid var(--sfm-line)}
.sfm-composer textarea,.sfm-view textarea,.sfm-view select,.sfr-card textarea{width:100%;padding:10px 12px;border:1px solid var(--sfm-line);border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:14px;resize:vertical;box-sizing:border-box}
.sfm-composer textarea{resize:none}
.sfm-view select option{color:#0f172a}
.sfm-label{font-size:13px;font-weight:600}
.sfm-err{min-height:18px;margin:0;color:#dc2626;font-size:13px}

.sfr-card{position:fixed;right:20px;bottom:20px;z-index:10001;width:min(340px,calc(100vw - 32px));padding:16px 18px 18px;border:1px solid var(--sfm-line);border-radius:16px;background:var(--sfm-bg);color:var(--sfm-text);font-family:inherit;box-shadow:0 18px 50px rgba(0,0,0,.25);animation:sfm-up .25s ease}
@keyframes sfm-up{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
.sfr-x{position:absolute;top:8px;right:8px;width:30px;height:30px;font-size:15px}
.sfr-title{margin:0 28px 10px 0;font-size:15px;font-weight:700;line-height:1.35}
.sfr-stars{display:flex;gap:4px}
.sfr-star{padding:0 2px;border:0;background:none;color:var(--sfm-line);font-size:30px;line-height:1;cursor:pointer;transition:color .12s}
.sfr-star.on{color:#f59e0b}
.sfr-hint{min-height:18px;margin:6px 0 0;font-size:12px;color:var(--sfm-muted)}
.sfr-more{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.sfr-more[hidden]{display:none}
.sfr-link{padding:0;border:0;background:none;color:var(--sfm-brand);font:600 13px/1.4 inherit;text-decoration:underline;cursor:pointer}

@media (prefers-reduced-motion:reduce){.sfm-panel,.sfr-card,#mailBtn.sfm-ring svg{animation:none}.sfr-star{transition:none}}
`;

  /* =========================================================
     INBOX
  ========================================================= */

  const state = {
    view: "list",
    threads: [],
    activeId: null,
    activeSubject: "",
    lastMessageId: null,
    unread: 0,
    open: false,
    threadTimer: null,
  };

  let mailBtn = null;
  let badge = null;
  let overlay = null;
  let el = {};

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildPanel() {
    overlay = document.createElement("div");
    overlay.className = "sfm-overlay sfm-scope";
    overlay.hidden = true;
    overlay.innerHTML = `
      <aside class="sfm-panel" role="dialog" aria-modal="true" aria-labelledby="sfmTitle">
        <header class="sfm-head">
          <button class="sfm-ib" id="sfmBack" type="button" aria-label="Back to messages" hidden>&#8249;</button>
          <h2 id="sfmTitle">Messages</h2>
          <button class="sfm-ib" id="sfmClose" type="button" aria-label="Close messages">&#10005;</button>
        </header>

        <section class="sfm-view" id="sfmList">
          <button class="sfm-primary" id="sfmNew" type="button">New message</button>
          <div class="sfm-threads" id="sfmThreads"></div>
        </section>

        <section class="sfm-view" id="sfmChat" hidden>
          <div class="sfm-chat-meta" id="sfmChatMeta"></div>
          <div class="sfm-msgs" id="sfmMsgs" aria-live="polite"></div>
          <p class="sfm-err" id="sfmChatErr" role="alert"></p>
          <div class="sfm-composer">
            <textarea id="sfmReply" rows="2" maxlength="4000" placeholder="Write a reply" aria-label="Your reply"></textarea>
            <button class="sfm-primary" id="sfmSend" type="button">Send</button>
          </div>
        </section>

        <section class="sfm-view" id="sfmNewView" hidden>
          <label class="sfm-label" for="sfmCat">What is this about?</label>
          <select id="sfmCat">
            ${CATEGORIES.map((c) => `<option value="${c.value}">${esc(c.label)}</option>`).join("")}
          </select>
          <label class="sfm-label" for="sfmText">Your message</label>
          <textarea id="sfmText" rows="8" maxlength="4000" placeholder="Tell us what you need or what you think."></textarea>
          <p class="sfm-err" id="sfmNewErr" role="alert"></p>
          <button class="sfm-primary" id="sfmCreate" type="button">Send message</button>
        </section>
      </aside>`;
    document.body.appendChild(overlay);

    const $ = (id) => overlay.querySelector(`#${id}`);
    el = {
      title: $("sfmTitle"),
      back: $("sfmBack"),
      close: $("sfmClose"),
      list: $("sfmList"),
      chat: $("sfmChat"),
      newView: $("sfmNewView"),
      newBtn: $("sfmNew"),
      threads: $("sfmThreads"),
      chatMeta: $("sfmChatMeta"),
      msgs: $("sfmMsgs"),
      chatErr: $("sfmChatErr"),
      reply: $("sfmReply"),
      send: $("sfmSend"),
      cat: $("sfmCat"),
      text: $("sfmText"),
      newErr: $("sfmNewErr"),
      create: $("sfmCreate"),
    };

    el.close.addEventListener("click", closePanel);
    el.back.addEventListener("click", () => showList());
    el.newBtn.addEventListener("click", () => showView("new"));
    el.send.addEventListener("click", sendReply);
    el.create.addEventListener("click", createThread);
    el.reply.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendReply();
      }
    });
    el.threads.addEventListener("click", (event) => {
      const item = event.target.closest("[data-id]");
      if (item) openThread(item.dataset.id);
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePanel();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.open) closePanel();
    });
  }

  function ensureBadge() {
    mailBtn = document.getElementById("mailBtn");
    if (!mailBtn) return;
    badge = document.createElement("span");
    badge.className = "sfm-badge";
    badge.hidden = true;
    mailBtn.appendChild(badge);
    mailBtn.setAttribute("aria-label", "Open messages");

    // Capture phase on document, so this wins over any older #mailBtn handler.
    document.addEventListener(
      "click",
      (event) => {
        if (!event.target.closest("#mailBtn")) return;
        event.preventDefault();
        event.stopPropagation();
        openPanel();
      },
      true
    );
  }

  function setBadge(count) {
    const previous = state.unread;
    state.unread = count;
    if (!badge) return;

    badge.textContent = count > 9 ? "9+" : String(count);
    badge.hidden = count <= 0;
    mailBtn.setAttribute("aria-label", count > 0 ? `Open messages, ${count} unread` : "Open messages");

    if (count > previous) {
      mailBtn.classList.remove("sfm-ring");
      void mailBtn.offsetWidth;
      mailBtn.classList.add("sfm-ring");
    }
  }

  async function refreshUnread() {
    if (document.hidden) return;
    try {
      const { unread } = await api("/unread");
      const changed = unread !== state.unread;
      setBadge(unread);
      if (changed && state.open && state.view === "list") loadThreads();
    } catch (_) {
      /* stay quiet: the badge just keeps its last value */
    }
  }

  /* ---------- views ---------- */

  function showView(name) {
    state.view = name;
    el.list.hidden = name !== "list";
    el.chat.hidden = name !== "chat";
    el.newView.hidden = name !== "new";
    el.back.hidden = name === "list";
    el.title.textContent =
      name === "list" ? "Messages" : name === "new" ? "New message" : state.activeSubject || "Conversation";
    if (name !== "chat") stopThreadPoll();
    if (name === "new") {
      el.newErr.textContent = "";
      el.text.focus();
    }
  }

  function showList() {
    state.activeId = null;
    showView("list");
    loadThreads();
    refreshUnread();
  }

  function openPanel(view = "list", threadId = null) {
    state.open = true;
    overlay.hidden = false;
    if (view === "chat" && threadId) openThread(threadId);
    else if (view === "new") showView("new");
    else showList();
    el.close.focus();
  }

  function closePanel() {
    state.open = false;
    overlay.hidden = true;
    stopThreadPoll();
    refreshUnread();
    if (mailBtn) mailBtn.focus();
  }

  /* ---------- thread list ---------- */

  function renderThreads() {
    if (!state.threads.length) {
      el.threads.innerHTML = `<p class="sfm-empty">No messages yet.<br />Questions, ideas or feedback? Choose New message and we'll reply here.</p>`;
      return;
    }

    el.threads.innerHTML = state.threads
      .map((t) => {
        const prefix = t.lastSender === "admin" ? "Support: " : "You: ";
        return `
          <button type="button" class="sfm-thread ${t.unread ? "unread" : ""}" data-id="${esc(t.id)}">
            <div class="sfm-thread-top"><span>${esc(t.categoryLabel)}</span><span>${esc(ago(t.lastMessageAt))}</span></div>
            <div class="sfm-thread-subject">${esc(t.subject)}</div>
            <div class="sfm-thread-prev">${esc(prefix + (t.preview || ""))}</div>
            ${t.unread ? `<span class="sfm-count" aria-label="${t.unread} unread">${t.unread}</span>` : ""}
          </button>`;
      })
      .join("");
  }

  async function loadThreads() {
    try {
      const { threads } = await api("/threads");
      state.threads = threads;
      renderThreads();
    } catch (err) {
      el.threads.innerHTML = `<p class="sfm-empty">We couldn't load your messages. ${esc(err.message)}</p>`;
    }
  }

  /* ---------- chat ---------- */

  function stopThreadPoll() {
    clearInterval(state.threadTimer);
    state.threadTimer = null;
  }

  function renderMessages(messages, forceScroll) {
    const nearBottom = el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight < 80;

    el.msgs.innerHTML = messages
      .map((m) => {
        const mine = m.sender === "user";
        return `
          <div class="sfm-row ${mine ? "me" : ""}">
            ${mine ? "" : `<span class="sfm-from">Support Team</span>`}
            <div class="sfm-bubble">${esc(m.body)}</div>
            <span class="sfm-time">${esc(clock(m.createdAt))}</span>
          </div>`;
      })
      .join("");

    if (forceScroll || nearBottom) el.msgs.scrollTop = el.msgs.scrollHeight;
  }

  async function openThread(id, { background = false } = {}) {
    try {
      const { thread, messages } = await api(`/threads/${id}`);
      const lastId = messages.length ? messages[messages.length - 1].id : null;
      const switched = state.activeId !== id || state.view !== "chat";
      const changed = switched || state.lastMessageId !== lastId;

      state.activeId = id;
      state.activeSubject = thread.subject;
      state.lastMessageId = lastId;

      if (switched) showView("chat");

      el.chatMeta.innerHTML = `${esc(thread.categoryLabel)} &middot; ${esc(STATUS_TEXT[thread.status] || thread.status)}`;
      if (changed) {
        renderMessages(messages, switched);
        if (thread.status === "closed") {
          el.msgs.insertAdjacentHTML(
            "beforeend",
            `<div class="sfm-note">This conversation was closed. Send a message if you still need help and we'll reopen it.</div>`
          );
        }
      }

      if (!background) {
        stopThreadPoll();
        state.threadTimer = setInterval(() => {
          if (!document.hidden && state.view === "chat" && state.activeId) {
            openThread(state.activeId, { background: true });
          }
        }, THREAD_POLL_MS);
        el.reply.focus();
      }

      refreshUnread();
    } catch (err) {
      if (!background) {
        showList();
        el.threads.innerHTML = `<p class="sfm-empty">We couldn't open that conversation. ${esc(err.message)}</p>`;
      }
    }
  }

  async function sendReply() {
    const body = el.reply.value.trim();
    if (!body || !state.activeId) return;

    el.send.disabled = true;
    el.chatErr.textContent = "";

    try {
      await api(`/threads/${state.activeId}/messages`, { method: "POST", body: { body } });
      el.reply.value = "";
      state.lastMessageId = null; // force a re-render
      await openThread(state.activeId, { background: true });
    } catch (err) {
      el.chatErr.textContent = err.message;
    } finally {
      el.send.disabled = false;
      el.reply.focus();
    }
  }

  async function createThread() {
    const message = el.text.value.trim();
    if (!message) {
      el.newErr.textContent = "Write a message before sending.";
      return;
    }

    el.create.disabled = true;
    el.newErr.textContent = "";

    try {
      const { thread } = await api("/threads", {
        method: "POST",
        body: { category: el.cat.value, message },
      });
      el.text.value = "";
      await openThread(thread.id);
    } catch (err) {
      el.newErr.textContent = err.message;
    } finally {
      el.create.disabled = false;
    }
  }

  /* =========================================================
     RATING PROMPTS
  ========================================================= */

  let ratingCard = null;

  function currentPageFeature() {
    const file = (location.pathname.split("/").pop() || "").toLowerCase();
    return PAGE_FEATURE[file] || "general";
  }

  async function maybePrompt(feature, trigger) {
    if (ratingCard || state.open) return false;
    try {
      const res = await api("/ratings/check", { method: "POST", body: { feature, trigger } });
      if (!res.show) return false;
      showRatingCard(res);
      return true;
    } catch (_) {
      return false;
    }
  }

  function closeRating() {
    if (ratingCard) ratingCard.remove();
    ratingCard = null;
  }

  function showRatingCard(prompt) {
    const card = document.createElement("div");
    card.className = "sfr-card sfm-scope";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Rate your experience");

    const title =
      prompt.feature === "general"
        ? "How is ScientiaForge working for you?"
        : prompt.trigger === "after_use"
        ? `How was the ${prompt.featureLabel}?`
        : `How are you finding the ${prompt.featureLabel}?`;

    card.innerHTML = `
      <button class="sfm-ib sfr-x" type="button" aria-label="Not now">&#10005;</button>
      <p class="sfr-title">${esc(title)}</p>
      <div class="sfr-stars" role="radiogroup" aria-label="Rating out of 5">
        ${[1, 2, 3, 4, 5]
          .map((n) => `<button type="button" class="sfr-star" role="radio" aria-checked="false" aria-label="${n} out of 5" data-v="${n}">&#9733;</button>`)
          .join("")}
      </div>
      <p class="sfr-hint">Select a star to rate</p>
      <div class="sfr-more" hidden>
        <textarea rows="3" maxlength="1000" placeholder="Anything we could do better? (optional)" aria-label="Comment"></textarea>
        <button class="sfm-primary" type="button" data-submit>Send rating</button>
      </div>`;

    document.body.appendChild(card);
    ratingCard = card;

    const starBtns = [...card.querySelectorAll(".sfr-star")];
    const hint = card.querySelector(".sfr-hint");
    const more = card.querySelector(".sfr-more");
    let value = 0;

    const paint = (n) => starBtns.forEach((b, i) => b.classList.toggle("on", i < n));

    starBtns.forEach((btn) => {
      const n = Number(btn.dataset.v);
      btn.addEventListener("mouseenter", () => paint(n));
      btn.addEventListener("mouseleave", () => paint(value));
      btn.addEventListener("click", () => {
        value = n;
        paint(n);
        starBtns.forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.v) === n)));
        hint.textContent = RATING_HINTS[n - 1];
        more.hidden = false;
      });
    });

    card.querySelector(".sfr-x").addEventListener("click", () => {
      api("/ratings/dismiss", { method: "POST", body: { prompt_id: prompt.promptId } }).catch(() => {});
      closeRating();
    });

    card.querySelector("[data-submit]").addEventListener("click", async (event) => {
      if (!value) return;
      const submit = event.currentTarget;
      submit.disabled = true;

      try {
        await api("/ratings", {
          method: "POST",
          body: {
            feature: prompt.feature,
            rating: value,
            comment: card.querySelector("textarea").value.trim(),
            trigger: prompt.trigger,
            prompt_id: prompt.promptId,
            page: (location.pathname.split("/").pop() || "").slice(0, 100),
          },
        });

        card.innerHTML = `
          <p class="sfr-title">Thanks for rating us.</p>
          <p class="sfr-hint">Your feedback helps us improve ScientiaForge.</p>
          ${value <= 2 ? `<button type="button" class="sfr-link" data-more>Tell us what went wrong</button>` : ""}`;

        card.querySelector("[data-more]")?.addEventListener("click", () => {
          closeRating();
          openPanel("new");
          el.cat.value = "feedback";
        });

        setTimeout(closeRating, value <= 2 ? 9000 : 2600);
      } catch (err) {
        submit.disabled = false;
        hint.textContent = err.message;
      }
    });
  }

  function scheduleRandomPrompt() {
    if (document.body.hasAttribute("data-sf-no-random-rating")) return;
    const delay = 30000 + Math.random() * 90000;
    setTimeout(() => {
      if (!document.hidden) maybePrompt(currentPageFeature(), "random");
    }, delay);
  }

  /* =========================================================
     INIT + PUBLIC API
  ========================================================= */

  window.SFMessages = {
    open: () => openPanel("list"),
    openNew: () => openPanel("new"),
    openThread: (id) => openPanel("chat", id),
    refresh: refreshUnread,
  };

  window.SFRating = {
    // Call after a key feature finishes, e.g. SFRating.afterUse("cv_analyzer").
    afterUse: (feature) => setTimeout(() => maybePrompt(feature, "after_use"), 1500),
    prompt: maybePrompt,
  };

  function init() {
    injectStyles();
    buildPanel();
    ensureBadge();
    refreshUnread();
    setInterval(refreshUnread, UNREAD_POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshUnread();
    });
    scheduleRandomPrompt();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
