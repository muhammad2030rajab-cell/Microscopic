import { Badge } from "@/components/ui/badge";
import type { Flag } from "@/lib/medical";

export function FlagBadge({ flag }: { flag: Flag }) {
  if (flag === "high") return <Badge tone="high">مرتفع</Badge>;
  if (flag === "low") return <Badge tone="low">منخفض</Badge>;
  if (flag === "abnormal") return <Badge tone="high">غير طبيعي</Badge>;
  if (flag === "normal") return <Badge tone="ok">طبيعي</Badge>;
  return <Badge>غير محدد</Badge>;
}

export function FlagDot({ flag }: { flag: Flag }) {
  const cls =
    flag === "high" || flag === "abnormal"
      ? "bg-high"
      : flag === "low"
        ? "bg-low"
        : flag === "normal"
          ? "bg-ok"
          : "bg-line-strong";
  return <span className={`inline-block size-1.5 rounded-full ${cls}`} aria-hidden />;
}
