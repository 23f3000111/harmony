import { ListChecks, ListPlus, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TaskDTO } from '@harmony/shared';
import { listVariants } from '@/lib/motion';
import { useOpenParam, useWorkspace, useWQuery } from '@/lib/workspace';
import { useMemberNames } from '@/features/data';
import { TaskRow } from '@/features/TaskRow';
import { TaskForm } from '@/features/taskForms';
import { Button } from '@/ui/Button';
import { ExportButton } from '@/ui/ExportButton';
import { Avatar, FilterChip, PageHeader, Tabs } from '@/ui/Primitives';
import { EmptyState, Loaded } from '@/ui/States';
import { api } from '@/lib/api';
import { dayMonth, relativeDay } from '@/lib/format';

type View = 'today' | 'mine' | 'open' | 'overdue' | 'recurring' | 'done';

export default function Tasks() {
  const { vocab, workspace, today, isManager, url } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'today';
  const assignee = params.get('assignee') ?? '';
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [openId, clearOpen] = useOpenParam();
  const { list: members } = useMemberNames();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  const apiView = view === 'mine' ? 'open' : view;
  const who = view === 'mine' ? workspace.myMemberId : assignee;
  const query = useWQuery<{ tasks: TaskDTO[]; hasMore: boolean }>('tasks', `/tasks?view=${apiView}${who ? `&assignee=${who}` : ''}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`, {
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (!openId) return;
    const fromList = query.data?.tasks.find((task) => task.id === openId);
    if (fromList) {
      setEditing(fromList);
      clearOpen();
      return;
    }
    let cancelled = false;
    api<{ task: TaskDTO }>(url(`tasks/${openId}`))
      .then((result) => !cancelled && setEditing(result.task))
      .catch(() => undefined)
      .finally(() => !cancelled && clearOpen());
    return () => {
      cancelled = true;
    };
  }, [openId, query.data, clearOpen, url]);

  const setView = (next: View) => {
    const updated = new URLSearchParams(params);
    updated.set('view', next);
    setParams(updated, { replace: true });
  };
  const setAssignee = (next: string) => {
    const updated = new URLSearchParams(params);
    if (next) updated.set('assignee', next);
    else updated.delete('assignee');
    setParams(updated, { replace: true });
  };

  const groups = useMemo(() => {
    const tasks = query.data?.tasks ?? [];
    if (view === 'done') return [{ label: 'Finished', tasks }];
    const late = tasks.filter((task) => task.dueOn && task.dueOn < today);
    const dueToday = tasks.filter((task) => task.dueOn === today);
    const later = tasks.filter((task) => task.dueOn && task.dueOn > today);
    const undated = tasks.filter((task) => !task.dueOn);
    const laterByDay = new Map<string, TaskDTO[]>();
    for (const task of later) laterByDay.set(task.dueOn!, [...(laterByDay.get(task.dueOn!) ?? []), task]);
    return [
      { label: 'Late', tasks: late },
      { label: 'Today', tasks: dueToday },
      ...[...laterByDay.entries()].map(([date, list]) => ({ label: `${relativeDay(date, today)}${relativeDay(date, today) === dayMonth(date) ? '' : ` · ${dayMonth(date)}`}`, tasks: list })),
      { label: 'Whenever', tasks: undated },
    ].filter((group) => group.tasks.length > 0);
  }, [query.data, view, today]);

  return (
    <>
      <PageHeader
        title={vocab.tasks}
        sub={view === 'mine' ? 'Everything that’s yours to do.' : 'Everyone can see the whole list, so nothing lives in one person’s head.'}
        actions={
          <>
            {isManager && <ExportButton path={url('export/tasks.csv')} filename="tasks.csv" label="Export" />}
            <Button icon={ListPlus} onClick={() => setCreating(true)}>
              New {vocab.task}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          label="Which tasks"
          value={view}
          onChange={setView}
          items={[
            { value: 'today', label: 'Today' },
            { value: 'mine', label: 'Mine' },
            { value: 'open', label: 'All open' },
            { value: 'overdue', label: 'Late' },
            { value: 'recurring', label: 'Repeating' },
            { value: 'done', label: 'Done' },
          ]}
        />
        <label className="relative block w-full lg:w-72">
          <span className="sr-only">Search {vocab.tasks.toLowerCase()}</span>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="field pl-11" />
        </label>
      </div>

      {view !== 'mine' && members.length > 1 && (
        <div className="scroll-thin -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
          <FilterChip selected={!assignee} onClick={() => setAssignee('')}>
            Everyone
          </FilterChip>
          {members.map((member) => (
            <FilterChip key={member.id} selected={assignee === member.id} onClick={() => setAssignee(assignee === member.id ? '' : member.id)}>
              <Avatar name={member.name} src={member.avatarUrl} size={18} />
              {member.name.split(' ')[0]}
            </FilterChip>
          ))}
          <FilterChip selected={assignee === 'none'} onClick={() => setAssignee(assignee === 'none' ? '' : 'none')}>
            Not assigned
          </FilterChip>
        </div>
      )}

      <div className="card p-3 sm:p-4">
        <Loaded query={query}>
          {() =>
            groups.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title={debounced ? `Nothing matches “${debounced}”` : view === 'done' ? 'Nothing finished yet' : view === 'overdue' ? 'Nothing is late' : `No ${vocab.tasks.toLowerCase()} here`}
                text={view === 'today' ? 'A clear day. Add something, or check what’s coming up.' : undefined}
                action={!debounced && view !== 'done' && <Button variant="soft" icon={ListPlus} onClick={() => setCreating(true)}>New {vocab.task}</Button>}
              />
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <h2 className={`px-2 pb-1 pt-1 text-[13px] font-semibold ${group.label === 'Late' ? 'text-coral-600' : 'text-ink-soft'}`}>
                      {group.label} <span className="font-normal">· {group.tasks.length}</span>
                    </h2>
                    <motion.ul variants={listVariants} initial="hidden" animate="show">
                      <AnimatePresence initial={false}>
                        {group.tasks.map((task) => (
                          <TaskRow key={task.id} task={task} onOpen={setEditing} />
                        ))}
                      </AnimatePresence>
                    </motion.ul>
                  </section>
                ))}
                {query.data?.hasMore && <p className="hint px-2">Showing the first 200. Search to narrow it down.</p>}
              </div>
            )
          }
        </Loaded>
      </div>

      <TaskForm open={creating} onClose={() => setCreating(false)} defaults={assignee && assignee !== 'none' ? { assigneeId: assignee } : undefined} />
      <TaskForm open={Boolean(editing)} onClose={() => setEditing(null)} task={editing} />
    </>
  );
}
