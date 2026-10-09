import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_SUPPORT_WHATSAPP } from "@/lib/platform-settings";

/** The id the customer sends you to get an activation key: copy it, or send it on WhatsApp in one tap. */
export function DeviceIdBlock({ deviceId }: { deviceId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(deviceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the id is selectable on screen */
    }
  }

  const message = `مرحبًا، عايز كود تفعيل لبرنامج Microscopic.\nرقم الجهاز:\n${deviceId}`;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">رقم الجهاز</p>
      <p dir="ltr" className="mt-1.5 select-all break-all font-mono text-[13px] leading-6 tracking-wide text-slate-800">{deviceId}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "تم النسخ" : "نسخ الرقم"}
        </Button>
        <Button type="button" variant="secondary" size="sm" asChild>
          <a href={`https://wa.me/${DEFAULT_SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" />
            إرسال عبر واتساب
          </a>
        </Button>
      </div>
    </div>
  );
}
