/* Pure helpers for the offline archive on /offline.html.
 * Plain UMD (no framework) so the offline page, the service worker's cache and
 * the unit tests all use the exact same file. Nothing here touches the DOM or
 * IndexedDB. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OfflineArchive = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  // Keep in step with MAX_OFFLINE_DAYS in src/lib/sync-shared.ts.
  var MAX_OFFLINE_DAYS = 60;

  /** Is the device copy recent enough to show? (A copy nobody refreshed for weeks should not stay readable.) */
  function isFresh(lastSyncMs, nowMs, maxDays) {
    if (typeof lastSyncMs !== "number" || !isFinite(lastSyncMs) || lastSyncMs <= 0) return false;
    var age = nowMs - lastSyncMs;
    return age >= 0 && age <= (maxDays || MAX_OFFLINE_DAYS) * 86400000;
  }

  var ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  /** Search-friendly text: case, diacritics, أ/إ/آ, ى/ي, ة/ه and Arabic digits all fold together. */
  function normalize(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[٠-٩]/g, function (d) { return String(ARABIC_DIGITS.indexOf(d)); })
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Every word the user typed must appear somewhere in the fields (any order). Empty query matches all. */
  function matches(query, fields) {
    var words = normalize(query).split(" ").filter(Boolean);
    if (!words.length) return true;
    var hay = normalize((fields || []).join(" "));
    return words.every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function ageText(age, unit) {
    var n = Number(age);
    var label = unit === "months" ? "شهر" : unit === "days" ? "يوم" : "سنة";
    return (isFinite(n) ? n : 0) + " " + label;
  }

  var STATUS = { draft: "مسودة", pending_review: "في انتظار المراجعة", approved: "معتمد", cancelled: "ملغي" };
  function statusText(s) { return STATUS[s] || STATUS.draft; }

  /** { text, cls } for a stored result flag. Unknown flags show as abnormal rather than silently normal. */
  function flagInfo(flag) {
    switch (flag) {
      case "normal": return { text: "", cls: "" };
      case "high": return { text: "مرتفع ↑", cls: "hi" };
      case "low": return { text: "منخفض ↓", cls: "lo" };
      case "critical": return { text: "حرج ⚠", cls: "cr" };
      default: return { text: "غير طبيعي", cls: "hi" };
    }
  }

  /** The list rows, newest first. A report whose patient row is missing is skipped. */
  function buildList(reports, patients, labId) {
    var byId = {};
    (patients || []).forEach(function (p) { if (!labId || String(p.lab_id) === labId) byId[String(p.id)] = p; });
    return (reports || [])
      .filter(function (r) { return (!labId || String(r.lab_id) === labId) && byId[String(r.patient_id)]; })
      .map(function (r) {
        var p = byId[String(r.patient_id)];
        return {
          id: String(r.id),
          name: String(p.full_name || ""),
          code: String(p.patient_code || ""),
          age: ageText(p.age, p.age_unit),
          gender: p.gender === "أنثى" ? "أنثى" : "ذكر",
          phone: String(p.phone || ""),
          nationalId: String(p.national_id || ""),
          sampleId: String(r.sample_id || ""),
          doctor: String(r.referring_doctor || "Himself"),
          notes: String(r.notes || ""),
          status: String(r.status || "draft"),
          createdAt: String(r.created_at || ""),
        };
      })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; });
  }

  function searchFields(item) {
    return [item.name, item.code, item.sampleId, item.phone, item.nationalId, item.doctor, item.id];
  }

  return {
    MAX_OFFLINE_DAYS: MAX_OFFLINE_DAYS,
    isFresh: isFresh,
    normalize: normalize,
    matches: matches,
    ageText: ageText,
    statusText: statusText,
    flagInfo: flagInfo,
    buildList: buildList,
    searchFields: searchFields,
  };
});
