import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CLOUD_URL, defaultSettings, healthUrl, normalizeUrl, pickTarget, sanitizeSettings } from "../www/launcher-logic.js";

test("normalizeUrl: LAN addresses and host:port default to http", () => {
  assert.equal(normalizeUrl("192.168.1.20:8080"), "http://192.168.1.20:8080");
  assert.equal(normalizeUrl(" 192.168.1.20 "), "http://192.168.1.20");
  assert.equal(normalizeUrl("lab-pc.local:8080"), "http://lab-pc.local:8080");
  assert.equal(normalizeUrl("localhost:3000"), "http://localhost:3000");
});

test("normalizeUrl: plain domains default to https, trailing slashes go", () => {
  assert.equal(normalizeUrl("microscopic.vercel.app"), "https://microscopic.vercel.app");
  assert.equal(normalizeUrl("https://microscopic.vercel.app///"), "https://microscopic.vercel.app");
  assert.equal(normalizeUrl("http://10.0.0.5:8080/"), "http://10.0.0.5:8080");
});

test("normalizeUrl: junk, empty and non-web schemes are refused", () => {
  assert.equal(normalizeUrl(""), null);
  assert.equal(normalizeUrl(undefined), null);
  assert.equal(normalizeUrl("javascript://x"), null);
  assert.equal(normalizeUrl("ftp://host"), null);
  assert.equal(normalizeUrl("http://"), null);
  assert.equal(normalizeUrl("not a url"), null);
});

test("sanitizeSettings: broken storage falls back to the safe default (cloud only)", () => {
  assert.deepEqual(sanitizeSettings(null), defaultSettings());
  assert.deepEqual(sanitizeSettings("x"), defaultSettings());
  assert.equal(sanitizeSettings({ mode: "weird" }).mode, "cloud");
  assert.equal(sanitizeSettings({ cloudUrl: "%%%" }).cloudUrl, DEFAULT_CLOUD_URL);
});

test("sanitizeSettings: hub/auto without a hub address cannot stay selected", () => {
  assert.equal(sanitizeSettings({ mode: "hub", hubUrl: "" }).mode, "cloud");
  assert.equal(sanitizeSettings({ mode: "auto" }).mode, "cloud");
  assert.deepEqual(sanitizeSettings({ mode: "hub", hubUrl: "192.168.1.20:8080" }), {
    mode: "hub",
    cloudUrl: DEFAULT_CLOUD_URL,
    hubUrl: "http://192.168.1.20:8080",
  });
});

const both = { mode: "auto", cloudUrl: "https://c.example", hubUrl: "http://192.168.1.20:8080" };

test("pickTarget auto: cloud when up, hub when only the hub is up, nothing otherwise", () => {
  assert.deepEqual(pickTarget(both, { cloudUp: true, hubUp: true }), { target: "cloud", url: "https://c.example" });
  assert.deepEqual(pickTarget(both, { cloudUp: false, hubUp: true }), { target: "hub", url: "http://192.168.1.20:8080" });
  assert.equal(pickTarget(both, { cloudUp: false, hubUp: false }), null);
});

test("pickTarget cloud/hub modes never hop to the other server", () => {
  assert.equal(pickTarget({ ...both, mode: "cloud" }, { cloudUp: false, hubUp: true }), null);
  assert.equal(pickTarget({ ...both, mode: "hub" }, { cloudUp: true, hubUp: false }), null);
  assert.equal(pickTarget({ ...both, mode: "hub" }, { cloudUp: false, hubUp: true })?.target, "hub");
});

test("pickTarget: auto with no hub set behaves like cloud", () => {
  const s = { mode: "auto", cloudUrl: "https://c.example", hubUrl: "" };
  assert.equal(pickTarget(s, { cloudUp: false, hubUp: true }), null);
});

test("healthUrl", () => {
  assert.equal(healthUrl("http://192.168.1.20:8080"), "http://192.168.1.20:8080/api/health");
  assert.equal(healthUrl("https://x.app/"), "https://x.app/api/health");
});
