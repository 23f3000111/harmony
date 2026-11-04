import clsx from 'clsx';
import { Check, Plus, RotateCcw, ShoppingBasket, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { RestockDTO } from '@harmony/shared';
import { Illustration } from '@/art/Illustrations';
import { del, post } from '@/lib/api';
import { firstName, money, qty, timeAgo } from '@/lib/format';
import { celebrate, CountUp, SPRING } from '@/lib/motion';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { useRestock } from '@/features/data';
import { RestockForm } from '@/features/stockForms';
import { Button, IconButton } from '@/ui/Button';
import { PageHeader, Pill, TickBox } from '@/ui/Primitives';
import { ListSkeleton, Loaded } from '@/ui/States';

const SOURCE: Record<RestockDTO['source'], string> = { auto: 'Ran low', manual: 'Added', meal: 'For a meal', request: 'Requested' };

export default function Restock() {
  const { vocab, url, isManager, showMoney, workspace, edition } = useWorkspace();
  const query = useRestock();
  const [adding, setAdding] = useState(false);
  const [quick, setQuick] = useState('');

  const fromForecast = useWMutation({
    run: () => post<{ added: number }>(url('restock/from-forecast?days=30')),
    scopes: ['restock', 'items'],
    done: (result) => (result.added ? `Added ${result.added} item${result.added === 1 ? '' : 's'} from the forecast` : 'Everything forecast is already on the list'),
  });
  const quickAdd = useWMutation({
    run: (name: string) => post(url('restock'), { name, quantity: 1 }),
    scopes: ['restock', 'items'],
    onDone: () => setQuick(''),
  });

  const groups = useMemo(() => {
    const needed = (query.data?.entries ?? []).filter((entry) => entry.status === 'needed');
    const map = new Map<string, RestockDTO[]>();
    for (const entry of needed) {
      const key = entry.category ?? 'Other';
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [query.data]);

  const needed = (query.data?.entries ?? []).filter((entry) => entry.status === 'needed');
  const bought = (query.data?.entries ?? []).filter((entry) => entry.status === 'bought');
  const total = needed.reduce((sum, entry) => sum + entry.estCostCents, 0);

  return (
    <>
      <PageHeader
        title={vocab.restock}
        sub={edition === 'home' ? 'One list for the whole family. Tick things off in the shop and the pantry tops itself up.' : 'Everything that needs buying. Ticking it off updates stock and spend together.'}
        actions={
          <>
            {isManager && (
              <Button variant="secondary" icon={Wand2} onClick={() => fromForecast.mutate()} loading={fromForecast.isPending}>
                Fill from forecast
              </Button>
            )}
            <Button icon={Plus} onClick={() => setAdding(true)}>
              Add
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <form
            className="card flex items-center gap-2 p-2 pl-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (quick.trim()) quickAdd.mutate(quick.trim());
            }}
          >
            <ShoppingBasket aria-hidden className="size-5 shrink-0 text-ink-soft" />
            <label className="min-w-0 flex-1">
              <span className="sr-only">Quick add</span>
              <input value={quick} onChange={(event) => setQuick(event.target.value)} placeholder="Type something and press Enter" className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-ink-soft/70" />
            </label>
            <Button type="submit" size="sm" loading={quickAdd.isPending} disabled={!quick.trim()}>
              Add
            </Button>
          </form>

          <Loaded query={query} skeleton={<div className="card p-6"><ListSkeleton rows={6} /></div>}>
            {() =>
              needed.length === 0 ? (
                <div className="card flex flex-col items-center px-6 py-12 text-center">
                  <Illustration name="done" className="h-32 w-auto" />
                  <h2 className="card-title mt-3">Nothing to buy</h2>
                  <p className="mt-1 max-w-[40ch] text-ink-muted">Items join this list on their own when they run low.</p>
                  {isManager && (
                    <Button variant="soft" icon={Sparkles} className="mt-4" onClick={() => fromForecast.mutate()}>
                      Check the forecast
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.map(([category, entries]) => (
                    <section key={category} className="card p-3 sm:p-4" aria-label={category}>
                      <h2 className="px-2 pb-2 pt-1 text-[13px] font-semibold text-ink-soft">
                        {category} <span className="font-normal">· {entries.length}</span>
                      </h2>
                      <ul>
                        <AnimatePresence initial={false}>
                          {entries.map((entry) => (
                            <RestockRow key={entry.id} entry={entry} currency={workspace.currency} showMoney={showMoney} remaining={needed.length} />
                          ))}
                        </AnimatePresence>
                      </ul>
                    </section>
                  ))}
                </div>
              )
            }
          </Loaded>
        </div>

        <aside className="min-w-0 space-y-5">
          {showMoney && (
            <section className="bg-ocean grain overflow-hidden rounded-card p-6 text-white shadow-glow">
              <p className="text-[13.5px] font-semibold text-white/80">Expected total</p>
              <CountUp value={total / 100} format={(value) => money(Math.round(value * 100), workspace.currency)} className="mt-2 block text-[2.2rem] font-semibold leading-none tracking-[-0.035em] tabular-nums" />
              <p className="mt-2 text-[13px] text-white/75">
                {needed.length} item{needed.length === 1 ? '' : 's'} to buy
              </p>
            </section>
          )}
          <section className="card p-5">
            <h2 className="card-title mb-3">Bought recently</h2>
            {bought.length === 0 ? (
              <p className="py-4 text-center text-[14px] text-ink-muted">Ticked items show here for two days, in case you need to undo.</p>
            ) : (
              <ul className="space-y-1">
                {bought.map((entry) => (
                  <BoughtRow key={entry.id} entry={entry} currency={workspace.currency} showMoney={showMoney} />
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      <RestockForm open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function RestockRow({ entry, currency, showMoney, remaining }: { entry: RestockDTO; currency: string; showMoney: boolean; remaining: number }) {
  const { url } = useWorkspace();
  const [done, setDone] = useState(false);
  const bought = useWMutation({
    run: () => post(url(`restock/${entry.id}/bought`), {}),
    scopes: ['restock', 'items', 'money'],
    done: `Bought ${entry.name}`,
  });
  const remove = useWMutation({ run: () => del(url(`restock/${entry.id}`)), scopes: ['restock', 'items'] });

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60, height: 0, transition: { duration: 0.28 } }} transition={SPRING} className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-canvas/70">
      <TickBox
        checked={done}
        label={`Bought ${entry.name}`}
        disabled={bought.isPending}
        onChange={() => {
          setDone(true);
          const rect = (document.activeElement as HTMLElement | null)?.getBoundingClientRect();
          if (remaining === 1 && rect) celebrate({ x: rect.left + rect.width / 2, y: rect.top });
          window.setTimeout(() => bought.mutate(), 260);
        }}
      />
      <div className="min-w-0 flex-1">
        <p className={clsx('truncate font-semibold transition-colors', done && 'text-ink-soft line-through')}>{entry.name}</p>
        <p className="truncate text-[12.5px] text-ink-soft">
          {qty(entry.quantity)} {entry.unit ?? ''} · {SOURCE[entry.source]}
          {entry.addedByName && entry.source !== 'auto' ? ` by ${firstName(entry.addedByName)}` : ''}
        </p>
      </div>
      {entry.source === 'auto' && <Pill tone="sun" className="hidden sm:inline-flex">Ran low</Pill>}
      {showMoney && entry.estCostCents > 0 && <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-ink-muted">{money(entry.estCostCents, currency)}</span>}
      <IconButton icon={Trash2} label={`Remove ${entry.name}`} size="sm" className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" onClick={() => remove.mutate()} />
    </motion.li>
  );
}

function BoughtRow({ entry, currency, showMoney }: { entry: RestockDTO; currency: string; showMoney: boolean }) {
  const { url } = useWorkspace();
  const undo = useWMutation({ run: () => post(url(`restock/${entry.id}/undo`)), scopes: ['restock', 'items', 'money'], done: `${entry.name} is back on the list` });
  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint-50 text-mint-600">
        <Check aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink-muted line-through decoration-ink-soft/40">{entry.name}</p>
        <p className="truncate text-[12px] text-ink-soft">
          {entry.boughtByName ? firstName(entry.boughtByName) : 'Someone'} · {entry.boughtAt ? timeAgo(entry.boughtAt) : ''}
          {showMoney && entry.actualCostCents ? ` · ${money(entry.actualCostCents, currency)}` : ''}
        </p>
      </div>
      <IconButton icon={RotateCcw} label={`Undo ${entry.name}`} size="sm" onClick={() => undo.mutate()} disabled={undo.isPending} />
    </li>
  );
}
