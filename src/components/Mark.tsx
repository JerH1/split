/**
 * The SplitSnax mark: four unequal shares around the monogram.
 *
 * Drawn on a 48 grid — ring radius 19.5, stroke 5.5, arcs at 34/27/22/17 per
 * cent separated by a constant 2.6 gap, starting at twelve o'clock. The
 * monogram sits at 26, which leaves 3.5 units of air inside the ring.
 *
 * Below 32px those gaps close and the four shares merge, so <MarkSmall> is a
 * separate drawing — one arc, one gap, heavier stroke, bigger S. Use it at
 * 24px and under rather than shrinking the full mark.
 *
 * Colours come from the theme's own person palette, so the mark harmonises
 * with whichever ground it lands on; the monogram is `--ink`, which is white
 * on the dark theme and near-black on the light one.
 */

const RING = { cx: 24, cy: 24, r: 19.5, strokeWidth: 5.5 };

// dash = arc length, gap = the rest of the circumference, offset = where it starts
const ARCS = [
  { color: "var(--person-1)", dash: 38.12, gap: 84.4, offset: 0 },
  { color: "var(--person-2)", dash: 30.27, gap: 92.25, offset: -40.72 },
  { color: "var(--person-3)", dash: 24.67, gap: 97.85, offset: -73.59 },
  { color: "var(--person-4)", dash: 19.06, gap: 103.46, offset: -100.86 },
];

interface MarkProps {
  size?: number;
  className?: string;
  /** Set when the mark is decorative and a nearby label already names it. */
  "aria-hidden"?: boolean;
}

function Monogram({ size }: { size: number }) {
  return (
    <text
      x="24"
      y="25.2"
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="'Baloo 2', system-ui, sans-serif"
      fontWeight="800"
      fontSize={size}
      fill="var(--ink)"
    >
      S
    </text>
  );
}

export default function Mark({
  size = 48,
  className,
  "aria-hidden": ariaHidden = true,
}: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role={ariaHidden ? undefined : "img"}
      aria-label={ariaHidden ? undefined : "SplitSnax"}
      aria-hidden={ariaHidden || undefined}
    >
      <g transform="rotate(-90 24 24)">
        {ARCS.map((arc) => (
          <circle
            key={arc.offset}
            {...RING}
            fill="none"
            stroke={arc.color}
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={arc.offset}
          />
        ))}
      </g>
      <Monogram size={26} />
    </svg>
  );
}

/** The 24px-and-under drawing. One arc, one gap, heavier stroke. */
export function MarkSmall({
  size = 24,
  className,
  "aria-hidden": ariaHidden = true,
}: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role={ariaHidden ? undefined : "img"}
      aria-label={ariaHidden ? undefined : "SplitSnax"}
      aria-hidden={ariaHidden || undefined}
    >
      <g transform="rotate(-96 24 24)">
        <circle
          cx="24"
          cy="24"
          r="19"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="7"
          strokeDasharray="112.38 7"
        />
      </g>
      <Monogram size={27} />
    </svg>
  );
}

/** "Split" in ink, "Snax" in the accent. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`font-display font-extrabold tracking-tight ${className ?? ""}`}
    >
      Split<span className="text-brand">Snax</span>
    </span>
  );
}
