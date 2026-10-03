import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";

/**
 * Helpers for the one-time Google Drive connection flow
 * (/api/google-drive/connect -> Google -> /api/google-drive/callback).
 * Server-only. The flow is restricted to active platform admins and protected
 * with a `state` cookie so a third party cannot start or complete it.
 */
export const STATE_COOKIE = "gd_oauth_state";

/** Same origin the app is served from (or BETTER_AUTH_URL when set). */
export function driveRedirectUri(request: Request): string {
  const base = process.env.BETTER_AUTH_URL?.trim() || new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/api/google-drive/callback`;
}

export async function isPlatformAdminRequest(request: Request): Promise<boolean> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return false;
  const sql = await getSql();
  const rows = await sql<{ auth_user_id: string }>`
    select auth_user_id from platform_admins
    where auth_user_id = ${session.user.id} and is_active = true
    limit 1
  `;
  return rows.length > 0;
}

export function newState(): string {
  return randomBytes(24).toString("hex");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
