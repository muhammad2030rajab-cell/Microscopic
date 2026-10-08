import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getPglite, getSql, type Sql } from "@/lib/db";
import { CrossSiteRequestError, assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { UnauthorizedError, requireUserId } from "@/lib/auth/verify.server";
import { assertLicensedRuntime } from "@/lib/license-runtime.server";
import { logEvent } from "@/lib/logger.server";

/**
 * In-program backup and restore for the local program (hub), fully offline.
 *  - Backup: the whole embedded database as one file (PGlite's own consistent data-directory dump).
 *  - Restore: the uploaded file is staged on disk and the program restarts; scripts/hub-restore.mjs applies it
 *    before the database opens and keeps the previous data next to it (db.before-restore-<date>).
 * Only the lab owner or a platform admin, and only in the local program (never on the cloud deployment).
 */

const RESTORE_EXIT_CODE = 75; // keep in sync with scripts/hub-restore.mjs
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

export const hubBackupAvailable = (): boolean =>
  process.env.HUB_MODE === "1" && !process.env.VERCEL && Boolean(process.env.HUB_DATA_DIR?.trim());

export async function assertCanManageBackups(userId: string): Promise<Sql> {
  if (!hubBackupAvailable()) throw new Error("BACKUP_NOT_AVAILABLE");
  const sql = await getSql();
  const rows = await sql<{ ok: boolean }>`
    select (
      exists(select 1 from platform_admins where auth_user_id = ${userId} and is_active = true)
      or exists(select 1 from lab_users where auth_user_id = ${userId} and role = 'owner' and is_active = true)
    ) as ok
  `;
  if (!rows[0]?.ok) throw new Error("PERMISSION_DENIED");
  return sql;
}

export async function readLastBackupAt(sql: Sql): Promise<string | null> {
  const rows = await sql<{ value: string }>`select value from platform_settings where key = 'last_backup_at' limit 1`;
  return rows[0]?.value ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");

async function createBackup(): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pg = await getPglite();
  const file = await pg.dumpDataDir("gzip");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const d = new Date();
  const fileName = `Microscopic-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.rjbak`;
  return { bytes, fileName };
}

async function stagePendingRestore(bytes: Uint8Array): Promise<void> {
  // A backup is a gzip file; refuse anything else before touching the disk.
  if (bytes.length < 1024 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error("BACKUP_INVALID");
  const dir = join(dirname(process.env.HUB_DATA_DIR!.trim()), "restore");
  await mkdir(dir, { recursive: true });
  const part = join(dir, "pending.tar.gz.part");
  await writeFile(part, bytes);
  await rename(part, join(dir, "pending.tar.gz"));
}

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (error instanceof CrossSiteRequestError) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  const text = error instanceof Error ? error.message : "";
  if (/PERMISSION_DENIED|BACKUP_NOT_AVAILABLE|LICENSE/.test(text)) return Response.json({ error: text }, { status: 403 });
  if (/BACKUP_INVALID/.test(text)) return Response.json({ error: "BACKUP_INVALID" }, { status: 400 });
  logEvent("error", "backup.failed", { error: text });
  return Response.json({ error: "FAILED" }, { status: 500 });
}

async function authorize(): Promise<Sql> {
  assertSameSiteRequest();
  const userId = await requireUserId();
  await assertLicensedRuntime();
  return assertCanManageBackups(userId);
}

export async function handleBackupDownload(): Promise<Response> {
  try {
    const sql = await authorize();
    const { bytes, fileName } = await createBackup();
    await sql.query(
      `insert into platform_settings (key, value) values ('last_backup_at', $1)
       on conflict (key) do update set value = excluded.value, updated_at = current_timestamp`,
      [new Date().toISOString()],
    );
    logEvent("info", "backup.created", { bytes: bytes.length });
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleRestoreUpload(request: Request): Promise<Response> {
  try {
    await authorize();
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES) return Response.json({ error: "TOO_LARGE" }, { status: 413 });
    await stagePendingRestore(new Uint8Array(await request.arrayBuffer()));
    logEvent("info", "backup.restore_staged", {});
    // Close the database cleanly, then exit with the "restart me" code: the Windows app starts the program again
    // and scripts/hub-restore.mjs applies the staged backup before the database opens.
    setTimeout(() => {
      void (async () => {
        try {
          await (await getPglite()).close();
        } catch {
          /* exiting anyway */
        }
        process.exit(RESTORE_EXIT_CODE);
      })();
    }, 500);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
