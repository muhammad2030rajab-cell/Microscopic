#!/usr/bin/env node
/**
 * Restore a backup produced by `backup-db.mjs`.
 *
 * Upserts every row from the dump back into its table, in an order that
 * respects the foreign keys in migrations/0002_laboratory_system.sql,
 * migrations/0003_platform_admins.sql, migrations/0005_lab_test_catalog.sql
 * and migrations/auth/0001_auth.sql (parents before children). Run
 * `npm run db:migrate` first against the target database so every table in
 * the dump actually exists.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/restore-db.mjs path/to/backup.json.gz
 *
 * This is intentionally conservative: it only INSERTs (upsert on primary
 * key), and never TRUNCATEs or DELETEs existing rows, so restoring into a
 * database that already has data merges rather than destroys it. Restoring
 * into a fresh, empty database is the safest and best-tested case.
 */
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const inputPath = process.argv[2];

if (!databaseUrl) {
  console.error("[restore] DATABASE_URL is required.");
  process.exit(1);
}
if (!inputPath) {
  console.error("[restore] Usage: node scripts/restore-db.mjs <backup.json.gz>");
  process.exit(1);
}

// Same order as backup-db.mjs's TABLES list, and safe to insert in this
// sequence given each table's foreign keys.
const TABLE_ORDER = [
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

async function readGzipJson(path) {
  const chunks = [];
  await new Promise((resolve, reject) => {
    createReadStream(path)
      .pipe(createGunzip())
      .on("data", (chunk) => chunks.push(chunk))
      .on("end", resolve)
      .on("error", reject);
  });
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main() {
  const dump = await readGzipJson(inputPath);
  console.log(`[restore] backup created at ${dump.createdAt}`);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    for (const table of TABLE_ORDER) {
      const rows = dump.tables?.[table];
      if (!rows || rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
      const conflictTarget = columns.includes("id") ? "id" : columns[0];

      let inserted = 0;
      for (const row of rows) {
        const values = columns.map((c) => row[c]);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
        const updateSet = columns
          .filter((c) => c !== conflictTarget)
          .map((c) => `"${c}" = excluded."${c}"`)
          .join(", ");
        const sql = updateSet
          ? `insert into "${table}" (${quotedColumns}) values (${placeholders})
             on conflict ("${conflictTarget}") do update set ${updateSet}`
          : `insert into "${table}" (${quotedColumns}) values (${placeholders})
             on conflict ("${conflictTarget}") do nothing`;
        await client.query(sql, values);
        inserted += 1;
      }
      console.log(`[restore] ${table}: ${inserted} row(s) restored`);
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log("[restore] done.");
}

main().catch((err) => {
  console.error("[restore] failed:", err?.message || err);
  process.exit(1);
});
