import { useState, type ChangeEvent } from "react";
import { Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { deleteReportAttachment, uploadReportAttachment, type ReportAttachment } from "@/lib/attachments";

const MAX_BYTES = 4 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export function AttachmentsPanel({
  reportId,
  canEdit,
  initial,
}: {
  reportId: string;
  canEdit: boolean;
  initial: ReportAttachment[];
}) {
  const [items, setItems] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > MAX_BYTES) {
      setError("حجم الملف كبير جدًا (الحد الأقصى 4 ميجابايت)");
      return;
    }
    setUploading(true);
    try {
      const base64 = await readAsBase64(file);
      const created = await uploadReportAttachment({
        data: { reportId, fileName: file.name, contentType: file.type, base64 },
      });
      setItems((current) => [...current, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر رفع الملف");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("حذف هذا المرفق؟")) return;
    setError("");
    setBusyId(id);
    try {
      await deleteReportAttachment({ data: { reportId, attachmentId: id } });
      setItems((current) => current.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حذف الملف");
    } finally {
      setBusyId(null);
    }
  }

  if (!canEdit && items.length === 0) return null;

  return (
    <div className="mx-auto mb-5 max-w-[820px] rounded-lg border border-line bg-elevated p-4 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium"><Paperclip className="size-4" />المرفقات</p>
        {canEdit ? (
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-teal/10 px-3 text-xs font-medium text-teal hover:bg-teal/15">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? "جارٍ الرفع…" : "رفع ملف"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChange} disabled={uploading} />
          </label>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-high">{error}</p> : null}

      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted">مفيش مرفقات لسه — تقدر ترفع صور مستندات أو سكانر أصلي مرتبط بالتقرير.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-md border border-line/70 px-3 py-2">
              <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-teal hover:underline">{a.fileName}</a>
              <span className="shrink-0 text-[0.68rem] text-muted">{formatSize(a.sizeBytes)}</span>
              {canEdit ? (
                <button type="button" onClick={() => remove(a.id)} disabled={busyId === a.id} className="shrink-0 text-muted hover:text-high disabled:opacity-50">
                  {busyId === a.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
