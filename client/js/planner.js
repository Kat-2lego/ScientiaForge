document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("plannerEventForm");
  const list = document.getElementById("plannerEventsList");
  const message = document.getElementById("plannerMessage");

  if (!form || !list || !message) return;

  const plannerApiUrl = "http://localhost:5001/api/planner/events";
  const saveButton = form.querySelector('button[type="submit"]');

  async function plannerRequest(options = {}) {
    const token = localStorage.getItem("sb-access-token");

    if (!token) {
      throw new Error("Please log in before using the planner.");
    }

    const response = await fetch(plannerApiUrl, {
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

  function renderEvents(events) {
    list.replaceChildren();

    if (!events.length) {
      const empty = document.createElement("p");
      empty.textContent = "No reminders or goals yet.";
      list.appendChild(empty);
      return;
    }

    events.forEach((event) => {
      const card = document.createElement("article");
      card.className = "planner-event-card";

      const heading = document.createElement("h4");
      heading.textContent = event.title;

      const details = document.createElement("p");
      details.textContent = [
        event.type === "goal" ? "Goal" : "Reminder",
        event.event_date,
        event.event_time ? event.event_time.slice(0, 5) : "",
        event.status,
      ].filter(Boolean).join(" · ");

      card.append(heading, details);

      if (event.description) {
        const description = document.createElement("p");
        description.textContent = event.description;
        card.appendChild(description);
      }

      if (event.remind_at) {
        const reminder = document.createElement("p");
        reminder.textContent =
          `Notify at: ${new Date(event.remind_at).toLocaleString()}`;
        card.appendChild(reminder);
      }

      list.appendChild(card);
    });
  }

  async function loadEvents() {
    list.textContent = "Loading entries...";

    try {
      const data = await plannerRequest();
      renderEvents(data.events ?? []);
    } catch (error) {
      list.textContent = error.message;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    saveButton.disabled = true;
    message.textContent = "Saving...";

    try {
      const values = new FormData(form);
      const localReminder = values.get("remind_at");

      let remindAt = null;

      if (localReminder) {
        const date = new Date(localReminder);

        if (!Number.isFinite(date.getTime())) {
          throw new Error("Choose a valid notification time.");
        }

        remindAt = date.toISOString();
      }

      await plannerRequest({
        method: "POST",
        body: JSON.stringify({
          title: values.get("title"),
          description: values.get("description"),
          type: values.get("type"),
          event_date: values.get("event_date"),
          event_time: values.get("event_time") || null,
          remind_at: remindAt,
        }),
      });

      form.reset();
      message.textContent = "Entry saved.";

      document.dispatchEvent(new Event("planner:updated"));

      await loadEvents();

    } catch (error) {
      message.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  });

  document.getElementById("plannerBtn")
    ?.addEventListener("click", loadEvents);

  document.querySelector(
    '.planner-tab[data-tab="calendar"]'
  )?.addEventListener("click", loadEvents);

  loadEvents();
});