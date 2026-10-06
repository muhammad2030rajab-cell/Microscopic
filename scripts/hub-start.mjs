// Starts the lab's local program on this PC.
//   node scripts/hub-start.mjs        (or double-click hub-start.bat)
// - The app listens on this PC only (127.0.0.1).
// - The gateway on HUB_PORT (default 8080) is the one door. It always opens for this PC, and for phones
//   only while the owner switches "mobile link" on from the control page (http://localhost:8080/_hub).
// - Data lives in %USERPROFILE%\MicroscopicHub (override with HUB_HOME). Back that folder up.
// - Patient data stays on this PC. (The page may ask Google Fonts for fonts when a connection exists; without one it falls back.)
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { createGateway } from "./hub-gateway.mjs";
import { buildHubEnv, hubOrigins, internalPort, lanAddresses, parsePort } from "./hub-config.mjs";

const home = resolve(process.env.HUB_HOME || join(homedir(), "MicroscopicHub"));
const port = parsePort(process.env.HUB_PORT);
const appPort = internalPort(port);
const entry = resolve("." + "/.output/server/index.mjs");

if (!existsSync(entry)) {
  console.error("The program is not built yet. Run:  npm install  then  npm run hub:build");
  process.exit(1);
}

mkdirSync(home, { recursive: true });
const secretFile = join(home, "secret.txt");
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString("hex"), { mode: 0o600 });
const secret = readFileSync(secretFile, "utf8").trim();

const lan = () => lanAddresses(networkInterfaces());
const env = buildHubEnv({ home, port, ips: lan(), secret, appPort });

// QR code for the phone address, if the `qrcode` package is installed (it is a dependency of the app).
let qrSvg = async () => null;
try {
  const mod = await import("qrcode");
  const toString = (mod.default ?? mod).toString;
  qrSvg = (text) => toString(text, { type: "svg", margin: 1 });
} catch {
  /* no QR: the address is still shown as text */
}

const app = spawn(process.execPath, [entry], { stdio: "inherit", env: { ...process.env, ...env } });
app.on("exit", (code) => process.exit(code ?? 0));

const { server } = createGateway({
  upstreamPort: appPort,
  secret,
  urls: () => hubOrigins(lan(), port).filter((o) => !o.includes("localhost") && !o.includes("127.0.0.1")),
  qrSvg,
});
server.listen(port, "0.0.0.0", () => {
  const control = `http://localhost:${port}/_hub`;
  console.log("Microscopic is starting. Your data is stored on this PC only (no cloud).");
  console.log("Data folder:      ", home);
  console.log("Open the program: ", `http://localhost:${port}`);
  console.log("Mobile link panel:", control, "(the link to phones is OFF until you switch it on there)");
  if (process.platform === "win32" && process.env.HUB_NO_OPEN !== "1") {
    spawn("cmd", ["/c", "start", "", control], { detached: true, stdio: "ignore" }).unref();
  }
});
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${port} is already used. Close the other copy, or set HUB_PORT.` : String(e));
  app.kill();
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close();
    app.kill(sig);
  });
}
