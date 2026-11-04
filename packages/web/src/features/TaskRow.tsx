import clsx from 'clsx';
import { CalendarClock, MoreHorizontal, Pencil, Repeat2, RotateCcw, SkipForward, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { RECURRENCE_LABEL, type TaskDTO } from '@harmony/shared';
import { del, post } from '@/lib/api';
import { dueLabel, firstName } from '@/lib/format';
import { itemVariants } from '@/lib/motion';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { Menu } from '@/ui/Menu';
import { Avatar, Pill, TickBox } from '@/ui/Primitives';
import { useToast } from '@/ui/Toast';
import { useMemberNames } from './data';

/** One task. The tick draws itself, and finishing a repeat offers an undo. */
export function TaskRow({ task, onOpen, compact, showPerson = true }: { task: TaskDTO; onOpen?: (task: TaskDTO) => void; compact?: boolean; showPerson?: boolean }) {
  const { url, today, isManager, workspace } = useWorkspace();
  const { map } = useMemberNames();
  const { toast } = useToast();
  const assignee = task.assigneeId ? map.get(task.assigneeId) : null;
  const finished = task.status === 'done' || task.status === 'skipped';
  const late = !finished && task.dueOn !== null && task.dueOn < today;
  const canAct = isManager || !task.assigneeId || task.assigneeId === workspace.myMemberId;

  const reopen = useWMutation({ run: () => post(url(`tasks/${task.id}/reopen`)), scopes: ['tasks', 'members'] });
  const complete = useWMutation({
    run: () => post(url(`tasks/${task.id}/complete`)),
    scopes: ['tasks', 'members'],
    onDone: () =>
      toast({
        title: task.recurrence !== 'none' ? `Done. Next one is scheduled.` : `Done: ${task.title}`,
        tone: 'success',
        action: { label: 'Undo', onClick: () => reopen.mutate() },
      }),
  });
  const skip = useWMutation({ run: () => post(url(`tasks/${task.id}/skip`)), scopes: ['tasks', 'members'], done: 'Skipped. It won’t count as done.' });
  const remove = useWMutation({ run: () => del(url(`tasks/${task.id}`)), scopes: ['tasks', 'members'], done: 'Deleted' });

  return (
    <motion.li
      layout
      variants={itemVariants}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
      className={clsx('group relative flex items-center gap-3 rounded-2xl px-2 transition-colors hover:bg-canvas/80', compact ? 'py-2' : 'py-2.5')}
    >
      <TickBox
        checked={task.status === 'done'}
        label={finished ? `Reopen ${task.title}` : `Finish ${task.title}`}
        disabled={!canAct || complete.isPending || reopen.isPending || task.status === 'skipped'}
        onChange={(next) => (next ? complete.mutate() : reopen.mutate())}
      />
      <button type="button" onClick={() => onOpen?.(task)} className="min-w-0 flex-1 text-left" disabled={!onOpen}>
        <span className={clsx('block truncate font-semibold transition-colors', finished && 'text-ink-soft line-through decoration-ink-soft/50')}>{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-soft">
          {task.dueOn && (
            <span className={clsx('inline-flex items-center gap-1', late && 'font-semibold text-coral-600')}>
              <CalendarClock aria-hidden className="size-3.5" />
              {dueLabel(task.dueOn, today)}
            </span>
          )}
          {task.recurrence !== 'none' && (
            <span className="inline-flex items-center gap-1">
              <Repeat2 aria-hidden className="size-3.5" />
              {RECURRENCE_LABEL[task.recurrence]}
            </span>
          )}
          {task.area && !compact && <span>{task.area}</span>}
          {task.status === 'skipped' && <span>Skipped</span>}
        </span>
      </button>
      {task.priority === 'high' && !finished && <Pill tone="coral">Priority</Pill>}
      {task.status === 'doing' && <Pill tone="sun">In progress</Pill>}
      {showPerson &&
        (assignee ? (
          <span title={assignee.name} className="flex items-center gap-1.5">
            <Avatar name={assignee.name} src={assignee.avatarUrl} size={28} />
            <span className="hidden text-[12.5px] font-medium text-ink-muted xl:inline">{firstName(assignee.name)}</span>
          </span>
        ) : (
          <span className="hidden rounded-full border border-dashed border-line px-2 py-1 text-[11.5px] font-semibold text-ink-soft sm:inline">Anyone</span>
        ))}
      {canAct && (
        <Menu
          trigger={(props) => (
            <button type="button" aria-label={`More for ${task.title}`} className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft opacity-100 transition hover:bg-white hover:text-brand-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" {...props}>
              <MoreHorizontal aria-hidden className="size-4" />
            </button>
          )}
          items={[
            ...(onOpen ? [{ label: 'Edit', icon: Pencil, onSelect: () => onOpen(task) }] : []),
            ...(finished ? [{ label: 'Reopen', icon: RotateCcw, onSelect: () => reopen.mutate() }] : [{ label: 'Skip this time', icon: SkipForward, onSelect: () => skip.mutate() }]),
            { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove.mutate() },
          ]}
        />
      )}
    </motion.li>
  );
}
