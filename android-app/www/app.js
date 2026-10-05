import { healthUrl, normalizeUrl, pickTarget, sanitizeSettings } from "./launcher-logic.js";

const KEY = "microscopic.launcher.v1";
const $ = (id) => document.getElementById(id);

function load() {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return sanitizeSettings(null);
  }
}
function save(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: the choice just is not remembered */
  }
}

/** Quick "is there a Microscopic server there?" check, 4 s at most. */
async function reachable(base) {
  const url = healthUrl(base);
  const http = window.Capacitor?.Plugins?.CapacitorHttp;
  try {
    if (http) {
      // Native request: no CORS and no mixed-content block, so http://192.168.x.x works from this https page.
      const res = await http.get({ url, connectTimeout: 4000, readTimeout: 4000 });
      return res.status >= 200 && res.status < 500;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      await fetch(url, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
      return true; // opaque response: the server answered
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

async function check(settings) {
  const [cloudUp, hubUp] = await Promise.all([
    settings.mode === "hub" ? false : reachable(settings.cloudUrl),
    settings.mode === "cloud" || !settings.hubUrl ? false : reachable(settings.hubUrl),
  ]);
  return { cloudUp, hubUp };
}

function setStatus(text, cls = "") {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + cls;
}

let cancelled = false;

async function connect() {
  cancelled = false;
  const settings = load();
  setStatus("جاري الاتصال…");
  const reach = await check(settings);
  if (cancelled) return;
  const pick = pickTarget(settings, reach);
  if (!pick) {
    const where = settings.mode === "hub" ? "المركز المحلي" : settings.mode === "auto" ? "السحابة ولا المركز" : "السحابة";
    setStatus(`مقدرتش أوصل لـ${where}. تأكد من الإنترنت أو الواي فاي، أو غيّر الإعدادات.`, "bad");
    return;
  }
  setStatus(pick.target === "hub" ? "متصل بالمركز المحلي…" : "متصل بالسحابة…", "ok");
  window.location.href = pick.url + "/";
}

function fillForm() {
  const s = load();
  $("cloudUrl").value = s.cloudUrl;
  $("hubUrl").value = s.hubUrl;
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === s.mode;
}

function readForm() {
  const mode = document.querySelector('input[name="mode"]:checked')?.value ?? "cloud";
  const cloudUrl = normalizeUrl($("cloudUrl").value);
  const hubText = $("hubUrl").value.trim();
  const hubUrl = hubText ? normalizeUrl(hubText) : "";
  if (!cloudUrl) return { error: "عنوان السحابة مش صحيح" };
  if (hubText && !hubUrl) return { error: "عنوان المركز مش صحيح" };
  if (!hubUrl && mode !== "cloud") return { error: "اكتب عنوان المركز الأول" };
  return { settings: sanitizeSettings({ mode, cloudUrl, hubUrl }) };
}

$("toggle").addEventListener("click", () => {
  cancelled = true;
  const box = $("settings");
  box.hidden = !box.hidden;
  if (!box.hidden) fillForm();
});
$("save").addEventListener("click", () => {
  const r = readForm();
  if (r.error) return void ($("testResult").textContent = r.error);
  save(r.settings);
  $("testResult").textContent = "اتحفظ.";
  $("settings").hidden = true;
  void connect();
});
$("test").addEventListener("click", async () => {
  const r = readForm();
  if (r.error) return void ($("testResult").textContent = r.error);
  $("testResult").textContent = "بجرّب…";
  const [cloudUp, hubUp] = await Promise.all([reachable(r.settings.cloudUrl), r.settings.hubUrl ? reachable(r.settings.hubUrl) : false]);
  $("testResult").textContent = `السحابة: ${cloudUp ? "متاحة" : "مش متاحة"}` + (r.settings.hubUrl ? ` — المركز: ${hubUp ? "متاح" : "مش متاح"}` : "");
});
$("open").addEventListener("click", () => void connect());

// Coming back with the Android back button must not bounce straight to the server again.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    cancelled = true;
    setStatus("اختار فتح البرنامج أو غيّر الإعدادات.");
  }
});

const nav = performance.getEntriesByType?.("navigation")?.[0];
if (nav && nav.type === "back_forward") setStatus("اختار فتح البرنامج أو غيّر الإعدادات.");
else void connect();
