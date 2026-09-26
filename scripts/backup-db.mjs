#!/usr/bin/env node
/**
 * Database backup — one of the "Next production hardening" items in
 * FINAL_STATUS.md ("Add production database backups"), which the V1 package
 * shipped without.
 *
 * Exports every application + auth table to a single timestamped, gzip-
 * compressed JSON file. Plain `pg` + JSON rather than shelling out to
 * `pg_dump`: this runs the same way from any Node environment (CI job,
 * scheduled GitHub Action, a developer's laptop) without assuming the
 * `pg_dump` binary is installed, which it usually is NOT on serverless /
 * managed runtimes (this app deploys via the Nitro "vercel" preset — see
 * `vite.config.ts`).
 *
 * This is a durability safety net for self-managed Postgres. If the deploy
 * target is Neon (the DB this app is pre-wired for — see `src/lib/db.ts`),
 * prefer Neon's built-in point-in-time recovery / branching for your primary
 * recovery path and treat this script as a secondary, portable export you
 * control yourself (e.g. to keep an off-provider copy).
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/backup-db.mjs [outputDir]
 *
 * Schedule this with a cron job, a scheduled GitHub Action, or any
 * always-on host with network access to the database — a serverless
 * deployment (Vercel functions) has no persistent process to run a cron
 * job from by itself.
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import pg from "pg";

// Ordered so a restore can re-insert parents before children (see
// restore-db.mjs). Any table not listed here is intentionally excluded
// (e.g. `_migrations`, which restore-db.mjs recomputes by running migrations).
const TABLES = [
  "user",
  "account",
  "session",
  "verification",
  "platform_admins",
  "labs",
  "lab_users",
  "lab_test_catalog",
  "patients",
  "reports",
  "report_results",
  "audit_logs",
];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[backup] DATABASE_URL is required.");
  process.exit(1);
}

const outputDir = process.argv[2] || join(process.cwd(), "backups");

async function main() {
  await mkdir(outputDir, { recursive: true });

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  const dump = { createdAt: new Date().toISOString(), tables: {} };

  try {
    for (const table of TABLES) {
      try {
        const res = await client.query(`select * from "${table}"`);
        dump.tables[table] = res.rows;
        console.log(`[backup] ${table}: ${res.rows.length} row(s)`);
      } catch (err) {
        // A table that does not exist yet (e.g. auth tables before sign-in
        // was ever turned on) must not fail the whole backup.
        console.warn(`[backup] skipping "${table}": ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  const stamp = dump.createdAt.replace(/[:.]/g, "-");
  const outPath = join(outputDir, `backup-${stamp}.json.gz`);
  await pipeline(Readable.from([JSON.stringify(dump)]), createGzip(), createWriteStream(outPath));

  console.log(`[backup] wrote ${outPath}`);
  console.log(
    "[backup] this file contains password hashes and personal/medical data — " +
      "store it encrypted and access-controlled, never in a public bucket or git repo.",
  );
}

main().catch((err) => {
  console.error("[backup] failed:", err?.message || err);
  process.exit(1);
});
