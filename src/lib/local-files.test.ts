import test from "node:test";
import assert from "node:assert/strict";
import { fileResponseType, isLocalAttachmentUrl, localAttachmentUrl, localFileKey, resolveInside } from "./local-files.ts";

test("a local attachment has its own url shape, cloud urls are not mistaken for it", () => {
  assert.equal(localAttachmentUrl("abc-123"), "/api/files/abc-123");
  assert.equal(isLocalAttachmentUrl("/api/files/abc-123"), true);
  assert.equal(isLocalAttachmentUrl("https://blob.vercel-storage.com/x.png"), false);
  assert.equal(isLocalAttachmentUrl(null), false);
});

test("the key is built from ids and a cleaned name, never from raw input", () => {
  const key = localFileKey({ labId: "lab1", reportId: "r1", attachmentId: "a1", fileName: "../../etc/passwd" });
  assert.equal(key, "lab1/r1/a1-__.._etc_passwd"); // slashes become "_", the leading dots are neutralised
  assert.ok(!key.split("/").includes(".."));
  assert.equal(localFileKey({ labId: "..", reportId: "..", attachmentId: "x", fileName: "t.png" }), "_/_/x-t.png");
});

test("resolveInside keeps every path under the files folder", () => {
  const root = "/data/hub/files";
  assert.equal(resolveInside(root, "lab1/r1/a1-scan.png")?.replaceAll("\\", "/").endsWith("/data/hub/files/lab1/r1/a1-scan.png"), true);
  assert.equal(resolveInside(root, "../db/secret"), null);
  assert.equal(resolveInside(root, "lab1/../../db"), null);
  assert.equal(resolveInside(root, ""), null);
  assert.equal(resolveInside(root, "a\0b"), null);
});

test("only images and PDF are shown inside the page, anything else downloads", () => {
  assert.deepEqual(fileResponseType("image/jpeg"), { type: "image/jpeg", inline: true });
  assert.deepEqual(fileResponseType("application/pdf; charset=binary"), { type: "application/pdf", inline: true });
  assert.deepEqual(fileResponseType("text/html"), { type: "application/octet-stream", inline: false });
  assert.deepEqual(fileResponseType("image/svg+xml"), { type: "application/octet-stream", inline: false });
  assert.deepEqual(fileResponseType(undefined), { type: "application/octet-stream", inline: false });
});
