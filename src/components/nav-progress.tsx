import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * A thin moving bar at the top while a page is loading, so a tap on a tab answers at once instead of the
 * screen looking frozen until the server replies. It only appears after 80 ms, so pages that open instantly
 * never flash it.
 */
export function NavProgress() {
  const busy = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!busy) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), 80);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!show) return null;
  return (
    <div
      role="progressbar"
      aria-label="جاري التحميل"
      className="no-print pointer-events-none fixed inset-x-0 z-50 h-1 overflow-hidden bg-teal/15"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="nav-progress h-full w-1/3 bg-teal" />
    </div>
  );
}
