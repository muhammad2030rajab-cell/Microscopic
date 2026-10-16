import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native-back";

/**
 * Only inside the Android app: the launcher screen (cloud / local hub address) is no longer reachable with the
 * back button, so this is the way back to it. Hidden everywhere else.
 */
export function NativeAppLink() {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  if (!native) return null;
  return (
    <section className="mx-auto mt-6 w-full max-w-5xl app-card p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold">اتصال التطبيق</h2>
      <p className="mt-1 text-sm text-muted">لتغيير عنوان السحابة أو المركز المحلي، أو وضع الاتصال (سحابة / مركز / تلقائي).</p>
      <button
        type="button"
        onClick={() => {
          window.location.href = "https://localhost/index.html?settings=1";
        }}
        className="mt-3 h-11 rounded-lg border border-line bg-paper px-4 text-sm font-medium"
      >
        فتح إعدادات الاتصال
      </button>
    </section>
  );
}
