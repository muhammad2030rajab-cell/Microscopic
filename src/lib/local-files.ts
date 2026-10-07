/**
 * Where a report attachment lives when the program runs on the lab PC (HUB.md): a plain file in the data
 * folder instead of a cloud service. Pure helpers (no disk access) so they are unit-tested.
 *
 * The file's place is never taken from the browser: it is rebuilt from ids the database already holds, and
 * `resolveInside` refuses anything that would step out of the files folder.
 */
import { isAbsolute, relative, resolve } from "node:path";

export const LOCAL_URL_PREFIX = "/api/files/";

export function isLocalAttachmentUrl(url: unknown): boolean {
  return typeof url === "string" && url.startsWith(LOCAL_URL_PREFIX);
}

export function localAttachmentUrl(attachmentId: string): string {
  return LOCAL_URL_PREFIX + encodeURIComponent(attachmentId);
}

/** One path segment with nothing in it that could mean "go up" or "start from the root". */
function safeSegment(value: string): string {
  return String(value).replace(/[^\w.\-\u0600-\u06FF ]/g, "_").replace(/^\.+/, "_") || "_";
}

export function localFileKey(parts: { labId: string; reportId: string; attachmentId: string; fileName: string }): string {
  return `${safeSegment(parts.labId)}/${safeSegment(parts.reportId)}/${safeSegment(parts.attachmentId)}-${safeSegment(parts.fileName)}`;
}

/** The full path of `key` under `root`, or null when it would land outside `root`. */
export function resolveInside(root: string, key: string): string | null {
  if (!key || key.includes("\0")) return null;
  const base = resolve(root);
  const full = resolve(base, key);
  const rel = relative(base, full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return full;
}

/** Types a browser may show inside the page; everything else is offered as a download only. */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

export function fileResponseType(contentType: string | null | undefined): { type: string; inline: boolean } {
  const t = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return INLINE_TYPES.has(t) ? { type: t, inline: true } : { type: "application/octet-stream", inline: false };
}
