import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Pencil, Plus, Receipt, RotateCcw, SlidersHorizontal, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { addMonthKey, monthKey, RECURRENCE_LABEL, type BillDTO, type ExpenseDTO, type SpendingSummary } from '@harmony/shared';
import { post } from '@/lib/api';
import { dayMonth, money, monthAbbr, monthLabel, relativeDay } from '@/lib/format';
import { EASE } from '@/lib/motion';
import { useWMutation, useWorkspace, useWQuery } from '@/lib/workspace';
import { BarChart, Gauge } from '@/charts/Charts';
import { BillForm, BudgetForm, ExpenseForm } from '@/features/moneyForms';
import { Button, IconButton } from '@/ui/Button';
import { ExportButton } from '@/ui/ExportButton';
import { CardHeader, PageHeader, Pill, Tabs } from '@/ui/Primitives';
import { EmptyState, ListSkeleton, Loaded, Skeleton } from '@/ui/States';

const SOURCE: Record<ExpenseDTO['source'], string> = { manual: 'Logged', bill: 'Bill', restock: 'Shopping', order: 'Purchase order' };

export default function Spending() {
  const { vocab, today, workspace, features, url } = useWorkspace();
  const [month, setMonth] = useState(monthKey(today));
  const summary = useWQuery<SpendingSummary>('money', `/money/summary?month=${month}`, { placeholderData: (previous) => previous });
  const expenses = useWQuery<{ expenses: ExpenseDTO[] }>('money', `/money/expenses?month=${month}`, { placeholderData: (previous) => previous });
  const [tab, setTab] = useState<'expenses' | 'bills'>(features.bills ? 'bills' : 'expenses');
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [expense, setExpense] = useState<ExpenseDTO | null | 'new'>(null);
  const [bill, setBill] = useState<BillDTO | null | 'new'>(null);
  const currency = workspace.currency;

  return (
    <>
      <PageHeader
        title={vocab.spending}
        sub="Every ringgit in one place: bills when paid, shopping when bought, orders when received. Nothing counted twice."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1 shadow-soft">
              <IconButton icon={ChevronLeft} label="Previous month" size="sm" onClick={() => setMonth(addMonthKey(month, -1))} />
              <span className="px-2 text-[13.5px] font-semibold">{monthLabel(month)}</span>
              <IconButton icon={ChevronRight} label="Next month" size="sm" disabled={month >= monthKey(today)} onClick={() => setMonth(addMonthKey(month, 1))} />
            </div>
            <Button icon={Plus} onClick={() => setExpense('new')}>
              Log expense
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="card flex flex-col p-5 sm:p-6">
          <CardHeader title="Budget used" hint={monthLabel(month)} action={<Button size="sm" variant="soft" icon={SlidersHorizontal} onClick={() => setBudgetOpen(true)}>Edit budget</Button>} />
          <Loaded query={summary} skeleton={<Skeleton className="h-40" />}>
            {(data) => (
              <div className="flex flex-1 flex-col justify-center">
                <Gauge value={data.budgetCents ? data.spentCents / data.budgetCents : 0} label="Budget used" sub={data.budgetCents ? `${money(data.spentCents, currency, { whole: true })} of ${money(data.budgetCents, currency, { whole: true })}` : `${money(data.spentCents, currency)} spent, no budget set`} />
                {data.unbudgetedCents > 0 && <p className="hint mt-4 text-center">{money(data.unbudgetedCents, currency)} went to categories without a budget.</p>}
              </div>
            )}
          </Loaded>
        </section>
        <section className="card p-5 sm:p-6 lg:col-span-2">
          <CardHeader title="Six months" hint="Total spent each month" />
          <Loaded query={summary} skeleton={<Skeleton className="h-48" />}>
            {(data) => (
              <BarChart
                summary={`Spending by month. ${data.byMonth.map((row) => `${row.month}: ${money(row.spentCents, currency)}`).join('. ')}`}
                data={data.byMonth.map((row) => ({ label: monthAbbr(row.month), value: row.spentCents, display: money(row.spentCents, currency, { compact: true }), highlight: row.month === month }))}
              />
            )}
          </Loaded>
        </section>
      </div>

      <section className="card mt-5 p-5 sm:p-6">
        <CardHeader title="By category" hint="Spent against each budget" />
        <Loaded query={summary}>
          {(data) =>
            data.byCategory.length === 0 ? (
              <EmptyState compact icon={Wallet} title="Nothing spent or budgeted yet" action={<Button size="sm" variant="soft" onClick={() => setBudgetOpen(true)}>Set a budget</Button>} />
            ) : (
              <ul className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                {data.byCategory.map((line, index) => {
                  const ratio = line.amountCents ? line.spentCents / line.amountCents : line.spentCents ? 1 : 0;
                  const over = line.amountCents > 0 && line.spentCents > line.amountCents;
                  return (
                    <li key={line.category}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold">{line.category}</span>
                        <span className={clsx('shrink-0 text-[13px] tabular-nums', over ? 'font-semibold text-coral-600' : 'text-ink-soft')}>
                          {money(line.spentCents, currency, { whole: true })}
                          {line.amountCents ? ` of ${money(line.amountCents, currency, { whole: true })}` : ' · no budget'}
                        </span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-canvas">
                        <motion.div
                          className={clsx('h-full rounded-full', over ? 'bg-coral-500' : ratio > 0.85 ? 'bg-sun-400' : line.amountCents ? 'bg-brand-gradient' : 'bg-line')}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${Math.min(100, ratio * 100)}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8, delay: index * 0.04, ease: EASE }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </Loaded>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {features.bills ? (
          <Tabs
            label="Show"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'bills', label: 'Bills' },
              { value: 'expenses', label: 'Every expense' },
            ]}
          />
        ) : (
          <h2 className="card-title">Every expense</h2>
        )}
        <div className="flex gap-2">
          <ExportButton path={url('export/expenses.csv')} filename="spending.csv" label="Export" size="sm" />
          {tab === 'bills' && (
            <Button size="sm" variant="soft" icon={Plus} onClick={() => setBill('new')}>
              Add bill
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">{tab === 'bills' && features.bills ? <BillsList onEdit={setBill} /> : <ExpenseList query={expenses} onEdit={setExpense} />}</div>

      {summary.data && <BudgetForm open={budgetOpen} onClose={() => setBudgetOpen(false)} lines={summary.data.byCategory} />}
      <ExpenseForm open={expense !== null} onClose={() => setExpense(null)} expense={expense === 'new' ? null : expense} />
      {features.bills && <BillForm open={bill !== null} onClose={() => setBill(null)} bill={bill === 'new' ? null : bill} />}
    </>
  );
}

function ExpenseList({ query, onEdit }: { query: ReturnType<typeof useWQuery<{ expenses: ExpenseDTO[] }>>; onEdit: (expense: ExpenseDTO) => void }) {
  const { workspace } = useWorkspace();
  return (
    <div className="card overflow-hidden">
      <Loaded query={query} skeleton={<div className="p-6"><ListSkeleton /></div>}>
        {({ expenses }) =>
          expenses.length === 0 ? (
            <EmptyState icon={Receipt} title="Nothing spent this month" />
          ) : (
            <ul className="divide-y divide-line/60">
              {expenses.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onEdit(row)} disabled={row.source !== 'manual'} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-canvas/70 disabled:cursor-default">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-canvas text-center leading-none">
                      <span>
                        <span className="block text-[10px] font-semibold text-ink-soft">{monthAbbr(row.spentOn.slice(0, 7))}</span>
                        <span className="block text-[15px] font-semibold">{Number(row.spentOn.slice(8, 10))}</span>
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.title}</span>
                      <span className="block truncate text-[12.5px] text-ink-soft">
                        {row.category} · {SOURCE[row.source]}
                        {row.memberName ? ` · ${row.memberName}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{money(row.amountCents, workspace.currency)}</span>
                    {row.source === 'manual' && <Pencil aria-hidden className="size-4 shrink-0 text-ink-soft" />}
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </div>
  );
}

function BillsList({ onEdit }: { onEdit: (bill: BillDTO) => void }) {
  const { today, workspace } = useWorkspace();
  const query = useWQuery<{ bills: BillDTO[] }>('bills', '/bills');
  return (
    <Loaded query={query} skeleton={<div className="card p-6"><ListSkeleton /></div>}>
      {({ bills }) => {
        const due = bills.filter((row) => row.status === 'due');
        const paid = bills.filter((row) => row.status === 'paid').slice(0, 12);
        if (bills.length === 0) return <div className="card"><EmptyState icon={Receipt} title="No bills yet" text="Add the bills you pay regularly. Harmony reminds you and schedules the next one." /></div>;
        return (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="card divide-y divide-line/60 overflow-hidden">
              {due.map((row) => (
                <BillRow key={row.id} bill={row} today={today} currency={workspace.currency} onEdit={() => onEdit(row)} />
              ))}
              {due.length === 0 && <p className="p-6 text-center text-ink-muted">Every bill is paid.</p>}
            </div>
            <section className="card p-5">
              <h3 className="card-title mb-3">Paid recently</h3>
              <ul className="space-y-1">
                {paid.map((row) => (
                  <PaidRow key={row.id} bill={row} currency={workspace.currency} />
                ))}
              </ul>
            </section>
          </div>
        );
      }}
    </Loaded>
  );
}

function BillRow({ bill, today, currency, onEdit }: { bill: BillDTO; today: string; currency: string; onEdit: () => void }) {
  const { url } = useWorkspace();
  const pay = useWMutation({ run: () => post(url(`bills/${bill.id}/pay`)), scopes: ['bills', 'money'], done: `Paid ${bill.name}. It’s now an expense.` });
  const late = bill.dueOn < today;
  const soon = !late && bill.dueOn <= today.slice(0, 8) + String(Math.min(28, Number(today.slice(8, 10)) + 7)).padStart(2, '0');
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={clsx('grid size-12 shrink-0 place-items-center rounded-2xl text-center leading-none', late ? 'bg-coral-50 text-coral-700' : 'bg-canvas')}>
          <span>
            <span className="block text-[10px] font-semibold opacity-75">{monthAbbr(bill.dueOn.slice(0, 7))}</span>
            <span className="block text-[17px] font-semibold">{Number(bill.dueOn.slice(8, 10))}</span>
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{bill.name}</span>
          <span className="block truncate text-[12.5px] text-ink-soft">
            {[bill.provider, RECURRENCE_LABEL[bill.recurrence], bill.paymentMethod].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
      {late ? <Pill tone="coral">Late</Pill> : soon ? <Pill tone="sun">{relativeDay(bill.dueOn, today)}</Pill> : <Pill tone="grey">{dayMonth(bill.dueOn)}</Pill>}
      <span className="w-28 text-right font-semibold tabular-nums">{bill.amountCents ? money(bill.amountCents, currency) : <span className="text-ink-soft">Set amount</span>}</span>
      <Button size="sm" onClick={() => pay.mutate()} loading={pay.isPending} disabled={!bill.amountCents}>
        Mark paid
      </Button>
    </div>
  );
}

function PaidRow({ bill, currency }: { bill: BillDTO; currency: string }) {
  const { url } = useWorkspace();
  const undo = useWMutation({ run: () => post(url(`bills/${bill.id}/undo`)), scopes: ['bills', 'money'], done: `${bill.name} marked unpaid` });
  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{bill.name}</span>
        <span className="block text-[12px] text-ink-soft">Paid {bill.paidOn ? dayMonth(bill.paidOn) : ''}</span>
      </span>
      <span className="text-[13.5px] font-semibold tabular-nums">{money(bill.amountCents, currency)}</span>
      <IconButton icon={RotateCcw} label={`Undo payment for ${bill.name}`} size="sm" onClick={() => undo.mutate()} />
    </li>
  );
}
