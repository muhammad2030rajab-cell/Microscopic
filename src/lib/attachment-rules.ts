/** Pure rules for report attachments kept inside the local program's database (no I/O, unit-tested). */

export const LOCAL_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"] as const;

/** Same-origin path the local program serves an attachment from. */
export const attachmentPath = (id: string): string => `/api/attachments/${id}`;

/** True for a url produced by `attachmentPath` (as opposed to a cloud Blob url). */
export const isLocalAttachmentUrl = (url: string): boolean => /^\/api\/attachments\/[\w-]+$/.test(url);

/** Local uploads accept only images and PDF, so a stored file can never be served as a web page. */
export function isAllowedLocalType(contentType: string | null | undefined): boolean {
  const t = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return (LOCAL_ATTACHMENT_TYPES as readonly string[]).includes(t);
}

/** Content type to answer with: the stored one when allowed, otherwise a download-only binary type. */
export function servedContentType(stored: string | null | undefined): string {
  const t = String(stored ?? "").split(";")[0].trim().toLowerCase();
  return isAllowedLocalType(t) ? t : "application/octet-stream";
}

/** Content-Disposition with a safe, UTF-8 (Arabic-friendly) file name. Inline only for allowed types. */
export function contentDisposition(fileName: string, contentType: string | null | undefined): string {
  const kind = isAllowedLocalType(contentType) ? "inline" : "attachment";
  const clean = String(fileName || "attachment").replace(/[\r\n"\\]/g, "_");
  return `${kind}; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
