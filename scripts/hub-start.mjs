// Starts the lab's local server (the "hub") on the Windows PC.
//   node scripts/hub-start.mjs        (or double-click hub-start.bat)
// Data lives in %USERPROFILE%\MicroscopicHub (override with HUB_HOME): the
// database in .\db, the signing secret in .\secret.txt. Back up that folder.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { buildHubEnv, hubOrigins, lanAddresses, parsePort } from "./hub-config.mjs";

const home = resolve(process.env.HUB_HOME || join(homedir(), "MicroscopicHub"));
const port = parsePort(process.env.HUB_PORT);
const entry = resolve("." + "/.output/server/index.mjs");

if (!existsSync(entry)) {
  console.error("The hub is not built yet. Run:  npm install  then  npm run hub:build");
  process.exit(1);
}

mkdirSync(home, { recursive: true });
const secretFile = join(home, "secret.txt");
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString("hex"), { mode: 0o600 });
const secret = readFileSync(secretFile, "utf8").trim();

const ips = lanAddresses(networkInterfaces());
const env = buildHubEnv({ home, port, ips, secret });

console.log("Microscopic hub starting...");
console.log("Data folder:", home);
console.log("Open from the phones (same Wi-Fi):");
for (const o of hubOrigins(ips, port).filter((x) => !x.includes("127.0.0.1"))) console.log("  ", o);
if (!ips.length) console.log("   (no network address found: connect this PC to the lab Wi-Fi/router)");

const child = spawn(process.execPath, [entry], { stdio: "inherit", env: { ...process.env, ...env } });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
