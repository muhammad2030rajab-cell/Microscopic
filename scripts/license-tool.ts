/**
 * Seller-side tool for offline activation codes. Run on YOUR computer, never ship it with the key.
 *
 *   npm run license -- keygen                 one time: makes your private key + puts the public key in the program
 *   npm run license -- issue --device "A1B2-C3D4-E5F6-7890" --note "معمل النور"
 *                                             makes a code that works ONLY on that customer's computer
 *   npm run license -- list                   the codes you made (id, device, note, date)
 *   npm run license -- verify <code> --device "A1B2-…"   checks a code against the program's public key
 *
 * The private key lives in ~/.rajab-license/ (outside the project, so it is never zipped or deployed).
 * Override with LICENSE_KEY_DIR. Back it up: lose it and you cannot make new codes; leak it and anyone can.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLicenseKeyPair, formatDeviceId, issueLicense, parseDeviceId, verifyLicense } from "../src/lib/license-code.ts";

const here = dirname(fileURLToPath(import.meta.url));
const keyDir = process.env.LICENSE_KEY_DIR ? resolve(process.env.LICENSE_KEY_DIR) : join(homedir(), ".rajab-license");
const privatePath = join(keyDir, "license-private.pem");
const ledgerPath = join(keyDir, "licenses-issued.json");
const publicKeyFile = resolve(here, "../src/lib/license-public-key.ts");

type Ledger = { id: string; device?: string; note: string; issuedAt: string }[];
const readLedger = (): Ledger => (existsSync(ledgerPath) ? (JSON.parse(readFileSync(ledgerPath, "utf8")) as Ledger) : []);
const currentPublicKey = () => /LICENSE_PUBLIC_KEY = "([^"]*)"/.exec(readFileSync(publicKeyFile, "utf8"))?.[1] ?? "";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const command = process.argv[2];

if (command === "keygen") {
  if (existsSync(privatePath) && !process.argv.includes("--force")) {
    console.error(`Private key already exists: ${privatePath}\nCodes made with it keep working only while the program carries the matching public key.\nUse --force to replace it (all old codes stop working in NEW builds).`);
    process.exit(1);
  }
  const { privatePem, publicBase64 } = createLicenseKeyPair();
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(privatePath, privatePem, { mode: 0o600 });
  try { chmodSync(privatePath, 0o600); } catch { /* Windows */ }
  const file = readFileSync(publicKeyFile, "utf8").replace(/LICENSE_PUBLIC_KEY = "[^"]*"/, `LICENSE_PUBLIC_KEY = "${publicBase64}"`);
  writeFileSync(publicKeyFile, file);
  console.log(`Private key: ${privatePath}  (BACK IT UP, never share it)\nPublic key written into src/lib/license-public-key.ts\nNext: npm run hub:build, then issue codes with: npm run license -- issue --note "customer"`);
} else if (command === "issue") {
  if (!existsSync(privatePath)) { console.error("No private key. Run: npm run license -- keygen"); process.exit(1); }
  const device = parseDeviceId(arg("device"));
  if (!device) { console.error('Missing or malformed --device. Ask the customer for the device id shown on the activation screen (like A1B2-C3D4-E5F6-7890).'); process.exit(1); }
  const { code, id } = issueLicense(readFileSync(privatePath, "utf8"), device);
  const publicKey = currentPublicKey();
  if (!publicKey || !verifyLicense(code, publicKey, device).ok) { console.error("This program build carries a different public key than your private key. Run keygen --force or rebuild."); process.exit(1); }
  const ledger = readLedger();
  ledger.push({ id, device: formatDeviceId(device), note: arg("note") ?? "", issuedAt: new Date().toISOString() });
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(`\n${code}\n\n(id ${id}, device ${formatDeviceId(device)}${arg("note") ? `, ${arg("note")}` : ""})`);
} else if (command === "list") {
  const ledger = readLedger();
  if (!ledger.length) console.log("No codes made yet.");
  for (const e of ledger) console.log(`${e.issuedAt.slice(0, 10)}  ${e.id}  ${e.device ?? "-"}  ${e.note}`);
} else if (command === "verify") {
  const r = verifyLicense(process.argv[3], currentPublicKey(), parseDeviceId(arg("device")));
  console.log(r.ok ? `OK (id ${r.id})` : `NOT valid: ${r.reason}`);
  process.exit(r.ok ? 0 : 1);
} else {
  console.log('Usage: npm run license -- keygen | issue --device "A1B2-…" [--note "..."] | list | verify <code> --device "A1B2-…"');
  process.exit(command ? 1 : 0);
}
