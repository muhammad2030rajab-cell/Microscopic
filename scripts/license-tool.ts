/**
 * Seller-side tool for offline activation codes. Run on YOUR computer, never ship it with the key.
 *
 *   npm run license -- keygen                 one time: makes your private key + puts the public key in the program
 *   npm run license -- issue --machine ABCD-EF01-2345-6789 --note "معمل النور"
 *                                             makes a code that works ONLY on that computer (the customer reads the
 *                                             machine id from the activation page) and notes it in your own list
 *   npm run license -- list                   the codes you made (id, machine, note, date)
 *   npm run license -- verify <code>          checks a code's signature and shows which machine it is for
 *   npm run license -- machine-id             this computer's id (to test on your own PC)
 *   npm run license -- server https://my-labs.vercel.app   writes your cloud site address into the program
 *   npm run license -- show-private           prints the private key as ONE line, to paste into your cloud site's settings (LICENSE_PRIVATE_KEY)
 *
 * The private key lives in ~/.rajab-license/ (outside the project, so it is never zipped or deployed).
 * Override with LICENSE_KEY_DIR. Back it up: lose it and you cannot make new codes; leak it and anyone can.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLicenseKeyPair, formatMachineId, inspectLicense, issueLicense, machineBytesFromRaw, parseMachineId } from "../src/lib/license-code.ts";
import { readRawMachineId } from "../src/lib/machine-id.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const keyDir = process.env.LICENSE_KEY_DIR ? resolve(process.env.LICENSE_KEY_DIR) : join(homedir(), ".rajab-license");
const privatePath = join(keyDir, "license-private.pem");
const ledgerPath = join(keyDir, "licenses-issued.json");
const publicKeyFile = resolve(here, "../src/lib/license-public-key.ts");

type Ledger = { id: string; machine?: string; note: string; issuedAt: string }[];
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
  const machine = parseMachineId(arg("machine"));
  if (!machine) { console.error("Give the customer's machine id: --machine ABCD-EF01-2345-6789 (shown on the activation page)"); process.exit(1); }
  const { code, id } = issueLicense(readFileSync(privatePath, "utf8"), machine);
  const publicKey = currentPublicKey();
  if (!publicKey || !inspectLicense(code, publicKey).ok) { console.error("This program build carries a different public key than your private key. Run keygen --force or rebuild."); process.exit(1); }
  const ledger = readLedger();
  ledger.push({ id, machine: formatMachineId(machine), note: arg("note") ?? "", issuedAt: new Date().toISOString() });
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(`\n${code}\n\n(id ${id}, machine ${formatMachineId(machine)}${arg("note") ? `, ${arg("note")}` : ""})`);
} else if (command === "list") {
  const ledger = readLedger();
  if (!ledger.length) console.log("No codes made yet.");
  for (const e of ledger) console.log(`${e.issuedAt.slice(0, 10)}  ${e.id}  ${e.machine ?? "-"}  ${e.note}`);
} else if (command === "verify") {
  const r = inspectLicense(process.argv[3], currentPublicKey());
  console.log(r.ok ? `OK (id ${r.id}, for machine ${formatMachineId(r.machine)})` : `NOT valid: ${r.reason}`);
  process.exit(r.ok ? 0 : 1);
} else if (command === "server") {
  const url = (process.argv[3] ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s"]+$/.test(url)) { console.error("Give your cloud site address, like: npm run license -- server https://my-labs.vercel.app"); process.exit(1); }
  const file = readFileSync(publicKeyFile, "utf8");
  if (!/LICENSE_SERVER_URL = "[^"]*"/.test(file)) { console.error("license-public-key.ts has no LICENSE_SERVER_URL line"); process.exit(1); }
  writeFileSync(publicKeyFile, file.replace(/LICENSE_SERVER_URL = "[^"]*"/, `LICENSE_SERVER_URL = "${url}"`));
  console.log(`Program will activate against ${url}. Rebuild the program (3-build-exe.bat).`);
} else if (command === "show-private") {
  if (!existsSync(privatePath)) { console.error("No private key. Run: npm run license -- keygen"); process.exit(1); }
  console.log(readFileSync(privatePath, "utf8").trim().replace(/\r?\n/g, "\\n"));
} else if (command === "machine-id") {
  console.log(formatMachineId(machineBytesFromRaw(readRawMachineId())));
} else {
  console.log("Usage: npm run license -- keygen | server <https-address> | show-private | issue --machine <id> [--note \"...\"] | list | verify <code> | machine-id");
  process.exit(command ? 1 : 0);
}
