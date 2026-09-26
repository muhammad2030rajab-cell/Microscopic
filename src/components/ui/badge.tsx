import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide",
  {
    variants: {
      tone: {
        muted: "bg-paper-2 text-ink-soft",
        teal: "bg-teal text-teal-fg",
        ok: "bg-ok-bg text-ok",
        high: "bg-high-bg text-high",
        low: "bg-low-bg text-low",
        ink: "bg-ink text-paper",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
