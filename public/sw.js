/* Service worker: lets the app open and the "new report" flow run offline.
 * - hashed build assets: cache-first
 * - icons / fonts: stale-while-revalidate
 * - /new HTML: network-first, cached copy only when the page asks (logged in)
 * - every other page: network only, friendly offline.html on failure
 * - server functions, /api, non-GET: never touched, never cached
 * Patient pages are deliberately NOT cached. */
importScripts("/sw-rules.js");

var VERSION = "v1";
var STATIC = "rajab-static-" + VERSION;
var PAGES = "rajab-pages-" + VERSION;
var KEEP = [STATIC, PAGES];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(PAGES)
      .then(function (c) { return c.add("/offline.html"); })
      .then(function () { return self.skipWaiting(); }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return KEEP.indexOf(k) === -1; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); }),
  );
});

function offlineResponse() {
  return caches.match("/offline.html").then(function (r) {
    return r || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  });
}

function put(cacheName, req, res) {
  if (!SwRules.cacheable(res)) return res;
  var copy = res.clone();
  caches.open(cacheName).then(function (c) { return c.put(req, copy); });
  return res;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  var kind = SwRules.decide({
    method: req.method,
    url: req.url,
    origin: self.location.origin,
    mode: req.mode,
    accept: req.headers.get("accept") || "",
  });
  if (kind === "bypass") return;

  if (kind === "immutable") {
    event.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { return put(STATIC, req, res); });
      }),
    );
    return;
  }

  if (kind === "revalidate") {
    event.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { return put(STATIC, req, res); }).catch(function () { return hit; });
        return hit || net;
      }),
    );
    return;
  }

  if (kind === "page") {
    // Network first; fall back to the copy saved while signed in.
    event.respondWith(
      fetch(req).catch(function () {
        return caches.open(PAGES).then(function (c) {
          return c.match(req.url).then(function (hit) { return hit || offlineResponse(); });
        });
      }),
    );
    return;
  }

  // kind === "navigate": network only, friendly page when offline.
  event.respondWith(fetch(req).catch(offlineResponse));
});

self.addEventListener("message", function (event) {
  var data = event.data || {};
  if (data.type === "cache-page" && SwRules.OFFLINE_PAGES.indexOf(data.url) !== -1) {
    // The page sends this only after loading successfully as a signed-in user.
    event.waitUntil(
      fetch(data.url, { credentials: "same-origin", headers: { accept: "text/html" } })
        .then(function (res) {
          if (!SwRules.cacheable(res)) return null;
          return caches.open(PAGES).then(function (c) { return c.put(data.url, res); });
        })
        .then(function () { if (event.source) event.source.postMessage({ type: "cached", url: data.url }); })
        .catch(function () {}),
    );
  }
  if (data.type === "clear") {
    // Sign-out: forget every saved page (offline.html is re-added).
    event.waitUntil(
      caches.delete(PAGES).then(function () {
        return caches.open(PAGES).then(function (c) { return c.add("/offline.html"); });
      }),
    );
  }
});
