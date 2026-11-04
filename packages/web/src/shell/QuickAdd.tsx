import clsx from 'clsx';
import { CalendarPlus, Inbox, ListPlus, PackagePlus, Plus, ReceiptText, ShoppingBasket, Wallet } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SPRING } from '@/lib/motion';
import { useWorkspace } from '@/lib/workspace';
import { ExpenseForm } from '@/features/moneyForms';
import { OrderForm, RequestForm } from '@/features/procurementForms';
import { ItemForm, RestockForm } from '@/features/stockForms';
import { EventForm, TaskForm } from '@/features/taskForms';

type Sheet = 'task' | 'restock' | 'item' | 'expense' | 'request' | 'event' | 'order' | null;

/** The floating plus: the four or five things people add most, one tap away from anywhere. */
export function QuickAdd() {
  const { vocab, features, isManager, showMoney, path } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => setSheet((event as CustomEvent<Sheet>).detail);
    window.addEventListener('harmony:quick-add', onOpen);
    return () => window.removeEventListener('harmony:quick-add', onOpen);
  }, []);

  const actions = [
    { key: 'task' as const, label: `New ${vocab.task}`, icon: ListPlus },
    { key: 'restock' as const, label: `Add to ${vocab.restock.toLowerCase()}`, icon: ShoppingBasket },
    features.requests && { key: 'request' as const, label: `New ${vocab.request}`, icon: Inbox },
    features.orders && isManager && { key: 'order' as const, label: 'New purchase order', icon: ReceiptText },
    showMoney && { key: 'expense' as const, label: 'Log an expense', icon: Wallet },
    isManager && !features.orders && { key: 'item' as const, label: `New ${vocab.item}`, icon: PackagePlus },
    { key: 'event' as const, label: 'Add a date', icon: CalendarPlus },
  ].filter((action): action is { key: Exclude<Sheet, null>; label: string; icon: typeof Plus } => Boolean(action));

  return (
    <>
      <div className="no-print fixed bottom-[max(1.1rem,calc(env(safe-area-inset-bottom)+.6rem))] right-5 z-40 lg:bottom-8 lg:right-8">
        <AnimatePresence>
          {open && (
            <motion.ul initial="hidden" animate="show" exit="hidden" className="absolute bottom-[calc(100%+12px)] right-0 flex flex-col items-end gap-2">
              {actions.map((action, index) => (
                <motion.li
                  key={action.key}
                  variants={{ hidden: { opacity: 0, y: 12, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1 } }}
                  transition={{ ...SPRING, delay: open ? (actions.length - index) * 0.03 : 0 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setSheet(action.key);
                    }}
                    className="flex items-center gap-3 whitespace-nowrap rounded-full bg-white py-2 pl-4 pr-2 text-[14px] font-semibold text-ink shadow-lift transition-transform hover:-translate-x-1"
                  >
                    {action.label}
                    <span className="tile size-9 rounded-full bg-brand-50 text-brand-700">
                      <action.icon aria-hidden className="size-[18px]" />
                    </span>
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        <motion.button
          type="button"
          aria-label={open ? 'Close quick add' : 'Quick add'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          whileTap={{ scale: 0.9 }}
          className={clsx('bg-brand-gradient grain grid size-14 place-items-center rounded-full text-white shadow-glow transition-shadow hover:shadow-lift')}
        >
          <motion.span animate={{ rotate: open ? 45 : 0 }} transition={SPRING}>
            <Plus aria-hidden className="size-7" />
          </motion.span>
        </motion.button>
      </div>
      <AnimatePresence>{open && <motion.div aria-hidden className="no-print fixed inset-0 z-30 bg-white/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />}</AnimatePresence>

      <TaskForm open={sheet === 'task'} onClose={() => setSheet(null)} />
      <RestockForm open={sheet === 'restock'} onClose={() => setSheet(null)} />
      <ItemForm open={sheet === 'item'} onClose={() => setSheet(null)} />
      <ExpenseForm open={sheet === 'expense'} onClose={() => setSheet(null)} />
      <EventForm open={sheet === 'event'} onClose={() => setSheet(null)} />
      {features.requests && <RequestForm open={sheet === 'request'} onClose={() => setSheet(null)} />}
      {features.orders && isManager && <OrderForm open={sheet === 'order'} onClose={() => setSheet(null)} onCreated={(order) => navigate(path(`orders/${order.id}`))} />}
    </>
  );
}

/** Opens a quick-add form from anywhere, such as a dashboard shortcut. */
export const openQuickAdd = (sheet: Exclude<Sheet, null>) => window.dispatchEvent(new CustomEvent('harmony:quick-add', { detail: sheet }));
