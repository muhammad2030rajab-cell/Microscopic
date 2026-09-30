import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, MessageCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildShareMessage,
  mailtoUrl,
  whatsappUrl,
  type ShareInput,
  type ShareMode,
} from "@/lib/share-text";

export type ShareChannel = "whatsapp" | "email";

/**
 * Confirmation step before anything leaves the app over WhatsApp or email.
 * Default is a link-only message with no patient data; sending the results as
 * text needs an explicit "I checked the recipient" tick.
 * Uses the native <dialog>: focus trap, Esc and backdrop come for free.
 */
export function ShareDialog({
  channel,
  onClose,
  input,
}: {
  channel: ShareChannel | null;
  onClose: () => void;
  input: Omit<ShareInput, "mode">;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<ShareMode>("link");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (channel && !dialog.open) {
      setMode("link");
      setConfirmed(false);
      dialog.showModal();
    }
    if (!channel && dialog.open) dialog.close();
  }, [channel]);

  const message = useMemo(() => buildShareMessage({ ...input, mode }), [input, mode]);
  const canSend = mode === "link" || confirmed;
  const isWhatsapp = channel === "whatsapp";

  function send() {
    if (!canSend) return;
    if (isWhatsapp) window.open(whatsappUrl(message), "_blank", "noopener,noreferrer");
    else window.location.href = mailtoUrl(message);
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-line bg-elevated p-0 text-ink backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5" dir="rtl">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          {isWhatsapp ? <MessageCircle className="size-5 text-emerald-600" /> : <Mail className="size-5 text-teal" />}
          {isWhatsapp ? "مشاركة عبر واتساب" : "مشاركة عبر البريد"}
        </h2>

        <fieldset className="space-y-2">
          <legend className="sr-only">محتوى الرسالة</legend>
          <label className="flex cursor-pointer gap-3 rounded-md border border-line p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-paper">
            <input type="radio" name="share-mode" className="mt-1" checked={mode === "link"} onChange={() => setMode("link")} />
            <span>
              <span className="font-medium">رابط التحقق فقط (موصى به)</span>
              <span className="block text-xs text-muted">بدون اسم المريض وبدون أي نتائج.</span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-md border border-line p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-paper">
            <input type="radio" name="share-mode" className="mt-1" checked={mode === "results"} onChange={() => setMode("results")} />
            <span>
              <span className="font-medium">ملخص النتائج كنص</span>
              <span className="block text-xs text-muted">يحتوي على اسم المريض وكل نتائجه.</span>
            </span>
          </label>
        </fieldset>

        {!input.approved ? (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            التقرير لم يُعتمد بعد، فالنتائج غير نهائية ورابط التحقق لن يعمل قبل الاعتماد.
          </p>
        ) : null}

        <div>
          <p className="mb-1 text-xs text-muted">الرسالة اللي هتتبعت:</p>
          <pre dir="rtl" className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-paper p-3 font-sans text-xs leading-6">
            {message.body}
          </pre>
        </div>

        {mode === "results" ? (
          <label className="flex cursor-pointer items-start gap-2 text-sm leading-6">
            <input type="checkbox" className="mt-1.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              راجعت المستلم وأوافق على إرسال بيانات المريض ونتائجه. الرسالة هتفضل في سجل المحادثة وممكن تتحول لغيره.
            </span>
          </label>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={send} disabled={!canSend}>
            {isWhatsapp ? "فتح واتساب" : "فتح البريد"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
