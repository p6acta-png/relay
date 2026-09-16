'use client';

import { useId, useState } from 'react';

/**
 * Small SVG charts, no chart library. Conventions (from the dataviz checklist):
 * thin marks, 4px rounded data ends anchored to the baseline, 1px solid recessive grid,
 * one axis, hover + keyboard-focus tooltips, and text in ink colours (never the series colour).
 * Every value is also available in the table view under the charts.
 */

export interface DayPoint {
  date: string;
  label: string;
  conversations: number;
  bookings: number;
  handoffs: number;
}

// Rendered into roughly half-width panels, so viewBox units stay close to CSS pixels and labels stay legible.
const WIDTH = 560;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 26, left: 34 };
const plotW = WIDTH - PAD.left - PAD.right;
const plotH = HEIGHT - PAD.top - PAD.bottom;

function niceMax(value: number) {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => value / s <= 5) ?? magnitude * 10;
  return Math.ceil(value / step) * step;
}

function ticks(max: number) {
  return [0, max / 2, max].map((v) => Math.round(v));
}

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  const left = `${(x / WIDTH) * 100}%`;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[var(--radius-md)] border border-rule bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-[var(--shadow-pop)]"
      style={{ left, top: `${(y / HEIGHT) * 100}%` }}
    >
      {children}
    </div>
  );
}

/** Columns for one series: bookings made per day. */
export function DailyColumns({
  points,
  valueKey,
  name,
}: {
  points: DayPoint[];
  valueKey: 'bookings';
  name: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...points.map((p) => p[valueKey])));
  const band = plotW / points.length;
  const barWidth = Math.min(24, Math.max(3, band - 2)); // capped, with a 2px surface gap between neighbours
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(points.length / 8);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        // A group, not an image: it contains focusable bars, and an image cannot have interactive children.
        role="group"
        aria-label={`${name} per day, column chart. Values are in the table below.`}
      >
        {ticks(max).map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-rule)"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-ink-3 font-mono text-[11px]">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD.left + band * i + band / 2;
          const h = (p[valueKey] / max) * plotH;
          const top = PAD.top + plotH - h;
          const r = Math.min(4, h, barWidth / 2);
          return (
            <g
              key={p.date}
              tabIndex={0}
              role="img"
              aria-label={`${p.label}: ${p[valueKey]} ${name.toLowerCase()}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="outline-none"
            >
              {/* Hit target: the whole band, taller than the bar */}
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - barWidth / 2},${PAD.top + plotH} V${top + r} Q${cx - barWidth / 2},${top} ${cx - barWidth / 2 + r},${top} H${cx + barWidth / 2 - r} Q${cx + barWidth / 2},${top} ${cx + barWidth / 2},${top + r} V${PAD.top + plotH} Z`}
                  fill="var(--color-chart-1)"
                  opacity={active === null || active === i ? 1 : 0.55}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="fill-ink-3 font-mono text-[11px]">
                  {p.label.split(' ').slice(0, 2).join(' ')}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="var(--color-rule-strong)"
          strokeWidth={1}
        />
      </svg>
      {active !== null && (
        <Tooltip x={PAD.left + band * active + band / 2} y={y(points[active]![valueKey]) - 6}>
          <span className="tabular block text-sm font-semibold text-ink">{points[active]![valueKey]}</span>
          <span className="text-ink-3">{points[active]!.label}</span>
        </Tooltip>
      )}
    </div>
  );
}

/** Two series on one scale (both are counts of conversations): lines with a crosshair tooltip. */
export function ConversationLines({ points }: { points: DayPoint[] }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.conversations, p.handoffs))));
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const series = [
    { key: 'conversations' as const, name: 'Conversations', color: 'var(--color-chart-1)' },
    { key: 'handoffs' as const, name: 'Handed to a person', color: 'var(--color-chart-2)' },
  ];
  const labelEvery = Math.ceil(points.length / 8);
  const last = points.length - 1;

  const onPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * WIDTH;
    const index = Math.round(((px - PAD.left) / plotW) * (points.length - 1));
    setActive(Math.max(0, Math.min(last, index)));
  };

  return (
    <div className="relative">
      <ul className="mb-2 flex flex-wrap gap-4 text-xs text-ink-2" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        role="img"
        aria-labelledby={`${id}-desc`}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setActive((a) => Math.min(last, (a ?? -1) + 1));
          if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? last + 1) - 1));
        }}
        onBlur={() => setActive(null)}
      >
        <desc id={`${id}-desc`}>
          Conversations and hand-offs per day, line chart. Use the arrow keys to read each day; values are
          also in the table below.
        </desc>
        {ticks(max).map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-rule)"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-ink-3 font-mono text-[11px]">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.date}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-ink-3 font-mono text-[11px]"
            >
              {p.label.split(' ').slice(0, 2).join(' ')}
            </text>
          ) : null,
        )}
        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="var(--color-rule-strong)"
            strokeWidth={1}
          />
        )}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              points={points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={x(last)}
              cy={y(points[last]![s.key])}
              r={4}
              fill={s.color}
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
            {active !== null && (
              <circle
                cx={x(active)}
                cy={y(points[active]![s.key])}
                r={4}
                fill={s.color}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            )}
          </g>
        ))}
      </svg>
      {active !== null && (
        <Tooltip x={x(active)} y={PAD.top + 4}>
          <span className="mb-1 block text-ink-3">{points[active]!.label}</span>
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
              <span className="tabular font-semibold text-ink">{points[active]![s.key]}</span>
              <span className="text-ink-3">{s.name}</span>
            </span>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal bars: bookings per service, value at the tip. */
export function ServiceBars({ rows }: { rows: { name: string; bookings: number; viaChat: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.bookings));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.name} className="grid grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-3 text-sm">
          <span className="truncate text-ink-2">{row.name}</span>
          <span
            className="flex items-center gap-2"
            title={`${row.bookings} bookings, ${row.viaChat} through the chat`}
          >
            <span
              className="h-3 rounded-r-[4px]"
              style={{
                width: `${Math.max(row.bookings ? 2 : 0, (row.bookings / max) * 70)}%`,
                background: 'var(--color-chart-1)',
              }}
              aria-hidden
            />
            <span className="tabular font-mono text-xs text-ink">
              {row.bookings}
              <span className="text-ink-3">
                {' '}
                · {row.bookings ? Math.round((row.viaChat / row.bookings) * 100) : 0}% chat
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
