import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SPRING } from '@/lib/motion';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: (event: React.MouseEvent) => void;
  danger?: boolean;
  disabled?: boolean;
}

/** A small dropdown. Escape or a click elsewhere closes it, and arrow keys move through it. */
export function Menu({
  trigger,
  items,
  align = 'right',
  side = 'bottom',
  className,
  header,
}: {
  trigger: (props: { onClick: (event: React.MouseEvent) => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  className?: string;
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    const first = root.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onMenuKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(index + (event.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length]?.focus();
  };

  return (
    <div ref={root} className={clsx('relative', className)}>
      {trigger({
        onClick: (event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: side === 'bottom' ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
            transition={SPRING}
            className={clsx(
              'absolute z-50 min-w-[210px] rounded-2xl border border-line/70 bg-white p-1.5 shadow-lift',
              align === 'right' ? 'right-0' : 'left-0',
              side === 'bottom' ? 'top-full mt-2 origin-top' : 'bottom-full mb-2 origin-bottom',
            )}
          >
            {header}
            {items.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect(event);
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[14px] font-medium outline-none transition-colors disabled:opacity-45',
                  item.danger ? 'text-coral-700 hover:bg-coral-50 focus:bg-coral-50' : 'text-ink hover:bg-brand-50 focus:bg-brand-50',
                )}
              >
                {item.icon && <item.icon aria-hidden className={clsx('size-4 shrink-0', item.danger ? 'text-coral-600' : 'text-ink-soft')} />}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
