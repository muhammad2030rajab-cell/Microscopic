// Builds the app as a plain Node server for the lab PC (HUB.md). Cross-platform:
// sets the variable itself, so it works in Windows cmd too. Does NOT run db:migrate:
// the hub's own on-disk database applies migrations/ by itself on first start.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Newer Vite versions block `require.resolve("vite/bin/vite.js")` (not in their "exports" map),
// so find the package through package.json (always exported) and read its "bin" entry.
function findVite() {
  const pkgPath = require.resolve("vite/package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.vite;
  if (!bin) throw new Error("vite/package.json has no bin entry");
  return join(dirname(pkgPath), bin);
}

let vite;
try {
  vite = findVite();
} catch (e) {
  console.error("Could not locate vite. Run `npm install` first.\n" + String(e));
  process.exit(1);
}
const r = spawnSync(process.execPath, [vite, "build"], {
  stdio: "inherit",
  env: { ...process.env, HUB_BUILD: "1" },
});
process.exit(r.status ?? 1);
