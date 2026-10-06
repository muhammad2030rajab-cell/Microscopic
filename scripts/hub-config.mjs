// Pure helpers for the lab-PC hub launcher (scripts/hub-start.mjs): which
// environment the server gets, and which addresses phones should open.
// No I/O here so it is unit-tested without a network or a build.
import { join } from "node:path";

/** Non-internal IPv4 addresses from os.networkInterfaces(), private LAN ranges first. */
export function lanAddresses(interfaces) {
  const found = [];
  for (const list of Object.values(interfaces ?? {})) {
    for (const nic of list ?? []) {
      if (nic.internal || (nic.family !== "IPv4" && nic.family !== 4)) continue;
      found.push(nic.address);
    }
  }
  const rank = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return [...new Set(found)].sort((a, b) => rank(a) - rank(b));
}

export function parsePort(value, fallback = 8080) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

/** Origins phones may use: every LAN address plus localhost, all on the hub's port. */
export function hubOrigins(ips, port) {
  return [...ips.map((ip) => `http://${ip}:${port}`), `http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

/** The app's own port, reachable only from this PC (the gateway on the public port is the door to it). */
export function internalPort(port) {
  return port + 10000 <= 65535 ? port + 10000 : port - 1000;
}

/**
 * Environment for the app process: hub mode, database on disk, listening on THIS PC ONLY (127.0.0.1).
 * Phones never talk to it directly: they go through the gateway, which the owner switches on and off.
 * The sign-in origin is the gateway's address (what the browser sees), not the app's.
 */
export function buildHubEnv({ home, port, ips, secret, appPort = internalPort(port) }) {
  const origins = hubOrigins(ips, port);
  return {
    HUB_MODE: "1",
    HUB_DATA_DIR: join(home, "db"),
    HUB_TRUSTED_ORIGINS: origins.join(","),
    BETTER_AUTH_URL: origins[0],
    BETTER_AUTH_SECRET: secret,
    VITE_AUTH_ENABLED: "true",
    HOST: "127.0.0.1",
    NITRO_HOST: "127.0.0.1",
    PORT: String(appPort),
    NITRO_PORT: String(appPort),
  };
}
