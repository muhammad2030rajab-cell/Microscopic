import type { CSSProperties, ReactNode } from "react";

/**
 * Decorative layer for the welcome page: a "slide under the microscope".
 * Everything here is purely visual — aria-hidden, no interaction, no images,
 * no fonts, no network — so it works offline, costs nothing to download, and
 * only animates transform/opacity (cheap on a phone). The motion is switched
 * off for people who ask for reduced motion (see styles.css).
 */

type CellKind = "rbc" | "wbc" | "rod" | "plt" | "coccus";

interface Cell {
  kind: CellKind;
  /** Position in % of the page, size in px. */
  x: number;
  y: number;
  size: number;
  /** Drift target (px), spin (deg), duration/delay (s), opacity. */
  dx: number;
  dy: number;
  rot: number;
  dur: number;
  delay: number;
  opacity: number;
}

// Fixed (not random) so server and client render the same markup.
const CELLS: Cell[] = [
  // Cells stay in the empty margins (top, bottom, the two edges) so the text column stays calm.
  { kind: "rbc", x: 6, y: 7, size: 54, dx: 22, dy: 30, rot: 40, dur: 19, delay: -4, opacity: 0.5 },
  { kind: "wbc", x: 78, y: 4, size: 66, dx: -24, dy: 22, rot: -30, dur: 24, delay: -9, opacity: 0.45 },
  { kind: "plt", x: 46, y: 3, size: 30, dx: 14, dy: -10, rot: 60, dur: 16, delay: -2, opacity: 0.6 },
  { kind: "rod", x: -4, y: 40, size: 72, dx: 18, dy: -18, rot: 22, dur: 22, delay: -12, opacity: 0.5 },
  { kind: "rbc", x: 90, y: 30, size: 44, dx: -14, dy: 30, rot: -50, dur: 21, delay: -6, opacity: 0.45 },
  { kind: "coccus", x: 88, y: 17, size: 38, dx: -12, dy: 20, rot: 50, dur: 18, delay: -13, opacity: 0.35 },
  { kind: "coccus", x: 6, y: 90, size: 50, dx: 22, dy: -14, rot: 35, dur: 26, delay: -15, opacity: 0.55 },
  { kind: "wbc", x: 84, y: 88, size: 58, dx: -18, dy: -22, rot: 45, dur: 23, delay: -3, opacity: 0.4 },
  { kind: "rbc", x: 36, y: 94, size: 60, dx: -22, dy: -12, rot: -35, dur: 20, delay: -8, opacity: 0.45 },
  { kind: "plt", x: 64, y: 95, size: 28, dx: 16, dy: -16, rot: 70, dur: 15, delay: -11, opacity: 0.6 },
  { kind: "rod", x: 20, y: 12, size: 56, dx: 20, dy: 10, rot: -24, dur: 25, delay: -7, opacity: 0.35 },
];

function CellShape({ kind }: { kind: CellKind }) {
  switch (kind) {
    case "rbc": // red blood cell: a disc with a pale biconcave centre
      return (
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="#fecdd3" stroke="#fb7185" strokeWidth="1.4" />
          <circle cx="24" cy="24" r="9" fill="#ffe4e6" stroke="#fda4af" strokeWidth="1" />
        </svg>
      );
    case "wbc": // white blood cell: pale body, lobed nucleus, granules
      return (
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="21" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.4" />
          <circle cx="18" cy="20" r="8" fill="#a5b4fc" stroke="#818cf8" strokeWidth="1" />
          <circle cx="29" cy="22" r="7" fill="#a5b4fc" stroke="#818cf8" strokeWidth="1" />
          <circle cx="23" cy="30" r="7" fill="#a5b4fc" stroke="#818cf8" strokeWidth="1" />
          <circle cx="38" cy="33" r="1.6" fill="#c7d2fe" />
          <circle cx="11" cy="32" r="1.4" fill="#c7d2fe" />
          <circle cx="35" cy="11" r="1.4" fill="#c7d2fe" />
        </svg>
      );
    case "rod": // bacillus with a flagellum
      return (
        <svg viewBox="0 0 80 48">
          <rect x="6" y="17" width="46" height="14" rx="7" fill="#99f6e4" stroke="#2dd4bf" strokeWidth="1.4" />
          <path d="M52 24 q6 -7 11 0 t11 0" fill="none" stroke="#2dd4bf" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="17" cy="24" r="2" fill="#5eead4" />
          <circle cx="29" cy="24" r="2" fill="#5eead4" />
        </svg>
      );
    case "plt": // platelets: a few small violet dots
      return (
        <svg viewBox="0 0 48 48">
          <circle cx="16" cy="18" r="5" fill="#ddd6fe" stroke="#a78bfa" strokeWidth="1.2" />
          <circle cx="30" cy="14" r="4" fill="#ddd6fe" stroke="#a78bfa" strokeWidth="1.2" />
          <circle cx="26" cy="30" r="5.5" fill="#ddd6fe" stroke="#a78bfa" strokeWidth="1.2" />
          <circle cx="12" cy="34" r="3.5" fill="#ddd6fe" stroke="#a78bfa" strokeWidth="1.2" />
        </svg>
      );
    case "coccus": // a cluster of round bacteria
      return (
        <svg viewBox="0 0 48 48">
          {[
            [16, 16],
            [30, 14],
            [24, 26],
            [12, 31],
            [33, 33],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="7" fill="#fde68a" stroke="#fbbf24" strokeWidth="1.2" />
          ))}
        </svg>
      );
  }
}

/** Slowly drifting cells behind the content. */
export function CellField() {
  return (
    <div className="wlc-field" aria-hidden="true">
      {CELLS.map((c, i) => {
        const style = {
          left: `${c.x}%`,
          top: `${c.y}%`,
          width: `${c.size}px`,
          height: `${c.kind === "rod" ? c.size * 0.6 : c.size}px`,
          opacity: c.opacity,
          animationDuration: `${c.dur}s`,
          animationDelay: `${c.delay}s`,
          "--dx": `${c.dx}px`,
          "--dy": `${c.dy}px`,
          "--rot": `${c.rot}deg`,
        } as CSSProperties;
        return (
          <span key={i} className="wlc-cell" style={style}>
            <CellShape kind={c.kind} />
          </span>
        );
      })}
    </div>
  );
}

/**
 * The logo as a microscope objective: ripples spread from it like a focus
 * pulse and a dashed turret ring turns slowly around it.
 */
export function LensLogo({ children, large = false }: { children: ReactNode; large?: boolean }) {
  return (
    <span className={`wlc-lens${large ? " wlc-lens-lg" : ""}`}>
      <span className="wlc-ring" aria-hidden="true" />
      <span className="wlc-ring wlc-ring-2" aria-hidden="true" />
      <span className="wlc-ring wlc-ring-3" aria-hidden="true" />
      <svg className="wlc-turret" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 6" strokeLinecap="round" />
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M48 1.5v6" />
          <path d="M48 88.5v6" />
          <path d="M1.5 48h6" />
          <path d="M88.5 48h6" />
        </g>
      </svg>
      <span className="wlc-lens-core">{children}</span>
    </span>
  );
}

/** A micrometer scale — the ruler you see in a microscope's eyepiece. */
export function Graticule() {
  const ticks = Array.from({ length: 41 }, (_, i) => i); // every 6 units, a long one every 5th
  return (
    <svg className="wlc-ruler" viewBox="0 0 246 27" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        <path d="M3 15h240" />
        {ticks.map((i) => (
          <path key={i} d={`M${3 + i * 6} 15v${i % 5 === 0 ? -9 : -4.5}`} />
        ))}
      </g>
      <g fill="currentColor" stroke="none" fontSize="8" letterSpacing="0.4">
        <text x="3" y="25" textAnchor="start">
          0
        </text>
        <text x="243" y="25" textAnchor="end">
          100 µm
        </text>
      </g>
    </svg>
  );
}
