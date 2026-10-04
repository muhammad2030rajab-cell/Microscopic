import test from "node:test";
import assert from "node:assert/strict";

// sw-rules.js is a UMD file for the worker; under this package's "type": "module"
// it registers itself on globalThis, exactly like it does on `self` in a worker.
await import("../public/sw-rules.js");
const { decide, cacheable } = globalThis.SwRules;
const origin = "https://app.example";
const d = (path, extra = {}) => decide({ method: "GET", url: origin + path, origin, ...extra });

test("the offline archive script is served from the cache like offline.html", () => {
  assert.equal(d("/offline-archive.js"), "revalidate");
  assert.equal(d("/offline.html"), "revalidate");
});

test("writes and server functions are never intercepted", () => {
  assert.equal(decide({ method: "POST", url: origin + "/new", origin }), "bypass");
  assert.equal(d("/_serverFn/abc123"), "bypass");
  assert.equal(d("/api/auth/get-session"), "bypass");
});

test("hashed build assets are cache-first", () => {
  assert.equal(d("/assets/index-Ab12.js"), "immutable");
});

test("only /new HTML is kept offline; patient pages are not", () => {
  assert.equal(d("/new", { mode: "navigate" }), "page");
  assert.equal(d("/reports/abc", { mode: "navigate" }), "navigate");
  assert.equal(d("/patients", { accept: "text/html,application/xhtml+xml" }), "navigate");
});

test("icons, manifest and google fonts revalidate; other origins are ignored", () => {
  assert.equal(d("/icon-192.png"), "revalidate");
  assert.equal(d("/manifest.webmanifest"), "revalidate");
  assert.equal(decide({ method: "GET", url: "https://fonts.gstatic.com/s/x.woff2", origin }), "revalidate");
  assert.equal(decide({ method: "GET", url: "https://evil.example/x.js", origin }), "bypass");
});

test("dev-server and worker files are bypassed", () => {
  assert.equal(d("/@vite/client"), "bypass");
  assert.equal(d("/src/main.tsx"), "bypass");
  assert.equal(d("/sw.js"), "bypass");
});

test("only clean 200 responses are cacheable", () => {
  assert.equal(cacheable({ status: 200, redirected: false, type: "basic" }), true);
  assert.equal(cacheable({ status: 200, redirected: true, type: "basic" }), false);
  assert.equal(cacheable({ status: 302, redirected: false, type: "basic" }), false);
  assert.equal(cacheable({ status: 200, redirected: false, type: "opaque" }), false);
  assert.equal(cacheable(null), false);
});
