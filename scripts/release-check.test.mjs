import test from "node:test";
import assert from "node:assert/strict";
import { checkRelease, readConfig, secretsFromPem } from "./release-check.mjs";

const KEY = "tHZKsK+53XYcoZ9BEjFULKvUWPMUY8Gbf+khyX9A028=";
const PEM = "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJ0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcd\n-----END PRIVATE KEY-----\n";
const good = [{ path: ".output/server/index.mjs", text: `const k="${KEY}";` }];

test("a clean build passes", () => {
  const r = checkRelease({ files: good, publicKey: KEY, enforced: true, secrets: secretsFromPem(PEM) });
  assert.deepEqual([r.ok, r.problems, r.warnings], [true, [], []]);
});

test("source maps, env files, pem files and license logs are refused", () => {
  const files = [...good, { path: ".output/public/assets/a.js.map" }, { path: ".output/.env" }, { path: ".output/x/license-private.pem" }, { path: ".output/issued.jsonl" }];
  const r = checkRelease({ files, publicKey: KEY, enforced: true });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 4);
});

test("the private key is caught as PEM, PEM body, or its base64 env form", () => {
  const body = secretsFromPem(PEM);
  assert.equal(body.length, 2);
  for (const leak of [PEM, body[0], body[1]]) {
    const r = checkRelease({ files: [...good, { path: ".output/server/leak.mjs", text: `x="${leak}"` }], publicKey: KEY, enforced: true, secrets: body });
    assert.equal(r.ok, false, leak.slice(0, 20));
  }
});

test("enforcement off or no public key is a blocking problem; missing key in the bundle is only a warning", () => {
  assert.equal(checkRelease({ files: good, publicKey: KEY, enforced: false }).ok, false);
  assert.equal(checkRelease({ files: good, publicKey: "", enforced: true }).ok, false);
  const r = checkRelease({ files: [{ path: ".output/a.mjs", text: "nothing" }], publicKey: KEY, enforced: true });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
});

test("readConfig reads the real config format", () => {
  const src = `export const LICENSE_PUBLIC_KEY: string = "${KEY}";\nexport const LICENSE_ENFORCED: boolean = true;`;
  assert.deepEqual(readConfig(src), { publicKey: KEY, enforced: true });
  assert.deepEqual(readConfig(src.replace("= true", "= false")), { publicKey: KEY, enforced: false });
});
