/**
 * One-time setup for activation, run on YOUR computer:
 *
 *   npm run license -- keygen --server https://your-app.vercel.app
 *
 * It makes your signing key pair, writes the PUBLIC key and your server address into src/lib/license-config.ts
 * (that is what ships inside the customers' program), keeps a copy of the private key in ~/.rajab-license/ (outside
 * the project), and prints the value to set as LICENSE_PRIVATE_KEY on your cloud deployment (Vercel). Codes for
 * customers are then made from the admin page (Labs > "تراخيص البرنامج المحلي"), not here.
 *
 * Activation WITHOUT internet (one-time, per device): the customer sends you the "device id" shown on his activation
 * screen; you run
 *
 *   npm run license -- issue --device <device id> --lab "Lab name"
 *
 * and send back the long key it prints. The key is signed with your private key, works only on that computer, has no
 * expiry, and needs no server. Every key is also noted in ~/.rajab-license/issued.jsonl so you can see re-issues.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { LICENSE_PUBLIC_KEY } from "../src/lib/license-config.ts";
import { OFFLINE_LICENSE_PREFIX, createLicenseKeyPair, parseDeviceId, pemFromEnv, publicBase64FromPrivatePem, signLicenseToken } from "../src/lib/license-token.ts";

const here = dirname(fileURLToPath(import.meta.url));
const keyDir = process.env.LICENSE_KEY_DIR ? resolve(process.env.LICENSE_KEY_DIR) : join(homedir(), ".rajab-license");
const privatePath = join(keyDir, "license-private.pem");
const configFile = resolve(here, "../src/lib/license-config.ts");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

if (process.argv[2] === "issue") {
  const fingerprint = parseDeviceId(arg("device") ?? "");
  const lab = (arg("lab") ?? "").trim();
  if (!fingerprint || !lab) {
    console.error('Usage: npm run license -- issue --device <device id the customer sent> --lab "Lab name" [--id OFF-...] [--key-file path]\n(the device id is 64 hex characters, dashes and spaces are fine)');
    process.exit(1);
  }
  const keyFile = arg("key-file") ? resolve(arg("key-file")!) : privatePath;
  const pem = process.env.LICENSE_PRIVATE_KEY ? pemFromEnv(process.env.LICENSE_PRIVATE_KEY) : existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "";
  if (!pem) {
    console.error(`No private key found. Looked for ${keyFile} (or the LICENSE_PRIVATE_KEY variable). Use --key-file to point at it.`);
    process.exit(1);
  }
  const expectedPublic = process.env.LICENSE_EXPECTED_PUBLIC_KEY || LICENSE_PUBLIC_KEY; // the override exists for tests
  if (publicBase64FromPrivatePem(pem) !== expectedPublic) {
    console.error("This private key does not match the public key inside the program (src/lib/license-config.ts): customers' programs would reject the key. Nothing was issued.");
    process.exit(1);
  }
  const manualAllowed = /LICENSE_ALLOW_MANUAL_KEYS\s*:\s*boolean\s*=\s*true/.test(readFileSync(new URL("../src/lib/license-config.ts", import.meta.url), "utf8"));
  if (!manualAllowed) {
    console.error("Refused: hand-signed OFF- keys are switched off (LICENSE_ALLOW_MANUAL_KEYS = false in src/lib/license-config.ts), because they can never be revoked.\nIssue the key from the admin page instead (Labs > local licenses > Issue key). Nothing was issued.");
    process.exit(1);
  }
  const licenseId = arg("id") ?? `${OFFLINE_LICENSE_PREFIX}${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
  if (!licenseId.startsWith(OFFLINE_LICENSE_PREFIX)) {
    console.error(`The id must start with ${OFFLINE_LICENSE_PREFIX} (that prefix is how the program knows not to ask a server about it).`);
    process.exit(1);
  }

  const ledger = join(keyDir, "issued.jsonl");
  const before = (existsSync(ledger) ? readFileSync(ledger, "utf8").split("\n").filter(Boolean) : []).flatMap((line) => {
    try { return [JSON.parse(line) as { lab: string; device: string }]; } catch { return []; }
  });
  const sameLab = before.filter((r) => r.lab.toLowerCase() === lab.toLowerCase());
  const otherDevices = new Set(sameLab.filter((r) => r.device !== fingerprint).map((r) => r.device));
  if (otherDevices.size > 0) console.warn(`NOTE: "${lab}" already has a key on ${otherDevices.size} other device(s). Fine for a new computer, but check it is not a second lab sharing one purchase.`);

  const token = signLicenseToken(pem, { lic: licenseId, fp: fingerprint });
  mkdirSync(keyDir, { recursive: true });
  appendFileSync(ledger, `${JSON.stringify({ date: new Date().toISOString(), licenseId, lab, device: fingerprint })}\n`);
  console.log(`Activation key for ${lab} (${licenseId}):\n\n${token}\n\nWhatsApp message to send:\n---\nكود تفعيل Microscopic لمعمل ${lab}:\n\n${token}\n\nانسخه كامل والصقه في شاشة التفعيل (مرة واحدة فقط، ومش محتاج إنترنت).\n---`);
  process.exit(0);
}

if (process.argv[2] !== "keygen") {
  console.log('Usage:\n  npm run license -- keygen --server https://your-app.vercel.app [--force]\n  npm run license -- issue --device <device id> --lab "Lab name"');
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
