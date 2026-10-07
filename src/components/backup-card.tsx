import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildBackup } from "@/lib/device-backup";
import { idbLocalStore } from "@/lib/sync-engine/idb-local-store";

/** Settings card: saves a copy of everything on this device as a file. The cloud stays the main backup. */
export function BackupCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function backup() {
    setBusy(true);
    setMessage("");
    try {
      const tables = await idbLocalStore().exportAll();
      const file = buildBackup(tables);
      if (file.counts.patients + file.counts.reports === 0) {
        setMessage("مفيش بيانات على الجهاز لسه. افتح الرئيسية وانتظر دقيقة لحد ما تتزامن، وجرّب تاني.");
        return;
      }
      const blob = new Blob([file.json], { type: "application/json" });
      const f = new File([blob], file.filename, { type: "application/json" });
      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [f] })) {
        try {
          await navigator.share({ files: [f], title: file.filename });
          setMessage(`تم: ${file.counts.patients} مريض و${file.counts.reports} تقرير.`);
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // sharing refused: fall back to a plain download below
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage(`اتحفظ الملف: ${file.counts.patients} مريض و${file.counts.reports} تقرير. لو ما لقيتوش في التنزيلات، جرّب من متصفح Chrome.`);
    } catch {
      setMessage("تعذر قراءة بيانات الجهاز.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-5xl rounded-lg border border-line bg-elevated p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold">نسخة احتياطية</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        بياناتك محفوظة على الجهاز وتتنسخ تلقائيًا على السحابة، فلو غيّرت الموبايل بتسجّل دخول وكل حاجة ترجع. الزرار ده بيحفظ نسخة إضافية في ملف عندك.
        الملف فيه أسماء المرضى ونتائجهم، فاحتفظ بيه في مكان خاص.
      </p>
      <Button type="button" variant="secondary" className="mt-3" onClick={backup} disabled={busy}>
        {busy ? "جارٍ التجهيز…" : "حفظ نسخة من بيانات الجهاز"}
      </Button>
      {message ? (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
