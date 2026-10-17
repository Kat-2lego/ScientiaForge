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

  const apiBase = "http://localhost:5001/api/planner";
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Notification request failed.");
    }

    return data;
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
      list.appendChild(card);
    });
  }

  async function refreshNotifications() {
    if (document.hidden) return;

    try {
      if (isNotificationsOpen()) {
        status.textContent = "Checking notifications...";
      }

      // Generate notifications for newly due entries first.
      await request("/notifications/sync", {
        method: "POST",
      });

      const data = await request("/notifications");
      updateBadge(data.unreadCount);

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

      await request("/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids: unreadIds }),
      });

      list.querySelectorAll(".notification-card").forEach((card) => {
        card.classList.remove("is-unread");
      });

      // Fetch the actual remaining unread count; do not assume zero.
      const updated = await request("/notifications");
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