import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Native <select> styled like <Input>; native pickers are the best UX on phones. */
export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-11 w-full rounded-sm border border-line bg-elevated px-2 text-sm text-ink",
        "transition-[border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-teal",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
