/**
 * مجال رؤية ميكروسكوب: إطار العدسة، شبكة القياس، خلايا مصبوغة، وشريط مقياس.
 * ثابت بالكامل (بدون عشوائية) عشان يطلع نفس الشكل في السيرفر والمتصفح.
 */
const CELLS: Array<[number, number, number]> = [
  [62, 70, 10],
  [116, 50, 7],
  [146, 94, 11],
  [96, 132, 8],
  [52, 122, 6],
  [128, 142, 7],
  [84, 92, 5],
  [112, 98, 4],
  [150, 60, 5],
  [70, 150, 5],
];

const TICKS = Array.from({ length: 17 }, (_, i) => i - 8);

export function FieldOfView({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="مجال رؤية ميكروسكوب لخلايا مصبوغة"
    >
      <defs>
        <clipPath id="fov-clip">
          <circle cx="100" cy="100" r="94" />
        </clipPath>
        <radialGradient id="fov-vignette" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#0c2230" stopOpacity="0" />
          <stop offset="100%" stopColor="#0c2230" stopOpacity="0.16" />
        </radialGradient>
      </defs>

      {/* حلقة العدسة */}
      <circle cx="100" cy="100" r="99" style={{ fill: "#0c2230" }} />
      <circle cx="100" cy="100" r="96" style={{ fill: "none", stroke: "#0e7c86", strokeWidth: 1.5 }} />

      {/* المجال المضيء */}
      <circle cx="100" cy="100" r="94" style={{ fill: "#f8f4f6" }} />

      <g clipPath="url(#fov-clip)">
        {CELLS.map(([x, y, r]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r={r * 1.9} style={{ fill: "#e59ab5", opacity: 0.38 }} />
            <circle cx={x} cy={y} r={r} style={{ fill: "#4b3f8f", opacity: 0.78 }} />
          </g>
        ))}

        {/* شبكة القياس */}
        <line x1="6" y1="100" x2="194" y2="100" style={{ stroke: "#0c2230", strokeOpacity: 0.35, strokeWidth: 0.6 }} />
        <line x1="100" y1="6" x2="100" y2="194" style={{ stroke: "#0c2230", strokeOpacity: 0.35, strokeWidth: 0.6 }} />
        {TICKS.map((i) => {
          const len = i % 5 === 0 ? 5 : 2.5;
          return (
            <g key={i} style={{ stroke: "#0c2230", strokeOpacity: 0.5, strokeWidth: 0.6 }}>
              <line x1={100 + i * 10} y1={100 - len} x2={100 + i * 10} y2={100 + len} />
              <line x1={100 - len} y1={100 + i * 10} x2={100 + len} y2={100 + i * 10} />
            </g>
          );
        })}

        {/* شريط المقياس */}
        <line x1="112" y1="160" x2="152" y2="160" style={{ stroke: "#0c2230", strokeWidth: 2 }} />
        <text x="132" y="171" textAnchor="middle" style={{ fontSize: 7, fill: "#0c2230", fontFamily: "ui-monospace, monospace" }}>
          50 µm
        </text>

        <circle cx="100" cy="100" r="94" style={{ fill: "url(#fov-vignette)" }} />
      </g>
    </svg>
  );
}
