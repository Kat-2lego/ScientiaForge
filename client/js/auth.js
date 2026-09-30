// auth.js — shared across all pages with a sidebar/logout link

const API_BASE = "http://localhost:5001/api";

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

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-label="Log Out"]').forEach((link) => {
    link.addEventListener("click", handleLogout);
  });
});