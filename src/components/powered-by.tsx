import { cn } from "@/lib/utils";

/** The developer's signature, shown at the bottom of the public pages (welcome, login). */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <footer dir="ltr" lang="en" className={cn("mx-auto flex flex-col items-center text-center", className)}>
      <span aria-hidden="true" className="h-px w-20 bg-gradient-to-r from-transparent via-blue-300 to-transparent" />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">Powered by</p>
      <p className="mt-1 bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-700 bg-clip-text font-display text-lg font-bold text-transparent">
        Dr. Muhammad Ragab
      </p>
      <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white/70 px-3 py-1 text-[11px] font-medium text-blue-900 shadow-sm backdrop-blur">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-cyan-600" />
        Medical Laboratory Specialist
      </p>
    </footer>
  );
}
