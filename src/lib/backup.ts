import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

/** What the Settings page needs to know: is backup available here (local program only) and when was the last one. */
export const getBackupInfo = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ available: boolean; lastBackupAt: string | null }> => {
    const { hubBackupAvailable, assertCanManageBackups, readLastBackupAt } = await import("@/lib/backup.server");
    if (!hubBackupAvailable()) return { available: false, lastBackupAt: null };
    try {
      const sql = await assertCanManageBackups(context.userId);
      return { available: true, lastBackupAt: await readLastBackupAt(sql) };
    } catch {
      return { available: false, lastBackupAt: null };
    }
  });
