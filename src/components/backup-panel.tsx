import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getBackupInfo } from "@/lib/backup";

/** Settings > Backup. Shown only in the local program, to the lab owner (see backup.server.ts). Works offline. */
export function BackupPanel() {
  const [info, setInfo] = useState<{ available: boolean; lastBackupAt: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => void getBackupInfo().then(setInfo).catch(() => setInfo({ available: false, lastBackupAt: null }));
  useEffect(refresh, []);

  if (!info?.available) return null;

  function download() {
    window.location.assign("/api/backup");
    window.setTimeout(refresh, 4000);
  }

  async function waitForRestart() {
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => window.setTimeout(r, 1500));
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.ok) {
          window.location.assign("/login");
          return;
        }
      } catch {
        /* still restarting */
      }
    }
    toast.message("اقفل البرنامج وافتحه تاني عشان تكتمل الاستعادة");
    setBusy(false);
  }

  async function restore(file: File) {
    const ok = window.confirm(
      "الاستعادة هتستبدل كل بيانات البرنامج الحالية بالنسخة اللي اخترتها.\nهتتحفظ نسخة من بياناتك الحالية في مجلد MicroscopicHub احتياطيًا.\nالبرنامج هيعيد التشغيل. تكمل؟",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/backup", { method: "POST", body: file, headers: { "content-type": "application/octet-stream" } });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        toast.error(code === "BACKUP_INVALID" ? "الملف ده مش نسخة احتياطية من Microscopic" : "تعذرت الاستعادة. بياناتك زي ما هي");
        setBusy(false);
        return;
      }
      toast.success("اتحفظت النسخة. البرنامج هيعيد التشغيل خلال ثواني");
      await waitForRestart();
    } catch {
      toast.error("تعذرت الاستعادة. بياناتك زي ما هي");
      setBusy(false);
    }
  }

  const last = info.lastBackupAt ? new Date(info.lastBackupAt).toLocaleString("ar-EG") : null;
  return (
    <section className="mx-auto mt-6 w-full max-w-5xl rounded-lg border border-line bg-elevated p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold">النسخ الاحتياطي</h2>
      <p className="mt-1 text-sm text-muted">
        نزّل نسخة من كل بيانات المعمل في ملف واحد، واحتفظ بيها على فلاشة أو جهاز تاني. من غير إنترنت.
      </p>
      <p className="mt-1 text-sm text-muted">{last ? `آخر نسخة: ${last}` : "لسه ما اتعملتش نسخة احتياطية."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={download} disabled={busy}>تنزيل نسخة احتياطية</Button>
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "جاري الاستعادة..." : "استعادة من نسخة"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".rjbak,.gz"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void restore(file);
          }}
        />
      </div>
    </section>
  );
}
