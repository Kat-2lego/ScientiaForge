// supportForm.js: sends the Help & Support form to /api/support/threads.
// Replies then show up under the mail icon (see supportWidgets.js).
(function () {
  "use strict";

  const form = document.getElementById("supportForm");
  if (!form) return;

  const nameInput = document.getElementById("supportName");
  const emailInput = document.getElementById("supportEmail");
  const category = document.getElementById("supportCategory");
  const message = document.getElementById("supportMessage");
  const status = document.getElementById("supportStatus");
  const submit = form.querySelector(".submit-btn");

  const token = () => {
    try {
      return localStorage.getItem("sb-access-token");
    } catch (_) {
      return null;
    }
  };

  function say(text, kind, threadId) {
    status.textContent = text;
    status.style.margin = "0 0 12px";
    status.style.fontSize = "14px";
    status.style.color = kind === "error" ? "#dc2626" : "#16a34a";

    if (threadId && window.SFMessages) {
      const link = document.createElement("button");
      link.type = "button";
      link.textContent = "View conversation";
      link.style.cssText =
        "margin-left:8px;padding:0;border:0;background:none;color:inherit;font:inherit;font-weight:600;text-decoration:underline;cursor:pointer";
      link.addEventListener("click", () => window.SFMessages.openThread(threadId));
      status.appendChild(link);
    }
  }

  // Fill in who is sending, from the logged-in account.
  (async function prefill() {
    if (!token()) return;
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) return;
      const me = await res.json();
      if (nameInput) {
        nameInput.value = me.firstName || "";
        nameInput.readOnly = true;
      }
      if (emailInput) {
        emailInput.value = me.email || "";
        emailInput.readOnly = true;
      }
    } catch (_) {
      /* the form still works without prefill */
    }
  })();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!token()) {
      say("Log in to send a message.", "error");
      return;
    }

    const text = message.value.trim();
    if (!text) {
      say("Write a message before sending.", "error");
      return;
    }

    submit.disabled = true;
    say("Sending…", "ok");

    try {
      const res = await fetch("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ category: category.value, message: text }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.error || "Your message could not be sent.");

      message.value = "";
      say("Message sent. Replies from our team will appear under the mail icon.", "ok", data.thread?.id);
      if (window.SFMessages) window.SFMessages.refresh();
    } catch (err) {
      say(err.message, "error");
    } finally {
      submit.disabled = false;
    }
  });
})();
