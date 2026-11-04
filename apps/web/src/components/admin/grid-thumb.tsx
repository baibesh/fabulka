import type { FrameGrid } from "@fabulka/shared";

/**
 * A page grid drawn small: each frame as a box on the page, numbered in reading order, with a
 * little gutter between them as the book prints it.
 */
export function GridThumb({ grid, size = 56 }: { grid: FrameGrid; size?: number }) {
  const gap = 0.025;
  return (
    <svg viewBox="0 0 1 1" width={size} height={size} role="img" aria-label={grid.id} className="shrink-0 rounded-md border border-border bg-background">
      {grid.frames.map((f, i) => (
        <g key={i}>
          <rect
            x={f.x + gap}
            y={f.y + gap}
            width={Math.max(f.w - 2 * gap, 0.01)}
            height={Math.max(f.h - 2 * gap, 0.01)}
            rx={0.02}
            className="fill-accent/15 stroke-accent"
            strokeWidth={0.02}
          />
          <text x={f.x + f.w / 2} y={f.y + f.h / 2} fontSize={0.16} textAnchor="middle" dominantBaseline="central" className="fill-accent font-bold">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
