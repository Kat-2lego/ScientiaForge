document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("plannerOverlay");
  const calendarButton = document.getElementById("plannerBtn");
  const notificationButton = document.getElementById("notificationBtn");
  const closeButton = document.getElementById("closePlannerBtn");

  const calendarTab = document.getElementById("calendarTab");
  const notificationsTab = document.getElementById("notificationsTab");

  const requiredElements = {
    plannerOverlay: overlay,
    plannerBtn: calendarButton,
    notificationBtn: notificationButton,
    closePlannerBtn: closeButton,
    calendarTab,
    notificationsTab,
  };

  const missing = Object.entries(requiredElements)
    .filter(([, element]) => !element)
    .map(([id]) => id);

  if (missing.length) {
    console.error("Planner UI: missing HTML elements:", missing);
    return;
  }

  const tabs = overlay.querySelectorAll(".planner-tab");
  let previousFocus = null;

  function switchTab(tabName) {
    calendarTab.classList.toggle(
      "hidden",
      tabName !== "calendar"
    );

    notificationsTab.classList.toggle(
      "hidden",
      tabName !== "notifications"
    );

    tabs.forEach((tab) => {
      tab.classList.toggle(
        "active",
        tab.dataset.tab === tabName
      );
    });
  }

  function openPlanner(tabName) {
    previousFocus = document.activeElement;
    switchTab(tabName);
    overlay.classList.remove("hidden");
    closeButton.focus();
  }

  function closePlanner() {
    overlay.classList.add("hidden");
    previousFocus?.focus();
  }

  calendarButton.addEventListener("click", () => {
    openPlanner("calendar");
  });

  notificationButton.addEventListener("click", () => {
    openPlanner("notifications");
  });

  closeButton.addEventListener("click", closePlanner);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closePlanner();
    }
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !overlay.classList.contains("hidden")
    ) {
      closePlanner();
    }
  });

  console.log("Planner UI ready.");
});