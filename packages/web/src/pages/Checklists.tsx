import clsx from 'clsx';
import { ClipboardCheck, Pencil, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChecklistDTO } from '@harmony/shared';
import { post } from '@/lib/api';
import { firstName, timeAgo } from '@/lib/format';
import { celebrate, listVariants, itemVariants } from '@/lib/motion';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { useChecklists } from '@/features/data';
import { ChecklistForm } from '@/features/taskForms';
import { Button, IconButton } from '@/ui/Button';
import { PageHeader, Pill, ProgressRing, TickBox } from '@/ui/Primitives';
import { EmptyState, Loaded } from '@/ui/States';

const CADENCE_LABEL: Record<ChecklistDTO['cadence'], string> = { weekly: 'Starts fresh every week', monthly: 'Starts fresh every month', once: 'One-off' };

export function ChecklistCard({ checklist, compact, onEdit }: { checklist: ChecklistDTO; compact?: boolean; onEdit?: () => void }) {
  const { url, path } = useWorkspace();
  const toggle = useWMutation<{ stepId: string; origin: { x: number; y: number } }>({
    run: ({ stepId }) => post(url(`checklists/${checklist.id}/steps/${stepId}/toggle`)),
    scopes: ['checklists'],
    onDone: (_result, { stepId, origin }) => {
      const finishing = !checklist.done[stepId] && checklist.doneCount + 1 === checklist.steps.length;
      if (finishing) celebrate(origin);
    },
  });
  const complete = checklist.doneCount === checklist.steps.length;
  const steps = compact ? checklist.steps.slice(0, 7) : checklist.steps;

  return (
    <section className={clsx('card min-w-0 p-5 sm:p-6', complete && 'ring-2 ring-mint-400/60')}>
      <div className="mb-4 flex items-start gap-4">
        <ProgressRing value={checklist.doneCount} total={checklist.steps.length} size={56} stroke={6} />
        <div className="min-w-0 flex-1">
          <h2 className="card-title truncate">{compact ? <Link to={path('checklists')} className="hover:underline">{checklist.name}</Link> : checklist.name}</h2>
          <p className="hint mt-0.5">{complete ? 'All done. Nice work.' : (checklist.description ?? CADENCE_LABEL[checklist.cadence])}</p>
        </div>
        {onEdit && <IconButton icon={Pencil} label={`Edit ${checklist.name}`} size="sm" onClick={onEdit} />}
      </div>
      <motion.ol variants={listVariants} initial="hidden" animate="show" className="space-y-1">
        {steps.map((step, index) => {
          const done = checklist.done[step.id];
          return (
            <motion.li key={step.id} variants={itemVariants} className="flex items-start gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-canvas/80">
              <TickBox
                checked={Boolean(done)}
                label={`${step.title}${done ? ', done' : ''}`}
                size={22}
                onChange={() => {
                  const button = document.activeElement as HTMLElement | null;
                  const rect = button?.getBoundingClientRect();
                  toggle.mutate({ stepId: step.id, origin: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 } });
                }}
              />
              <span className="min-w-0 flex-1 pt-px">
                <span className={clsx('block text-[14px] font-semibold', done && 'text-ink-soft line-through decoration-ink-soft/40')}>
                  {!compact && <span className="mr-1.5 text-ink-soft">{index + 1}.</span>}
                  {step.title}
                </span>
                {done ? (
                  <span className="hint block">
                    {done.memberName ? firstName(done.memberName) : 'Someone'} · {timeAgo(done.at)}
                  </span>
                ) : (
                  step.hint && !compact && <span className="hint block">{step.hint}</span>
                )}
              </span>
            </motion.li>
          );
        })}
      </motion.ol>
      {compact && checklist.steps.length > steps.length && (
        <Link to={path('checklists')} className="mt-2 inline-block text-[13px] font-semibold text-brand-700 hover:underline">
          {checklist.steps.length - steps.length} more steps
        </Link>
      )}
    </section>
  );
}

export default function Checklists() {
  const { vocab, isManager } = useWorkspace();
  const query = useChecklists();
  const [editing, setEditing] = useState<ChecklistDTO | null | 'new'>(null);

  return (
    <>
      <PageHeader
        title={vocab.checklists}
        sub="Repeatable routines that start fresh on their own, and remember who ticked what."
        actions={
          isManager && (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              New checklist
            </Button>
          )
        }
      />
      <Loaded query={query}>
        {({ checklists }) =>
          checklists.length === 0 ? (
            <div className="card">
              <EmptyState icon={ClipboardCheck} title="No checklists yet" text="Turn the routine you repeat every week into a checklist anyone can tick." action={isManager && <Button icon={Plus} onClick={() => setEditing('new')}>New checklist</Button>} />
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
              {checklists.map((checklist) => (
                <div key={checklist.id} className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <Pill tone={checklist.cadence === 'once' ? 'grey' : 'brand'}>{CADENCE_LABEL[checklist.cadence]}</Pill>
                  </div>
                  <ChecklistCard checklist={checklist} onEdit={isManager ? () => setEditing(checklist) : undefined} />
                </div>
              ))}
            </div>
          )
        }
      </Loaded>
      <ChecklistForm open={editing !== null} onClose={() => setEditing(null)} checklist={editing === 'new' ? null : editing} />
    </>
  );
}
