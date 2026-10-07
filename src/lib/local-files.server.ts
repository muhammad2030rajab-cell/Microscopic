/** Disk access for attachments in the local program. Server only. The path logic itself is in local-files.ts. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { env } from "@/lib/env.server";
import { resolveInside } from "@/lib/local-files";

/** The files folder, or null when this is not the local program (never on Vercel). */
export function localFilesRoot(): string | null {
  if (env("HUB_MODE") !== "1" || env("VERCEL")) return null;
  return env("HUB_FILES_DIR") || null;
}

function pathFor(key: string): string {
  const root = localFilesRoot();
  const full = root ? resolveInside(root, key) : null;
  if (!full) throw new Error("LOCAL_FILE_PATH_INVALID");
  return full;
}

export async function saveLocalFile(key: string, data: Buffer): Promise<void> {
  const full = pathFor(key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
}

/** null when the file is not there (deleted by hand, or the folder was moved). */
export async function readLocalFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(pathFor(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteLocalFile(key: string): Promise<void> {
  await rm(pathFor(key), { force: true });
}
