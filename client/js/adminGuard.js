// adminGuard.js — include on every admin page, right after the Chart.js/
// lucide CDN tags and BEFORE the page's own admin*.js script. Confirms this
// is a logged-in admin account (redirecting away if not) and exposes small
// shared helpers (AdminAPI, showToast, openModal/closeModal, format
// helpers) that adminDashboard.js / adminUsers.js / adminSettings.js all
// build on, so none of them duplicate auth-header or formatting logic.

const ADMIN_API_BASE = "http://localhost:5001/api";

/* =========================================================
   PAGE GUARD
========================================================= */

async function guardAdminPage() {
  const token = localStorage.getItem("sb-access-token");

  if (!token) {
    window.location.href = "LogIn.html";
    return null;
  }

  try {
    const res = await fetch(`${ADMIN_API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      window.location.href = "LogIn.html";
      return null;
    }

    const me = await res.json();

    if (!me.isAdmin) {
      // Logged in, but not an admin — bounce back to the normal app.
      // Fails closed: no admin data is ever fetched before this resolves.
      window.location.href = "Dashboard.html";
      return null;
    }

    document.querySelectorAll("[data-admin-name]").forEach((el) => {
      el.textContent = me.firstName || me.email;
    });
    document.querySelectorAll("[data-admin-email]").forEach((el) => {
      el.textContent = me.email;
    });
    document.body.classList.remove("admin-auth-pending");

    return me;
  } catch (err) {
    console.error("Admin auth check failed:", err);
    window.location.href = "LogIn.html";
    return null;
  }
}

/* =========================================================
   API WRAPPER — attaches the Bearer token to every call and
   normalizes error handling so page scripts can just await it.
========================================================= */

const AdminAPI = {
  async request(path, options = {}) {
    const token = localStorage.getItem("sb-access-token");

    const res = await fetch(`${ADMIN_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : null;

    if (!res.ok) {
      throw new Error((data && data.error) || `Request failed (${res.status}).`);
    }

    return data;
  },

  get(path) {
    return this.request(path, { method: "GET" });
  },

  post(path, body) {
    return this.request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
  },

  put(path, body) {
    return this.request(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
  },
};

/* =========================================================
   TOASTS
========================================================= */

function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    document.body.appendChild(host);
  }
  return host;
}

function showToast(message, type = "success") {
  const host = ensureToastHost();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  host.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.3s ease";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

/* =========================================================
   MODAL
========================================================= */

function openModal(overlayEl) {
  if (overlayEl) overlayEl.removeAttribute("hidden");
}

function closeModal(overlayEl) {
  if (overlayEl) overlayEl.setAttribute("hidden", "");
}

/* =========================================================
   FORMAT HELPERS
========================================================= */

function initials(firstName, lastName, email) {
  const a = (firstName || "").trim()[0];
  const b = (lastName || "").trim()[0];
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();
  return (email || "?")[0].toUpperCase();
}

function formatRelativeTime(isoString) {
  if (!isoString) return "Never";
  const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Eased count-up animation for KPI numbers.
function animateCount(el, target, duration = 900) {
  if (!el) return;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/* =========================================================
   SHARED PROMOTE/DEMOTE CONFIRM MODAL
   Used by both AdminUsers.html and AdminSettings.html so the confirm
   step (and its copy) only needs to exist in one place. Each page
   includes its own #confirmModal/#confirmModalTitle/#confirmModalBody/
   #confirmModalConfirm/#confirmModalCancel markup and calls
   wireConfirmModal(onSuccess) once on load; row buttons then call
   requestRoleChange(id, email, "promote" | "demote").
========================================================= */

let __pendingRoleAction = null;
let __onRoleActionSuccess = null;

function requestRoleChange(id, email, type) {
  __pendingRoleAction = { id, type };

  const overlay = document.getElementById("confirmModal");
  const title = document.getElementById("confirmModalTitle");
  const body = document.getElementById("confirmModalBody");
  const confirmBtn = document.getElementById("confirmModalConfirm");
  if (!overlay || !title || !body || !confirmBtn) return;

  if (type === "promote") {
    title.textContent = "Make this user an admin?";
    body.textContent = `${email} will get full admin access, and we'll email them a secure link to set their admin password. This can be reversed at any time.`;
    confirmBtn.textContent = "Make admin";
    confirmBtn.className = "modal-btn-confirm";
  } else {
    title.textContent = "Revoke admin access?";
    body.textContent = `${email} will lose admin access immediately and go back to a regular account.`;
    confirmBtn.textContent = "Revoke access";
    confirmBtn.className = "modal-btn-confirm danger";
  }

  openModal(overlay);
}

async function confirmPendingRoleChange() {
  if (!__pendingRoleAction) return;
  const { id, type } = __pendingRoleAction;
  const confirmBtn = document.getElementById("confirmModalConfirm");
  const originalLabel = confirmBtn.textContent;
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Working\u2026";

  try {
    const result = await AdminAPI.post(`/admin/users/${id}/${type}`);
    showToast(result.message, "success");
    closeModal(document.getElementById("confirmModal"));
    if (typeof __onRoleActionSuccess === "function") __onRoleActionSuccess();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = originalLabel;
    __pendingRoleAction = null;
  }
}

function wireConfirmModal(onSuccess) {
  __onRoleActionSuccess = onSuccess;
  const overlay = document.getElementById("confirmModal");
  document.getElementById("confirmModalCancel")?.addEventListener("click", () => closeModal(overlay));
  document.getElementById("confirmModalConfirm")?.addEventListener("click", confirmPendingRoleChange);
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal(overlay);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/* =========================================================
   SHARED AUDIT-ENTRY RENDERING
   Used by the dashboard's "Live activity" feed and the Settings page's
   audit log, so one entry looks the same wherever it's shown.
========================================================= */
const ACTION_META = {
  sign_up: { icon: "user-plus", color: "green", label: "signed up" },
  sign_in: { icon: "log-in", color: "blue", label: "signed in" },
  sign_out: { icon: "log-out", color: "blue", label: "signed out" },
  profile_updated: { icon: "user", color: "blue", label: "updated their profile" },
  cv_uploaded: { icon: "file-text", color: "blue", label: "uploaded a CV" },
  cv_analysed: { icon: "file-search", color: "green", label: "had a CV analysed" },
  interview_started: { icon: "mic", color: "orange", label: "started a mock interview" },
  interview_completed: { icon: "check-circle", color: "green", label: "completed a mock interview" },
  skill_gap_run: { icon: "bar-chart-3", color: "blue", label: "ran a skill-gap analysis" },
  payment_succeeded: { icon: "credit-card", color: "green", label: "made a payment" },
  payment_failed: { icon: "ban", color: "red", label: "had a payment fail" },
  subscription_created: { icon: "badge-check", color: "green", label: "started a subscription" },
  subscription_cancelled: { icon: "x", color: "red", label: "cancelled their subscription" },
  admin_promote: { icon: "shield-plus", color: "purple", label: "was promoted to admin" },
  admin_demote: { icon: "shield-minus", color: "red", label: "had admin access revoked" },
  admin_settings_update: { icon: "settings", color: "purple", label: "updated site settings" },
};

function activityItemHtml(entry) {
  const meta = ACTION_META[entry.action] || { icon: "activity", color: "blue", label: entry.action };
  const who = entry.userEmail || "Someone";
  return `
    <div class="activity-item">
      <div class="activity-icon ${meta.color}"><i data-lucide="${meta.icon}"></i></div>
      <div class="activity-text">
        <div class="primary">${escapeHtml(who)} ${escapeHtml(meta.label)}</div>
        ${entry.description ? `<div class="secondary">${escapeHtml(entry.description)}</div>` : ""}
      </div>
      <div class="activity-time">${formatRelativeTime(entry.createdAt)}</div>
    </div>
  `;
}

document.body.classList.add("admin-auth-pending");
const adminReady = guardAdminPage();