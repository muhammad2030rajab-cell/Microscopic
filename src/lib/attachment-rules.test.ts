import test from "node:test";
import assert from "node:assert/strict";
import { attachmentPath, contentDisposition, isAllowedLocalType, isLocalAttachmentUrl, servedContentType } from "./attachment-rules.ts";

test("attachmentPath and isLocalAttachmentUrl agree", () => {
  assert.equal(attachmentPath("abc-123"), "/api/attachments/abc-123");
  assert.ok(isLocalAttachmentUrl(attachmentPath("abc-123")));
  assert.ok(!isLocalAttachmentUrl("https://x.public.blob.vercel-storage.com/reports/a.png"));
  assert.ok(!isLocalAttachmentUrl("/api/attachments/../secret"));
});

test("only images and PDF are accepted locally", () => {
  for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "IMAGE/PNG", "image/png; charset=x"]) assert.ok(isAllowedLocalType(t), t);
  for (const t of ["text/html", "image/svg+xml", "application/javascript", "", null, undefined]) assert.ok(!isAllowedLocalType(t), String(t));
});

test("an unexpected stored type is never served as a page", () => {
  assert.equal(servedContentType("text/html"), "application/octet-stream");
  assert.equal(servedContentType("image/png"), "image/png");
});

test("content disposition is inline only for allowed types and escapes the name", () => {
  assert.match(contentDisposition("تقرير 1.pdf", "application/pdf"), /^inline; filename\*=UTF-8''/);
  assert.match(contentDisposition("a.html", "text/html"), /^attachment;/);
  assert.ok(!contentDisposition('x"\r\ny.png', "image/png").includes('"'));
  assert.ok(!/[\r\n]/.test(contentDisposition("a\r\nb.png", "image/png")));
});
