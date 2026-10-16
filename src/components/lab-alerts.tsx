import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Database, Wallet } from "lucide-react";
import { getBillingSummary } from "@/lib/billing";
import { getBackupInfo } from "@/lib/backup";
import { backupAlertText, unpaidAlertText } from "@/lib/lab-alerts";

/**
 * Dashboard strips next to the stock alerts: unpaid invoices (needs "billing.manage") and the backup reminder
 * (local program, owner only). Like InventoryAlerts they show nothing when all is fine, offline, or if the call
 * fails — the dashboard must never break because of them.
 */

function Strip({ to, icon, title, text }: { to: "/billing" | "/settings"; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link
      to={to}
      className="mt-3 flex items-center gap-3 rounded-xl border border-low/40 bg-low-bg px-4 py-3 text-sm text-low transition hover:shadow-sm"
    >
      <span className="shrink-0 [&>svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1 leading-6">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs">{text}</span>
      </span>
    </Link>
  );
}

export function BillingAlerts() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getBillingSummary()
      .then((s) => {
        if (alive) setText(unpaidAlertText(s.unpaid.length, s.outstanding));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!text) return null;
  return <Strip to="/billing" icon={<Wallet />} title="متأخرات على المرضى" text={text} />;
}

export function BackupAlert() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getBackupInfo()
      .then((info) => {
        if (alive) setText(backupAlertText(info.available, info.lastBackupAt));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!text) return null;
  return <Strip to="/settings" icon={<Database />} title="خد نسخة احتياطية" text={text} />;
}
