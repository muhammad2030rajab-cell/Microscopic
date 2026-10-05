// Builds the app as a plain Node server for the lab PC (HUB.md). Cross-platform:
// sets the variable itself, so it works in Windows cmd too. Does NOT run db:migrate:
// the hub's own on-disk database applies migrations/ by itself on first start.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let vite;
try {
  vite = require.resolve("vite/bin/vite.js");
} catch {
  console.error("vite is not installed. Run `npm install` first.");
  process.exit(1);
}
const r = spawnSync(process.execPath, [vite, "build"], {
  stdio: "inherit",
  env: { ...process.env, HUB_BUILD: "1" },
});
process.exit(r.status ?? 1);
