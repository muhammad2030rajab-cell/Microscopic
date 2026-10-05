// Run in CI after `npx cap add android`: the lab hub is plain http on the local network,
// which Android blocks unless the manifest allows cleartext traffic.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function patchManifest(xml) {
  if (/android:usesCleartextTraffic\s*=/.test(xml)) return xml.replace(/android:usesCleartextTraffic\s*=\s*"[^"]*"/, 'android:usesCleartextTraffic="true"');
  if (!/<application\b/.test(xml)) throw new Error("AndroidManifest.xml has no <application> element");
  return xml.replace(/<application\b/, '<application android:usesCleartextTraffic="true"');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? "android/app/src/main/AndroidManifest.xml";
  writeFileSync(file, patchManifest(readFileSync(file, "utf8")));
  console.log("patched", file);
}
