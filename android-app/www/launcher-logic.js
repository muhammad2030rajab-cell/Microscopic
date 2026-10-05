// Pure logic of the Android launcher screen (no DOM, no network): tested with node:test.

export const DEFAULT_CLOUD_URL = "https://microscopic.vercel.app";

/** "192.168.1.20:8080" -> "http://192.168.1.20:8080"; "lab.example.com" -> "https://lab.example.com"; junk -> null. */
export function normalizeUrl(input) {
  let text = String(input ?? "").trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    const host = text.split("/")[0];
    const local = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host) || /^localhost(:\d+)?$/i.test(host) || /\.local(:\d+)?$/i.test(host) || /:\d+$/.test(host);
    text = (local ? "http://" : "https://") + text;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, ""));
}

export function defaultSettings() {
  return { mode: "cloud", cloudUrl: DEFAULT_CLOUD_URL, hubUrl: "" };
}

/** Whatever was stored (maybe old, maybe broken) -> valid settings. */
export function sanitizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== "object") return base;
  const cloudUrl = normalizeUrl(raw.cloudUrl) ?? base.cloudUrl;
  const hubUrl = normalizeUrl(raw.hubUrl) ?? "";
  let mode = raw.mode === "hub" || raw.mode === "auto" || raw.mode === "cloud" ? raw.mode : "cloud";
  if (!hubUrl && mode !== "cloud") mode = "cloud"; // nothing to fall back to
  return { mode, cloudUrl, hubUrl };
}

/**
 * Which server to open. `cloudUp` / `hubUp` are the results of a quick reachability check.
 *  - cloud: always the cloud
 *  - hub:   always the hub
 *  - auto:  the cloud when reachable, else the hub (if one is set)
 * Returns { target: "cloud" | "hub", url } or null when nothing is reachable.
 */
export function pickTarget(settings, reach) {
  const cloud = { target: "cloud", url: settings.cloudUrl };
  const hub = settings.hubUrl ? { target: "hub", url: settings.hubUrl } : null;
  if (settings.mode === "cloud") return reach.cloudUp ? cloud : null;
  if (settings.mode === "hub") return hub && reach.hubUp ? hub : null;
  if (reach.cloudUp) return cloud;
  return hub && reach.hubUp ? hub : null;
}

export function healthUrl(base) {
  return base.replace(/\/+$/, "") + "/api/health";
}
