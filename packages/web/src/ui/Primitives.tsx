import clsx from 'clsx';
import { Check, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { initials } from '@/lib/format';
import { SPRING } from '@/lib/motion';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#1f58e0,#38bdf8)',
  'linear-gradient(135deg,#0b9a70,#7ee0b5)',
  'linear-gradient(135deg,#d98500,#ffd166)',
  'linear-gradient(135deg,#dc3150,#ff9aa8)',
  'linear-gradient(135deg,#6d3bd1,#b89bff)',
  'linear-gradient(135deg,#0f7f8c,#5fd3dd)',
  'linear-gradient(135deg,#96398e,#f2a27e)',
  'linear-gradient(135deg,#526c40,#a9bd78)',
];

const hash = (text: string) => [...text].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, src, size = 36, className, ring }: { name: string; src?: string | null; size?: number; className?: string; ring?: boolean }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.36) };
  if (src) {
    return <img src={src} alt="" referrerPolicy="no-referrer" className={clsx('shrink-0 rounded-full object-cover', ring && 'ring-2 ring-white', className)} style={style} />;
  }
  return (
    <span
      aria-hidden
      title={name}
      className={clsx('grid shrink-0 place-items-center rounded-full font-semibold tracking-tight text-white', ring && 'ring-2 ring-white', className)}
      style={{ ...style, backgroundImage: AVATAR_GRADIENTS[hash(name) % AVATAR_GRADIENTS.length] }}
    >
      {initials(name)}
    </span>
  );
}

export type Tone = 'brand' | 'mint' | 'sun' | 'coral' | 'grey';

const PILL: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  mint: 'bg-mint-50 text-mint-700',
  sun: 'bg-sun-50 text-sun-700',
  coral: 'bg-coral-50 text-coral-700',
  grey: 'bg-canvas text-ink-muted',
};
const DOT: Record<Tone, string> = { brand: 'bg-brand-500', mint: 'bg-mint-500', sun: 'bg-sun-500', coral: 'bg-coral-500', grey: 'bg-ink-soft' };

export function Pill({ tone = 'grey', children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none', PILL[tone], className)}>
      {dot && <span aria-hidden className={clsx('size-1.5 rounded-full', DOT[tone])} />}
      {children}
    </span>
  );
}

const TILE_TONE: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  mint: 'bg-mint-50 text-mint-600',
  sun: 'bg-sun-50 text-sun-600',
  coral: 'bg-coral-50 text-coral-600',
  grey: 'bg-canvas text-ink-muted',
};

export function IconTile({ icon: Icon, tone = 'brand', size = 40, className }: { icon: LucideIcon; tone?: Tone; size?: number; className?: string }) {
  return (
    <span className={clsx('tile', TILE_TONE[tone], className)} style={{ width: size, height: size, borderRadius: Math.min(16, size * 0.36) }}>
      <Icon aria-hidden style={{ width: size * 0.48, height: size * 0.48 }} />
    </span>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mb-7">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[62ch] text-ink-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function CardHeader({ title, hint, action, className }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {hint && <p className="hint mt-0.5">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** The tick that draws itself, with a small burst when it lands. */
export function TickBox({ checked, onChange, label, size = 24, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; size?: number; disabled?: boolean }) {
  const [burst, setBurst] = useState(0);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!checked) setBurst((count) => count + 1);
        onChange(!checked);
      }}
      className="group relative grid shrink-0 place-items-center disabled:opacity-50"
      style={{ width: size + 12, height: size + 12, margin: -6 }}
    >
      <motion.span
        whileTap={{ scale: 0.82 }}
        animate={{ scale: checked ? [1, 1.18, 1] : 1 }}
        transition={{ duration: 0.3 }}
        className={clsx('grid place-items-center rounded-[9px] border-2 transition-colors duration-150', checked ? 'border-mint-500 bg-mint-500' : 'border-line bg-white group-hover:border-brand-400')}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-[72%]" aria-hidden>
          <motion.path
            d="M5 12.5l4.6 4.6L19 7.6"
            stroke="white"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          />
        </svg>
      </motion.span>
      <AnimatePresence>
        {burst > 0 && checked && (
          <span key={burst} className="pointer-events-none absolute inset-0" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => {
              const angle = (index / 6) * Math.PI * 2;
              return (
                <motion.span
                  key={index}
                  className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-mint-400"
                  initial={{ x: -3, y: -3, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos(angle) * 22 - 3, y: Math.sin(angle) * 22 - 3, opacity: 0, scale: 0.4 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              );
            })}
          </span>
        )}
      </AnimatePresence>
    </button>
  );
}

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({ items, value, onChange, label, className }: { items: TabItem<T>[]; value: T; onChange: (value: T) => void; label: string; className?: string }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, step: number) => {
    const next = (from + step + items.length) % items.length;
    onChange(items[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={clsx('scroll-thin inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line/70 bg-white p-1 shadow-soft', className)}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') move(index, 1);
              if (event.key === 'ArrowLeft') move(index, -1);
            }}
            className={clsx('relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors', selected ? 'text-white' : 'text-ink-muted hover:text-brand-700')}
          >
            {selected && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-full bg-brand-600 shadow-glow" transition={SPRING} />}
            <span className="relative flex items-center gap-1.5">
              {item.label}
              {item.count !== undefined && item.count > 0 && <span className={clsx('rounded-full px-1.5 text-[11px] leading-[18px]', selected ? 'bg-white/20' : 'bg-brand-50 text-brand-700')}>{item.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function LevelBar({ value, tone = 'brand', className }: { value: number; tone?: Tone; className?: string }) {
  const color = { brand: 'bg-brand-500', mint: 'bg-mint-500', sun: 'bg-sun-500', coral: 'bg-coral-500', grey: 'bg-ink-soft' }[tone];
  return (
    <span className={clsx('block h-1.5 overflow-hidden rounded-full bg-canvas', className)} aria-hidden>
      <motion.span className={clsx('block h-full rounded-full', color)} initial={{ width: 0 }} animate={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
    </span>
  );
}

export function ProgressRing({ value, total, size = 64, stroke = 7, label }: { value: number; total: number; size?: number; stroke?: number; label?: ReactNode }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--brand-100))" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={fraction >= 1 ? '#12b886' : 'rgb(var(--brand-600))'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - fraction) }}
          transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <span className="absolute text-[13px] font-semibold">{label ?? `${value}/${total}`}</span>
    </span>
  );
}

export function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
        selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-muted hover:border-brand-300 hover:text-brand-700',
      )}
    >
      {selected && <Check aria-hidden className="size-3.5" />}
      {children}
    </button>
  );
}
