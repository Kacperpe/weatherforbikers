self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Pogoda na trasie", body: "Sprawdź warunki na swojej trasie." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Ignore malformed push payloads and show the safe default.
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag || "route-weather-alert",
    renotify: true,
    icon: "/favicon.ico",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.focus();
        existing.navigate(url);
        return;
      }
      return self.clients.openWindow(url);
    }),
  );
});
