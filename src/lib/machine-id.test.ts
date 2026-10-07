import assert from "node:assert/strict";
import test from "node:test";
import { isUsableSmbiosUuid } from "./machine-id.server.ts";

test("a real board UUID is usable", () => {
  assert.equal(isUsableSmbiosUuid("4C4C4544-0042-3510-8047-B7C04F4B4E33"), true);
  assert.equal(isUsableSmbiosUuid(" 7f3a2c10-91de-4b6a-8c55-0a1b2c3d4e5f \n"), true);
});

test("empty, malformed, all-same-digit and factory placeholder ids are not usable", () => {
  for (const bad of ["", "abc", "00000000-0000-0000-0000-000000000000", "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF", "03000200-0400-0500-0006-000700080009", "12345678-1234-5678-90AB-CDDEEFAABBCC", "aaaaaaaa-bbbb-aaaa-bbbb-aaaaaaaaaaaa"]) {
    assert.equal(isUsableSmbiosUuid(bad), false, bad);
  }
});
