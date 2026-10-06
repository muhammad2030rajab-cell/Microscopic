import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createGateway } from "./hub-gateway.mjs";
import {
  createDeviceRegistry, createHubState, createPinLimiter, decide, isLoopbackAddress, pairingKey, parseCookies, shortAgent,
  signPairCookie, stripCookie, verifyPairCookie,
} from "./hub-gateway-logic.mjs";

// ───────── pure logic ─────────

test("isLoopbackAddress: this PC only", () => {
  for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "127.5.5.5"]) assert.equal(isLoopbackAddress(a), true, a);
  for (const a of ["192.168.1.20", "10.0.0.2", "::ffff:192.168.1.5", "", undefined, "fe80::1"]) assert.equal(isLoopbackAddress(a), false, String(a));
});

test("cookies: parse and strip the pairing cookie only", () => {
  assert.deepEqual(parseCookies("a=1; hub_pair=x.y; b=2"), { a: "1", hub_pair: "x.y", b: "2" });
  assert.deepEqual(parseCookies(undefined), {});
  assert.equal(stripCookie("a=1; hub_pair=x.y; b=2", "hub_pair"), "a=1; b=2");
  assert.equal(stripCookie("hub_pair=x.y", "hub_pair"), undefined);
  assert.equal(stripCookie(undefined, "hub_pair"), undefined);
});

test("pair cookie: valid only for its own epoch and secret", () => {
  const key = pairingKey("secret-1");
  const cookie = signPairCookie("epoch1", key);
  assert.equal(verifyPairCookie(cookie, "epoch1", key), true);
  assert.equal(verifyPairCookie(cookie, "epoch2", key), false); // link was switched off and on again
  assert.equal(verifyPairCookie(cookie, "epoch1", pairingKey("secret-2")), false);
  assert.equal(verifyPairCookie(cookie + "x", "epoch1", key), false);
  assert.equal(verifyPairCookie("", "epoch1", key), false);
  assert.equal(verifyPairCookie(cookie, null, key), false);
});

test("decide: this PC is never locked out, phones need the link ON and the PIN", () => {
  const d = (o) => decide({ method: "GET", linkOn: false, paired: false, loopback: false, path: "/", ...o });
  assert.equal(d({ loopback: true, path: "/reports" }), "proxy");
  assert.equal(d({ loopback: true, path: "/_hub" }), "control");
  assert.equal(d({ loopback: true, path: "/_hub/api/status", linkOn: true }), "control");
  assert.equal(d({}), "locked");
  assert.equal(d({ path: "/_hub/pair", method: "POST" }), "locked");
  assert.equal(d({ linkOn: true }), "pair-page");
  assert.equal(d({ linkOn: true, paired: true }), "proxy");
  assert.equal(d({ linkOn: true, path: "/_hub/pair" }), "pair-page");
  assert.equal(d({ linkOn: true, path: "/_hub/pair", method: "POST" }), "pair-submit");
  assert.equal(d({ linkOn: true, paired: true, path: "/_hub" }), "hidden");
  assert.equal(d({ linkOn: true, paired: true, path: "/_hub/api/link", method: "POST" }), "hidden");
  assert.equal(d({ linkOn: true, paired: true, path: "/_hubby" }), "proxy"); // not the control prefix
});

test("state: off at start, a new pin and epoch every time it is switched on, times out by itself", () => {
  let t = 0;
  let n = 0;
  const state = createHubState({ now: () => t, makePin: () => `10000${++n}`, makeEpoch: () => `e${n}` });
  assert.deepEqual(state.snapshot(), { on: false, pin: null, epoch: null, expiresAt: null });
  state.enable(30);
  assert.deepEqual(state.snapshot(), { on: true, pin: "100001", epoch: "e1", expiresAt: 30 * 60_000 });
  t = 29 * 60_000;
  assert.equal(state.snapshot().on, true);
  t = 30 * 60_000;
  assert.deepEqual(state.snapshot(), { on: false, pin: null, epoch: null, expiresAt: null });
  state.enable(0);
  assert.equal(state.snapshot().expiresAt, null);
  assert.equal(state.snapshot().pin, "100002");
  state.renewPin();
  assert.deepEqual([state.snapshot().pin, state.snapshot().epoch], ["100003", "e3"]);
  state.disable();
  state.renewPin(); // does nothing while off
  assert.equal(state.snapshot().on, false);
});

test("pin limiter and device registry", () => {
  const l = createPinLimiter({ max: 2, windowMs: 1000 });
  l.fail("a", 0);
  assert.equal(l.blocked("a", 1), false);
  l.fail("a", 2);
  assert.equal(l.blocked("a", 3), true);
  assert.equal(l.blocked("a", 1500), false);
  const reg = createDeviceRegistry({ max: 2 });
  reg.seen("1.1.1.1", "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537", 10);
  reg.seen("2.2.2.2", "Mozilla/5.0 (iPhone) Safari/604", 20);
  reg.seen("1.1.1.1", "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537", 30);
  assert.deepEqual(reg.list().map((r) => [r.ip, r.ua, r.lastSeen]), [["1.1.1.1", "Android · Chrome", 30], ["2.2.2.2", "iPhone · Safari", 20]]);
  assert.equal(shortAgent(undefined), "جهاز");
  assert.equal(shortAgent("Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit"), "Android · التطبيق");
});

// ───────── the gateway itself, against a fake app ─────────

async function setup(extra = {}) {
  const hits = [];
  const app = http.createServer((req, res) => {
    hits.push({ url: req.url, host: req.headers.host, cookie: req.headers.cookie, xff: req.headers["x-forwarded-for"] });
    res.writeHead(200, { "content-type": "text/plain", "set-cookie": "app=1; Path=/" });
    res.end("APP:" + req.url);
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  let t = 1_000_000;
  const state = createHubState({ now: () => t, makePin: () => "123456", makeEpoch: (() => { let i = 0; return () => `epoch${++i}`; })() });
  const gw = createGateway({
    upstreamPort: app.address().port, secret: "test-secret", state, now: () => t,
    remoteOf: (req) => req.headers?.["x-test-remote"] ?? "127.0.0.1",
    urls: () => ["http://192.168.1.20:8080"], qrSvg: async () => "<svg>qr</svg>", ...extra,
  });
  await new Promise((r) => gw.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${gw.server.address().port}`;
  const call = (path, { remote, ...init } = {}) => fetch(base + path, { redirect: "manual", ...init, headers: { ...(remote ? { "x-test-remote": remote } : {}), ...(init.headers ?? {}) } });
  const close = async () => { gw.server.closeAllConnections?.(); await new Promise((r) => gw.server.close(r)); await new Promise((r) => app.close(r)); };
  return { hits, state, call, close, advance: (ms) => { t += ms; }, gw };
}
const control = (call, body) => call("/_hub/api/link", { method: "POST", headers: { "x-hub-control": "1", "content-type": "application/json" }, body: JSON.stringify(body) });
const PHONE = "192.168.1.55";

test("this PC always reaches the app; the request is passed through unchanged", async () => {
  const s = await setup();
  const res = await s.call("/reports?x=1", { headers: { cookie: "a=1; hub_pair=zzz" } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "APP:/reports?x=1");
  assert.match(res.headers.get("set-cookie"), /app=1/);
  assert.equal(s.hits[0].cookie, "a=1"); // the pairing cookie never reaches the app
  await s.close();
});

test("a phone is turned away while the link is off, and never reaches the app", async () => {
  const s = await setup();
  const res = await s.call("/", { remote: PHONE });
  assert.equal(res.status, 403);
  assert.match(await res.text(), /الربط مقفول/);
  assert.equal((await s.call("/_hub/pair", { remote: PHONE, method: "POST", body: "pin=123456" })).status, 403);
  assert.equal(s.hits.length, 0);
  await s.close();
});

test("link on: phone sees the PIN page, wrong PIN fails, right PIN pairs it, then it reaches the app", async () => {
  const s = await setup();
  assert.equal((await control(s.call, { on: true, minutes: 60 })).status, 200);

  const page = await s.call("/anything", { remote: PHONE });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /name="pin"/);
  assert.equal(s.hits.length, 0);

  const wrong = await s.call("/_hub/pair", { remote: PHONE, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pin=000000" });
  assert.equal(wrong.status, 403);
  assert.match(await wrong.text(), /غلط/);

  const ok = await s.call("/_hub/pair", { remote: PHONE, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pin=123456" });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("location"), "/");
  const cookie = ok.headers.get("set-cookie").split(";")[0];
  assert.match(ok.headers.get("set-cookie"), /HttpOnly/);

  const res = await s.call("/lab", { remote: PHONE, headers: { cookie: `${cookie}; app=1`, "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/120" } });
  assert.equal(await res.text(), "APP:/lab");
  assert.equal(s.hits.at(-1).xff, PHONE);
  assert.equal(s.hits.at(-1).cookie, "app=1");

  const status = await (await s.call("/_hub/api/status")).json();
  assert.deepEqual([status.on, status.pin, status.urls, status.qr], [true, "123456", ["http://192.168.1.20:8080"], "<svg>qr</svg>"]);
  assert.deepEqual(status.devices.map((d) => [d.ip, d.ua]), [[PHONE, "Android · Chrome"]]);
  await s.close();
});

test("a phone can never see or use the control page, even when paired", async () => {
  const s = await setup();
  await control(s.call, { on: true });
  const pair = await s.call("/_hub/pair", { remote: PHONE, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pin=123456" });
  const cookie = pair.headers.get("set-cookie").split(";")[0];
  for (const path of ["/_hub", "/_hub/api/status"]) assert.equal((await s.call(path, { remote: PHONE, headers: { cookie } })).status, 404, path);
  const sneaky = await control(s.call, { on: false }); // from this PC: fine
  assert.equal(sneaky.status, 200);
  await control(s.call, { on: true });
  const fromPhone = await s.call("/_hub/api/link", { remote: PHONE, method: "POST", headers: { cookie, "x-hub-control": "1" }, body: JSON.stringify({ on: false }) });
  assert.equal(fromPhone.status, 404);
  assert.equal((await (await s.call("/_hub/api/status")).json()).on, true);
  await s.close();
});

test("control actions need the custom header (a web page cannot switch the link on)", async () => {
  const s = await setup();
  const res = await s.call("/_hub/api/link", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ on: true }) });
  assert.equal(res.status, 403);
  assert.equal((await (await s.call("/_hub/api/status")).json()).on, false);
  assert.equal((await s.call("/_hub/api/link", { method: "POST", headers: { "x-hub-control": "1" }, body: "not json" })).status, 400);
  await s.close();
});

test("switching the link off cuts every phone at once, and a new switch-on needs a new pairing", async () => {
  const s = await setup();
  await control(s.call, { on: true });
  const pair = () => s.call("/_hub/pair", { remote: PHONE, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pin=123456" });
  const cookie = (await pair()).headers.get("set-cookie").split(";")[0];
  assert.equal(await (await s.call("/", { remote: PHONE, headers: { cookie } })).text(), "APP:/");

  await control(s.call, { on: false });
  assert.equal((await s.call("/", { remote: PHONE, headers: { cookie } })).status, 403);

  await control(s.call, { on: true }); // new epoch: the old cookie is dead even though the PIN text is the same
  assert.match(await (await s.call("/", { remote: PHONE, headers: { cookie } })).text(), /name="pin"/);
  assert.equal(s.hits.length, 1);
  await s.close();
});

test("a new PIN while the link stays on cuts the phones that were already paired", async () => {
  const s = await setup();
  await control(s.call, { on: true });
  const pair = await s.call("/_hub/pair", { remote: PHONE, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pin=123456" });
  const cookie = pair.headers.get("set-cookie").split(";")[0];
  assert.equal(await (await s.call("/", { remote: PHONE, headers: { cookie } })).text(), "APP:/");
  await s.call("/_hub/api/renew", { method: "POST", headers: { "x-hub-control": "1" } });
  assert.match(await (await s.call("/", { remote: PHONE, headers: { cookie } })).text(), /name="pin"/);
  await s.close();
});

test("the link switches itself off when its time is up", async () => {
  const s = await setup();
  await control(s.call, { on: true, minutes: 30 });
  assert.match(await (await s.call("/", { remote: PHONE })).text(), /name="pin"/);
  s.advance(31 * 60_000);
  assert.equal((await s.call("/", { remote: PHONE })).status, 403);
  assert.equal((await (await s.call("/_hub/api/status")).json()).on, false);
  await s.close();
});

test("guessing the PIN is slowed down: 5 wrong tries and that phone is blocked, even with the right PIN", async () => {
  const s = await setup();
  await control(s.call, { on: true });
  const post = (pin, remote = PHONE) => s.call("/_hub/pair", { remote, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `pin=${pin}` });
  for (let i = 0; i < 5; i++) assert.equal((await post("999999")).status, 403);
  assert.equal((await post("123456")).status, 429);
  assert.equal((await post("123456", "192.168.1.99")).status, 303); // other phones are unaffected
  await s.close();
});

test("the app being down gives a calm retry page, not a crash", async () => {
  const s = await setup({ upstreamPort: 1 });
  const res = await s.call("/");
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("retry-after"), "3");
  assert.match(await res.text(), /بيشتغل/);
  await s.close();
});

test("the control page itself is served to this PC", async () => {
  const s = await setup();
  const res = await s.call("/_hub");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /شغّل ربط الموبايل/);
  assert.match(html, /x-hub-control/);
  await s.close();
});
