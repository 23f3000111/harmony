import clsx from 'clsx';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SPRING, useMediaQuery } from '@/lib/motion';
import { Button } from './Button';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const isPhone = useMediaQuery('(max-width: 639px)');

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const autofocus = panel.current?.querySelector<HTMLElement>('[data-autofocus]');
      (autofocus ?? panel.current)?.focus();
    }, 30);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = overflow;
      previous.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" onKeyDown={onKeyDown}>
          <motion.div aria-hidden className="absolute inset-0 bg-brand-950/45 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={isPhone ? { y: '100%' } : { opacity: 0, y: 18, scale: 0.97 }}
            animate={isPhone ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isPhone ? { y: '100%', transition: { duration: 0.2 } } : { opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.14 } }}
            transition={SPRING}
            className={clsx(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-lift outline-none sm:rounded-[28px]',
              size === 'sm' && 'sm:max-w-[420px]',
              size === 'md' && 'sm:max-w-[540px]',
              size === 'lg' && 'sm:max-w-[780px]',
            )}
          >
            <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-6">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[1.3rem] font-semibold leading-tight tracking-[-0.02em]">
                  {title}
                </h2>
                {sub && <div className="mt-1 text-[14px] text-ink-muted">{sub}</div>}
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-5 pt-2">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface ConfirmOptions {
  title: string;
  text?: string;
  confirm: string;
  danger?: boolean;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const ask = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  const value = useMemo(() => ask, [ask]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={Boolean(options)}
        onClose={() => answer(false)}
        title={options?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => answer(false)}>
              Keep it
            </Button>
            <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => answer(true)} data-autofocus>
              {options?.confirm}
            </Button>
          </>
        }
      >
        {options?.text && <p className="text-ink-muted">{options.text}</p>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm must be used inside ConfirmProvider');
  return value;
}
