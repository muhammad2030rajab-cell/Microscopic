import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** يولّد QR Code في المتصفح فقط (بدون أي اتصال شبكة) يشير لصفحة التحقق العامة من التقرير. */
export function ReportQrCode({ reportId }: { reportId: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const verifyUrl = `${window.location.origin}/verify/${reportId}`;
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 96, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [reportId]);

  if (!dataUrl) return null;
  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      <img src={dataUrl} alt="رمز التحقق من التقرير" className="size-16 rounded-md border border-line/60 bg-white p-1" />
      <span className="text-[0.55rem] text-muted">Scan to verify</span>
    </div>
  );
}
