// Offline check: fails if the program's own code or the built web files reference an outside website
// (fonts, CDNs, analytics, images...) other than the few allowed ones. Run: npm run check:offline
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

// Allowed: XML/SVG namespaces, the local machine, the one-time activation site, and wa.me share links (opened only when the user taps them).
const ALLOWED = [/^https?:\/\/(www\.)?w3\.org\//, /^https?:\/\/localhost/, /^https?:\/\/127\.0\.0\.1/, /^https?:\/\/wa\.me\//, /^https?:\/\/microscopic\.vercel\.app/, /^https?:\/\/schemas\./, /^https?:\/\/(www\.)?schema\.org/, /^https?:\/\/(react|tanstack|github)\./, /^https?:\/\/\$\{/];
const BANNED_HOSTS = /(fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr|cdnjs|googletagmanager|google-analytics|gravatar)/;
const roots = ["src", ".output/public"].filter(existsSync);
const exts = new Set([".ts", ".tsx", ".css", ".html", ".js", ".mjs"]);
const bad = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== "node_modules") walk(p); continue; }
    if (!exts.has(extname(p)) || /\.test\.ts$/.test(p) || p.endsWith("routeTree.gen.ts")) continue;
    // Server-only code (Vercel/cloud features) is not part of the offline program's web files.
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
      const url = m[0];
      if (ALLOWED.some((re) => re.test(url))) continue;
      if (p.includes(".server.") || p.includes("/api/")) continue;
      if (BANNED_HOSTS.test(url) || p.startsWith(".output")) bad.push(`${p}: ${url.slice(0, 80)}`);
    }
  }
}
for (const r of roots) walk(r);
if (bad.length) {
  console.error("Outside-website references found (the offline program must not need them):\n" + bad.join("\n"));
  process.exit(1);
}
console.log("Offline check passed: no outside fonts, CDNs or analytics in", roots.join(", "));
