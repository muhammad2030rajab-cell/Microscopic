// Decisions of the hub's "mobile link" gateway. No network, no files: unit-tested.
//
// The app listens only on this PC (127.0.0.1). The gateway is the one door that faces the Wi-Fi:
//   - from this PC itself: always open, and only from here the control page (/_hub) works;
//   - from a phone: closed unless the owner switched the mobile link ON, and even then the phone
//     must type the PIN shown on the PC once (it gets a cookie that dies when the link is switched off).
import { createHmac, timingSafeEqual, randomBytes, randomInt, createHash } from "node:crypto";

export const CONTROL_PREFIX = "/_hub";
export const PAIR_COOKIE = "hub_pair";

export function isLoopbackAddress(addr) {
  if (!addr) return false;
  const a = String(addr).replace(/^::ffff:/i, "");
  return a === "127.0.0.1" || a === "::1" || /^127\./.test(a);
}

/** "a=1; hub_pair=x.y" -> { a: "1", hub_pair: "x.y" } */
export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Remove one cookie from a Cookie header (the app never needs to see the pairing cookie). */
export function stripCookie(header, name) {
  if (!header) return header;
  const kept = String(header).split(";").map((p) => p.trim()).filter((p) => p && !p.startsWith(`${name}=`));
  return kept.length ? kept.join("; ") : undefined;
}

export function pairingKey(secret) {
  return createHash("sha256").update(`hub-pair:${secret}`).digest();
}

export function signPairCookie(epoch, key) {
  return `${epoch}.${createHmac("sha256", key).update(String(epoch)).digest("hex")}`;
}

/** True only for a cookie signed by this hub for the CURRENT epoch (a new epoch starts every time the link is switched on). */
export function verifyPairCookie(value, epoch, key) {
  if (!value || !epoch) return false;
  const expected = Buffer.from(signPairCookie(epoch, key));
  const given = Buffer.from(String(value));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Wrong-PIN limiter: `max` failures per key inside `windowMs`. */
export function createPinLimiter({ max = 5, windowMs = 10 * 60_000 } = {}) {
  const fails = new Map();
  const fresh = (key, now) => {
    const list = (fails.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length) fails.set(key, list);
    else fails.delete(key);
    return list;
  };
  return {
    blocked: (key, now = Date.now()) => fresh(key, now).length >= max,
    fail(key, now = Date.now()) {
      const list = fresh(key, now);
      list.push(now);
      fails.set(key, list);
      if (fails.size > 500) fails.delete(fails.keys().next().value);
    },
    clear: (key) => fails.delete(key),
  };
}

export const DURATIONS_MINUTES = [30, 60, 240, 720, 0]; // 0 = until switched off

/** The mobile-link state. Always OFF at start (never remembered across restarts). */
export function createHubState({ now = () => Date.now(), makePin = () => String(randomInt(100000, 1000000)), makeEpoch = () => randomBytes(8).toString("hex") } = {}) {
  let on = false;
  let expiresAt = null;
  let pin = null;
  let epoch = null;
  const check = () => {
    if (on && expiresAt !== null && now() >= expiresAt) {
      on = false;
      pin = null;
      epoch = null;
      expiresAt = null;
    }
  };
  return {
    /** minutes = 0 means "until I switch it off". Switching on always makes a NEW pin and epoch (old phones must pair again). */
    enable(minutes = 0) {
      on = true;
      pin = makePin();
      epoch = makeEpoch();
      const m = Number(minutes);
      expiresAt = m > 0 ? now() + m * 60_000 : null;
    },
    disable() {
      on = false;
      pin = null;
      epoch = null;
      expiresAt = null;
    },
    /** New pin (and so new epoch): everyone already paired is cut off, the link stays on. */
    renewPin() {
      check();
      if (!on) return;
      pin = makePin();
      epoch = makeEpoch();
    },
    snapshot() {
      check();
      return { on, pin, epoch, expiresAt };
    },
  };
}

/**
 * What the gateway does with a request.
 * "control"       the control page / its API (this PC only)
 * "hidden"        /_hub asked from a phone: pretend it does not exist
 * "proxy"         pass it to the app
 * "locked"        a phone while the link is off
 * "pair-page"     a phone, link on, not paired yet: show the PIN page
 * "pair-submit"   the PIN form was posted
 */
export function decide({ loopback, path, method, linkOn, paired }) {
  const isControl = path === CONTROL_PREFIX || path.startsWith(`${CONTROL_PREFIX}/`);
  const isPair = path === `${CONTROL_PREFIX}/pair`;
  if (loopback) return isControl ? "control" : "proxy";
  if (!linkOn) return "locked";
  if (isPair) return method === "POST" ? "pair-submit" : "pair-page";
  if (isControl) return "hidden";
  return paired ? "proxy" : "pair-page";
}

/** Recently seen phones, newest first; one row per address + browser. */
export function createDeviceRegistry({ max = 50 } = {}) {
  const rows = new Map();
  return {
    seen(ip, userAgent, now = Date.now()) {
      const ua = shortAgent(userAgent);
      const key = `${ip}|${ua}`;
      const row = rows.get(key) ?? { ip, ua, firstSeen: now, lastSeen: now };
      row.lastSeen = now;
      rows.set(key, row);
      if (rows.size > max) rows.delete(rows.keys().next().value);
    },
    list: () => [...rows.values()].sort((a, b) => b.lastSeen - a.lastSeen),
    clear: () => rows.clear(),
  };
}

export function shortAgent(userAgent) {
  const ua = String(userAgent ?? "");
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "جهاز";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /wv\)/.test(ua) ? "التطبيق" : "";
  return browser ? `${os} · ${browser}` : os;
}
