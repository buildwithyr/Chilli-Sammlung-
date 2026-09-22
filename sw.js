// Service Worker nur für Web-Push-Benachrichtigungen der Bestellverwaltung.
// Kein Offline-Caching (siehe APP-UEBERSICHT.md, "Bekannte Grenzen").

self.addEventListener("push", (event) => {
  let payload = { title: "Neue Bestellanfrage", body: "Es ist eine neue Bestellanfrage eingegangen." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    // Rohtext statt JSON: Standardtext verwenden.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "assets/icons/icon-180.png",
      data: { url: payload.url || "admin.html" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "admin.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const win of windows) {
        if (win.url.includes(url) && "focus" in win) return win.focus();
      }
      return clients.openWindow(url);
    })
  );
});
