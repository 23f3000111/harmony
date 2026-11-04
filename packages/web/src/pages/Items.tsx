import clsx from 'clsx';
import { Boxes, History, Minus, PackagePlus, Pencil, Plus, Search, ShoppingBasket } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { ItemDTO, MovementDTO } from '@harmony/shared';
import { post } from '@/lib/api';
import { dayMonth, money, qty, relativeDay, timeAgo } from '@/lib/format';
import { itemVariants, listVariants } from '@/lib/motion';
import { useOpenParam, useWMutation, useWorkspace, useWQuery } from '@/lib/workspace';
import { useItems } from '@/features/data';
import { AdjustForm, ItemForm } from '@/features/stockForms';
import { Button, IconButton } from '@/ui/Button';
import { ExportButton } from '@/ui/ExportButton';
import { Modal } from '@/ui/Modal';
import { FilterChip, LevelBar, PageHeader, Pill, type Tone } from '@/ui/Primitives';
import { EmptyState, ListSkeleton, Loaded } from '@/ui/States';
import { stockLevel } from '@harmony/shared';

const STATUS: Record<ItemDTO['forecast']['status'], { label: string; tone: Tone }> = {
  out: { label: 'Out', tone: 'coral' },
  low: { label: 'Low', tone: 'coral' },
  soon: { label: 'Running out', tone: 'sun' },
  ok: { label: 'Fine', tone: 'mint' },
};

type Filter = 'all' | 'attention' | string;

export default function Items() {
  const { vocab, isManager, url, today, workspace, showMoney } = useWorkspace();
  const query = useItems();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ItemDTO | null | 'new'>(null);
  const [adjusting, setAdjusting] = useState<ItemDTO | null>(null);
  const [history, setHistory] = useState<ItemDTO | null>(null);
  const [openId, clearOpen] = useOpenParam();

  useEffect(() => {
    if (!openId || !query.data) return;
    const item = query.data.items.find((row) => row.id === openId);
    if (item) setHistory(item);
    clearOpen();
  }, [openId, query.data, clearOpen]);

  const categories = useMemo(() => [...new Set((query.data?.items ?? []).map((item) => item.category))], [query.data]);
  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data?.items ?? [])
      .filter((item) => (filter === 'all' ? true : filter === 'attention' ? item.forecast.status !== 'ok' : item.category === filter))
      .filter((item) => !term || item.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const rank = { out: 0, low: 1, soon: 2, ok: 3 };
        return rank[a.forecast.status] - rank[b.forecast.status] || a.name.localeCompare(b.name);
      });
  }, [query.data, filter, search]);
  const attention = (query.data?.items ?? []).filter((item) => item.forecast.status !== 'ok').length;

  return (
    <>
      <PageHeader
        title={vocab.items}
        sub="Everything you keep, how much is left, and when it’ll run out. Low items join the list on their own."
        actions={
          <>
            {isManager && <ExportButton path={url('export/items.csv')} filename="stock.csv" label="Export" />}
            {isManager && (
              <Button icon={PackagePlus} onClick={() => setEditing('new')}>
                New {vocab.item}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="scroll-thin -mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1">
          <FilterChip selected={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </FilterChip>
          <FilterChip selected={filter === 'attention'} onClick={() => setFilter('attention')}>
            Needs attention {attention > 0 && <span className="rounded-full bg-coral-500 px-1.5 text-[11px] text-white">{attention}</span>}
          </FilterChip>
          {categories.map((category) => (
            <FilterChip key={category} selected={filter === category} onClick={() => setFilter(category)}>
              {category}
            </FilterChip>
          ))}
        </div>
        <label className="relative block w-full shrink-0 lg:w-64">
          <span className="sr-only">Search {vocab.items.toLowerCase()}</span>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="field pl-11" />
        </label>
      </div>

      <Loaded query={query} skeleton={<div className="card p-6"><ListSkeleton rows={8} /></div>}>
        {() =>
          items.length === 0 ? (
            <div className="card">
              <EmptyState icon={Boxes} title={search ? `Nothing matches “${search}”` : 'Nothing here yet'} text={isManager && !search ? 'Add what you keep, and Harmony works out when it’ll run out.' : undefined} action={isManager && !search && <Button icon={PackagePlus} onClick={() => setEditing('new')}>New {vocab.item}</Button>} />
            </div>
          ) : (
            <motion.ul variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  today={today}
                  currency={workspace.currency}
                  showMoney={showMoney}
                  isManager={isManager}
                  onAdjust={() => setAdjusting(item)}
                  onEdit={() => setEditing(item)}
                  onHistory={() => setHistory(item)}
                />
              ))}
            </motion.ul>
          )
        }
      </Loaded>

      <ItemForm open={editing !== null} onClose={() => setEditing(null)} item={editing === 'new' ? null : editing} />
      <AdjustForm open={Boolean(adjusting)} onClose={() => setAdjusting(null)} item={adjusting} />
      <HistoryModal item={history} onClose={() => setHistory(null)} />
    </>
  );
}

function ItemCard({ item, today, currency, showMoney, isManager, onAdjust, onEdit, onHistory }: { item: ItemDTO; today: string; currency: string; showMoney: boolean; isManager: boolean; onAdjust: () => void; onEdit: () => void; onHistory: () => void }) {
  const { url } = useWorkspace();
  const status = STATUS[item.forecast.status];
  const level = stockLevel(item.quantity, item.minQty, item.targetQty);
  const useOne = useWMutation({ run: () => post(url(`items/${item.id}/adjust`), { delta: -1, reason: 'used' }), scopes: ['items', 'restock'] });
  const addList = useWMutation({ run: () => post(url('restock'), { name: item.name, itemId: item.id, quantity: Math.max(1, item.forecast.suggestedQty || (item.targetQty ?? 1) - item.quantity) }), scopes: ['restock', 'items'], done: `${item.name} is on the list` });

  return (
    <motion.li variants={itemVariants} layout className="card group flex min-w-0 flex-col p-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onHistory} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px] font-semibold">{item.name}</span>
          <span className="block truncate text-[12.5px] text-ink-soft">
            {item.category}
            {item.location ? ` · ${item.location}` : ''}
            {item.supplierName ? ` · ${item.supplierName}` : ''}
          </span>
        </button>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p>
          <span className="text-[1.65rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{qty(item.quantity)}</span>
          <span className="ml-1 text-[13px] text-ink-soft">{item.unit}</span>
        </p>
        <p className="text-right text-[12.5px] text-ink-soft">
          {item.forecast.runsOutOn ? (
            <>
              Runs out <span className={clsx('font-semibold', item.forecast.status === 'ok' ? 'text-ink' : 'text-coral-600')}>{relativeDay(item.forecast.runsOutOn, today) === dayMonth(item.forecast.runsOutOn) ? dayMonth(item.forecast.runsOutOn) : relativeDay(item.forecast.runsOutOn, today).toLowerCase()}</span>
            </>
          ) : (
            'Not enough use to forecast'
          )}
          <span className="block">Restock at {qty(item.minQty)}</span>
        </p>
      </div>
      <LevelBar value={level} tone={status.tone} className="mt-3" />

      <div className="mt-4 flex items-center gap-1.5">
        <button type="button" onClick={() => useOne.mutate()} disabled={item.quantity <= 0 || useOne.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 active:scale-95 disabled:opacity-40" aria-label={`Used one ${item.unit} of ${item.name}`}>
          <Minus aria-hidden className="size-3.5" />
          Used 1
        </button>
        <button type="button" onClick={onAdjust} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-canvas">
          <Plus aria-hidden className="size-3.5" />
          More
        </button>
        <span className="flex-1" />
        {item.onOrder > 0 ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700">{qty(item.onOrder)} on order</span>
        ) : item.onList ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-sun-700">
            <ShoppingBasket aria-hidden className="size-3.5" />
            On the list
          </span>
        ) : (
          <IconButton icon={ShoppingBasket} label={`Add ${item.name} to the list`} size="sm" onClick={() => addList.mutate()} />
        )}
        <IconButton icon={History} label={`History of ${item.name}`} size="sm" onClick={onHistory} />
        {isManager && <IconButton icon={Pencil} label={`Edit ${item.name}`} size="sm" onClick={onEdit} />}
      </div>
      {showMoney && item.unitCostCents > 0 && <p className="hint mt-2">{money(item.unitCostCents, currency)} each</p>}
    </motion.li>
  );
}

const REASON: Record<string, string> = { used: 'Used', restocked: 'Topped up', received: 'Delivered', adjusted: 'Corrected' };

function HistoryModal({ item, onClose }: { item: ItemDTO | null; onClose: () => void }) {
  const query = useWQuery<{ movements: MovementDTO[] }>('items', `/items/${item?.id}/movements`, { enabled: Boolean(item) });
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={item?.name ?? ''} sub={item ? `${qty(item.quantity)} ${item.unit} now${item.forecast.dailyUsage ? ` · about ${qty(item.forecast.dailyUsage * 7)} ${item.unit} a week` : ''}` : undefined}>
      {item && (
        <Loaded query={query}>
          {({ movements }) =>
            movements.length === 0 ? (
              <p className="py-8 text-center text-ink-muted">No changes recorded yet.</p>
            ) : (
              <ol className="divide-y divide-line/70">
                {movements.map((move) => (
                  <li key={move.id} className="flex items-center gap-3 py-2.5">
                    <span className={clsx('grid size-9 shrink-0 place-items-center rounded-xl text-[13px] font-semibold tabular-nums', move.delta < 0 ? 'bg-coral-50 text-coral-700' : 'bg-mint-50 text-mint-700')}>
                      {move.delta > 0 ? '+' : ''}
                      {qty(move.delta)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{REASON[move.reason] ?? move.reason}</span>
                      <span className="block truncate text-[12px] text-ink-soft">
                        {move.memberName ?? 'Someone'}
                        {move.note ? ` · ${move.note}` : ''}
                      </span>
                    </span>
                    <span className="hint shrink-0">{timeAgo(move.createdAt)}</span>
                  </li>
                ))}
              </ol>
            )
          }
        </Loaded>
      )}
    </Modal>
  );
}
