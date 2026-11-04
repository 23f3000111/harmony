import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CountUp, Glare, useTilt } from '@/lib/motion';
import { IconTile, type Tone } from './Primitives';

/** A stat that links to the list behind it. Exactly one per row is "featured". */
export function KpiCard({
  label,
  value,
  format,
  hint,
  icon,
  tone = 'brand',
  featured,
  to,
}: {
  label: string;
  value: number;
  format?: (value: number) => string;
  hint: string;
  icon: LucideIcon;
  tone?: Tone;
  featured?: boolean;
  to: string;
}) {
  const tilt = useTilt<HTMLAnchorElement>(6);
  const blob = { brand: 'bg-brand-200', mint: 'bg-mint-100', sun: 'bg-sun-100', coral: 'bg-coral-100', grey: 'bg-line' }[tone];
  return (
    <Link
      ref={tilt.ref}
      to={to}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      style={tilt.style}
      className={clsx(
        'group relative block overflow-hidden rounded-card p-5 outline-offset-4',
        featured ? 'bg-ocean grain text-white shadow-glow' : 'border border-line/70 bg-white shadow-card hover:shadow-lift',
      )}
    >
      <span aria-hidden className={clsx('absolute -bottom-10 -right-8 size-32 rounded-full blur-2xl', featured ? 'bg-white/20' : clsx(blob, 'opacity-70'))} />
      <span className="relative flex items-start justify-between gap-3">
        <span className={clsx('text-[13.5px] font-semibold', featured ? 'text-white/85' : 'text-ink-muted')}>{label}</span>
        {featured ? (
          <span className="tile size-10 bg-white/16 text-white">
            <IconGlyph icon={icon} />
          </span>
        ) : (
          <IconTile icon={icon} tone={tone} />
        )}
      </span>
      <CountUp value={value} format={format} className="relative mt-3 block text-[2.2rem] font-semibold leading-none tracking-[-0.035em] tabular-nums" />
      <span className={clsx('relative mt-2 block truncate text-[13px]', featured ? 'text-white/75' : 'text-ink-soft')}>{hint}</span>
      <Glare />
    </Link>
  );
}

function IconGlyph({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden className="size-5" />;
}
