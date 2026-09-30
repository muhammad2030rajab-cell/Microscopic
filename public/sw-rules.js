/* Routing rules for sw.js. Plain UMD so the worker (importScripts) and the
 * unit tests (require) share exactly the same logic. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SwRules = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  // Only these HTML pages are kept for offline use. They contain no patient
  // data (lab profile + test catalog only). Report pages are never cached.
  var OFFLINE_PAGES = ["/new"];
  var FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

  /**
   * @param {{method:string, url:string, origin:string, mode?:string, accept?:string}} r
   * @returns {"bypass"|"immutable"|"revalidate"|"page"|"navigate"}
   */
  function decide(r) {
    if (r.method !== "GET") return "bypass";
    var u = new URL(r.url);
    if (u.origin !== r.origin) {
      return FONT_HOSTS.indexOf(u.hostname) !== -1 ? "revalidate" : "bypass";
    }
    var p = u.pathname;
    if (p.indexOf("/api/") === 0 || p.indexOf("/_serverFn") === 0) return "bypass";
    if (p.indexOf("/@") === 0 || p.indexOf("/src/") === 0 || p.indexOf("/node_modules/") === 0) return "bypass";
    if (p === "/sw.js" || p === "/sw-rules.js") return "bypass";
    var isNav = r.mode === "navigate" || (r.accept || "").indexOf("text/html") !== -1;
    if (isNav) return OFFLINE_PAGES.indexOf(p) !== -1 ? "page" : "navigate";
    if (p.indexOf("/assets/") === 0) return "immutable";
    if (/\.(png|svg|jpg|jpeg|webp|ico|woff2?|webmanifest)$/i.test(p) || p === "/offline.html") return "revalidate";
    return "bypass";
  }

  /** Cache only clean, successful, non-redirected responses. */
  function cacheable(res) {
    return !!res && res.status === 200 && !res.redirected && (res.type === "basic" || res.type === "cors");
  }

  return { decide: decide, cacheable: cacheable, OFFLINE_PAGES: OFFLINE_PAGES };
});
