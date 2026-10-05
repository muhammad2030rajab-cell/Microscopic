import { useEffect, useRef, useState } from "react";
import { Loader2, Share2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canSharePdfFile, saveBlob } from "@/lib/generate-report-pdf";

type Status = "preparing" | "ready" | "error";

/**
 * Sends the report as a real PDF file through the phone's share sheet (WhatsApp, Telegram, mail...).
 *
 * Two steps on purpose: the PDF is built first (a few seconds), and only then does the person tap
 * "choose app". navigator.share() has to run inside a fresh tap; building the file inside the same tap
 * would often lose that permission. The file carries the patient's name and results, so it needs the
 * same explicit "I checked the recipient" tick as the text summary in ShareDialog.
 */
export function PdfShareDialog({
  open,
  onClose,
  build,
  filename,
  title,
}: {
  open: boolean;
  onClose: () => void;
  /** Builds the PDF (buildReportPdf on the visible report). */
  build: () => Promise<Blob>;
  filename: string;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<Status>("preparing");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    let cancelled = false;
    blobRef.current = null;
    setStatus("preparing");
    setConfirmed(false);
    setNote("");
    build()
      .then((blob) => {
        if (cancelled) return;
        blobRef.current = blob;
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setNote(err instanceof Error ? err.message : "تعذر إنشاء ملف PDF");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // `build` is a fresh closure on every render of the parent; the dialog must build once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function share() {
    const blob = blobRef.current;
    if (!blob || !confirmed) return;
    const file = new File([blob], filename, { type: "application/pdf" });
    if (canSharePdfFile(file)) {
      try {
        await navigator.share({ files: [file], title });
        onClose();
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // closed the sheet: stay here
        // anything else (permission lost, app refused the file): fall through to a plain download
      }
    }
    saveBlob(blob, filename);
    setNote("المتصفح ده مش بيدعم المشاركة المباشرة للملفات، فالملف اتحفظ على جهازك. أرفقه في واتساب من هناك.");
  }

  const ready = status === "ready";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-line bg-elevated p-0 text-ink backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5" dir="rtl">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Share2 className="size-5 text-teal" />
          مشاركة التقرير كملف PDF
        </h2>

        <p className="flex items-center gap-2 rounded-md bg-paper p-3 text-sm">
          {status === "preparing" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> جارٍ تجهيز الملف…
            </>
          ) : status === "ready" ? (
            "الملف جاهز. اختار التطبيق اللي هتبعته منه."
          ) : (
            <span className="flex items-start gap-2 text-red-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {note}
            </span>
          )}
        </p>

        <label className="flex cursor-pointer items-start gap-2 text-sm leading-6">
          <input type="checkbox" className="mt-1.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>راجعت المستلم وأوافق على إرسال ملف فيه اسم المريض وكل نتائجه. الملف هيفضل عند المستلم وممكن يتحول لغيره.</span>
        </label>

        {ready && note ? <p className="rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">{note}</p> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            إغلاق
          </Button>
          <Button onClick={share} disabled={!ready || !confirmed}>
            اختيار التطبيق
          </Button>
        </div>
      </div>
    </dialog>
  );
}
