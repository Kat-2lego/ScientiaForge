// auth.js — shared across all pages with a sidebar/logout link

const API_BASE = "/api";

async function handleLogout(event) {
  if (event) event.preventDefault();

  const token = localStorage.getItem("sb-access-token");

  try {
    if (token) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch (err) {
    console.warn("Logout request failed, clearing session locally anyway:", err);
  } finally {
    localStorage.removeItem("sb-access-token");
    window.location.href = "LogIn.html";
  }
}

window.getAuthHeaders = function getAuthHeaders() {
  const token = localStorage.getItem("sb-access-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/* =========================================================
   ACTIVITY HEARTBEAT
   Pings the server every 60s while this tab is the active one, so the
   admin dashboard's "online now" count and average session length stay
   accurate. Paused via the Page Visibility API when the tab is hidden,
   so switching away doesn't inflate "online" numbers.
========================================================= */

let heartbeatTimer = null;

async function sendHeartbeat() {
  const token = localStorage.getItem("sb-access-token");
  if (!token || document.hidden) return;

  try {
    await fetch(`${API_BASE}/activity/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    // Fire-and-forget — a missed heartbeat just means one fewer data point.
  }
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 60 * 1000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) sendHeartbeat();
});

/* =========================================================
   ADMIN NAV LINK
   Reveals any element marked [data-admin-only] (the "Admin Panel"
   sidebar link on Dashboard.html) once we've confirmed this account
   has the admin role. Safe no-op on pages with no such element, and
   fails closed (stays hidden) if the check can't be completed.
========================================================= */

async function revealAdminLinksIfAdmin() {
  const token = localStorage.getItem("sb-access-token");
  const adminLinks = document.querySelectorAll("[data-admin-only]");
  if (!token || adminLinks.length === 0) return;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const { isAdmin } = await res.json();
    if (isAdmin) {
      adminLinks.forEach((el) => { el.style.display = ""; });
    }
  } catch (err) {
    // Leave the admin link hidden on failure.
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-label="Log Out"]').forEach((link) => {
    link.addEventListener("click", handleLogout);
  });

  startHeartbeat();
  revealAdminLinksIfAdmin();
});