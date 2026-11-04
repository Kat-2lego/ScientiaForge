//notifications.js
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("plannerOverlay");
  const tab = document.getElementById("notificationsTab");
  const list = document.getElementById("notificationsList");
  const status = document.getElementById("notificationStatus");
  const badge = document.getElementById("notificationBadge");
  const bell = document.getElementById("notificationBtn");

  if (!overlay || !tab || !list || !status || !badge || !bell) {
    console.error("Notifications: required HTML elements are missing.");
    return;
  }

  const apiBase = "/api";
  let queue = Promise.resolve();

  function isNotificationsOpen() {
    return (
      !document.hidden &&
      !overlay.classList.contains("hidden") &&
      !tab.classList.contains("hidden")
    );
  }

  async function request(path, options = {}) {
    const token = localStorage.getItem("sb-access-token");

    if (!token) {
      throw new Error("Please log in to view notifications.");
    }

    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      // Non-JSON response (e.g. an HTML 404 page)
    }

    if (!response.ok) {
      throw new Error(
        data?.error || `Notification request failed (${response.status}).`
      );
    }

    return data ?? {};
  }

  function updateBadge(count) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count === 0);

    bell.setAttribute(
      "aria-label",
      count
        ? `Open notifications, ${count} unread`
        : "Open notifications"
    );
  }

  // Application Command Centre "you applied N days ago" reminders carry
  // quick status buttons; every other notification (the existing planner
  // reminders/goals) renders exactly as before.
  const FOLLOWUP_TYPE = "app_followup_7d";
  const FOLLOWUP_ACTIONS = [
    { label: "Still waiting", status: null },
    { label: "Interview", status: "interview" },
    { label: "Offer", status: "offer" },
    { label: "Rejected", status: "rejected" },
  ];

  async function handleFollowupAction(applicationId, status, actionsRow) {
  const buttons = actionsRow.querySelectorAll("button");

  buttons.forEach((button) => {
    button.disabled = true;
  });

  try {
    if (status) {
      const result = await request(
        `/applications/${encodeURIComponent(applicationId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );

      // Notify the Application Command Centre that its data changed.
      document.dispatchEvent(
        new CustomEvent("application:updated", {
          detail: {
            application: result.application,
          },
        })
      );

      actionsRow.textContent = "Application status updated.";
    } else {
      actionsRow.textContent = "Marked as still waiting.";
    }
  } catch (error) {
    console.error("Follow-up action failed:", error);

    actionsRow.textContent =
      error.message || "Couldn't update. Please try again.";

    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

  function renderNotifications(items) {
    list.replaceChildren();

    if (!items.length) {
      const empty = document.createElement("p");
      empty.textContent = "No notifications yet.";
      list.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "notification-card";
      card.dataset.notificationId = item.id;
      card.classList.toggle("is-unread", !item.is_read);

      const title = document.createElement("h4");
      title.textContent = item.title;

      const body = document.createElement("p");
      body.textContent = item.body || "";

      const time = document.createElement("time");
      time.dateTime = item.created_at;
      time.textContent = new Date(item.created_at).toLocaleString();

      card.append(title, body, time);

      if (item.type === FOLLOWUP_TYPE && item.reference_id) {
        const actions = document.createElement("div");
        actions.className = "notification-actions";

        FOLLOWUP_ACTIONS.forEach(({ label, status }) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = label;
          btn.addEventListener("click", () =>
            handleFollowupAction(item.reference_id, status, actions)
          );
          actions.appendChild(btn);
        });

        card.appendChild(actions);
      }

      list.appendChild(card);
    });
  }

  // "Show a pop-up when the user opens the app and has new notifications" -
  // once per page load, not on every 60s/visibility-change refresh.
  let hasShownOpenToast = false;

  function showNotificationToast(count) {
    const toast = document.createElement("button");
    toast.type = "button";
    toast.className = "notification-toast";
    toast.setAttribute("role", "status");
    toast.innerHTML =
      '<i data-lucide="bell"></i><span>' +
      (count === 1 ? "You have 1 new update" : `You have ${count} new updates`) +
      "</span>";
    toast.addEventListener("click", () => {
      toast.remove();
      bell.click();
    });
    document.body.appendChild(toast);
    window.lucide?.createIcons();
    window.setTimeout(() => toast.remove(), 6000);
  }

  async function refreshNotifications() {
    if (document.hidden) return;

    try {
      if (isNotificationsOpen()) {
        status.textContent = "Checking notifications...";
      }

      // Generate notifications for newly due entries first.
      await request("/planner/notifications/sync", {
        method: "POST",
      });

      const data = await request("/planner/notifications");
      updateBadge(data.unreadCount);

      if (!hasShownOpenToast) {
        hasShownOpenToast = true;
        if (data.unreadCount > 0) showNotificationToast(data.unreadCount);
      }

      // Update the badge while closed, but only mark items read
      // after rendering them in the open notifications tab.
      if (!isNotificationsOpen()) return;

      const items = data.notifications ?? [];
      renderNotifications(items);

      status.textContent = items.length === 100
        ? "Showing your latest 100 notifications."
        : "";

      const unreadIds = items
        .filter((item) => !item.is_read)
        .map((item) => item.id);

      if (!unreadIds.length || !isNotificationsOpen()) return;

      await request("/planner/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids: unreadIds }),
      });

      list.querySelectorAll(".notification-card").forEach((card) => {
        card.classList.remove("is-unread");
      });

      // Fetch the actual remaining unread count; do not assume zero.
      const updated = await request("/planner/notifications");
      updateBadge(updated.unreadCount);
    } catch (error) {
      console.error("Notifications:", error);

      if (isNotificationsOpen()) {
        status.textContent = error.message;
      }
    }
  }

  function scheduleRefresh() {
    // Keep refreshes in order if multiple events fire together.
    queue = queue.then(refreshNotifications, refreshNotifications);
  }

  bell.addEventListener("click", scheduleRefresh);

  document.querySelector(
    '.planner-tab[data-tab="notifications"]'
  )?.addEventListener("click", scheduleRefresh);

  document.addEventListener("planner:updated", scheduleRefresh);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleRefresh();
  });

  // Check once a minute while this page is visible.
  setInterval(() => {
    if (!document.hidden) scheduleRefresh();
  }, 60_000);

  scheduleRefresh();
});