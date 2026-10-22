/* SkillForge service worker: shows system notifications and focuses the app on click. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// Ready for real Web Push (browser closed). Your server sends { title, body, url }.
self.addEventListener("push", e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || "SkillForge", {
    body: d.body || "You have a goal reminder.", tag: d.tag, data: { url: d.url || "./dashboard.html" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./dashboard.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const open = cs.find(c => "focus" in c);
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});