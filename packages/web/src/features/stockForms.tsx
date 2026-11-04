import { Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ITEM_CATEGORIES, ITEM_LOCATIONS, type ItemDTO } from '@harmony/shared';
import { del, fieldError, generalError, patch, post } from '@/lib/api';
import { cents, money, qty, toAmount } from '@/lib/format';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { Button } from '@/ui/Button';
import { FormError, MoneyField, SelectField, TextArea, TextField } from '@/ui/Fields';
import { Modal, useConfirm } from '@/ui/Modal';
import { useItems, useSuppliers } from './data';

export function ItemForm({ open, onClose, item }: { open: boolean; onClose: () => void; item?: ItemDTO | null }) {
  const { url, edition, workspace, vocab, features } = useWorkspace();
  const suppliers = useSuppliers();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: '', category: '', unit: 'pcs', location: '', quantity: '0', minQty: '1', targetQty: '', cost: '', supplierId: '', expiresOn: '', notes: '' });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((value) => ({ ...value, [key]: event.target.value }));

  useEffect(() => {
    if (!open) return;
    setForm({
      name: item?.name ?? '',
      category: item?.category ?? ITEM_CATEGORIES[edition][0]!,
      unit: item?.unit ?? 'pcs',
      location: item?.location ?? '',
      quantity: item ? String(item.quantity) : '0',
      minQty: item ? String(item.minQty) : '1',
      targetQty: item?.targetQty != null ? String(item.targetQty) : '',
      cost: toAmount(item?.unitCostCents ?? 0),
      supplierId: item?.supplierId ?? '',
      expiresOn: item?.expiresOn ?? '',
      notes: item?.notes ?? '',
    });
  }, [open, item, edition]);

  const save = useWMutation({
    run: () => {
      const body = {
        name: form.name,
        category: form.category,
        unit: form.unit || 'pcs',
        location: form.location || null,
        quantity: Number(form.quantity || 0),
        minQty: Number(form.minQty || 0),
        targetQty: form.targetQty ? Number(form.targetQty) : null,
        unitCostCents: cents(form.cost),
        supplierId: form.supplierId || null,
        expiresOn: form.expiresOn || null,
        notes: form.notes || null,
      };
      return item ? patch(url(`items/${item.id}`), body) : post(url('items'), body);
    },
    scopes: ['items', 'restock'],
    done: item ? 'Saved' : `Added ${form.name}`,
    onDone: onClose,
    silentErrors: true,
  });
  const remove = useWMutation({ run: () => del(url(`items/${item!.id}`)), scopes: ['items', 'restock'], done: 'Removed', onDone: onClose });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Edit ${item.name}` : `New ${vocab.item}`}
      footer={
        <>
          {item && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="mr-auto !text-coral-600"
              onClick={async () => {
                if (await confirm({ title: `Remove ${item.name}?`, text: 'Its history is kept for reports.', confirm: 'Remove', danger: true })) remove.mutate();
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="item-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="item-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['name'])} />
        <TextField label="Name" value={form.name} onChange={set('name')} error={fieldError(save.error, 'name')} required data-autofocus />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Category" value={form.category} onChange={set('category')}>
            {ITEM_CATEGORIES[edition].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SelectField>
          <SelectField label="Kept in" value={form.location} onChange={set('location')} optional>
            <option value="">Not set</option>
            {ITEM_LOCATIONS[edition].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SelectField>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TextField label="In stock" type="number" min={0} step="any" inputMode="decimal" value={form.quantity} onChange={set('quantity')} error={fieldError(save.error, 'quantity')} />
          <TextField label="Unit" value={form.unit} onChange={set('unit')} placeholder="pcs, kg, box" />
          <TextField label="Restock at" type="number" min={0} step="any" inputMode="decimal" value={form.minQty} onChange={set('minQty')} hint="Joins the list here." />
          <TextField label="Fill up to" type="number" min={0} step="any" inputMode="decimal" value={form.targetQty} onChange={set('targetQty')} optional />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MoneyField label="Cost per unit" value={form.cost} onChange={set('cost')} currency={workspace.currency} optional />
          {features.suppliers ? (
            <SelectField label="Supplier" value={form.supplierId} onChange={set('supplierId')} optional>
              <option value="">None</option>
              {(suppliers.data?.suppliers ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <TextField label="Use by" type="date" value={form.expiresOn} onChange={set('expiresOn')} optional hint="Shows on the use-first list." />
          )}
        </div>
        <TextArea label="Notes" value={form.notes} onChange={set('notes')} rows={2} optional />
      </form>
    </Modal>
  );
}

/** Record use or a top-up. Usage feeds the run-out forecast, so it only counts what really happened. */
export function AdjustForm({ open, onClose, item }: { open: boolean; onClose: () => void; item: ItemDTO | null }) {
  const { url } = useWorkspace();
  const [mode, setMode] = useState<'used' | 'restocked'>('used');
  const [amount, setAmount] = useState('1');
  useEffect(() => {
    if (open) {
      setMode('used');
      setAmount('1');
    }
  }, [open]);

  const save = useWMutation({
    run: () => post(url(`items/${item!.id}/adjust`), { delta: mode === 'used' ? -Number(amount) : Number(amount), reason: mode }),
    scopes: ['items', 'restock'],
    done: () => (mode === 'used' ? `Recorded ${amount} ${item!.unit} used` : `Added ${amount} ${item!.unit}`),
    onDone: onClose,
  });
  const step = (by: number) => setAmount((value) => String(Math.max(0, Math.round((Number(value || 0) + by) * 100) / 100)));

  if (!item) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.name}
      sub={`${qty(item.quantity)} ${item.unit} in stock`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!Number(amount)}>
            {mode === 'used' ? 'Record use' : 'Add stock'}
          </Button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1">
        {(['used', 'restocked'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={`h-10 rounded-xl text-[14px] font-semibold transition-all ${mode === value ? 'bg-white text-brand-700 shadow-soft' : 'text-ink-soft'}`}>
            {value === 'used' ? 'Used some' : 'Topped up'}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4">
        <button type="button" onClick={() => step(-1)} aria-label="Less" className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700 transition-transform active:scale-90">
          <Minus aria-hidden className="size-6" />
        </button>
        <label className="text-center">
          <span className="sr-only">Amount</span>
          <input type="number" min={0} step="any" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-28 bg-transparent text-center text-[2.6rem] font-semibold tracking-[-0.04em] outline-none" data-autofocus />
          <span className="block text-ink-soft">{item.unit}</span>
        </label>
        <button type="button" onClick={() => step(1)} aria-label="More" className="grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-glow transition-transform active:scale-90">
          <Plus aria-hidden className="size-6" />
        </button>
      </div>
      <p className="hint mt-4 text-center">
        {mode === 'used'
          ? `Leaves ${qty(Math.max(0, item.quantity - Number(amount || 0)))} ${item.unit}.`
          : `Brings it to ${qty(item.quantity + Number(amount || 0))} ${item.unit}.`}
      </p>
    </Modal>
  );
}

export function RestockForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { url, vocab, workspace, showMoney } = useWorkspace();
  const items = useItems();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState('');
  const [cost, setCost] = useState('');
  useEffect(() => {
    if (open) {
      setName('');
      setAmount('1');
      setUnit('');
      setCost('');
    }
  }, [open]);

  const match = items.data?.items.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());

  const save = useWMutation({
    run: () =>
      post(url('restock'), {
        name: match?.name ?? name,
        itemId: match?.id ?? null,
        quantity: Number(amount || 1),
        unit: unit || match?.unit || null,
        estCostCents: cost ? cents(cost) : 0,
      }),
    scopes: ['restock', 'items'],
    done: `Added to the ${vocab.restock.toLowerCase()}`,
    onDone: onClose,
    silentErrors: true,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add to ${vocab.restock.toLowerCase()}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="restock-form" loading={save.isPending}>
            Add
          </Button>
        </>
      }
    >
      <form
        id="restock-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['name'])} />
        <TextField
          label="What"
          list="restock-items"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldError(save.error, 'name')}
          hint={match ? `Linked to stock: ${qty(match.quantity)} ${match.unit} left${match.onList ? ', already on the list' : ''}.` : 'Pick a stock item to top it up when bought.'}
          required
          data-autofocus
        />
        <datalist id="restock-items">
          {(items.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-4">
          <TextField label="How many" type="number" min={0} step="any" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <TextField label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={match?.unit ?? 'pcs'} optional />
        </div>
        {showMoney && (
          <MoneyField
            label="Expected cost"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            currency={workspace.currency}
            optional
            hint={match && !cost ? `About ${money(Math.round(Number(amount || 1) * match.unitCostCents), workspace.currency)} at the usual price.` : undefined}
          />
        )}
      </form>
    </Modal>
  );
}
