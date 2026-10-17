// Pre-delivery guard for the program you hand to customers: `npm run hub:build && npm run release:check`.
// It never changes anything, it only refuses (exit 1) when the build could leak your signing key or your source.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXT = /\.(c|m)?js$|\.json$|\.html$|\.css$|\.txt$|\.env.*$/i;

/** Pure: findings for a list of built files ({path, text?}) plus the facts about this build. */
export function checkRelease({ files, publicKey, enforced, secrets = [] }) {
  const problems = [];
  const warnings = [];
  if (!enforced) problems.push("LICENSE_ENFORCED مش true في src/lib/license-config.ts: النسخة هتتسلّم من غير تفعيل.");
  if (!publicKey) problems.push("LICENSE_PUBLIC_KEY فاضي: النسخة هتشتغل من غير تفعيل.");
  for (const f of files) {
    const name = f.path.replace(/\\/g, "/");
    if (/\.map$/i.test(name)) problems.push(`ملف source map داخل النسخة (بيكشف الكود الأصلي): ${name}`);
    if (/(^|\/)\.env(\.|$)/i.test(name)) problems.push(`ملف إعدادات سرّي داخل النسخة: ${name}`);
    if (/(^|\/)(license-private\.pem|issued\.jsonl)$/i.test(name) || /\.pem$/i.test(name)) problems.push(`ملف مفتاح أو سجل تراخيص داخل النسخة: ${name}`);
    if (typeof f.text !== "string") continue;
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(f.text)) problems.push(`مفتاح خاص (PEM) ظاهر جوّه: ${name}`);
    for (const s of secrets) if (s && f.text.includes(s)) problems.push(`المفتاح الخاص للتراخيص ظاهر جوّه: ${name}`);
  }
  if (publicKey && !files.some((f) => typeof f.text === "string" && f.text.includes(publicKey))) {
    warnings.push("المفتاح العام مش موجود في ملفات النسخة: اتأكد إنك بنيتها بعد ضبط license-config (hub:build).");
  }
  return { ok: problems.length === 0, problems, warnings };
}

/** The secret strings worth hunting for: the signing key's PEM body, and its base64 form as kept in LICENSE_PRIVATE_KEY. */
export function secretsFromPem(pem) {
  if (!pem || !pem.includes("PRIVATE KEY")) return [];
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return [body, Buffer.from(pem.trim()).toString("base64")].filter((s) => s.length > 20);
}

export function readConfig(source) {
  const key = /LICENSE_PUBLIC_KEY\s*:\s*string\s*=\s*"([^"]*)"/.exec(source)?.[1] ?? "";
  const enforced = /LICENSE_ENFORCED\s*:\s*boolean\s*=\s*true/.test(source);
  return { publicKey: key, enforced };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue; // third-party code, thousands of files, never ours
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function main() {
  const root = join(fileURLToPath(import.meta.url), "..", "..");
  const outDir = join(root, ".output");
  if (!existsSync(outDir)) {
    console.error("مفيش مجلد .output: شغّل `npm run hub:build` الأول.");
    process.exit(1);
  }
  const { publicKey, enforced } = readConfig(readFileSync(join(root, "src/lib/license-config.ts"), "utf8"));
  const pemPaths = [process.env.LICENSE_KEY_FILE, join(homedir(), ".rajab-license", "license-private.pem")].filter(Boolean);
  const pems = pemPaths.filter((p) => existsSync(p)).map((p) => readFileSync(p, "utf8"));
  if (process.env.LICENSE_PRIVATE_KEY) {
    const v = process.env.LICENSE_PRIVATE_KEY.trim();
    pems.push(v.includes("BEGIN") ? v : Buffer.from(v, "base64").toString("utf8"));
  }
  const secrets = pems.flatMap(secretsFromPem);
  const files = walk(outDir).map((p) => ({ path: relative(root, p), text: TEXT_EXT.test(p) && statSync(p).size < 20_000_000 ? readFileSync(p, "utf8") : undefined }));
  const r = checkRelease({ files, publicKey, enforced, secrets });
  console.log(`فُحص ${files.length} ملف في .output ${secrets.length ? "(مع البحث عن مفتاحك الخاص)" : "(مفيش مفتاح خاص على الجهاز ده للبحث عنه)"}`);
  for (const w of r.warnings) console.log("تنبيه: " + w);
  for (const p of r.problems) console.log("مشكلة: " + p);
  console.log(r.ok ? "النسخة سليمة من ناحية التسريب." : "النسخة مش جاهزة للتسليم.");
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
