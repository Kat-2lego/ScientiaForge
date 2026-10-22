// adminSettings.js — powers AdminSettings.html. Requires adminGuard.js
// (AdminAPI, showToast, initials, formatDate, formatRelativeTime,
// escapeHtml, activityItemHtml, requestRoleChange, wireConfirmModal).

let auditPage = 1;
const AUDIT_PAGE_SIZE = 15;
let auditActionFilter = "";

/* =========================================================
   MANAGE ADMINS
========================================================= */

function adminRow(u) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email.split("@")[0];
  const since = u.roleUpdatedAt ? `Admin since ${formatDate(u.roleUpdatedAt)}` : `Joined ${formatDate(u.createdAt)}`;

  return `
    <div class="admin-list-row">
      <div class="cell-user">
        <div class="cell-avatar">${initials(u.firstName, u.lastName, u.email)}</div>
        <div>
          <div class="cell-user-name">${escapeHtml(name)}</div>
          <div class="cell-user-email">${escapeHtml(u.email)} &middot; ${since}</div>
        </div>
      </div>
      <button class="btn-chip demote" data-id="${u.id}" data-email="${escapeHtml(u.email)}">Revoke</button>
    </div>
  `;
}

async function loadAdmins() {
  const container = document.getElementById("adminsList");
  if (!container) return;
  container.innerHTML = '<div class="table-empty">Loading\u2026</div>';

  try {
    const result = await AdminAPI.get("/admin/users?role=admin&pageSize=100");
    container.innerHTML = result.users.length
      ? result.users.map(adminRow).join("")
      : '<div class="table-empty">No admins found.</div>';
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load admins: ${escapeHtml(err.message)}</div>`;
  }
}

/* =========================================================
   SITE SETTINGS TOGGLES
========================================================= */

async function loadSiteSettings() {
  try {
    const settings = await AdminAPI.get("/admin/settings");
    const maintenanceEl = document.getElementById("maintenanceModeToggle");
    const signupsEl = document.getElementById("allowSignupsToggle");
    if (maintenanceEl) maintenanceEl.checked = settings.maintenanceMode;
    if (signupsEl) signupsEl.checked = settings.allowNewSignups;
  } catch (err) {
    showToast("Could not load site settings.", "error");
  }
}

function wireSettingToggle(checkboxId, apiKey) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;

  checkbox.addEventListener("change", async () => {
    const nextValue = checkbox.checked;
    checkbox.disabled = true;

    try {
      await AdminAPI.put("/admin/settings", { [apiKey]: nextValue });
      showToast("Setting saved.", "success");
    } catch (err) {
      checkbox.checked = !nextValue; // revert on failure
      showToast(err.message, "error");
    } finally {
      checkbox.disabled = false;
    }
  });
}

/* =========================================================
   AUDIT LOG
========================================================= */

async function loadAuditLog() {
  const container = document.getElementById("auditLogList");
  const infoEl = document.getElementById("auditPaginationInfo");
  const prevBtn = document.getElementById("auditPrevBtn");
  const nextBtn = document.getElementById("auditNextBtn");
  if (!container) return;

  container.innerHTML = '<div class="table-empty">Loading\u2026</div>';

  try {
    const params = new URLSearchParams({ page: String(auditPage), pageSize: String(AUDIT_PAGE_SIZE) });
    if (auditActionFilter) params.set("action", auditActionFilter);

    const result = await AdminAPI.get(`/admin/audit-log?${params.toString()}`);

    if (result.unavailable) {
      container.innerHTML = `<div class="table-empty">${escapeHtml(result.note || "The audit log isn't available yet.")}</div>`;
      if (infoEl) infoEl.textContent = "";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    container.innerHTML = result.entries.length
      ? result.entries.map(activityItemHtml).join("")
      : '<div class="table-empty">No matching audit entries.</div>';
    lucide.createIcons();

    const totalPages = Math.max(1, Math.ceil(result.total / AUDIT_PAGE_SIZE));
    if (infoEl) infoEl.textContent = `Page ${result.page} of ${totalPages} \u00b7 ${result.total} entries`;
    if (prevBtn) prevBtn.disabled = auditPage <= 1;
    if (nextBtn) nextBtn.disabled = auditPage >= totalPages;
  } catch (err) {
    container.innerHTML = `<div class="table-empty">Could not load the audit log: ${escapeHtml(err.message)}</div>`;
  }
}

/* =========================================================
   INIT
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();

  const me = await adminReady;
  if (!me) return; // adminGuard.js already redirected away

  loadAdmins();
  loadSiteSettings();
  loadAuditLog();

  wireSettingToggle("maintenanceModeToggle", "maintenanceMode");
  wireSettingToggle("allowSignupsToggle", "allowNewSignups");

  document.getElementById("adminsList")?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-id]");
    if (!btn) return;
    requestRoleChange(btn.dataset.id, btn.dataset.email, "demote");
  });

  wireConfirmModal(loadAdmins);

  const auditFilterSelect = document.getElementById("auditActionFilter");
  if (auditFilterSelect) {
    auditFilterSelect.addEventListener("change", () => {
      auditActionFilter = auditFilterSelect.value;
      auditPage = 1;
      loadAuditLog();
    });
  }

  document.getElementById("auditPrevBtn")?.addEventListener("click", () => {
    if (auditPage > 1) {
      auditPage -= 1;
      loadAuditLog();
    }
  });

  document.getElementById("auditNextBtn")?.addEventListener("click", () => {
    auditPage += 1;
    loadAuditLog();
  });
});