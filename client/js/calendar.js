document.addEventListener("DOMContentLoaded", () => {
  const daysContainer = document.getElementById("calendarDays");
  const monthLabel = document.getElementById("calendarMonthLabel");
  const selectedLabel = document.getElementById("selectedDateLabel");
  const selectedEvents = document.getElementById("selectedDateEvents");
  const loadStatus = document.getElementById("calendarLoadStatus");

  const previousButton = document.getElementById("previousMonthBtn");
  const nextButton = document.getElementById("nextMonthBtn");
  const todayButton = document.getElementById("calendarTodayBtn");

  const dateInput = document.querySelector(
    '#plannerEventForm input[name="event_date"]'
  );

  if (
    !daysContainer ||
    !monthLabel ||
    !selectedLabel ||
    !selectedEvents ||
    !loadStatus ||
    !previousButton ||
    !nextButton ||
    !todayButton ||
    !dateInput
  ) {
    console.error("Calendar: required HTML elements are missing.");
    return;
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }
  function eventCoversDate(event, key) {
    if (event.status !== "active") return false;

    if (
      event.type === "goal" &&
      event.starts_at &&
      event.ends_at
    ) {
      const [year, month, day] = key.split("-").map(Number);
      const dayStart = new Date(year, month - 1, day).getTime();
      const dayEnd = new Date(year, month - 1, day + 1).getTime();

      // Treat goal intervals as [start, end).
      return (
        Date.parse(event.starts_at) < dayEnd &&
        Date.parse(event.ends_at) > dayStart
      );
    }

    return event.event_date === key;
  }

  function announceSelectedDate() {
    document.dispatchEvent(
      new CustomEvent("planner:date-selected", {
        detail: { date: selectedDate },
      })
    );
  }

  const now = new Date();

  let selectedDate = dateKey(now);
  let displayedMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  let events = [];
  let requestNumber = 0;

  function renderSelectedDate() {
    const [year, month, day] = selectedDate.split("-").map(Number);

    selectedLabel.textContent = new Date(
      year,
      month - 1,
      day
    ).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    selectedEvents.replaceChildren();

    const matchingEvents = events
      .filter((event) => eventCoversDate(event, selectedDate))
      .sort((a, b) =>
        (a.event_time || "").localeCompare(b.event_time || "")
      );

    if (!matchingEvents.length) {
      const empty = document.createElement("p");
      empty.textContent = "No active entries for this date.";
      selectedEvents.appendChild(empty);
      return;
    }

    matchingEvents.forEach((event) => {
      const card = document.createElement("article");
      card.className = "planner-event-card";

      const title = document.createElement("h4");
      title.textContent = event.title;

      const details = document.createElement("p");
      details.textContent =
        event.type === "goal" && event.starts_at && event.ends_at
          ? `Goal · ${new Date(event.starts_at).toLocaleString()} → ${
              new Date(event.ends_at).toLocaleString()
            }`
          : [
              event.type === "goal" ? "Goal" : "Reminder",
              event.event_time
                ? event.event_time.slice(0, 5)
                : "No time set",
            ].join(" · ");

      card.append(title, details);

      if (event.description) {
        const description = document.createElement("p");
        description.textContent = event.description;
        card.appendChild(description);
      }

      selectedEvents.appendChild(card);
    });
  }

  function renderCalendar() {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();

    monthLabel.textContent = displayedMonth.toLocaleDateString(
      undefined,
      {
        month: "long",
        year: "numeric",
      }
    );

    daysContainer.replaceChildren();

    // Convert Sunday-first numbering to a Monday-first calendar.
    const startingOffset =
      (new Date(year, month, 1).getDay() + 6) % 7;

    const numberOfDays = new Date(year, month + 1, 0).getDate();

    const today = dateKey(new Date());

    for (let index = 0; index < startingOffset; index++) {
      const spacer = document.createElement("div");
      spacer.setAttribute("aria-hidden", "true");
      daysContainer.appendChild(spacer);
    }

    for (let day = 1; day <= numberOfDays; day++) {
      const date = new Date(year, month, day);
      const key = dateKey(date);
      const hasEvents = events.some((event) =>
        eventCoversDate(event, key)
      );
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.textContent = day;

      button.classList.toggle("is-today", key === today);
      button.classList.toggle("is-selected", key === selectedDate);
      button.classList.toggle("has-events", hasEvents);

      button.setAttribute(
        "aria-pressed",
        String(key === selectedDate)
      );

      if (key === today) {
        button.setAttribute("aria-current", "date");
      }

      button.setAttribute(
        "aria-label",
        `${date.toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}${hasEvents ? ", has active entries" : ""}`
      );

      button.addEventListener("click", () => {
        selectedDate = key;
        renderCalendar();
        announceSelectedDate();

        // Restore focus after rebuilding the buttons.
        daysContainer.querySelector(".is-selected")?.focus();
      });

      daysContainer.appendChild(button);
    }

    renderSelectedDate();
  }

  async function refreshCalendar() {
    const currentRequest = ++requestNumber;
    const token = localStorage.getItem("sb-access-token");

    if (!token) {
      events = [];
      renderCalendar();
      loadStatus.textContent = "Please log in to load your calendar.";
      return;
    }

    loadStatus.textContent = "Loading calendar...";

    try {
      const response = await fetch(
        "/api/planner/events",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load calendar.");
      }

      if (currentRequest !== requestNumber) return;

      events = data.events ?? [];
      renderCalendar();
      loadStatus.textContent = "";
    } catch (error) {
      if (currentRequest !== requestNumber) return;

      loadStatus.textContent = error.message;
    }
  }

  function moveMonth(offset) {
    displayedMonth = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() + offset,
      1
    );

    selectedDate = dateKey(displayedMonth);
    renderCalendar();
    announceSelectedDate();
  }

  previousButton.addEventListener("click", () => moveMonth(-1));
  nextButton.addEventListener("click", () => moveMonth(1));

  todayButton.addEventListener("click", () => {
    const today = new Date();

    displayedMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );

    selectedDate = dateKey(today);
    renderCalendar();
    announceSelectedDate();
  });

  document.getElementById("plannerBtn")
    ?.addEventListener("click", refreshCalendar);

  document.querySelector('.planner-tab[data-tab="calendar"]')
    ?.addEventListener("click", refreshCalendar);

  document.addEventListener("planner:updated", refreshCalendar);

  renderCalendar();
  refreshCalendar();
});