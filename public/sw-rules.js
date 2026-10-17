/* Routing rules for sw.js. Plain UMD so the worker (importScripts) and the
 * unit tests (require) share exactly the same logic. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SwRules = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  // Only these HTML pages are kept for offline use. Their saved HTML carries no patient data:
  // /new has the lab profile + test catalog, /patients only a permission flag, and /lab,
  // /catalog, /analytics, /methods and the /reports archive load their data in the browser (ssr: false), so the HTML is an empty shell.
  // Report pages are never cached.
  var OFFLINE_PAGES = ["/new", "/lab", "/patients", "/catalog", "/analytics", "/methods", "/reports"];
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
    if (isNav) return OFFLINE_PAGES.indexOf(pageKey(p)) !== -1 ? "page" : "navigate";
    if (p.indexOf("/assets/") === 0) return "immutable";
    if (/\.(png|svg|jpg|jpeg|webp|ico|woff2?|webmanifest)$/i.test(p) || p === "/offline.html" || p === "/offline-archive.js") return "revalidate";
    return "bypass";
  }

  /** "/reports/" and "/reports" are the same page. */
  function pageKey(path) {
    return path.length > 1 && path.charAt(path.length - 1) === "/" ? path.slice(0, -1) : path;
  }

  /** Cache only clean, successful, non-redirected responses. */
  function cacheable(res) {
    return !!res && res.status === 200 && !res.redirected && (res.type === "basic" || res.type === "cors");
  }

  /** Build files (/assets/*.js and *.css) a saved page needs, so they are kept too. Unique, in page order. */
  function assetUrls(html) {
    var out = [];
    var re = /(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))(?:[?#][^"]*)?"/g;
    var m;
    while ((m = re.exec(String(html || "")))) if (out.indexOf(m[1]) === -1) out.push(m[1]);
    return out;
  }

  return { decide: decide, cacheable: cacheable, assetUrls: assetUrls, pageKey: pageKey, OFFLINE_PAGES: OFFLINE_PAGES };
});
