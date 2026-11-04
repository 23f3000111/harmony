import clsx from 'clsx';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SPRING } from '@/lib/motion';
import { Avatar } from './Primitives';

export interface ToastInput {
  title: string;
  tone?: 'success' | 'error' | 'info' | 'live';
  person?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((item) => item.id !== id)), []);

  const toast = useCallback(
    (input: ToastInput) => {
      counter.current += 1;
      const id = counter.current;
      setItems((list) => [...list.slice(-3), { ...input, id }]);
      const duration = input.duration ?? (input.action ? 7000 : input.tone === 'error' ? 6500 : 4200);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
                transition={SPRING}
                className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-2xl bg-brand-950 py-2.5 pl-3 pr-2 text-[14px] text-white shadow-lift"
              >
                {item.person ? (
                  <Avatar name={item.person} size={26} />
                ) : item.tone === 'error' ? (
                  <CircleAlert aria-hidden className="size-5 shrink-0 text-coral-400" />
                ) : (
                  <CheckCircle2 aria-hidden className={clsx('size-5 shrink-0', item.tone === 'info' ? 'text-brand-300' : 'text-mint-400')} />
                )}
                <span className="min-w-0 flex-1 leading-snug">{item.title}</span>
                {item.action && (
                  <button
                    type="button"
                    onClick={() => {
                      item.action!.onClick();
                      dismiss(item.id);
                    }}
                    className="rounded-full bg-white/12 px-3 py-1 text-[13px] font-semibold transition-colors hover:bg-white/25"
                  >
                    {item.action.label}
                  </button>
                )}
                <button type="button" aria-label="Dismiss" onClick={() => dismiss(item.id)} className="grid size-7 shrink-0 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                  <X aria-hidden className="size-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
