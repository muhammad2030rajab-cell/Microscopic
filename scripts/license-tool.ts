/**
 * One-time setup for activation, run on YOUR computer:
 *
 *   npm run license -- keygen --server https://your-app.vercel.app
 *
 * It makes your signing key pair, writes the PUBLIC key and your server address into src/lib/license-config.ts
 * (that is what ships inside the customers' program), keeps a copy of the private key in ~/.rajab-license/ (outside
 * the project), and prints the value to set as LICENSE_PRIVATE_KEY on your cloud deployment (Vercel). Codes for
 * customers are then made from the admin page (Labs > "تراخيص البرنامج المحلي"), not here.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLicenseKeyPair } from "../src/lib/license-token.ts";

const here = dirname(fileURLToPath(import.meta.url));
const keyDir = process.env.LICENSE_KEY_DIR ? resolve(process.env.LICENSE_KEY_DIR) : join(homedir(), ".rajab-license");
const privatePath = join(keyDir, "license-private.pem");
const configFile = resolve(here, "../src/lib/license-config.ts");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

if (process.argv[2] !== "keygen") {
  console.log("Usage: npm run license -- keygen --server https://your-app.vercel.app [--force]");
  process.exit(process.argv[2] ? 1 : 0);
}

const server = (arg("server") ?? "").replace(/\/+$/, "");
if (!/^https?:\/\/[^\s"]+$/.test(server)) {
  console.error('Add your cloud address, e.g.  npm run license -- keygen --server https://your-app.vercel.app');
  process.exit(1);
}
if (existsSync(privatePath) && !process.argv.includes("--force")) {
  console.error(`A private key already exists: ${privatePath}\nReplacing it makes every customer's existing activation invalid in NEW builds. Use --force only if you mean it.`);
  process.exit(1);
}

const { privatePem, publicBase64 } = createLicenseKeyPair();
mkdirSync(keyDir, { recursive: true });
writeFileSync(privatePath, privatePem, { mode: 0o600 });
try { chmodSync(privatePath, 0o600); } catch { /* Windows */ }
const config = readFileSync(configFile, "utf8")
  .replace(/LICENSE_PUBLIC_KEY: string = "[^"]*"/, `LICENSE_PUBLIC_KEY: string = "${publicBase64}"`)
  .replace(/LICENSE_SERVER_URL: string = "[^"]*"/, `LICENSE_SERVER_URL: string = "${server}"`);
writeFileSync(configFile, config);

console.log(`Private key saved: ${privatePath}   (BACK IT UP, never share it, never put it in the project)

1) On your cloud deployment (Vercel > Settings > Environment Variables) add:
   LICENSE_PRIVATE_KEY = ${Buffer.from(privatePem).toString("base64")}
   Then run the new migrations (npm run db:migrate) and redeploy.

2) src/lib/license-config.ts now carries your public key and server address.
   Build the local program (npm run hub:build) and give customers THAT build.

3) For each sale: admin page > Labs > "تراخيص البرنامج المحلي" > create a code and send it.`);
