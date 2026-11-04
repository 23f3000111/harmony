import clsx from 'clsx';
import { ArrowRight, Bell, Check, Clock3, Package, Receipt, Truck, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { addDays, dateRange, EDITION_INFO, type ActivityDTO, type DashboardDTO, type Edition, type MemberStats, type RequestDTO, type Role, type ShelfItem, type TimelineTask, type UpcomingDTO } from '@harmony/shared';
import { Illustration } from '@/art/Illustrations';
import { LivingShelf } from '@/art/Shelf';
import { dayMonth, dayNumber, firstName, money, monthAbbr, relativeDay, timeAgo, weekday } from '@/lib/format';
import { EASE, Glare, Reveal, useTilt } from '@/lib/motion';
import { useWorkspace } from '@/lib/workspace';
import { DecisionForm } from '@/features/procurementForms';
import { Avatar, CardHeader, IconTile, Pill } from '@/ui/Primitives';
import { Button } from '@/ui/Button';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('card min-w-0 p-5 sm:p-6', className)}>{children}</section>;
}

interface Fact {
  icon: LucideIcon;
  label: string;
  value: string;
}

export function Banner({
  chip,
  title,
  summary,
  primary,
  secondary,
  shelf,
  facts,
}: {
  chip: string;
  title: string;
  summary: string;
  primary: ReactNode;
  secondary?: ReactNode;
  shelf: ShelfItem[];
  facts: [Fact, Fact];
}) {
  const { edition } = useWorkspace();
  const reduced = useReducedMotion();
  const tilt = useTilt<HTMLDivElement>(7);

  return (
    <section className="bg-hero grain relative overflow-hidden rounded-banner px-6 py-8 text-white shadow-lift sm:px-10 sm:py-11">
      <span aria-hidden className="absolute -left-24 -top-28 size-[380px] animate-drift rounded-full bg-[rgb(var(--brand-400)/.45)] blur-[90px]" />
      <span aria-hidden className="absolute -bottom-32 right-[-60px] size-[420px] rounded-full bg-[rgb(var(--accent)/.45)] blur-[100px]" style={{ animation: reduced ? undefined : 'drift 18s ease-in-out infinite reverse' }} />
      <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="min-w-0">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 px-3.5 py-1.5 text-[13px] font-semibold backdrop-blur-md"
          >
            <span className="size-1.5 rounded-full bg-mint-400 shadow-[0_0_0_4px_rgba(52,211,153,.25)]" aria-hidden />
            {chip}
          </motion.span>
          <motion.h1 initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.08, ease: EASE }} className="banner-title mt-5">
            {title}
          </motion.h1>
          <motion.p initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.16, ease: EASE }} className="mt-4 max-w-[54ch] text-[16px] leading-relaxed text-white/85">
            {summary}
          </motion.p>
          <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.24, ease: EASE }} className="mt-7 flex flex-wrap gap-3">
            {primary}
            {secondary}
          </motion.div>
        </div>

        <div className="relative hidden lg:block">
          <div
            ref={tilt.ref}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            style={tilt.style}
            className="relative mx-auto w-full max-w-[400px] rounded-[28px] border border-white/25 bg-white/10 px-4 pb-14 pt-14 backdrop-blur-md"
          >
            <p className="absolute right-5 top-4 text-[12.5px] font-semibold text-white/80">{edition === 'supply' ? 'Stores right now' : edition === 'people' ? 'The pantry right now' : 'The shelf right now'}</p>
            <LivingShelf items={shelf} edition={edition} max={6} label="Stock levels" />
            <Glare />
          </div>
          <FactChip fact={facts[0]} className="-left-8 -top-7 animate-float-a" />
          <FactChip fact={facts[1]} className="-bottom-8 -right-4 animate-float-b" />
        </div>

        {shelf.length > 0 && (
          <div className="-mx-2 rounded-[22px] border border-white/20 bg-white/10 px-2 pb-3 pt-4 backdrop-blur-md lg:hidden">
            <LivingShelf items={shelf} edition={edition} max={5} label="Stock levels" />
          </div>
        )}
      </div>
    </section>
  );
}

function FactChip({ fact, className }: { fact: Fact; className?: string }) {
  return (
    <div className={clsx('absolute flex max-w-[250px] items-center gap-3 rounded-2xl bg-white py-2.5 pl-2.5 pr-4 text-ink shadow-lift', className)}>
      <IconTile icon={fact.icon} size={36} />
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink-soft">{fact.label}</span>
        <span className="block truncate text-[15px] font-semibold tracking-tight">{fact.value}</span>
      </span>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-brand-gradient text-white shadow-[0_4px_10px_-4px_rgb(var(--brand-600)/.6)]',
  late: 'bg-coral-500 text-white',
  done: 'bg-mint-100 text-mint-700',
  skipped: 'bg-canvas text-ink-soft line-through',
};

/** Two weeks, one row per person, as a real table that scrolls inside its card. */
export function TwoWeekTimeline({ start, tasks, members, today, title }: { start: string; tasks: TimelineTask[]; members: MemberStats[]; today: string; title: string }) {
  const { path } = useWorkspace();
  const days = dateRange(start, 14);
  const rows = useMemo(() => {
    const people = members.map((member) => ({ id: member.id as string | null, name: member.name, title: member.title, avatarUrl: member.avatarUrl }));
    if (tasks.some((task) => !task.assigneeId)) people.push({ id: null, name: 'Anyone', title: 'Not assigned', avatarUrl: null });
    return people.filter((person) => tasks.some((task) => task.assigneeId === person.id) || person.id !== null);
  }, [members, tasks]);

  const stateOf = (task: TimelineTask) => (task.status === 'done' ? 'done' : task.status === 'skipped' ? 'skipped' : task.dueOn < today ? 'late' : 'scheduled');

  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="hint mt-0.5">
            {dayMonth(start)} to {dayMonth(addDays(start, 13))}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-soft" aria-label="Legend">
          {[
            ['scheduled', 'To do'],
            ['late', 'Late'],
            ['done', 'Done'],
            ['skipped', 'Skipped'],
          ].map(([key, label]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span aria-hidden className={clsx('h-2.5 w-4 rounded-full', STATUS_STYLE[key!])} />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="scroll-thin overflow-x-auto pb-3">
        <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            {title}, {dayMonth(start)} to {dayMonth(addDays(start, 13))}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-[170px] bg-white px-5 pb-2 text-[12px] font-semibold text-ink-soft sm:px-6">
                Person
              </th>
              {days.map((day) => {
                const isToday = day === today;
                return (
                  <th key={day} scope="col" className={clsx('px-1 pb-2 text-center text-[11.5px] font-semibold', isToday ? 'bg-brand-50' : '', isToday ? 'rounded-t-2xl' : '')}>
                    <span className="block text-ink-soft">{weekday(day)}</span>
                    <span className={clsx('mx-auto mt-1 grid size-7 place-items-center rounded-full text-[13px]', isToday ? 'bg-brand-600 text-white shadow-glow' : 'text-ink')}>{dayNumber(day)}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((person, rowIndex) => (
              <tr key={person.id ?? 'anyone'}>
                <th scope="row" className={clsx('sticky left-0 z-10 bg-white px-5 py-2 sm:px-6', rowIndex > 0 && 'border-t border-line/60')}>
                  <span className="flex items-center gap-2.5">
                    {person.id ? <Avatar name={person.name} src={person.avatarUrl} size={30} /> : <span className="grid size-[30px] place-items-center rounded-full border border-dashed border-line text-[11px] text-ink-soft">?</span>}
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">{person.id ? firstName(person.name) : person.name}</span>
                      {person.title && <span className="block truncate text-[11.5px] font-normal text-ink-soft">{person.title}</span>}
                    </span>
                  </span>
                </th>
                {days.map((day) => {
                  const cell = tasks.filter((task) => task.dueOn === day && task.assigneeId === person.id);
                  const isToday = day === today;
                  return (
                    <td key={day} className={clsx('px-1 py-2 align-top', isToday && 'bg-brand-50', rowIndex > 0 && 'border-t border-line/60', isToday && rowIndex === rows.length - 1 && 'rounded-b-2xl')}>
                      <div className="flex flex-col gap-1">
                        {cell.slice(0, 2).map((task) => {
                          const state = stateOf(task);
                          return (
                            <Link
                              key={task.id}
                              to={path(`tasks?open=${task.id}`)}
                              title={task.title}
                              aria-label={`${task.title}, ${person.id ? person.name : 'anyone'}, ${dayMonth(day)}, ${state === 'scheduled' ? 'to do' : state}`}
                              className={clsx('block truncate rounded-full px-2 py-[3px] text-[11px] font-semibold leading-tight transition-transform hover:-translate-y-px', STATUS_STYLE[state])}
                            >
                              {task.title}
                            </Link>
                          );
                        })}
                        {cell.length > 2 && <span className="px-1 text-[11px] font-semibold text-ink-soft">+{cell.length - 2} more</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const UPCOMING_ICON: Record<UpcomingDTO['kind'], LucideIcon> = { event: Bell, bill: Receipt, task: Check, delivery: Truck };

export function UpcomingList({ items, members }: { items: UpcomingDTO[]; members: MemberStats[] }) {
  const { today, path, workspace } = useWorkspace();
  return (
    <Card>
      <CardHeader title="Coming up" hint="Next two weeks" />
      {items.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">Nothing booked for the next two weeks.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, index) => {
            const Icon = UPCOMING_ICON[item.kind];
            const person = item.personId ? members.find((member) => member.id === item.personId) : null;
            const first = index === 0;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link to={path(item.href)} className={clsx('group flex items-center gap-3 rounded-2xl p-3 transition-transform hover:-translate-y-0.5', first ? 'bg-ocean grain text-white shadow-glow' : 'bg-canvas/80 hover:bg-brand-50')}>
                  <span className={clsx('grid size-12 shrink-0 place-items-center rounded-2xl text-center leading-none', first ? 'bg-white/15' : 'bg-white shadow-soft')}>
                    <span>
                      <span className={clsx('block text-[10.5px] font-semibold', first ? 'text-white/75' : 'text-ink-soft')}>{monthAbbr(item.date.slice(0, 7))}</span>
                      <span className="mt-0.5 block text-[17px] font-semibold">{dayNumber(item.date)}</span>
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{item.title}</span>
                    <span className={clsx('mt-0.5 flex items-center gap-1.5 truncate text-[12.5px]', first ? 'text-white/75' : 'text-ink-soft')}>
                      <Icon aria-hidden className="size-3.5 shrink-0" />
                      {relativeDay(item.date, today)}
                      {item.time && (
                        <>
                          <Clock3 aria-hidden className="ml-1 size-3.5 shrink-0" />
                          {item.time}
                        </>
                      )}
                      {item.amountCents !== null && <span className="ml-1 font-semibold">{money(item.amountCents, workspace.currency)}</span>}
                    </span>
                  </span>
                  {person && <Avatar name={person.name} src={person.avatarUrl} size={28} ring={first} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export interface QuickLink {
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
}

export function QuickActions({ name, text, links }: { name: string; text: string; links: QuickLink[] }) {
  const { path } = useWorkspace();
  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="relative bg-gradient-to-b from-brand-50 to-white px-5 pb-2 pt-5 sm:px-6">
        <Illustration name="welcome" className="absolute -right-2 top-2 h-24 w-auto opacity-90" />
        <h2 className="card-title">Hi {firstName(name)}</h2>
        <p className="mt-1 max-w-[24ch] text-[13.5px] text-ink-muted">{text}</p>
      </div>
      <ul className="px-3 pb-3 pt-2">
        {links.map((link) => {
          const content = (
            <>
              <IconTile icon={link.icon} size={36} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{link.label}</span>
              <ArrowRight aria-hidden className="size-4 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </>
          );
          const className = 'group flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors hover:bg-brand-50';
          return (
            <li key={link.label}>
              {link.to !== undefined ? (
                <Link to={path(link.to)} className={className}>
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={link.onClick} className={className}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STAGES: Record<'supply' | 'people', { key: string; title: string }[]> = {
  supply: [
    { key: 'open', title: 'Requested' },
    { key: 'approved', title: 'Approved' },
    { key: 'ordered', title: 'Ordered' },
    { key: 'done', title: 'Received' },
  ],
  people: [
    { key: 'open', title: 'Asked' },
    { key: 'approved', title: 'Approved' },
    { key: 'done', title: 'Done' },
  ],
};

/** Follows one request from asking to arriving, with the fill animating to where it is now. */
export function JourneyTracker({ request }: { request: RequestDTO }) {
  const { edition } = useWorkspace();
  const reduced = useReducedMotion();
  const stages = STAGES[edition === 'supply' ? 'supply' : 'people'];
  const declined = request.status === 'rejected';
  const index = declined ? 1 : Math.max(0, stages.findIndex((stage) => stage.key === request.status));
  const finished = request.status === 'done';
  const fill = stages.length > 1 ? (finished ? 1 : index / (stages.length - 1)) : 1;

  return (
    <Card>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="card-title">Your latest request</h2>
          <p className="mt-0.5 truncate text-ink-muted">{request.title}</p>
        </div>
        <span className="text-[13px] font-semibold text-ink-soft">{declined ? 'Declined' : `Stage ${index + 1} of ${stages.length}`}</span>
      </div>
      <div className="relative" style={{ ['--cols' as string]: stages.length }}>
        <div className="absolute left-[calc(50%/var(--cols))] right-[calc(50%/var(--cols))] top-[25px] hidden h-1.5 rounded-full bg-canvas sm:block" aria-hidden />
        <motion.div
          aria-hidden
          className={clsx('absolute left-[calc(50%/var(--cols))] top-[25px] hidden h-1.5 rounded-full sm:block', declined ? 'bg-coral-400' : 'bg-brand-gradient')}
          initial={reduced ? false : { width: 0 }}
          whileInView={{ width: `calc((100% - 100% / var(--cols)) * ${fill})` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: EASE }}
        />
        <ol className="relative grid grid-cols-1 gap-5 sm:gap-2 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]">
          {stages.map((stage, stageIndex) => {
            const done = finished || stageIndex < index;
            const current = !finished && stageIndex === index;
            const failed = declined && stageIndex === index;
            return (
              <li key={stage.key} className="flex items-center gap-3 sm:flex-col sm:text-center">
                <span className="relative grid size-14 shrink-0 place-items-center">
                  {current && !failed && !reduced && <span aria-hidden className="absolute inset-0 animate-ring rounded-[20px] bg-brand-400" />}
                  <span
                    className={clsx(
                      'relative grid size-14 place-items-center rounded-[20px] text-[15px] font-semibold',
                      failed ? 'bg-coral-500 text-white' : done ? 'bg-mint-500 text-white' : current ? 'bg-brand-gradient text-white shadow-glow' : 'border-2 border-line bg-white text-ink-soft',
                    )}
                  >
                    {done ? <Check aria-hidden className="size-6" /> : stageIndex + 1}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{failed ? 'Declined' : stage.title}</span>
                  <span className="hint block">
                    {stageIndex === 0 ? timeAgo(request.createdAt) : failed ? (request.decisionNote ?? 'No reason given') : done || current ? (request.decidedByName ? `by ${firstName(request.decidedByName)}` : 'In progress') : 'Waiting'}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

/** Requests waiting for a decision: the newest in full, the rest as quick rows. */
export function WaitingForYou({ requests }: { requests: RequestDTO[] }) {
  const { path, workspace } = useWorkspace();
  const [decision, setDecision] = useState<{ request: RequestDTO; kind: 'approve' | 'reject' } | null>(null);
  const [newest, ...rest] = requests;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Waiting for you"
        hint={requests.length ? `${requests.length} request${requests.length === 1 ? '' : 's'} to decide` : 'Nothing to decide'}
        action={
          <Link to={path('requests')} className="text-[13px] font-semibold text-brand-700 hover:underline">
            See all
          </Link>
        }
      />
      {!newest ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <Illustration name="done" className="h-24 w-auto" />
          <p className="mt-2 text-ink-muted">You’re all caught up.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="bg-ocean grain relative overflow-hidden rounded-[22px] p-5 text-white shadow-glow">
            <div className="flex items-center gap-2.5">
              <Avatar name={newest.requestedByName ?? 'Someone'} size={34} ring />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{newest.requestedByName ?? 'Someone'}</p>
                <p className="text-[12px] text-white/70">{timeAgo(newest.createdAt)}</p>
              </div>
              {newest.priority === 'high' && <span className="ml-auto rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-semibold">Urgent</span>}
            </div>
            <p className="mt-4 text-[17px] font-semibold leading-snug tracking-tight">{newest.title}</p>
            {newest.details && <p className="mt-1.5 line-clamp-2 text-[13.5px] text-white/80">{newest.details}</p>}
            {(newest.lines.length > 0 || newest.neededBy || newest.estimatedCents > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {newest.lines.slice(0, 3).map((line) => (
                  <span key={line.name} className="rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-[12px] font-medium backdrop-blur">
                    {line.qty} × {line.name}
                  </span>
                ))}
                {newest.estimatedCents > 0 && <span className="rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-[12px] font-medium">{money(newest.estimatedCents, workspace.currency)}</span>}
                {newest.neededBy && <span className="rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-[12px] font-medium">By {dayMonth(newest.neededBy)}</span>}
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Button variant="white" size="sm" onClick={() => setDecision({ request: newest, kind: 'approve' })}>
                Review and approve
              </Button>
              <Button variant="glass" size="sm" onClick={() => setDecision({ request: newest, kind: 'reject' })}>
                Decline
              </Button>
            </div>
          </div>
          <ul className="space-y-1.5">
            {rest.slice(0, 4).map((request) => (
              <li key={request.id} className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-canvas">
                <Avatar name={request.requestedByName ?? 'Someone'} size={32} />
                <Link to={path(`requests?open=${request.id}`)} className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{request.title}</span>
                  <span className="block truncate text-[12px] text-ink-soft">
                    {firstName(request.requestedByName ?? 'Someone')} · {timeAgo(request.createdAt)}
                  </span>
                </Link>
                <button type="button" onClick={() => setDecision({ request, kind: 'approve' })} aria-label={`Approve ${request.title}`} className="grid size-8 place-items-center rounded-full bg-mint-50 text-mint-700 transition-colors hover:bg-mint-100">
                  <Check aria-hidden className="size-4" />
                </button>
              </li>
            ))}
            {rest.length === 0 && <li className="grid h-full place-items-center rounded-2xl border border-dashed border-line p-4 text-center text-[13px] text-ink-soft">No other requests</li>}
          </ul>
        </div>
      )}
      <DecisionForm open={Boolean(decision)} onClose={() => setDecision(null)} request={decision?.request ?? null} decision={decision?.kind ?? 'approve'} />
    </Card>
  );
}

export function ActivityFeed({ items }: { items: ActivityDTO[] }) {
  return (
    <Card>
      <CardHeader title="Latest activity" hint="Updates live as people work" />
      {items.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">Nothing has happened yet.</p>
      ) : (
        <ol className="relative space-y-3.5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
          {items.map((item) => (
            <motion.li key={item.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="relative flex items-start gap-3">
              <Avatar name={item.actorName ?? 'Harmony'} size={32} ring />
              <p className="min-w-0 flex-1 pt-1 text-[13.5px] leading-snug">
                <span className="font-semibold">{item.actorName ? firstName(item.actorName) : 'Someone'}</span> <span className="text-ink-muted">{item.summary}</span>
                <span className="hint block">{timeAgo(item.createdAt)}</span>
              </p>
            </motion.li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function TeamCards({ members }: { members: MemberStats[] }) {
  const { path } = useWorkspace();
  return (
    <Card>
      <CardHeader
        title="Who’s doing what"
        hint="Open, late and finished this week"
        action={
          <Link to={path('people')} className="text-[13px] font-semibold text-brand-700 hover:underline">
            Manage
          </Link>
        }
      />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {members.map((member) => (
          <li key={member.id}>
            <Link to={path(`tasks?assignee=${member.id}`)} className="flex items-center gap-3 rounded-2xl border border-line/70 p-3 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft">
              <Avatar name={member.name} src={member.avatarUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{member.name}</span>
                <span className="block truncate text-[12px] text-ink-soft">{member.title ?? ''}</span>
              </span>
              <span className="flex shrink-0 gap-1.5 text-[12px] font-semibold tabular-nums">
                <span className="rounded-full bg-brand-50 px-2 py-1 text-brand-700" title="Open">
                  {member.openTasks}
                </span>
                {member.overdueTasks > 0 && (
                  <span className="rounded-full bg-coral-50 px-2 py-1 text-coral-700" title="Late">
                    {member.overdueTasks}
                  </span>
                )}
                <span className="rounded-full bg-mint-50 px-2 py-1 text-mint-700" title="Done this week">
                  {member.doneThisWeek}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RunningOut({ stock, title = 'Running out soon' }: { stock: DashboardDTO['stock']; title?: string }) {
  const { path, today } = useWorkspace();
  return (
    <Card>
      <CardHeader
        title={title}
        hint="Forecast from real use"
        action={
          <Link to={path('month')} className="text-[13px] font-semibold text-brand-700 hover:underline">
            Plan the month
          </Link>
        }
      />
      {stock.runningOut.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">Nothing is due to run out in the next two weeks.</p>
      ) : (
        <ul className="space-y-3">
          {stock.runningOut.map((item) => {
            const pct = Math.max(4, Math.min(100, (item.daysLeft / 21) * 100));
            return (
              <li key={item.id}>
                <Link to={path(`items?open=${item.id}`)} className="group block rounded-2xl p-2 transition-colors hover:bg-canvas">
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <IconTile icon={Package} size={32} tone={item.daysLeft <= 3 ? 'coral' : 'sun'} />
                      <span className="truncate font-semibold">{item.name}</span>
                    </span>
                    <span className={clsx('shrink-0 text-[12.5px] font-semibold', item.daysLeft <= 3 ? 'text-coral-600' : 'text-sun-700')}>
                      {item.daysLeft <= 0 ? 'Out now' : `${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left`}
                    </span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-canvas">
                    <motion.span
                      className={clsx('block h-full rounded-full', item.daysLeft <= 3 ? 'bg-coral-500' : 'bg-sun-400')}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${pct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: EASE }}
                    />
                  </span>
                  <span className="hint mt-1 block">Runs out {relativeDay(item.runsOutOn, today).toLowerCase() === 'today' ? 'today' : `on ${dayMonth(item.runsOutOn)}`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function roleChip(edition: Edition, role: Role, title: string | null) {
  if (title) return title;
  return role === 'member' ? EDITION_INFO[edition].memberTitle : EDITION_INFO[edition].managerTitle;
}

export { Reveal };
