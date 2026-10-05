import test from "node:test";
import assert from "node:assert/strict";
import { patchManifest } from "../scripts/patch-android.mjs";

const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:label="@string/app_name">
    </application>
</manifest>`;

test("adds cleartext permission to <application>", () => {
  const out = patchManifest(manifest);
  assert.match(out, /<application android:usesCleartextTraffic="true"/);
  assert.match(out, /android:allowBackup="true"/);
});

test("running twice changes nothing more", () => {
  const once = patchManifest(manifest);
  assert.equal(patchManifest(once), once);
});

test("an existing false is flipped to true", () => {
  const out = patchManifest(manifest.replace("<application", '<application android:usesCleartextTraffic="false"'));
  assert.match(out, /usesCleartextTraffic="true"/);
  assert.doesNotMatch(out, /usesCleartextTraffic="false"/);
});

test("a manifest without <application> is an error, not a silent no-op", () => {
  assert.throws(() => patchManifest("<manifest></manifest>"));
});
