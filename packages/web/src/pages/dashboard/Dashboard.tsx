import clsx from 'clsx';
import {
  AlarmClock,
  CalendarRange,
  ChefHat,
  ClipboardList,
  Hourglass,
  Inbox,
  ListChecks,
  ListPlus,
  Package,
  PackageSearch,
  ReceiptText,
  ShoppingBasket,
  Sparkles,
  Truck,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import type { DashboardDTO, TaskDTO } from '@harmony/shared';
import { BarChart, Donut, Gauge, Legend, SERIES } from '@/charts/Charts';
import { dayMonth, firstName, greeting, minutesLabel, money, monthAbbr, plural, relativeDay } from '@/lib/format';
import { listVariants, Reveal } from '@/lib/motion';
import { useWorkspace, useWQuery } from '@/lib/workspace';
import { TaskRow } from '@/features/TaskRow';
import { openQuickAdd } from '@/shell/QuickAdd';
import { Button, LinkButton } from '@/ui/Button';
import { KpiCard } from '@/ui/Kpi';
import { CardHeader, IconTile, Pill, ProgressRing } from '@/ui/Primitives';
import { DashboardSkeleton, EmptyState, ErrorState } from '@/ui/States';
import { ActivityFeed, Banner, Card, JourneyTracker, QuickActions, roleChip, RunningOut, TeamCards, TwoWeekTimeline, UpcomingList, WaitingForYou } from './parts';
import { ChecklistCard } from '../Checklists';
import { useState } from 'react';
import { TaskForm } from '@/features/taskForms';

export default function Dashboard() {
  const query = useWQuery<DashboardDTO>('dashboard', '/dashboard', { refetchInterval: 120_000 });
  if (query.isPending) return <DashboardSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <DashboardView data={query.data} />;
}

function DashboardView({ data }: { data: DashboardDTO }) {
  const { edition, isManager } = useWorkspace();
  if (edition === 'home') return isManager ? <HomeManager data={data} /> : <MemberDashboard data={data} />;
  if (edition === 'people') return isManager ? <PeopleManager data={data} /> : <MemberDashboard data={data} />;
  return isManager ? <SupplyManager data={data} /> : <MemberDashboard data={data} />;
}

function useCommon(data: DashboardDTO) {
  const { workspace, edition } = useWorkspace();
  const hello = `${greeting(workspace.timezone)}, ${firstName(data.me.name)}`;
  const chip = roleChip(edition, data.me.role, data.me.title);
  return { hello, chip, currency: workspace.currency };
}

const join = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

function TodayList({ tasks, title, hint, empty, limit = 7 }: { tasks: TaskDTO[]; title: string; hint: string; empty: string; limit?: number }) {
  const { path, vocab } = useWorkspace();
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const open = tasks.filter((task) => task.status !== 'done');
  const done = tasks.length - open.length;
  return (
    <Card>
      <CardHeader
        title={title}
        hint={hint}
        action={
          <div className="flex items-center gap-3">
            {tasks.length > 0 && <ProgressRing value={done} total={tasks.length} size={46} stroke={5} label={<span className="text-[11px]">{`${done}/${tasks.length}`}</span>} />}
          </div>
        }
      />
      {tasks.length === 0 ? (
        <EmptyState compact icon={Sparkles} title={empty} text={`Add a ${vocab.task} or enjoy the quiet.`} action={<Button size="sm" variant="soft" icon={ListPlus} onClick={() => openQuickAdd('task')}>New {vocab.task}</Button>} />
      ) : (
        <>
          <motion.ul variants={listVariants} initial="hidden" animate="show" className="-mx-2">
            <AnimatePresence initial={false}>
              {tasks.slice(0, limit).map((task) => (
                <TaskRow key={task.id} task={task} onOpen={setEditing} />
              ))}
            </AnimatePresence>
          </motion.ul>
          {tasks.length > limit && (
            <Link to={path('tasks?view=today')} className="mt-2 inline-block text-[13px] font-semibold text-brand-700 hover:underline">
              See all {tasks.length}
            </Link>
          )}
        </>
      )}
      <TaskForm open={Boolean(editing)} onClose={() => setEditing(null)} task={editing} />
    </Card>
  );
}

function WeeklyBars({ data, title }: { data: DashboardDTO; title: string }) {
  const weeks = data.tasks.perWeek;
  const total = weeks.reduce((sum, week) => sum + week.done, 0);
  return (
    <Card>
      <CardHeader title={title} hint={`${total} in the last eight weeks`} />
      <BarChart
        summary={`${title}. ${weeks.map((week) => `Week of ${dayMonth(week.weekStart)}: ${week.done}`).join('. ')}`}
        data={weeks.map((week, index) => ({ label: index === weeks.length - 1 ? 'This week' : dayMonth(week.weekStart), value: week.done, highlight: index === weeks.length - 1 }))}
      />
    </Card>
  );
}

function HomeManager({ data }: { data: DashboardDTO }) {
  const { path, vocab } = useWorkspace();
  const navigate = useNavigate();
  const { hello, chip, currency } = useCommon(data);
  const tonight = data.meals?.tonight;
  const nextBill = data.money?.nextBill;

  const summary = join(
    [
      data.tasks.dueTodayCount ? plural(data.tasks.dueTodayCount, 'chore') + ' due today' : 'No chores due today',
      data.tasks.overdueCount ? `${data.tasks.overdueCount} running late` : '',
      tonight ? `${tonight.title} for dinner` : '',
      nextBill ? `the ${nextBill.name} bill due ${relativeDay(nextBill.dueOn, data.today).toLowerCase() === 'today' ? 'today' : `on ${dayMonth(nextBill.dueOn)}`}` : '',
    ].filter(Boolean),
  ) + '.';

  return (
    <div className="space-y-5">
      <Banner
        chip={chip}
        title={hello}
        summary={summary}
        primary={
          <LinkButton to={path('restock')} variant="white" icon={ShoppingBasket}>
            Open the shopping list
          </LinkButton>
        }
        secondary={
          <LinkButton to={path('month')} variant="glass" icon={CalendarRange}>
            Plan the month
          </LinkButton>
        }
        shelf={data.stock.shelf}
        facts={[
          { icon: ShoppingBasket, label: 'Shopping list', value: data.restock.openCount ? `${plural(data.restock.openCount, 'item')} · ${money(data.restock.estCents, currency, { whole: true })}` : 'All bought' },
          { icon: ChefHat, label: 'Tonight', value: tonight?.title ?? 'Not planned' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard featured to={path('tasks?view=today')} label="Chores today" value={data.tasks.dueTodayCount + data.tasks.overdueCount} hint={`${data.tasks.doneTodayCount} done so far today`} icon={ListChecks} />
        <KpiCard to={path('restock')} label={vocab.restock} value={data.restock.openCount} hint={data.restock.openCount ? `About ${money(data.restock.estCents, currency)}` : 'Nothing to buy'} icon={ShoppingBasket} tone="sun" />
        <KpiCard to={path('spending')} label="Bills due soon" value={data.money?.billsDueCount ?? 0} hint={data.money?.billsDueCount ? `${money(data.money.billsDueCents, currency)} in the next two weeks` : 'Nothing due in two weeks'} icon={Wallet} tone="coral" />
        <KpiCard to={path('items')} label="Running low" value={data.stock.lowCount} hint={`Out of ${data.stock.itemCount} things you track`} icon={Package} tone="mint" />
      </div>

      <Reveal>
        <TwoWeekTimeline title="The family’s fortnight" start={data.timeline.start} tasks={data.timeline.tasks} members={data.members} today={data.today} />
      </Reveal>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <TodayList tasks={data.tasks.today} title="Today at home" hint="Everyone’s chores due today and anything late" empty="Nothing due today" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <TonightCard data={data} />
            <UseFirstCard data={data} />
          </div>
          <WeeklyBars data={data} title="Chores finished each week" />
        </div>
        <aside className="min-w-0 space-y-5">
          <UpcomingList items={data.upcoming} members={data.members} />
          {data.checklist && <ChecklistCard checklist={data.checklist} compact />}
          <QuickActions
            name={data.me.name}
            text="The things you do most, one tap away."
            links={[
              { label: `New ${vocab.task}`, icon: ListPlus, onClick: () => openQuickAdd('task') },
              { label: 'Plan a meal', icon: ChefHat, to: 'meals' },
              { label: 'Log an expense', icon: Wallet, onClick: () => openQuickAdd('expense') },
              { label: 'Share the fridge board', icon: ClipboardList, onClick: () => navigate(path('settings#board')) },
            ]}
          />
          <ActivityFeed items={data.activity} />
        </aside>
      </div>
    </div>
  );
}

function TonightCard({ data }: { data: DashboardDTO }) {
  const { path } = useWorkspace();
  const tonight = data.meals?.tonight;
  return (
    <Card>
      <CardHeader title="Tonight’s dinner" action={<Link to={path('meals')} className="text-[13px] font-semibold text-brand-700 hover:underline">Meal plan</Link>} />
      {tonight ? (
        <div className="rounded-[20px] bg-canvas/80 p-4">
          <p className="text-[17px] font-semibold tracking-tight">{tonight.title}</p>
          {(tonight.prepMinutes || tonight.cookMinutes) && (
            <p className="mt-1 text-[13px] text-ink-soft">
              {[tonight.prepMinutes && `Prep ${minutesLabel(tonight.prepMinutes)}`, tonight.cookMinutes && `Cook ${minutesLabel(tonight.cookMinutes)}`, tonight.serves && `Serves ${tonight.serves}`].filter(Boolean).join(' · ')}
            </p>
          )}
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {(data.meals?.week ?? [])
              .filter((meal) => meal.slot === 'dinner' && meal.date > data.today)
              .slice(0, 3)
              .map((meal) => (
                <li key={meal.id}>
                  <Pill tone="brand" dot={false}>
                    {relativeDay(meal.date, data.today)}: {meal.title}
                  </Pill>
                </li>
              ))}
          </ul>
        </div>
      ) : (
        <EmptyState compact icon={ChefHat} title="Dinner isn’t planned" action={<LinkButton to={path('meals')} size="sm" variant="soft">Plan this week</LinkButton>} />
      )}
    </Card>
  );
}

function UseFirstCard({ data }: { data: DashboardDTO }) {
  const { path, today } = useWorkspace();
  return (
    <Card className="border-coral-100 bg-gradient-to-br from-white to-coral-50/50">
      <CardHeader title="Use these first" hint="So nothing goes to waste" />
      {data.stock.useFirst.length === 0 ? (
        <p className="py-4 text-center text-ink-muted">Nothing is close to its date.</p>
      ) : (
        <ul className="space-y-2">
          {data.stock.useFirst.map((item) => (
            <li key={item.id}>
              <Link to={path(`items?open=${item.id}`)} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-soft transition-transform hover:-translate-y-0.5">
                <IconTile icon={Hourglass} size={34} tone={item.expiresOn <= today ? 'coral' : 'sun'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.name}</span>
                  <span className="block truncate text-[12px] text-ink-soft">{item.location ?? 'Kitchen'}</span>
                </span>
                <span className={clsx('shrink-0 text-[12.5px] font-semibold', item.expiresOn <= today ? 'text-coral-600' : 'text-sun-700')}>
                  {item.expiresOn < today ? 'Past its date' : item.expiresOn === today ? 'Use today' : `By ${relativeDay(item.expiresOn, today)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PeopleManager({ data }: { data: DashboardDTO }) {
  const { path, vocab } = useWorkspace();
  const { hello, chip, currency } = useCommon(data);
  const budgetUse = data.money && data.money.monthBudgetCents > 0 ? data.money.monthSpentCents / data.money.monthBudgetCents : 0;
  const waiting = data.requests?.openCount ?? 0;

  const summary = join(
    [
      waiting ? plural(waiting, 'staff request') + ' waiting for you' : 'No requests waiting',
      data.tasks.overdueCount ? plural(data.tasks.overdueCount, 'late job') : '',
      data.stock.lowCount ? `${data.stock.lowCount} pantry or cleaning items running low` : '',
    ].filter(Boolean),
  ) + '.';

  return (
    <div className="space-y-5">
      <Banner
        chip={chip}
        title={hello}
        summary={summary}
        primary={
          <LinkButton to={path('requests')} variant="white" icon={Inbox}>
            Review requests
          </LinkButton>
        }
        secondary={
          <LinkButton to={path('month')} variant="glass" icon={CalendarRange}>
            Plan next month
          </LinkButton>
        }
        shelf={data.stock.shelf}
        facts={[
          { icon: ShoppingBasket, label: vocab.restock, value: data.restock.openCount ? `${plural(data.restock.openCount, 'item')}` : 'All stocked' },
          { icon: Wallet, label: 'Spent this month', value: money(data.money?.monthSpentCents ?? 0, currency, { whole: true }) },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard featured to={path('requests')} label="Requests waiting" value={waiting} hint={waiting ? 'Newest first' : 'All decided'} icon={Inbox} />
        <KpiCard to={path('tasks?view=overdue')} label="Late jobs" value={data.tasks.overdueCount} hint={`${data.tasks.openCount} jobs open in total`} icon={AlarmClock} tone="coral" />
        <KpiCard to={path('restock')} label={vocab.restock} value={data.restock.openCount} hint={data.restock.openCount ? `About ${money(data.restock.estCents, currency)}` : 'Nothing to restock'} icon={ShoppingBasket} tone="sun" />
        <KpiCard to={path('tasks?view=done')} label="Done this week" value={data.tasks.doneThisWeek} hint={`${data.tasks.doneTodayCount} finished today`} icon={ListChecks} tone="mint" />
      </div>

      <Reveal>
        <TwoWeekTimeline title="The team’s fortnight" start={data.timeline.start} tasks={data.timeline.tasks} members={data.members} today={data.today} />
      </Reveal>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader title="Office budget" hint="Used so far this month" action={<Link to={path('spending')} className="text-[13px] font-semibold text-brand-700 hover:underline">Details</Link>} />
          <div className="flex flex-1 flex-col justify-center">
            <Gauge value={budgetUse} label="Budget used this month" sub={data.money?.monthBudgetCents ? `${money(data.money.monthSpentCents, currency, { whole: true })} of ${money(data.money.monthBudgetCents, currency, { whole: true })}` : 'No budget set yet'} />
          </div>
        </Card>
        <div className="min-w-0 lg:col-span-2">
          <WaitingForYou requests={data.requests?.waiting ?? []} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <WeeklyBars data={data} title="Jobs finished each week" />
          <TeamCards members={data.members} />
          <TodayList tasks={data.tasks.today} title="Due today" hint="Across the whole team" empty="Nothing due today" />
        </div>
        <aside className="min-w-0 space-y-5">
          <UpcomingList items={data.upcoming} members={data.members} />
          <QuickActions
            name={data.me.name}
            text="Keep the office running without chasing anyone."
            links={[
              { label: 'Delegate a job', icon: ListPlus, onClick: () => openQuickAdd('task') },
              { label: 'Restock the pantry', icon: ShoppingBasket, to: 'restock' },
              { label: 'Add a team member', icon: UsersRound, to: 'people' },
              { label: 'Log an expense', icon: Wallet, onClick: () => openQuickAdd('expense') },
            ]}
          />
          {data.checklist && <ChecklistCard checklist={data.checklist} compact />}
          <ActivityFeed items={data.activity} />
        </aside>
      </div>
    </div>
  );
}

function SupplyManager({ data }: { data: DashboardDTO }) {
  const { path, workspace } = useWorkspace();
  const { hello, chip, currency } = useCommon(data);
  const orders = data.orders;
  const waiting = data.requests?.openCount ?? 0;
  const byCategory = (data.money?.byCategory ?? []).filter((line) => line.spentCents > 0);
  const top = byCategory.slice(0, 5);
  const other = byCategory.slice(5).reduce((sum, line) => sum + line.spentCents, 0);
  const segments = [...top.map((line, index) => ({ label: line.category, value: line.spentCents, color: SERIES[index % SERIES.length]! })), ...(other ? [{ label: 'Other', value: other, color: 'rgb(var(--line))' }] : [])];
  const monthTotal = data.money?.monthSpentCents ?? 0;

  const summary = join(
    [
      waiting ? plural(waiting, 'purchase request') + ' to approve' : 'No requests waiting',
      orders?.lateCount ? plural(orders.lateCount, 'late delivery', 'late deliveries') : '',
      data.stock.runningOut.length ? `${data.stock.runningOut.length} stock lines running out within two weeks` : '',
    ].filter(Boolean),
  ) + '.';

  return (
    <div className="space-y-5">
      <Banner
        chip={chip}
        title={hello}
        summary={summary}
        primary={
          <LinkButton to={path('requests')} variant="white" icon={Inbox}>
            Approve requests
          </LinkButton>
        }
        secondary={
          <LinkButton to={path('orders')} variant="glass" icon={ReceiptText}>
            Purchase orders
          </LinkButton>
        }
        shelf={data.stock.shelf}
        facts={[
          { icon: Truck, label: 'Awaiting delivery', value: orders ? `${orders.openCount} orders · ${money(orders.openCents, currency, { compact: true })}` : 'None' },
          { icon: Wallet, label: 'Spent this month', value: money(monthTotal, currency, { compact: true }) },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard featured to={path('requests')} label="Awaiting approval" value={waiting} hint={waiting ? 'Purchase requests from the team' : 'All decided'} icon={Inbox} />
        <KpiCard to={path('orders')} label="Open orders" value={(orders?.openCents ?? 0) / 100} format={(value) => money(Math.round(value * 100), currency, { compact: true })} hint={`${orders?.openCount ?? 0} orders still arriving`} icon={ReceiptText} />
        <KpiCard to={path('orders')} label="Late deliveries" value={orders?.lateCount ?? 0} hint="Past their expected date" icon={Truck} tone="coral" />
        <KpiCard to={path('month')} label="Running out" value={data.stock.runningOut.length} hint={`${data.stock.lowCount} already below minimum`} icon={PackageSearch} tone="sun" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Spend by month" hint="Goods received, bills and logged expenses" action={<Link to={path('spending')} className="text-[13px] font-semibold text-brand-700 hover:underline">Spend and budgets</Link>} />
          <BarChart
            summary={`Spend by month. ${(data.money?.byMonth ?? []).map((month) => `${month.month}: ${money(month.spentCents, currency)}`).join('. ')}`}
            data={(data.money?.byMonth ?? []).map((month, index, list) => ({ label: monthAbbr(month.month), value: month.spentCents, display: money(month.spentCents, currency, { compact: true }), highlight: index === list.length - 1 }))}
          />
        </Card>
        <Card>
          <CardHeader title="Where it went" hint="This month by category" />
          {segments.length === 0 ? (
            <p className="py-8 text-center text-ink-muted">No spending yet this month.</p>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col">
              <Donut segments={segments} centre={money(monthTotal, currency, { compact: true })} caption="this month" summary={`Spend this month by category. ${segments.map((segment) => `${segment.label}: ${money(segment.value, currency)}`).join('. ')}`} />
              <Legend items={segments.map((segment) => ({ label: segment.label, value: money(segment.value, currency, { compact: true }), color: segment.color }))} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <WaitingForYou requests={data.requests?.waiting ?? []} />
        </div>
        <QuickActions
          name={data.me.name}
          text={`${workspace.name}, one screen for everything you buy.`}
          links={[
            { label: 'New purchase order', icon: ReceiptText, onClick: () => openQuickAdd('order') },
            { label: 'Restock from the forecast', icon: Sparkles, to: 'month' },
            { label: 'Compare suppliers', icon: Truck, to: 'suppliers' },
            { label: 'Check stock', icon: PackageSearch, to: 'items' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <DeliveriesCard data={data} />
          <RunningOut stock={data.stock} />
          <TodayList tasks={data.tasks.today} title="Team tasks today" hint="Follow-ups, counts and checks" empty="Nothing due today" />
        </div>
        <aside className="min-w-0 space-y-5">
          <UpcomingList items={data.upcoming} members={data.members} />
          {data.checklist && <ChecklistCard checklist={data.checklist} compact />}
          <ActivityFeed items={data.activity} />
        </aside>
      </div>
    </div>
  );
}

function DeliveriesCard({ data }: { data: DashboardDTO }) {
  const { path, today, workspace } = useWorkspace();
  const list = data.orders?.awaitingDelivery ?? [];
  return (
    <Card>
      <CardHeader title="On the way" hint="Sent orders still to arrive" action={<Link to={path('orders')} className="text-[13px] font-semibold text-brand-700 hover:underline">All orders</Link>} />
      {list.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">Nothing is on the way.</p>
      ) : (
        <ul className="divide-y divide-line/70">
          {list.map((order) => {
            const late = order.expectedOn !== null && order.expectedOn < today;
            const progress = order.totalCents ? order.receivedCents / order.totalCents : 0;
            return (
              <li key={order.id}>
                <Link to={path(`orders/${order.id}`)} className="flex items-center gap-3 py-3 transition-colors hover:bg-canvas/60 sm:px-2">
                  <IconTile icon={Truck} size={38} tone={late ? 'coral' : 'brand'} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{order.number}</span>
                      <span className="truncate text-ink-muted">{order.supplierName}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                        <span className="block h-full rounded-full bg-mint-500" style={{ width: `${progress * 100}%` }} />
                      </span>
                      <span className="hint">{progress > 0 ? `${Math.round(progress * 100)}% received` : 'Nothing received yet'}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{money(order.totalCents - order.receivedCents, workspace.currency, { compact: true })}</span>
                    {order.expectedOn && <span className={clsx('block text-[12px] font-semibold', late ? 'text-coral-600' : 'text-ink-soft')}>{late ? `Late since ${dayMonth(order.expectedOn)}` : relativeDay(order.expectedOn, today)}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Helpers, kids, staff and requesters see their own day first, and no money. */
function MemberDashboard({ data }: { data: DashboardDTO }) {
  const { path, vocab, edition, features } = useWorkspace();
  const { hello, chip } = useCommon(data);
  const mine = data.tasks.mine;
  const myOpen = mine.filter((task) => task.status !== 'done').length;
  const latestRequest = data.requests?.mine[0];

  const summary = join(
    [
      myOpen ? `You have ${plural(myOpen, vocab.task)} to do today` : `You’re clear for today`,
      data.tasks.myOverdueCount ? `${data.tasks.myOverdueCount} running late` : '',
      latestRequest ? `your request “${latestRequest.title}” is ${latestRequest.status === 'open' ? 'waiting for a decision' : latestRequest.status === 'rejected' ? 'declined' : latestRequest.status}` : '',
    ].filter(Boolean),
  ) + '.';

  return (
    <div className="space-y-5">
      <Banner
        chip={chip}
        title={hello}
        summary={summary}
        primary={
          <LinkButton to={path('tasks?view=mine')} variant="white" icon={ListChecks}>
            My {vocab.tasks.toLowerCase()}
          </LinkButton>
        }
        secondary={
          features.requests ? (
            <Button variant="glass" icon={Inbox} onClick={() => openQuickAdd('request')}>
              Ask for something
            </Button>
          ) : (
            <LinkButton to={path('restock')} variant="glass" icon={ShoppingBasket}>
              Shopping list
            </LinkButton>
          )
        }
        shelf={data.stock.shelf}
        facts={[
          { icon: ListChecks, label: 'Done today', value: `${mine.filter((task) => task.status === 'done').length} of ${mine.length}` },
          { icon: ShoppingBasket, label: vocab.restock, value: data.restock.openCount ? plural(data.restock.openCount, 'item') : 'Nothing needed' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard featured to={path('tasks?view=mine')} label={`My ${vocab.tasks.toLowerCase()}`} value={data.tasks.myOpenCount} hint={data.tasks.myOverdueCount ? `${data.tasks.myOverdueCount} late` : 'Nothing late'} icon={ListChecks} />
        <KpiCard to={path('tasks?view=done')} label="Done this week" value={data.me.doneThisWeek} hint="By you" icon={Sparkles} tone="mint" />
        <KpiCard to={path('restock')} label={vocab.restock} value={data.restock.openCount} hint={edition === 'home' ? 'Tick things off as you buy them' : 'What needs restocking'} icon={ShoppingBasket} tone="sun" />
        {features.requests ? (
          <KpiCard to={path('requests')} label="My requests" value={data.requests?.mine.filter((request) => request.status === 'open').length ?? 0} hint="Waiting for a decision" icon={Inbox} tone="brand" />
        ) : (
          <KpiCard to={path('items')} label="Running low" value={data.stock.lowCount} hint="Tell someone if you use the last one" icon={Package} tone="coral" />
        )}
      </div>

      {latestRequest && (
        <Reveal>
          <JourneyTracker request={latestRequest} />
        </Reveal>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <TodayList tasks={mine} title={`My ${vocab.tasks.toLowerCase()} today`} hint="Tick them off as you go" empty="Nothing for you today" limit={10} />
          {edition === 'home' && data.meals && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <TonightCard data={data} />
              <UseFirstCard data={data} />
            </div>
          )}
          <TodayList tasks={data.tasks.today.filter((task) => task.assigneeId !== data.me.id)} title="Everyone else today" hint="So you can lend a hand" empty="Nothing else due" limit={5} />
        </div>
        <aside className="min-w-0 space-y-5">
          <UpcomingList items={data.upcoming} members={data.members} />
          {data.checklist && <ChecklistCard checklist={data.checklist} compact />}
          <QuickActions
            name={data.me.name}
            text="Quick ways to keep everyone in the loop."
            links={[
              { label: `Add a ${vocab.task}`, icon: ListPlus, onClick: () => openQuickAdd('task') },
              { label: `Add to ${vocab.restock.toLowerCase()}`, icon: ShoppingBasket, onClick: () => openQuickAdd('restock') },
              ...(features.requests ? [{ label: `New ${vocab.request}`, icon: Inbox, onClick: () => openQuickAdd('request') }] : []),
              { label: 'See the month ahead', icon: CalendarRange, to: 'month' },
            ]}
          />
        </aside>
      </div>
    </div>
  );
}
