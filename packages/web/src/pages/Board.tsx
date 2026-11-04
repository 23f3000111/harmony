import clsx from 'clsx';
import { ChefHat, Maximize, ShoppingBasket, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EDITION_INFO, type BoardDTO } from '@harmony/shared';
import { Logo } from '@/art/Illustrations';
import { api, post } from '@/lib/api';
import { dayMonth, firstName, fullDate, qty, relativeDay } from '@/lib/format';
import { celebrate, SPRING } from '@/lib/motion';
import { subscribeLive } from '@/lib/platform';
import { applyEdition } from '@/lib/workspace';
import { Avatar, TickBox } from '@/ui/Primitives';
import { ErrorState } from '@/ui/States';

/** The fridge or wall board: big, touch-friendly, live, and safe to leave open on a shared screen. */
export default function Board() {
  const { token = '' } = useParams();
  const client = useQueryClient();
  const key = ['board', token];
  const query = useQuery({ queryKey: key, queryFn: () => api<BoardDTO>(`/board/${token}`), refetchInterval: 60_000, retry: 1 });
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(new Date());
  const storeKey = `harmony:board:${token}:me`;
  const [me, setMe] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storeKey);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (query.data) applyEdition(query.data.edition);
  }, [query.data?.edition]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => subscribeLive(`/board/${token}/stream`, { onStatus: setLive, onChange: () => void client.invalidateQueries({ queryKey: ['board', token] }) }),
    [token, client],
  );

  const choose = (id: string | null) => {
    setMe(id);
    try {
      if (id) localStorage.setItem(storeKey, id);
      else localStorage.removeItem(storeKey);
    } catch {
      // The board still works without remembering who's holding it.
    }
  };

  const toggleTask = useMutation({
    mutationFn: (id: string) => post(`/board/${token}/tasks/${id}/toggle`, { memberId: me }),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const toggleEntry = useMutation({
    mutationFn: (id: string) => post(`/board/${token}/restock/${id}/toggle`, { memberId: me }),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  const data = query.data;
  const grouped = useMemo(() => {
    if (!data) return [];
    const people = [...data.members.map((member) => ({ id: member.id as string | null, name: member.name })), { id: null, name: 'Anyone' }];
    return people.map((person) => ({ ...person, tasks: data.tasks.filter((task) => task.assigneeId === person.id) })).filter((group) => group.tasks.length > 0);
  }, [data]);

  if (query.isPending) return <div className="grid min-h-dvh place-items-center bg-canvas"><Logo size={56} /></div>;
  if (query.isError || !data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="card max-w-md">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      </div>
    );
  }

  const time = new Intl.DateTimeFormat('en-MY', { hour: 'numeric', minute: '2-digit', timeZone: data.timezone }).format(now);
  const open = data.tasks.filter((task) => task.status !== 'done').length;
  const needed = data.restock.filter((entry) => entry.status === 'needed');

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="wash" aria-hidden />
      <header className="bg-hero grain relative overflow-hidden px-6 pb-10 pt-6 text-white sm:px-10">
        <span aria-hidden className="absolute -right-20 -top-28 size-96 rounded-full bg-[rgb(var(--accent)/.45)] blur-[100px]" />
        <div className="relative mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={42} />
            <div>
              <p className="text-[19px] font-semibold tracking-tight">{data.workspaceName}</p>
              <p className="text-[13px] text-white/75">{EDITION_INFO[data.edition].name} board</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold', live ? 'bg-white/15' : 'bg-coral-500/80')}>
              {live ? <Wifi aria-hidden className="size-4" /> : <WifiOff aria-hidden className="size-4" />}
              {live ? 'Live' : 'Reconnecting'}
            </span>
            <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)} aria-label="Full screen" className="grid size-10 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              <Maximize aria-hidden className="size-5" />
            </button>
          </div>
        </div>
        <div className="relative mx-auto mt-8 flex max-w-[1500px] flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[clamp(3rem,2rem+4vw,5.5rem)] font-semibold leading-none tracking-[-0.05em] tabular-nums">{time}</p>
            <p className="mt-2 text-[18px] text-white/85">{fullDate(data.today)}</p>
          </div>
          <p className="max-w-[30ch] text-right text-[18px] text-white/90">
            {open ? `${open} thing${open === 1 ? '' : 's'} left to do today.` : 'Everything for today is done.'} {needed.length ? `${needed.length} on the list.` : ''}
          </p>
        </div>
      </header>

      <main className="relative mx-auto -mt-5 max-w-[1500px] px-4 pb-16 sm:px-8">
        <section className="card mb-5 flex flex-wrap items-center gap-2 p-3" aria-label="Who is using the board">
          <span className="px-2 text-[14px] font-semibold text-ink-muted">Who’s ticking?</span>
          {data.members.map((member) => (
            <button
              key={member.id}
              type="button"
              aria-pressed={me === member.id}
              onClick={() => choose(me === member.id ? null : member.id)}
              className={clsx('flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-[15px] font-semibold transition-all', me === member.id ? 'border-brand-600 bg-brand-600 text-white shadow-glow' : 'border-line bg-white hover:border-brand-300')}
            >
              <Avatar name={member.name} size={30} />
              {firstName(member.name)}
            </button>
          ))}
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="card p-5 sm:p-7" aria-labelledby="board-today">
            <h1 id="board-today" className="text-[1.6rem] font-semibold tracking-tight">
              Today
            </h1>
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center py-14 text-center">
                <Sparkles aria-hidden className="size-10 text-brand-500" />
                <p className="mt-3 text-[18px] font-semibold">Nothing due today</p>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {grouped.map((group) => (
                  <div key={group.id ?? 'anyone'}>
                    <p className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink-muted">
                      {group.id ? <Avatar name={group.name} size={26} /> : null}
                      {group.id ? firstName(group.name) : 'Anyone'}
                    </p>
                    <ul className="space-y-2">
                      <AnimatePresence initial={false}>
                        {group.tasks.map((task) => {
                          const done = task.status === 'done';
                          return (
                            <motion.li layout key={task.id} transition={SPRING} className={clsx('flex items-center gap-4 rounded-[20px] border p-4 transition-colors', done ? 'border-mint-100 bg-mint-50/70' : 'border-line/70 bg-white')}>
                              <TickBox
                                checked={done}
                                size={32}
                                label={`${done ? 'Reopen' : 'Finish'} ${task.title}`}
                                onChange={(next) => {
                                  if (next && open === 1) {
                                    const rect = (document.activeElement as HTMLElement | null)?.getBoundingClientRect();
                                    if (rect) celebrate({ x: rect.left + rect.width / 2, y: rect.top });
                                  }
                                  toggleTask.mutate(task.id);
                                }}
                              />
                              <span className={clsx('min-w-0 flex-1 text-[17px] font-semibold leading-snug', done && 'text-ink-soft line-through')}>{task.title}</span>
                              {task.dueOn && task.dueOn < data.today && !done && <span className="shrink-0 rounded-full bg-coral-50 px-2.5 py-1 text-[12.5px] font-semibold text-coral-700">Late</span>}
                            </motion.li>
                          );
                        })}
                      </AnimatePresence>
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-5">
            <section className="card p-5 sm:p-7" aria-labelledby="board-list">
              <h2 id="board-list" className="flex items-center gap-2 text-[1.35rem] font-semibold tracking-tight">
                <ShoppingBasket aria-hidden className="size-6 text-brand-600" />
                {data.edition === 'home' ? 'Shopping list' : 'Restock list'}
              </h2>
              {data.restock.length === 0 ? (
                <p className="py-8 text-center text-[16px] text-ink-muted">Nothing to buy.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {data.restock.map((entry) => {
                    const done = entry.status === 'bought';
                    return (
                      <li key={entry.id} className={clsx('flex items-center gap-4 rounded-[20px] p-3.5', done ? 'bg-mint-50/70' : 'bg-canvas/80')}>
                        <TickBox checked={done} size={30} label={`${done ? 'Undo' : 'Bought'} ${entry.name}`} onChange={() => toggleEntry.mutate(entry.id)} />
                        <span className={clsx('min-w-0 flex-1 text-[16px] font-semibold', done && 'text-ink-soft line-through')}>{entry.name}</span>
                        <span className="shrink-0 text-[14px] text-ink-soft">
                          {qty(entry.quantity)} {entry.unit ?? ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {data.edition === 'home' && (
              <section className="bg-ocean grain overflow-hidden rounded-card p-6 text-white shadow-glow">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-white/80">
                  <ChefHat aria-hidden className="size-5" />
                  Tonight’s dinner
                </p>
                <p className="mt-2 text-[1.6rem] font-semibold leading-tight tracking-tight">{data.tonight?.title ?? 'Not planned yet'}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {data.week
                    .filter((meal) => meal.slot === 'dinner' && meal.date > data.today)
                    .slice(0, 4)
                    .map((meal) => (
                      <li key={meal.id} className="rounded-full border border-white/25 bg-white/12 px-3 py-1.5 text-[13.5px] font-medium">
                        {relativeDay(meal.date, data.today)}: {meal.title}
                      </li>
                    ))}
                </ul>
              </section>
            )}

            {data.events.length > 0 && (
              <section className="card p-5 sm:p-7">
                <h2 className="text-[1.35rem] font-semibold tracking-tight">This week</h2>
                <ul className="mt-4 space-y-2.5">
                  {data.events.map((event) => (
                    <li key={event.id} className="flex items-center gap-3">
                      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-[17px] font-semibold text-brand-700">{Number(event.date.slice(8, 10))}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[16px] font-semibold">{event.title}</span>
                        <span className="block text-[13.5px] text-ink-soft">
                          {relativeDay(event.date, data.today)}
                          {event.time ? ` · ${event.time}` : ''} · {dayMonth(event.date)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
