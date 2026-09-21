// BayMeet's service worker. It does one job: when a push notification arrives, show it, and when
// it's tapped, open the right page. It caches nothing and never touches page loads.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  // Always show something: browsers (Safari especially) penalise a push that shows nothing.
  event.waitUntil(
    self.registration.showNotification(data.title || "BayMeet", {
      body: data.body || "",
      icon: "/pwa-icon/192?v=2a6b5c-1",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only ever open pages on our own site, whatever the notification says.
  let target = new URL("/", self.location.origin);
  try {
    const wanted = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch (e) {
    // keep the home page
  }
  const href = target.href;

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = open.find((c) => c.url === href);
      if (same) return same.focus();
      const any = open.find((c) => "navigate" in c);
      if (any) {
        await any.focus();
        return any.navigate(href);
      }
      return self.clients.openWindow(href);
    })()
  );
});
