document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("plannerEventForm");
  const list = document.getElementById("plannerEventsList");
  const message = document.getElementById("plannerMessage");

  if (!form || !list || !message) return;

  const api = "/api";
  const fields = form.elements;
  const saveButton = form.querySelector('button[type="submit"]');
  const reminderFields = document.getElementById("reminderFields");
  const goalFields = document.getElementById("goalFields");
  const notifyLabel = document.getElementById("notifyFieldLabel");

  let cachedEvents = [];
  let selectedDate = localDateKey(new Date());
  let loadNumber = 0;

  function localDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function configureForm() {
    const isGoal = fields.type.value === "goal";

    reminderFields.hidden = isGoal;
    reminderFields.disabled = isGoal;
    goalFields.hidden = !isGoal;
    goalFields.disabled = !isGoal;

    fields.event_date.required = !isGoal;
    fields.starts_at.required = isGoal;
    fields.ends_at.required = isGoal;
    fields.remind_at.required = !isGoal;

    notifyLabel.textContent = isGoal
      ? "Notify me at — optional"
      : "Notify me at — required";

    if (!fields.event_date.value) {
      fields.event_date.value = selectedDate;
    }

    if (isGoal && !fields.starts_at.value) {
      fields.starts_at.value = `${selectedDate}T09:00`;
    }
  }

  async function request(path = "", options = {}) {
    const token = localStorage.getItem("sb-access-token");

    if (!token) throw new Error("Please log in first.");

    const response = await fetch(`${api}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Planner request failed.");
    }

    return data;
  }

  function toIso(value, label) {
    const date = new Date(value);

    if (!value || !Number.isFinite(date.getTime())) {
      throw new Error(`Choose a valid ${label}.`);
    }

    return date.toISOString();
  }

  function deadline(event) {
    if (event.type === "goal") {
      return event.ends_at ? Date.parse(event.ends_at) : null;
    }

    if (event.due_at) return Date.parse(event.due_at);

    // Legacy reminder fallback.
    if (!event.event_date) return null;

    const [year, month, day] = event.event_date.split("-").map(Number);

    if (event.event_time) {
      return new Date(
        `${event.event_date}T${event.event_time}`
      ).getTime();
    }

    return new Date(year, month - 1, day + 1).getTime();
  }

  function category(event, now) {
    if (event.status === "completed") return "Completed";
    if (event.status === "cancelled") return "Cancelled";

    const end = deadline(event);

    if (end === null || !Number.isFinite(end)) {
      return "Schedule not set";
    }

    if (end <= now) return "Overdue";

    if (
      event.type === "goal" &&
      event.starts_at &&
      Date.parse(event.starts_at) <= now
    ) {
      return "In progress";
    }

    return "Upcoming";
  }

  function addText(parent, text, tag = "p") {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function renderEvents() {
    list.replaceChildren();

    if (!cachedEvents.length) {
      addText(list, "No reminders or goals yet.");
      return;
    }

    const now = Date.now();
    const order = [
      "Overdue",
      "In progress",
      "Upcoming",
      "Schedule not set",
      "Completed",
      "Cancelled",
    ];

    order.forEach((groupName) => {
      const items = cachedEvents
        .filter((event) => category(event, now) === groupName)
        .sort((a, b) => {
          const aTime =
            groupName === "Upcoming" && a.type === "goal"
              ? Date.parse(a.starts_at)
              : deadline(a);

          const bTime =
            groupName === "Upcoming" && b.type === "goal"
              ? Date.parse(b.starts_at)
              : deadline(b);

          return (aTime ?? Infinity) - (bTime ?? Infinity) ||
            a.title.localeCompare(b.title);
        });

      if (!items.length) return;

      const collapsed = ["Completed", "Cancelled"].includes(groupName);
      const group = document.createElement(collapsed ? "details" : "section");
      group.className = "planner-entry-group";

      addText(
        group,
        `${groupName} (${items.length})`,
        collapsed ? "summary" : "h4"
      );

      items.forEach((event) => {
        const card = document.createElement("article");
        card.className = "planner-event-card";

        if (groupName === "Overdue") {
          card.classList.add("is-overdue");
        }

        addText(card, event.title, "h4");
        addText(card, event.type === "goal" ? "Goal" : "Reminder");

        if (event.type === "goal") {
          addText(
            card,
            event.starts_at && event.ends_at
              ? `Start: ${new Date(event.starts_at).toLocaleString()}
End: ${new Date(event.ends_at).toLocaleString()}`
              : "Schedule not set — this is an older goal."
          );
        } else {
          addText(
            card,
            `Due: ${event.event_date}${
              event.event_time
                ? ` at ${event.event_time.slice(0, 5)}`
                : " (end of day)"
            }`
          );
        }

        if (event.description) addText(card, event.description);

        if (event.remind_at) {
          addText(
            card,
            `Notify at: ${new Date(event.remind_at).toLocaleString()}`
          );
        } else if (event.type === "reminder") {
          addText(card, "No notification time — older reminder.");
        }

        if (event.status !== "cancelled") {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "planner-status-btn";
          button.textContent =
            event.status === "completed" ? "Reopen" : "Mark complete";

          button.addEventListener("click", async () => {
            button.disabled = true;

            try {
              const data = await request(`/${event.id}/status`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: event.status === "completed"
                    ? "active"
                    : "completed",
                }),
              });

              event.status = data.event.status;
              renderEvents();

              document.dispatchEvent(new Event("planner:updated"));
              message.textContent = "Entry updated.";
            } catch (error) {
              message.textContent = error.message;
              button.disabled = false;
            }
          });

          card.appendChild(button);
        }

        group.appendChild(card);
      });

      list.appendChild(group);
    });
  }

  async function loadEvents() {
    const currentLoad = ++loadNumber;

    try {
      const data = await request();
      if (currentLoad !== loadNumber) return;

      cachedEvents = data.events ?? [];
      renderEvents();
    } catch (error) {
      if (currentLoad === loadNumber) {
        message.textContent = error.message;
      }
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    message.textContent = "Saving...";

    try {
      const isGoal = fields.type.value === "goal";
      const remindAt = fields.remind_at.value
        ? toIso(fields.remind_at.value, "notification time")
        : null;

      const payload = {
        title: fields.title.value,
        description: fields.description.value,
        type: fields.type.value,
        remind_at: remindAt,
      };

      let end;

      if (isGoal) {
        payload.starts_at = toIso(fields.starts_at.value, "start time");
        payload.ends_at = toIso(fields.ends_at.value, "end time");
        payload.event_date = fields.starts_at.value.slice(0, 10);
        payload.event_time = fields.starts_at.value.slice(11, 16);

        end = Date.parse(payload.ends_at);

        if (end <= Date.parse(payload.starts_at)) {
          throw new Error("The goal must end after it starts.");
        }
      } else {
        if (!remindAt) {
          throw new Error("Notify me at is required for reminders.");
        }

        payload.event_date = fields.event_date.value;
        payload.event_time = fields.event_time.value || null;

        if (!payload.event_date) {
          throw new Error("Choose a due date.");
        }

        const [year, month, day] =
          payload.event_date.split("-").map(Number);

        const due = payload.event_time
          ? new Date(`${payload.event_date}T${payload.event_time}`)
          : new Date(year, month - 1, day + 1);

        payload.due_at = due.toISOString();
        end = due.getTime();
      }

      if (remindAt) {
        const notify = Date.parse(remindAt);

        if (notify <= Date.now()) {
          throw new Error("Notification time must be in the future.");
        }

        if (notify > end) {
          throw new Error("Notification time cannot be after the deadline.");
        }
      }

      await request("", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      form.reset();
      configureForm();
      message.textContent = "Entry saved.";

      document.dispatchEvent(new Event("planner:updated"));
      await loadEvents();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  });

  fields.type.addEventListener("change", configureForm);

  document.addEventListener("planner:date-selected", (event) => {
    selectedDate = event.detail.date;
    fields.event_date.value = selectedDate;

    if (fields.type.value === "goal") {
      const time = fields.starts_at.value.slice(11, 16) || "09:00";
      fields.starts_at.value = `${selectedDate}T${time}`;
    }
  });

  document.getElementById("plannerBtn")
    ?.addEventListener("click", loadEvents);

  document.querySelector('.planner-tab[data-tab="calendar"]')
    ?.addEventListener("click", loadEvents);

  setInterval(() => {
    if (
      !document.hidden &&
      !document.getElementById("plannerOverlay")
        ?.classList.contains("hidden")
    ) {
      renderEvents();
    }
  }, 60_000);

  configureForm();
  loadEvents();
});