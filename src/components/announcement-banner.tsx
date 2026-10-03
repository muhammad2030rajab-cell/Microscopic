import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { getPublicPlatformSettings } from "@/lib/platform-settings";

/**
 * Platform-wide announcement shown at the top of every lab page (AppShell).
 * The text is cached in memory for a minute so moving between pages does not
 * refetch it each time; offline / errors simply show nothing.
 */
const TTL_MS = 60_000;
let cache: { text: string; at: number } | null = null;

export function AnnouncementBanner() {
  const [text, setText] = useState(cache?.text ?? "");

  useEffect(() => {
    if (cache && Date.now() - cache.at < TTL_MS) {
      setText(cache.text);
      return;
    }
    let cancelled = false;
    getPublicPlatformSettings()
      .then((s) => {
        cache = { text: s.announcement, at: Date.now() };
        if (!cancelled) setText(s.announcement);
      })
      .catch(() => {
        /* offline or server hiccup: keep whatever we have */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!text) return null;
  return (
    <div
      role="status"
      className="no-print mb-4 flex items-start gap-2 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3 text-sm leading-7"
    >
      <Megaphone className="mt-1 size-4 shrink-0 text-teal" aria-hidden />
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}
