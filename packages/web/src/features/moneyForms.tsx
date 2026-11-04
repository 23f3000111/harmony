import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RECURRENCE_LABEL, RECURRENCES, SPEND_CATEGORIES, type BillDTO, type BudgetLine, type ExpenseDTO, type Recurrence } from '@harmony/shared';
import { del, fieldError, generalError, patch, post, put } from '@/lib/api';
import { cents, money, toAmount } from '@/lib/format';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { Button } from '@/ui/Button';
import { FormError, MoneyField, SelectField, TextField } from '@/ui/Fields';
import { Modal, useConfirm } from '@/ui/Modal';

const METHODS = ['Online banking', 'Auto-debit', 'JomPAY', 'DuitNow', 'Credit card', 'Debit card', 'Cash', 'E-wallet', 'Bank transfer'];

export function ExpenseForm({ open, onClose, expense }: { open: boolean; onClose: () => void; expense?: ExpenseDTO | null }) {
  const { url, edition, today, workspace } = useWorkspace();
  const confirm = useConfirm();
  const [form, setForm] = useState({ title: '', category: '', amount: '', spentOn: today, paymentMethod: '' });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((value) => ({ ...value, [key]: event.target.value }));
  useEffect(() => {
    if (!open) return;
    setForm({
      title: expense?.title ?? '',
      category: expense?.category ?? SPEND_CATEGORIES[edition][0]!,
      amount: toAmount(expense?.amountCents ?? 0),
      spentOn: expense?.spentOn ?? today,
      paymentMethod: expense?.paymentMethod ?? '',
    });
  }, [open, expense, edition, today]);

  const save = useWMutation({
    run: () => {
      const body = { title: form.title, category: form.category, amountCents: cents(form.amount), spentOn: form.spentOn, paymentMethod: form.paymentMethod || null };
      return expense ? patch(url(`money/expenses/${expense.id}`), body) : post(url('money/expenses'), body);
    },
    scopes: ['money'],
    done: expense ? 'Saved' : `Logged ${money(cents(form.amount), workspace.currency)}`,
    onDone: onClose,
    silentErrors: true,
  });
  const remove = useWMutation({ run: () => del(url(`money/expenses/${expense!.id}`)), scopes: ['money'], done: 'Deleted', onDone: onClose });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Log an expense'}
      size="sm"
      footer={
        <>
          {expense && expense.source === 'manual' && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="mr-auto !text-coral-600"
              onClick={async () => {
                if (await confirm({ title: 'Delete this expense?', confirm: 'Delete', danger: true })) remove.mutate();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="expense-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['title', 'amountCents'])} />
        <MoneyField label="Amount" value={form.amount} onChange={set('amount')} currency={workspace.currency} error={fieldError(save.error, 'amountCents')} required data-autofocus />
        <TextField label="What for" value={form.title} onChange={set('title')} error={fieldError(save.error, 'title')} required />
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Category" value={form.category} onChange={set('category')}>
            {SPEND_CATEGORIES[edition].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SelectField>
          <TextField label="Date" type="date" value={form.spentOn} onChange={set('spentOn')} />
        </div>
        <SelectField label="Paid by" value={form.paymentMethod} onChange={set('paymentMethod')} optional>
          <option value="">Not set</option>
          {METHODS.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </SelectField>
      </form>
    </Modal>
  );
}

export function BillForm({ open, onClose, bill }: { open: boolean; onClose: () => void; bill?: BillDTO | null }) {
  const { url, edition, today, workspace } = useWorkspace();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: '', provider: '', category: 'Utilities', amount: '', dueOn: today, recurrence: 'monthly' as Recurrence, paymentMethod: '' });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((value) => ({ ...value, [key]: event.target.value }));
  useEffect(() => {
    if (!open) return;
    setForm({
      name: bill?.name ?? '',
      provider: bill?.provider ?? '',
      category: bill?.category ?? 'Utilities',
      amount: toAmount(bill?.amountCents ?? 0),
      dueOn: bill?.dueOn ?? today,
      recurrence: bill?.recurrence ?? 'monthly',
      paymentMethod: bill?.paymentMethod ?? '',
    });
  }, [open, bill, today]);

  const save = useWMutation({
    run: () => {
      const body = { name: form.name, provider: form.provider || null, category: form.category, amountCents: cents(form.amount), dueOn: form.dueOn, recurrence: form.recurrence, paymentMethod: form.paymentMethod || null };
      return bill ? patch(url(`bills/${bill.id}`), body) : post(url('bills'), body);
    },
    scopes: ['bills', 'money'],
    done: bill ? 'Saved' : `Added the ${form.name} bill`,
    onDone: onClose,
    silentErrors: true,
  });
  const remove = useWMutation({ run: () => del(url(`bills/${bill!.id}`)), scopes: ['bills', 'money'], done: 'Bill removed', onDone: onClose });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={bill ? `Edit ${bill.name}` : 'Add a bill'}
      sub="It becomes an expense when you mark it paid, so nothing counts twice."
      footer={
        <>
          {bill && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="mr-auto !text-coral-600"
              onClick={async () => {
                if (await confirm({ title: `Remove the ${bill.name} bill?`, confirm: 'Remove', danger: true })) remove.mutate();
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="bill-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="bill-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['name', 'amountCents', 'dueOn'])} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Bill" value={form.name} onChange={set('name')} placeholder="Electricity" error={fieldError(save.error, 'name')} required data-autofocus />
          <TextField label="Provider" value={form.provider} onChange={set('provider')} placeholder="TNB" optional />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MoneyField label="Amount" value={form.amount} onChange={set('amount')} currency={workspace.currency} error={fieldError(save.error, 'amountCents')} />
          <TextField label="Next due" type="date" value={form.dueOn} onChange={set('dueOn')} error={fieldError(save.error, 'dueOn')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Repeats" value={form.recurrence} onChange={set('recurrence')}>
            {RECURRENCES.map((value) => (
              <option key={value} value={value}>
                {RECURRENCE_LABEL[value]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Category" value={form.category} onChange={set('category')}>
            {SPEND_CATEGORIES[edition].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SelectField>
        </div>
        <SelectField label="Usually paid by" value={form.paymentMethod} onChange={set('paymentMethod')} optional>
          <option value="">Not set</option>
          {METHODS.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </SelectField>
      </form>
    </Modal>
  );
}

export function BudgetForm({ open, onClose, lines }: { open: boolean; onClose: () => void; lines: BudgetLine[] }) {
  const { url, edition, workspace } = useWorkspace();
  const [values, setValues] = useState<Record<string, string>>({});
  const categories = [...new Set([...SPEND_CATEGORIES[edition], ...lines.map((line) => line.category)])];

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(categories.map((category) => [category, toAmount(lines.find((line) => line.category === category)?.amountCents ?? 0)])));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = Object.values(values).reduce((sum, value) => sum + cents(value), 0);

  const save = useWMutation({
    run: () => put(url('money/budgets'), { budgets: Object.entries(values).map(([category, value]) => ({ category, amountCents: cents(value) })) }),
    scopes: ['money'],
    done: 'Budget saved',
    onDone: onClose,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Monthly budget"
      sub={`Total ${money(total, workspace.currency)} a month. Leave a category empty to skip it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save budget
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {categories.map((category, index) => (
          <MoneyField
            key={category}
            label={category}
            value={values[category] ?? ''}
            onChange={(event) => setValues((current) => ({ ...current, [category]: event.target.value }))}
            currency={workspace.currency}
            data-autofocus={index === 0 ? true : undefined}
          />
        ))}
      </div>
    </Modal>
  );
}
