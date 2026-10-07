import test from "node:test";
import assert from "node:assert/strict";
import { buildHubEnv, hubOrigins, internalPort, lanAddresses, parsePort } from "./hub-config.mjs";

test("lanAddresses: IPv4 only, skips internal, 192.168 first, no duplicates", () => {
  const ips = lanAddresses({
    lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    vpn: [{ address: "172.20.1.5", family: "IPv4", internal: false }],
    wifi: [
      { address: "fe80::1", family: "IPv6", internal: false },
      { address: "192.168.1.20", family: "IPv4", internal: false },
      { address: "192.168.1.20", family: "IPv4", internal: false },
    ],
    other: [{ address: "10.0.0.7", family: 4, internal: false }],
  });
  assert.deepEqual(ips, ["192.168.1.20", "10.0.0.7", "172.20.1.5"]);
});

test("lanAddresses: nothing usable / missing input is an empty list", () => {
  assert.deepEqual(lanAddresses({}), []);
  assert.deepEqual(lanAddresses(undefined), []);
});

test("parsePort: valid numbers pass, junk falls back", () => {
  assert.equal(parsePort("9090"), 9090);
  assert.equal(parsePort(undefined), 8080);
  assert.equal(parsePort("0"), 8080);
  assert.equal(parsePort("70000"), 8080);
  assert.equal(parsePort("abc", 3000), 3000);
});

test("hubOrigins: LAN addresses first, then localhost", () => {
  assert.deepEqual(hubOrigins(["192.168.1.20"], 8080), [
    "http://192.168.1.20:8080",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ]);
});

test("internalPort: a different port than the public one, always valid", () => {
  assert.equal(internalPort(8080), 18080);
  assert.equal(internalPort(60000), 59000);
  for (const p of [1, 80, 8080, 55535, 65535]) {
    const i = internalPort(p);
    assert.ok(i >= 1 && i <= 65535 && i !== p, String(p));
  }
});

test("buildHubEnv: hub mode, database on disk, the app listens on THIS PC only, origins use the public port", () => {
  const env = buildHubEnv({ home: "/data/hub", port: 8080, ips: ["192.168.1.20"], secret: "s3cret" });
  assert.equal(env.HUB_MODE, "1");
  assert.match(env.HUB_DATA_DIR.replaceAll("\\", "/"), /^\/data\/hub\/db$/);
  assert.equal(env.BETTER_AUTH_URL, "http://192.168.1.20:8080");
  assert.ok(env.HUB_TRUSTED_ORIGINS.split(",").includes("http://localhost:8080"));
  assert.equal(env.BETTER_AUTH_SECRET, "s3cret");
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.NITRO_HOST, "127.0.0.1");
  assert.equal(env.NITRO_PORT, "18080");
  assert.equal(env.PORT, "18080");
});

test("buildHubEnv: with no network the hub still starts on localhost", () => {
  const env = buildHubEnv({ home: "/h", port: 8081, ips: [], secret: "x" });
  assert.equal(env.BETTER_AUTH_URL, "http://localhost:8081");
});
