// Gator Eyes service worker: phone notifications, plus a small offline page.
// Live data is never cached here; every page still loads fresh from the network.
const CACHE = "ge-sw-1";
const OFFLINE = "./offline.html";
const ICON = "./assets/img/icon-192.png";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, ICON, "./assets/css/style.css?v=20261101r"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Pages: network first; only when the phone is offline show the offline page.
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});

async function badge() {
  try {
    const open = await self.registration.getNotifications();
    if (self.navigator.setAppBadge) await self.navigator.setAppBadge(open.length);
  } catch (_) {}
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "Gator Eyes", body: e.data ? e.data.text() : "" }; }
  const title = d.title || "Gator Eyes alert";
  const opts = {
    body: d.body || "",
    icon: ICON,
    badge: ICON,
    data: { url: d.url || "./index.html#alerts" },
  };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  e.waitUntil(self.registration.showNotification(title, opts).then(badge));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = new URL((e.notification.data && e.notification.data.url) || "./index.html#alerts", self.location.href);
  // Taps only ever open Gator Eyes itself, never another site.
  if (url.origin !== self.location.origin) url = new URL("./index.html#alerts", self.location.href);
  url = url.href;
  e.waitUntil((async () => {
    await badge();
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        try { await w.navigate(url); } catch (_) {}
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener("notificationclose", (e) => e.waitUntil(badge()));
