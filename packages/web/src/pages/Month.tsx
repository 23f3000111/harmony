import clsx from 'clsx';
import { CalendarPlus, ChevronLeft, ChevronRight, ListChecks, Package, ReceiptText, ShoppingBasket, Truck, Wallet, Wand2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addMonthKey, dateRange, diffDays, monthKey, weekdayIndex, type MonthAheadDTO } from '@harmony/shared';
import { Illustration } from '@/art/Illustrations';
import { post } from '@/lib/api';
import { dayMonth, dayNumber, minutesLabel, money, monthLabel, qty } from '@/lib/format';
import { CountUp, EASE, Reveal } from '@/lib/motion';
import { useWMutation, useWorkspace, useWQuery } from '@/lib/workspace';
import { EventForm } from '@/features/taskForms';
import { Button, IconButton } from '@/ui/Button';
import { Avatar, CardHeader, IconTile, PageHeader, Pill } from '@/ui/Primitives';
import { DashboardSkeleton, ErrorState } from '@/ui/States';

export default function Month() {
  const { today, url, isManager, showMoney, workspace, vocab, path, features } = useWorkspace();
  const [month, setMonth] = useState<string | null>(null);
  const query = useWQuery<MonthAheadDTO>('month', `/month-ahead${month ? `?month=${month}` : ''}`, { placeholderData: (previous) => previous });
  const [addingDate, setAddingDate] = useState(false);
  const fill = useWMutation({
    run: () => post<{ added: number }>(url(`restock/from-forecast?days=${query.data ? Math.max(1, diffDays(query.data.end, today) + 1) : 30}`)),
    scopes: ['restock', 'items'],
    done: (result) => (result.added ? `Added ${result.added} item${result.added === 1 ? '' : 's'} to the ${vocab.restock.toLowerCase()}` : 'Everything is already on the list'),
  });

  if (query.isPending) return <DashboardSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  const current = monthKey(today);
  const totalCommitted = data.budget.committedCents;
  const budgetLeft = data.budget.budgetCents - totalCommitted;

  return (
    <>
      <PageHeader
        title={`${monthLabel(data.month)}, planned`}
        sub="What you’ll need to buy, who has what to do, and what it all costs, worked out from real records."
        actions={
          <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1 shadow-soft">
            <IconButton icon={ChevronLeft} label="Previous month" size="sm" disabled={data.month <= current} onClick={() => setMonth(addMonthKey(data.month, -1))} />
            <span className="px-2 text-[13.5px] font-semibold">{monthLabel(data.month)}</span>
            <IconButton icon={ChevronRight} label="Next month" size="sm" onClick={() => setMonth(addMonthKey(data.month, 1))} />
          </div>
        }
      />

      <section className="bg-hero grain relative mb-5 overflow-hidden rounded-banner p-6 text-white shadow-lift sm:p-9">
        <span aria-hidden className="absolute -right-20 -top-24 size-80 rounded-full bg-[rgb(var(--accent)/.45)] blur-[90px]" />
        <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-[14px] font-semibold text-white/80">
              {dayMonth(data.start)} to {dayMonth(data.end)}
            </p>
            {showMoney ? (
              <>
                <CountUp value={totalCommitted / 100} format={(value) => money(Math.round(value * 100), workspace.currency, { whole: true })} className="banner-title mt-2 block tabular-nums" />
                <p className="mt-2 max-w-[56ch] text-white/85">
                  {data.budget.budgetCents
                    ? budgetLeft >= 0
                      ? `Expected this month, leaving ${money(budgetLeft, workspace.currency, { whole: true })} of the ${money(data.budget.budgetCents, workspace.currency, { whole: true })} budget.`
                      : `Expected this month, which is ${money(-budgetLeft, workspace.currency, { whole: true })} over the ${money(data.budget.budgetCents, workspace.currency, { whole: true })} budget.`
                    : 'Expected this month. Set a budget to see how it compares.'}
                </p>
              </>
            ) : (
              <>
                <p className="banner-title mt-2">{data.tasks.total} things to do</p>
                <p className="mt-2 text-white/85">Plus {data.restock.length} items to restock and {data.events.length} dates to remember.</p>
              </>
            )}
          </div>
          {showMoney && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { icon: ShoppingBasket, label: 'Restock', value: data.restockCents, show: true },
                { icon: Wallet, label: 'Bills', value: data.billsCents, show: features.bills },
                { icon: Truck, label: 'Deliveries', value: data.deliveries.reduce((sum, row) => sum + row.totalCents, 0), show: features.orders },
                { icon: ReceiptText, label: 'Last month', value: data.budget.lastMonthCents, show: true },
              ]
                .filter((row) => row.show)
                .map((row) => (
                <div key={row.label} className="rounded-2xl border border-white/20 bg-white/12 px-3.5 py-3 backdrop-blur">
                  <p className="flex items-center gap-1.5 text-[12px] text-white/75">
                    <row.icon aria-hidden className="size-3.5" />
                    {row.label}
                  </p>
                  <p className="mt-1 text-[16px] font-semibold tabular-nums">{money(row.value, workspace.currency, { compact: true })}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Reveal>
        <Runway data={data} onFill={isManager ? () => fill.mutate() : undefined} filling={fill.isPending} />
      </Reveal>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <MonthCalendar data={data} />
          <section className="card p-5 sm:p-6">
            <CardHeader title="Who does what" hint={`${data.tasks.total} ${vocab.tasks.toLowerCase()}${data.tasks.minutes ? `, about ${minutesLabel(data.tasks.minutes)} of work` : ''}`} action={<Link to={path('tasks?view=open')} className="text-[13px] font-semibold text-brand-700 hover:underline">All {vocab.tasks.toLowerCase()}</Link>} />
            {data.tasks.perPerson.length === 0 ? (
              <p className="py-6 text-center text-ink-muted">Nothing scheduled this month.</p>
            ) : (
              <ul className="space-y-3">
                {data.tasks.perPerson.map((person) => {
                  const max = Math.max(...data.tasks.perPerson.map((row) => row.count));
                  return (
                    <li key={person.memberId ?? 'none'} className="flex items-center gap-3">
                      {person.memberId ? <Avatar name={person.name} size={34} /> : <span className="grid size-[34px] place-items-center rounded-full border border-dashed border-line text-ink-soft">?</span>}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-semibold">{person.name}</span>
                          <span className="shrink-0 text-[13px] text-ink-soft">
                            {person.count} · {person.minutes ? minutesLabel(person.minutes) : 'no estimate'}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
                          <motion.div className={clsx('h-full rounded-full', person.memberId ? 'bg-brand-gradient' : 'bg-line')} initial={{ width: 0 }} whileInView={{ width: `${(person.count / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <aside className="min-w-0 space-y-5">
          {showMoney && data.bills.length > 0 && (
            <section className="card p-5">
              <CardHeader title="Bills this month" hint={money(data.billsCents, workspace.currency)} />
              <ul className="space-y-2">
                {data.bills.map((bill) => (
                  <li key={bill.id} className="flex items-center gap-3 rounded-2xl bg-canvas/70 px-3 py-2.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[14px] font-semibold shadow-soft">{dayNumber(bill.dueOn)}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{bill.name}</span>
                    <span className="font-semibold tabular-nums">{money(bill.amountCents, workspace.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.deliveries.length > 0 && (
            <section className="card p-5">
              <CardHeader title="Deliveries expected" />
              <ul className="space-y-2">
                {data.deliveries.map((delivery) => (
                  <li key={delivery.id}>
                    <Link to={path(`orders/${delivery.id}`)} className="flex items-center gap-3 rounded-2xl bg-canvas/70 px-3 py-2.5 hover:bg-brand-50">
                      <IconTile icon={Truck} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{delivery.number}</span>
                        <span className="block truncate text-[12px] text-ink-soft">
                          {delivery.supplierName} · {dayMonth(delivery.expectedOn)}
                        </span>
                      </span>
                      {showMoney && <span className="text-[13px] font-semibold tabular-nums">{money(delivery.totalCents, workspace.currency, { compact: true })}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card p-5">
            <CardHeader title="Dates to remember" action={<Button size="sm" variant="soft" icon={CalendarPlus} onClick={() => setAddingDate(true)}>Add</Button>} />
            {data.events.length === 0 ? (
              <p className="py-4 text-center text-ink-muted">Nothing on the calendar.</p>
            ) : (
              <ul className="space-y-2">
                {data.events.map((event) => (
                  <li key={event.id} className="flex items-center gap-3 rounded-2xl bg-canvas/70 px-3 py-2.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[14px] font-semibold shadow-soft">{dayNumber(event.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{event.title}</span>
                      <span className="block text-[12px] capitalize text-ink-soft">
                        {event.kind}
                        {event.time ? ` · ${event.time}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      <EventForm open={addingDate} onClose={() => setAddingDate(false)} />
    </>
  );
}

/** Each item is a bar running out towards its forecast date, with a marker for the last day to order. */
function Runway({ data, onFill, filling }: { data: MonthAheadDTO; onFill?: () => void; filling?: boolean }) {
  const { workspace, showMoney, path, vocab } = useWorkspace();
  const reduced = useReducedMotion();
  const span = Math.max(1, diffDays(data.end, data.today));
  const rows = data.restock.slice(0, 12);
  const position = (date: string | null) => (date ? Math.max(0, Math.min(1, diffDays(date, data.today) / span)) : 1);

  return (
    <section className="card p-5 sm:p-6">
      <CardHeader
        title="Stock runway"
        hint="Each bar runs out where the forecast says it will. The marker is the last day to order."
        action={
          onFill && rows.length > 0 && (
            <Button size="sm" icon={Wand2} onClick={onFill} loading={filling}>
              Add all to {vocab.restock.toLowerCase()}
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Illustration name="plan" className="h-28 w-auto" />
          <p className="mt-2 text-ink-muted">Nothing needs restocking before the month ends.</p>
        </div>
      ) : (
        <>
          <div className="mb-2 hidden grid-cols-[minmax(0,180px)_minmax(0,1fr)_120px] gap-4 text-[12px] font-semibold text-ink-soft md:grid">
            <span>Item</span>
            <span className="flex justify-between">
              <span>Today</span>
              <span>{dayMonth(data.end)}</span>
            </span>
            <span className="text-right">Buy</span>
          </div>
          <ul className="space-y-3">
            {rows.map((item, index) => {
              const runsOut = position(item.forecast.runsOutOn);
              const orderBy = item.forecast.orderBy ? position(item.forecast.orderBy) : null;
              const urgent = item.forecast.status === 'out' || item.forecast.status === 'low' || (item.forecast.daysLeft !== null && item.forecast.daysLeft <= 7);
              return (
                <li key={item.id} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_120px] md:gap-4">
                  <Link to={path(`items?open=${item.id}`)} className="flex min-w-0 items-center gap-2.5 hover:underline">
                    <IconTile icon={Package} size={30} tone={urgent ? 'coral' : 'sun'} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{item.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-soft">
                        {qty(item.quantity)} {item.unit} left{item.supplierName ? ` · ${item.supplierName}` : ''}
                      </span>
                    </span>
                  </Link>
                  <div className="relative h-7 rounded-full bg-canvas" role="img" aria-label={`${item.name}: ${item.forecast.runsOutOn ? `runs out ${dayMonth(item.forecast.runsOutOn)}` : 'below minimum'}${item.forecast.orderBy ? `, order by ${dayMonth(item.forecast.orderBy)}` : ''}`}>
                    <motion.div
                      className={clsx('absolute inset-y-0 left-0 rounded-full', urgent ? 'bg-gradient-to-r from-coral-400 to-coral-500' : 'bg-brand-gradient')}
                      initial={reduced ? false : { width: 0 }}
                      whileInView={{ width: `${Math.max(3, runsOut * 100)}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: index * 0.05, ease: EASE }}
                    />
                    <span className="absolute inset-y-0 left-3 flex items-center text-[11.5px] font-semibold text-white mix-blend-normal">
                      {item.forecast.runsOutOn ? (item.forecast.daysLeft === 0 ? 'Out today' : `${item.forecast.daysLeft} days`) : 'Below minimum'}
                    </span>
                    {orderBy !== null && orderBy < 1 && (
                      <span className="absolute -top-1.5 bottom-[-6px] w-0.5 rounded-full bg-ink" style={{ left: `${orderBy * 100}%` }} title={`Order by ${dayMonth(item.forecast.orderBy!)}`}>
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">Order by {dayMonth(item.forecast.orderBy!)}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 md:block md:text-right">
                    <span className="text-[14px] font-semibold tabular-nums">
                      {qty(item.forecast.suggestedQty)} {item.unit}
                    </span>
                    {showMoney && item.forecast.suggestedCostCents > 0 && <span className="block text-[12px] text-ink-soft">{money(item.forecast.suggestedCostCents, workspace.currency)}</span>}
                    {item.onList && <Pill tone="sun">On the list</Pill>}
                  </div>
                </li>
              );
            })}
          </ul>
          {data.restock.length > rows.length && <p className="hint mt-4">And {data.restock.length - rows.length} more. Adding all puts every one of them on the list.</p>}
        </>
      )}
    </section>
  );
}

function MonthCalendar({ data }: { data: MonthAheadDTO }) {
  const [first] = [data.month + '-01'];
  const totalDays = Number(data.end.slice(8, 10));
  const lead = weekdayIndex(first);
  const days = dateRange(first, totalDays);
  const max = Math.max(1, ...Object.values(data.tasks.byDate));
  const billDays = new Set(data.bills.map((bill) => bill.dueOn));
  const eventDays = new Set(data.events.map((event) => event.date));
  const deliveryDays = new Set(data.deliveries.map((delivery) => delivery.expectedOn));

  return (
    <section className="card p-5 sm:p-6">
      <CardHeader title="The month at a glance" hint="Darker days are busier" />
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11.5px] font-semibold text-ink-soft" aria-hidden>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <ol className="mt-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, index) => (
          <li key={`blank-${index}`} aria-hidden />
        ))}
        {days.map((date) => {
          const count = data.tasks.byDate[date] ?? 0;
          const past = date < data.today;
          const isToday = date === data.today;
          const intensity = count / max;
          return (
            <li
              key={date}
              className={clsx('relative flex aspect-square min-h-[40px] flex-col justify-between rounded-xl p-1.5 text-left sm:p-2', past ? 'opacity-40' : '', isToday && 'ring-2 ring-brand-600')}
              style={{ background: count ? `rgb(var(--brand-600) / ${0.08 + intensity * 0.55})` : 'rgb(var(--canvas))' }}
              aria-label={`${dayMonth(date)}: ${count} tasks${billDays.has(date) ? ', a bill due' : ''}${eventDays.has(date) ? ', a date to remember' : ''}`}
            >
              <span className={clsx('text-[12px] font-semibold', intensity > 0.55 ? 'text-white' : 'text-ink')}>{dayNumber(date)}</span>
              <span className="flex gap-0.5">
                {billDays.has(date) && <span className="size-1.5 rounded-full bg-coral-500" />}
                {eventDays.has(date) && <span className="size-1.5 rounded-full bg-sun-500" />}
                {deliveryDays.has(date) && <span className="size-1.5 rounded-full bg-mint-500" />}
              </span>
            </li>
          );
        })}
      </ol>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
        <li className="flex items-center gap-1.5">
          <ListChecks aria-hidden className="size-3.5" />
          Shade shows how many tasks
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-coral-500" />
          Bill
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sun-500" />
          Date
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-mint-500" />
          Delivery
        </li>
      </ul>
    </section>
  );
}
