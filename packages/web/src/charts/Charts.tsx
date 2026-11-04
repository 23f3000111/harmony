import clsx from 'clsx';
import { motion, useReducedMotion } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { EASE } from '@/lib/motion';

export interface BarDatum {
  label: string;
  value: number;
  /** Shown above the bar. Defaults to the value. */
  display?: string;
  highlight?: boolean;
  muted?: boolean;
}

/** Hand-drawn bars. The tallest gets the gradient and glow; bars grow in with a small stagger. */
export function BarChart({ data, summary, height = 180, format = String }: { data: BarDatum[]; summary: string; height?: number; format?: (value: number) => string }) {
  const reduced = useReducedMotion();
  const gradientId = useId();
  const max = Math.max(1, ...data.map((datum) => datum.value));
  const peak = data.reduce((best, datum, index) => (datum.value > (data[best]?.value ?? -1) ? index : best), 0);

  return (
    <figure role="img" aria-label={summary} className="w-full">
      <div className="flex items-end gap-2 sm:gap-3" style={{ height }}>
        {data.map((datum, index) => {
          const fraction = datum.value / max;
          const isPeak = index === peak && datum.value > 0;
          return (
            <div key={`${datum.label}-${index}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className={clsx('text-[11.5px] font-semibold tabular-nums', isPeak ? 'text-brand-700' : 'text-ink-soft')}>{datum.display ?? format(datum.value)}</span>
              <motion.div
                className={clsx('w-full max-w-[44px] rounded-t-[12px] rounded-b-[6px]', isPeak ? 'shadow-glow' : datum.highlight ? 'bg-brand-300' : datum.muted ? 'bg-brand-50' : 'bg-brand-100')}
                style={{ backgroundImage: isPeak ? `var(--gradient-brand)` : undefined, transformOrigin: 'bottom' }}
                initial={reduced ? false : { scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: index * 0.06, ease: EASE }}
              >
                <div style={{ height: Math.max(6, fraction * (height - 44)) }} />
              </motion.div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3">
        {data.map((datum, index) => (
          <span key={`${datum.label}-label-${index}`} className={clsx('min-w-0 flex-1 truncate text-center text-[11.5px]', datum.highlight ? 'font-semibold text-ink' : 'text-ink-soft')}>
            {datum.label}
          </span>
        ))}
      </div>
      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <linearGradient id={gradientId} />
        </defs>
      </svg>
    </figure>
  );
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export const SERIES = ['rgb(var(--brand-600))', 'rgb(var(--accent))', '#12b886', '#ffbe3d', '#ff7a8a', 'rgb(var(--brand-300))', '#8b5cf6', '#14b8a6'];

/** SVG donut, r=42 with an 11 stroke, segments drawing in over a second. */
export function Donut({ segments, centre, caption, size = 168, summary }: { segments: DonutSegment[]; centre: ReactNode; caption: string; size?: number; summary: string }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <figure role="img" aria-label={summary} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgb(var(--brand-50))" strokeWidth="11" />
        {total > 0 &&
          segments.map((segment, index) => {
            const length = (segment.value / total) * circumference;
            const gap = segments.length > 1 ? Math.min(2.2, length * 0.3) : 0;
            const dash = Math.max(0, length - gap);
            const circle = (
              <motion.circle
                key={segment.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={active === index ? 13 : 11}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={-offset}
                initial={reduced ? false : { strokeDasharray: `0 ${circumference}` }}
                whileInView={{ strokeDasharray: `${dash} ${circumference}` }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.1 + index * 0.08, ease: EASE }}
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                style={{ transition: 'stroke-width 150ms ease' }}
              />
            );
            offset += length;
            return circle;
          })}
      </svg>
      <figcaption className="absolute inset-0 grid place-items-center text-center">
        <span>
          <span className="block text-[1.35rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">{active !== null ? segments[active]?.label : centre}</span>
          <span className="hint mt-1 block">{active !== null ? `${Math.round(((segments[active]?.value ?? 0) / Math.max(1, total)) * 100)}%` : caption}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <ul className="min-w-0 flex-1 space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2.5 text-[13.5px]">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="min-w-0 flex-1 truncate text-ink-muted">{item.label}</span>
          <span className="font-semibold tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** A semicircle of ticks that fill up to the percentage. */
export function Gauge({ value, label, sub, ticks = 28 }: { value: number; label: string; sub?: string; ticks?: number }) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, value));
  const lit = Math.round(clamped * ticks);
  const over = value > 1;
  return (
    <figure role="img" aria-label={`${label}: ${Math.round(value * 100)}%`} className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 112" className="w-full" aria-hidden>
        {Array.from({ length: ticks }, (_, index) => {
          const angle = Math.PI - (index / (ticks - 1)) * Math.PI;
          const inner = 72;
          const outer = 92;
          const x1 = 100 + Math.cos(angle) * inner;
          const y1 = 102 - Math.sin(angle) * inner;
          const x2 = 100 + Math.cos(angle) * outer;
          const y2 = 102 - Math.sin(angle) * outer;
          const on = index < lit;
          return (
            <motion.line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth="5.5"
              strokeLinecap="round"
              stroke={on ? (over ? '#f4506a' : index > ticks * 0.82 ? '#f5a314' : 'rgb(var(--brand-600))') : 'rgb(var(--brand-100))'}
              initial={reduced ? false : { opacity: 0.25 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: on ? index * 0.025 : 0, duration: 0.25 }}
            />
          );
        })}
      </svg>
      <figcaption className="absolute inset-x-0 bottom-0 text-center">
        <span className="block text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{Math.round(value * 100)}%</span>
        {sub && <span className="hint mt-1 block">{sub}</span>}
      </figcaption>
    </figure>
  );
}

/** A tiny trend line for a stat card. */
export function Sparkline({ values, className, stroke = 'currentColor' }: { values: number[]; className?: string; stroke?: string }) {
  const reduced = useReducedMotion();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values.map((value, index) => [(index / (values.length - 1)) * 100, 30 - ((value - min) / Math.max(1, max - min)) * 26 - 2] as const);
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden>
      <motion.path d={path} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" initial={reduced ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: EASE }} />
    </svg>
  );
}
