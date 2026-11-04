import clsx from 'clsx';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  CADENCES,
  EVENT_KINDS,
  RECURRENCE_LABEL,
  RECURRENCES,
  ROLES,
  TASK_AREAS,
  type ChecklistDTO,
  type EventDTO,
  type MemberDTO,
  type Priority,
  type Recurrence,
  type Role,
  type TaskDTO,
} from '@harmony/shared';
import { del, fieldError, generalError, patch, post } from '@/lib/api';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { Button } from '@/ui/Button';
import { FormError, SelectField, TextArea, TextField } from '@/ui/Fields';
import { useConfirm, Modal } from '@/ui/Modal';
import { useMemberNames } from './data';

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-ink-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-2xl bg-canvas p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={clsx('h-9 rounded-xl text-[13px] font-semibold transition-all', value === option.value ? 'bg-white text-brand-700 shadow-soft' : 'text-ink-soft hover:text-ink')}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

export function TaskForm({ open, onClose, task, defaults }: { open: boolean; onClose: () => void; task?: TaskDTO | null; defaults?: Partial<TaskDTO> }) {
  const { url, edition, vocab, today, isManager, workspace } = useWorkspace();
  const { list: members } = useMemberNames();
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [area, setArea] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [minutes, setMinutes] = useState('');

  useEffect(() => {
    if (!open) return;
    const source = task ?? defaults ?? {};
    setTitle(source.title ?? '');
    setNotes(source.notes ?? '');
    setArea(source.area ?? '');
    setAssigneeId(source.assigneeId ?? (isManager ? '' : workspace.myMemberId));
    setDueOn(source.dueOn ?? (task ? '' : today));
    setPriority(source.priority ?? 'normal');
    setRecurrence(source.recurrence ?? 'none');
    setMinutes(source.estimatedMinutes ? String(source.estimatedMinutes) : '');
  }, [open, task, defaults, today, isManager, workspace.myMemberId]);

  const save = useWMutation({
    run: () => {
      const body = {
        title,
        notes: notes || null,
        area: area || null,
        assigneeId: assigneeId || null,
        dueOn: dueOn || null,
        priority,
        recurrence,
        estimatedMinutes: minutes ? Number(minutes) : null,
      };
      return task ? patch(url(`tasks/${task.id}`), body) : post(url('tasks'), body);
    },
    scopes: ['tasks', 'members'],
    done: task ? 'Saved' : `Added “${title}”`,
    onDone: onClose,
    silentErrors: true,
  });

  const remove = useWMutation({ run: () => del(url(`tasks/${task!.id}`)), scopes: ['tasks', 'members'], done: 'Deleted', onDone: onClose });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const people = isManager ? members : members.filter((member) => member.id === workspace.myMemberId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? `Edit ${vocab.task}` : `New ${vocab.task}`}
      footer={
        <>
          {task && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="mr-auto !text-coral-600"
              onClick={async () => {
                if (await confirm({ title: `Delete “${task.title}”?`, text: 'It disappears for everyone. Finished history stays.', confirm: 'Delete', danger: true })) remove.mutate();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" loading={save.isPending}>
            {task ? 'Save' : `Add ${vocab.task}`}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-4">
        <FormError message={generalError(save.error, ['title'])} />
        <TextField label="What needs doing" value={title} onChange={(event) => setTitle(event.target.value)} error={fieldError(save.error, 'title')} placeholder={edition === 'home' ? 'Wipe kitchen counters' : 'Book aircon servicing'} required data-autofocus />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Who" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            {isManager && <option value="">Anyone</option>}
            {people.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Due" type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Repeats" value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)} hint={recurrence !== 'none' ? 'Finishing it schedules the next one.' : undefined}>
            {RECURRENCES.map((value) => (
              <option key={value} value={value}>
                {RECURRENCE_LABEL[value]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Area" value={area} onChange={(event) => setArea(event.target.value)} optional>
            <option value="">None</option>
            {TASK_AREAS[edition].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SelectField>
        </div>
        <Segmented label="Priority" value={priority} onChange={setPriority} options={PRIORITIES} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px]">
          <TextArea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} optional rows={2} />
          <TextField label="Minutes" type="number" min={0} inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} optional hint="Helps plan the month." />
        </div>
      </form>
    </Modal>
  );
}

export function EventForm({ open, onClose, event: existing }: { open: boolean; onClose: () => void; event?: EventDTO | null }) {
  const { url, today } = useWorkspace();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [kind, setKind] = useState<EventDTO['kind']>('other');

  useEffect(() => {
    if (!open) return;
    setTitle(existing?.title ?? '');
    setDate(existing?.date ?? today);
    setTime(existing?.time ?? '');
    setKind(existing?.kind ?? 'other');
  }, [open, existing, today]);

  const save = useWMutation({
    run: () => {
      const body = { title, date, time: time || null, kind };
      return existing ? patch(url(`events/${existing.id}`), body) : post(url('events'), body);
    },
    scopes: ['events'],
    done: existing ? 'Saved' : 'Added to the calendar',
    onDone: onClose,
    silentErrors: true,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Edit date' : 'Add a date'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="event-form"
        className="space-y-4"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['title', 'date', 'time'])} />
        <TextField label="What" value={title} onChange={(e) => setTitle(e.target.value)} error={fieldError(save.error, 'title')} required data-autofocus />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={fieldError(save.error, 'date')} required />
          <TextField label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} optional />
        </div>
        <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as EventDTO['kind'])}>
          {EVENT_KINDS.map((value) => (
            <option key={value} value={value}>
              {value[0]!.toUpperCase() + value.slice(1)}
            </option>
          ))}
        </SelectField>
      </form>
    </Modal>
  );
}

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', member: 'Member' };
export const roleLabel = (role: Role) => ROLE_LABEL[role];

export function MemberForm({ open, onClose, member }: { open: boolean; onClose: () => void; member?: MemberDTO | null }) {
  const { url, workspace, edition } = useWorkspace();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(member?.name ?? '');
    setRole(member?.role ?? 'member');
    setTitle(member?.title ?? '');
    setDepartment(member?.department ?? '');
    setPhone(member?.phone ?? '');
  }, [open, member]);

  const save = useWMutation({
    run: () => {
      const body = { name, role, title: title || null, department: department || null, phone: phone || null };
      return member ? patch(url(`members/${member.id}`), body) : post(url('members'), body);
    },
    scopes: ['members'],
    done: member ? 'Saved' : `Added ${name}`,
    onDone: onClose,
    silentErrors: true,
  });

  const grantable = ROLES.filter((value) => workspace.myRole === 'owner' || value !== 'owner');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? `Edit ${member.name}` : 'Add a person'}
      sub={member ? undefined : 'They can take part without an account. Send them an invite link later if they want to sign in.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="member-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="member-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['name'])} />
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} error={fieldError(save.error, 'name')} required data-autofocus />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label={edition === 'home' ? 'Who they are' : 'Job title'} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={edition === 'home' ? 'Helper, son, grandma…' : 'Office administrator'} optional />
          <SelectField label="Role" value={role} onChange={(event) => setRole(event.target.value as Role)} hint={role === 'member' ? 'Members don’t see money.' : undefined} disabled={member?.role === 'owner' && workspace.myRole !== 'owner'}>
            {grantable.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </SelectField>
        </div>
        {edition !== 'home' && <TextField label="Department" value={department} onChange={(event) => setDepartment(event.target.value)} optional />}
        <TextField label="Phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} optional />
      </form>
    </Modal>
  );
}

interface StepDraft {
  id?: string;
  title: string;
  hint?: string | null;
  key: string;
}

let stepKey = 0;
const draft = (step?: { id?: string; title: string; hint?: string | null }): StepDraft => ({ ...(step ?? { title: '' }), key: `s${(stepKey += 1)}` });

export function ChecklistForm({ open, onClose, checklist }: { open: boolean; onClose: () => void; checklist?: ChecklistDTO | null }) {
  const { url } = useWorkspace();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cadence, setCadence] = useState<ChecklistDTO['cadence']>('weekly');
  const [steps, setSteps] = useState<StepDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(checklist?.name ?? '');
    setDescription(checklist?.description ?? '');
    setCadence(checklist?.cadence ?? 'weekly');
    setSteps(checklist ? checklist.steps.map(draft) : [draft(), draft(), draft()]);
  }, [open, checklist]);

  const save = useWMutation({
    run: () => {
      const body = { name, description: description || null, cadence, steps: steps.filter((step) => step.title.trim()).map(({ id, title, hint }) => ({ id, title, hint: hint ?? null })) };
      return checklist ? patch(url(`checklists/${checklist.id}`), body) : post(url('checklists'), body);
    },
    scopes: ['checklists'],
    done: 'Checklist saved',
    onDone: onClose,
    silentErrors: true,
  });
  const remove = useWMutation({ run: () => del(url(`checklists/${checklist!.id}`)), scopes: ['checklists'], done: 'Checklist deleted', onDone: onClose });

  const update = (key: string, title: string) => setSteps((list) => list.map((step) => (step.key === key ? { ...step, title } : step)));
  const move = (index: number, by: number) =>
    setSteps((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item!);
      return next;
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={checklist ? 'Edit checklist' : 'New checklist'}
      footer={
        <>
          {checklist && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="mr-auto !text-coral-600"
              onClick={async () => {
                if (await confirm({ title: `Delete ${checklist.name}?`, text: 'Its history goes too.', confirm: 'Delete', danger: true })) remove.mutate();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="checklist-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="checklist-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['name'])} />
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} error={fieldError(save.error, 'name')} required data-autofocus />
        <TextField label="What it’s for" value={description} onChange={(event) => setDescription(event.target.value)} optional />
        <Segmented
          label="Starts fresh"
          value={cadence}
          onChange={setCadence}
          options={CADENCES.map((value) => ({ value, label: value === 'once' ? 'Never' : value === 'weekly' ? 'Every week' : 'Every month' }))}
        />
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink-muted">Steps</p>
          <ol className="space-y-2">
            {steps.map((step, index) => (
              <li key={step.key} className="flex items-center gap-2">
                <span className="flex flex-col">
                  <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="text-ink-soft disabled:opacity-30">
                    <GripVertical aria-hidden className="size-4 rotate-90" />
                  </button>
                </span>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-700">{index + 1}</span>
                <input className="field h-10" value={step.title} onChange={(event) => update(step.key, event.target.value)} placeholder="Describe the step" aria-label={`Step ${index + 1}`} />
                <button type="button" aria-label="Remove step" onClick={() => setSteps((list) => list.filter((item) => item.key !== step.key))} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-coral-50 hover:text-coral-600">
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ol>
          <Button variant="soft" size="sm" icon={Plus} className="mt-3" onClick={() => setSteps((list) => [...list, draft()])}>
            Add a step
          </Button>
        </div>
      </form>
    </Modal>
  );
}
