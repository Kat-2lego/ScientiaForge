// adminUsers.js — powers AdminUsers.html. Requires adminGuard.js to already
// be loaded on the page (AdminAPI, showToast, openModal/closeModal, initials,
// formatRelativeTime, formatDate).

const PAGE_SIZE = 20;

let currentPage = 1;
let currentSearch = "";
let currentRoleFilter = "";
let searchDebounceTimer = null;

/* =========================================================
   HELPERS
========================================================= */

function detailRow(label, valueHtml) {
  return `<div class="kv-row"><span class="kv-label">${escapeHtml(label)}</span><span class="kv-value">${valueHtml}</span></div>`;
}

function onlineStatusHtml(online, lastSeenAt) {
  return `<span class="online-status ${online ? "online" : ""}"><span class="dot"></span>${
    online ? "Online now" : formatRelativeTime(lastSeenAt)
  }</span>`;
}

/* =========================================================
   TABLE RENDERING
========================================================= */

function userRow(u) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email.split("@")[0];

  return `
    <tr>
      <td>
        <div class="cell-user">
          <div class="cell-avatar">${initials(u.firstName, u.lastName, u.email)}</div>
          <div>
            <div class="cell-user-name">${escapeHtml(name)}</div>
            <div class="cell-user-email">${escapeHtml(u.email)}</div>
          </div>
        </div>
      </td>
      <td><span class="role-pill ${u.role === "admin" ? "admin" : "user"}">${u.role === "admin" ? "Admin" : "User"}</span></td>
      <td>${formatDate(u.createdAt)}</td>
      <td>${onlineStatusHtml(u.online, u.lastSeenAt)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-chip" data-action="view" data-id="${u.id}">View</button>
          ${
            u.role === "admin"
              ? `<button class="btn-chip demote" data-action="demote" data-id="${u.id}" data-email="${escapeHtml(u.email)}">Revoke admin</button>`
              : `<button class="btn-chip promote" data-action="promote" data-id="${u.id}" data-email="${escapeHtml(u.email)}">Make admin</button>`
          }
        </div>
      </td>
    </tr>
  `;
}

function renderPagination(total, page, pageSize) {
  const info = document.getElementById("paginationInfo");
  const controls = document.getElementById("paginationControls");
  if (!info || !controls) return;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  info.textContent = `${from}\u2013${to} of ${total} user${total === 1 ? "" : "s"}`;
  controls.innerHTML = `
    <button data-page="${page - 1}" ${page <= 1 ? "disabled" : ""} aria-label="Previous page"><i data-lucide="chevron-left"></i></button>
    <button data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""} aria-label="Next page"><i data-lucide="chevron-right"></i></button>
  `;
  lucide.createIcons();
}

async function loadUsers() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Loading users\u2026</td></tr>`;

  try {
    const params = new URLSearchParams({ page: String(currentPage), pageSize: String(PAGE_SIZE) });
    if (currentSearch) params.set("search", currentSearch);
    if (currentRoleFilter) params.set("role", currentRoleFilter);

    const result = await AdminAPI.get(`/admin/users?${params.toString()}`);

    tbody.innerHTML = result.users.length
      ? result.users.map(userRow).join("")
      : `<tr><td colspan="5" class="table-empty">No users match your filters.</td></tr>`;

    renderPagination(result.total, result.page, result.pageSize);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Could not load users: ${escapeHtml(err.message)}</td></tr>`;
  }
}

/* =========================================================
   DETAIL MODAL
========================================================= */

async function openDetailModal(id) {
  const overlay = document.getElementById("detailModal");
  const body = document.getElementById("detailModalBody");
  if (!overlay || !body) return;

  body.innerHTML = '<div class="table-empty">Loading\u2026</div>';
  openModal(overlay);

  try {
    const u = await AdminAPI.get(`/admin/users/${id}`);
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email.split("@")[0];

    body.innerHTML = `
      <div class="cell-user" style="margin-bottom:14px;">
        <div class="cell-avatar">${initials(u.firstName, u.lastName, u.email)}</div>
        <div>
          <div class="cell-user-name">${escapeHtml(name)}</div>
          <div class="cell-user-email">${escapeHtml(u.email)}</div>
        </div>
      </div>
      ${detailRow("Role", `<span class="role-pill ${u.role === "admin" ? "admin" : "user"}">${u.role === "admin" ? "Admin" : "User"}</span>`)}
      ${detailRow("Joined", formatDate(u.createdAt))}
      ${detailRow("Status", onlineStatusHtml(u.online, u.lastSeenAt))}
      ${detailRow("Target industry", escapeHtml(u.targetIndustry || "\u2014"))}
      ${detailRow("Experience level", escapeHtml(u.careerExperienceLevel || "\u2014"))}
      <div class="divider"></div>
      ${detailRow("CV analyses run", String(u.stats.cvAnalyses))}
      ${detailRow("Recent sessions", String(u.stats.sessionsCount))}
      ${detailRow("Avg. session length", u.stats.avgSessionMinutes ? `${u.stats.avgSessionMinutes}m` : "\u2014")}
    `;
  } catch (err) {
    body.innerHTML = `<div class="table-empty">Could not load this user: ${escapeHtml(err.message)}</div>`;
  }
}

/* =========================================================
   INIT
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();

  const me = await adminReady;
  if (!me) return; // adminGuard.js already redirected away

  loadUsers();

  const searchInput = document.getElementById("userSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentSearch = searchInput.value.trim();
        currentPage = 1;
        loadUsers();
      }, 300);
    });
  }

  const roleFilter = document.getElementById("roleFilterSelect");
  if (roleFilter) {
    roleFilter.addEventListener("change", () => {
      currentRoleFilter = roleFilter.value;
      currentPage = 1;
      loadUsers();
    });
  }

  const paginationControls = document.getElementById("paginationControls");
  if (paginationControls) {
    paginationControls.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-page]");
      if (!btn || btn.disabled) return;
      currentPage = Number(btn.dataset.page);
      loadUsers();
    });
  }

  const tbody = document.getElementById("usersTableBody");
  if (tbody) {
    tbody.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const { action, id, email } = btn.dataset;

      if (action === "view") openDetailModal(id);
      else if (action === "promote") requestRoleChange(id, email, "promote");
      else if (action === "demote") requestRoleChange(id, email, "demote");
    });
  }

  wireConfirmModal(loadUsers);

  const detailModal = document.getElementById("detailModal");
  document.getElementById("detailModalClose")?.addEventListener("click", () => closeModal(detailModal));
  detailModal?.addEventListener("click", (event) => {
    if (event.target === detailModal) closeModal(detailModal);
  });
});