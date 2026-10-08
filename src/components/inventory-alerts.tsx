import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { listInventory } from "@/lib/inventory";
import { summarizeInventory, todayInCairo, type InventorySummary } from "@/lib/inventory-math";

/**
 * Dashboard strip: what in the lab's stock or devices needs attention today.
 * Shows nothing when everything is fine, when offline, or when the call fails (the dashboard must never break because of it).
 * Render it only for people with the "inventory.manage" permission (the call is refused for anyone else anyway).
 */
export function InventoryAlerts() {
  const [summary, setSummary] = useState<InventorySummary | null>(null);

  useEffect(() => {
    let alive = true;
    listInventory()
      .then((res) => {
        if (alive) setSummary(summarizeInventory(res.supplies, res.devices, todayInCairo()));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!summary) return null;
  const parts = [
    summary.lowOrOut > 0 ? `${summary.lowOrOut} مستلزم ناقص أو نافد` : null,
    summary.expiringOrExpired > 0 ? `${summary.expiringOrExpired} منتهي أو قرب ينتهي` : null,
    summary.devicesNeedingAttention > 0 ? `${summary.devicesNeedingAttention} جهاز محتاج متابعة` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;

  return (
    <Link
      to="/inventory"
      className="mt-5 flex items-center gap-3 rounded-xl border border-low/40 bg-low-bg px-4 py-3 text-sm text-low transition hover:shadow-sm"
    >
      <TriangleAlert className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 leading-6">
        <span className="block font-semibold">تنبيهات الأجهزة والمستلزمات</span>
        <span className="block text-xs">{parts.join(" · ")}</span>
      </span>
    </Link>
  );
}
