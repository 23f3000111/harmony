import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ItemDTO, OrderDTO, Priority, RequestDTO, RequestKind, SupplierDTO } from '@harmony/shared';
import { del, fieldError, generalError, patch, post } from '@/lib/api';
import { cents, money, qty, toAmount } from '@/lib/format';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { Button } from '@/ui/Button';
import { FormError, MoneyField, SelectField, TextArea, TextField } from '@/ui/Fields';
import { Modal, useConfirm } from '@/ui/Modal';
import { useItems, useMemberNames, useSuppliers } from './data';
import { Segmented } from './taskForms';

interface LineDraft {
  key: string;
  itemId: string;
  name: string;
  qty: string;
  unit: string;
  cost: string;
}

let lineKey = 0;
const newLine = (seed: Partial<LineDraft> = {}): LineDraft => ({ key: `l${(lineKey += 1)}`, itemId: '', name: '', qty: '1', unit: '', cost: '', ...seed });

function LineEditor({ lines, setLines, items, showCost, currency }: { lines: LineDraft[]; setLines: (update: (lines: LineDraft[]) => LineDraft[]) => void; items: ItemDTO[]; showCost: boolean; currency: string }) {
  const update = (key: string, patchLine: Partial<LineDraft>) => setLines((list) => list.map((line) => (line.key === key ? { ...line, ...patchLine } : line)));
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-ink-muted">Lines</p>
      <ul className="space-y-2">
        {lines.map((line, index) => (
          <li key={line.key} className="grid grid-cols-[minmax(0,1fr)_76px_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_84px_110px_auto]">
            <input
              className="field h-10"
              list="line-items"
              value={line.name}
              aria-label={`Line ${index + 1}`}
              placeholder="Item or description"
              onChange={(event) => {
                const match = items.find((item) => item.name.toLowerCase() === event.target.value.toLowerCase());
                update(line.key, match ? { name: match.name, itemId: match.id, unit: match.unit, cost: line.cost || toAmount(match.unitCostCents) } : { name: event.target.value, itemId: '' });
              }}
            />
            <input className="field h-10 px-3" type="number" min={0} step="any" inputMode="decimal" aria-label="Quantity" value={line.qty} onChange={(event) => update(line.key, { qty: event.target.value })} />
            {showCost && (
              <input className="field hidden h-10 px-3 sm:block" type="number" min={0} step="0.01" inputMode="decimal" aria-label="Unit cost" placeholder="Unit cost" value={line.cost} onChange={(event) => update(line.key, { cost: event.target.value })} />
            )}
            <button type="button" aria-label="Remove line" onClick={() => setLines((list) => list.filter((item) => item.key !== line.key))} className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-coral-50 hover:text-coral-600">
              <Trash2 aria-hidden className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <datalist id="line-items">
        {items.map((item) => (
          <option key={item.id} value={item.name} />
        ))}
      </datalist>
      <div className="mt-3 flex items-center justify-between">
        <Button variant="soft" size="sm" icon={Plus} onClick={() => setLines((list) => [...list, newLine()])}>
          Add a line
        </Button>
        {showCost && <span className="text-[14px] font-semibold tabular-nums">{money(lines.reduce((sum, line) => sum + Number(line.qty || 0) * cents(line.cost), 0), currency)}</span>}
      </div>
    </div>
  );
}

export function RequestForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { url, edition, workspace, vocab } = useWorkspace();
  const items = useItems();
  const [kind, setKind] = useState<RequestKind>(edition === 'supply' ? 'purchase' : 'supply');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  useEffect(() => {
    if (!open) return;
    setKind(edition === 'supply' ? 'purchase' : 'supply');
    setTitle('');
    setDetails('');
    setNeededBy('');
    setPriority('normal');
    setLines([newLine()]);
  }, [open, edition]);

  const wantsLines = kind === 'supply' || kind === 'purchase';

  const save = useWMutation({
    run: () =>
      post(url('requests'), {
        kind,
        title,
        details: details || null,
        neededBy: neededBy || null,
        priority,
        lines: wantsLines
          ? lines
              .filter((line) => line.name.trim())
              .map((line) => ({ itemId: line.itemId || null, name: line.name, qty: Number(line.qty || 1), unit: line.unit || null, unitCostCents: cents(line.cost) }))
          : [],
      }),
    scopes: ['requests'],
    done: 'Request sent',
    onDone: onClose,
    silentErrors: true,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`New ${vocab.request}`}
      sub={edition === 'supply' ? 'A manager approves it, then it becomes a purchase order.' : 'Your HR team gets it straight away.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="request-form" loading={save.isPending}>
            Send request
          </Button>
        </>
      }
    >
      <form
        id="request-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['title'])} />
        {edition === 'people' && (
          <Segmented
            label="What kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'supply', label: 'Supplies' },
              { value: 'repair', label: 'Repair' },
              { value: 'other', label: 'Something else' },
            ]}
          />
        )}
        <TextField label="What you need" value={title} onChange={(event) => setTitle(event.target.value)} error={fieldError(save.error, 'title')} required data-autofocus placeholder={kind === 'repair' ? 'Aircon in meeting room 2 is leaking' : 'More oat milk for the pantry'} />
        <TextArea label="Why" value={details} onChange={(event) => setDetails(event.target.value)} rows={2} optional />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Needed by" type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} optional />
          <Segmented
            label="How urgent"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'Urgent' },
            ]}
          />
        </div>
        {wantsLines && <LineEditor lines={lines} setLines={setLines} items={items.data?.items ?? []} showCost={edition === 'supply'} currency={workspace.currency} />}
      </form>
    </Modal>
  );
}

export function DecisionForm({ open, onClose, request, decision }: { open: boolean; onClose: () => void; request: RequestDTO | null; decision: 'approve' | 'reject' }) {
  const { url, edition, workspace } = useWorkspace();
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const members = useMemberNames().list;
  useEffect(() => {
    if (open) {
      setNote('');
      setAssigneeId('');
    }
  }, [open]);

  const save = useWMutation({
    run: () => post(url(`requests/${request!.id}/${decision}`), { note: note || null, assigneeId: assigneeId || null }),
    scopes: ['requests', 'tasks', 'restock', 'members'],
    done: decision === 'approve' ? `Approved “${request?.title}”` : `Declined “${request?.title}”`,
    onDone: onClose,
  });

  if (!request) return null;
  const makesJob = decision === 'approve' && edition === 'people' && request.kind !== 'supply';
  const addsToList = decision === 'approve' && edition === 'people' && request.kind === 'supply';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={decision === 'approve' ? 'Approve request' : 'Decline request'}
      sub={request.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={decision === 'approve' ? 'primary' : 'danger'} onClick={() => save.mutate()} loading={save.isPending}>
            {decision === 'approve' ? 'Approve' : 'Decline'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {addsToList && <p className="rounded-2xl bg-brand-50 px-4 py-3 text-[14px] text-brand-800">Approving adds it to the restock list.</p>}
        {edition === 'supply' && decision === 'approve' && (
          <p className="rounded-2xl bg-brand-50 px-4 py-3 text-[14px] text-brand-800">
            Next you can raise a purchase order for it{request.estimatedCents ? ` (about ${money(request.estimatedCents, workspace.currency)})` : ''}.
          </p>
        )}
        {makesJob && (
          <SelectField label="Give the job to" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} optional>
            <option value="">Decide later</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextArea label={decision === 'approve' ? 'Note for them' : 'Reason'} value={note} onChange={(event) => setNote(event.target.value)} rows={2} optional={decision === 'approve'} data-autofocus />
      </div>
    </Modal>
  );
}

export function SupplierForm({ open, onClose, supplier }: { open: boolean; onClose: () => void; supplier?: SupplierDTO | null }) {
  const { url } = useWorkspace();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '', category: '', paymentTermsDays: '30', leadTimeDays: '3', notes: '' });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((value) => ({ ...value, [key]: event.target.value }));
  useEffect(() => {
    if (!open) return;
    setForm({
      name: supplier?.name ?? '',
      contactName: supplier?.contactName ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      category: supplier?.category ?? '',
      paymentTermsDays: String(supplier?.paymentTermsDays ?? 30),
      leadTimeDays: String(supplier?.leadTimeDays ?? 3),
      notes: supplier?.notes ?? '',
    });
  }, [open, supplier]);

  const save = useWMutation({
    run: () => {
      const body = {
        name: form.name,
        contactName: form.contactName || null,
        email: form.email || null,
        phone: form.phone || null,
        category: form.category || null,
        paymentTermsDays: Number(form.paymentTermsDays || 0),
        leadTimeDays: Number(form.leadTimeDays || 0),
        notes: form.notes || null,
      };
      return supplier ? patch(url(`suppliers/${supplier.id}`), body) : post(url('suppliers'), body);
    },
    scopes: ['suppliers', 'items'],
    done: supplier ? 'Saved' : `Added ${form.name}`,
    onDone: onClose,
    silentErrors: true,
  });
  const remove = useWMutation({ run: () => del(url(`suppliers/${supplier!.id}`)), scopes: ['suppliers', 'items'], done: 'Supplier removed', onDone: onClose });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplier ? `Edit ${supplier.name}` : 'New supplier'}
      footer={
        <>
          {supplier && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="mr-auto !text-coral-600"
              onClick={async () => {
                if (await confirm({ title: `Remove ${supplier.name}?`, text: 'Past orders keep their details.', confirm: 'Remove', danger: true })) remove.mutate();
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="supplier-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['name', 'email'])} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Company" value={form.name} onChange={set('name')} error={fieldError(save.error, 'name')} required data-autofocus />
          <TextField label="What they supply" value={form.category} onChange={set('category')} placeholder="Packaging" optional />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="Contact" value={form.contactName} onChange={set('contactName')} optional />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={fieldError(save.error, 'email')} optional />
          <TextField label="Phone" type="tel" value={form.phone} onChange={set('phone')} optional />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Delivery takes" type="number" min={0} value={form.leadTimeDays} onChange={set('leadTimeDays')} hint="Days. Sets the order-by dates." />
          <TextField label="Pay within" type="number" min={0} value={form.paymentTermsDays} onChange={set('paymentTermsDays')} hint="Days after delivery." />
        </div>
        <TextArea label="Notes" value={form.notes} onChange={set('notes')} rows={2} optional />
      </form>
    </Modal>
  );
}

export function OrderForm({ open, onClose, request, supplierId: presetSupplier, order, onCreated }: { open: boolean; onClose: () => void; request?: RequestDTO | null; supplierId?: string; order?: OrderDTO | null; onCreated?: (order: OrderDTO) => void }) {
  const { url, workspace } = useWorkspace();
  const items = useItems();
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState('');
  const [expectedOn, setExpectedOn] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  useEffect(() => {
    if (!open) return;
    if (order) {
      setSupplierId(order.supplierId);
      setExpectedOn(order.expectedOn ?? '');
      setNotes(order.notes ?? '');
      setLines(order.lines.map((line) => newLine({ itemId: line.itemId ?? '', name: line.description, qty: String(line.qty), unit: line.unit ?? '', cost: toAmount(line.unitCostCents) })));
      return;
    }
    const firstItem = request?.lines.find((line) => line.itemId);
    const fromItem = firstItem ? items.data?.items.find((item) => item.id === firstItem.itemId) : undefined;
    setSupplierId(presetSupplier ?? fromItem?.supplierId ?? '');
    setExpectedOn('');
    setNotes(request ? `For request: ${request.title}` : '');
    setLines(
      request?.lines.length
        ? request.lines.map((line) => newLine({ itemId: line.itemId ?? '', name: line.name, qty: String(line.qty), unit: line.unit ?? '', cost: toAmount(line.unitCostCents) }))
        : presetSupplier
          ? (items.data?.items ?? [])
              .filter((item) => item.supplierId === presetSupplier && item.forecast.suggestedQty > 0)
              .map((item) => newLine({ itemId: item.id, name: item.name, qty: String(item.forecast.suggestedQty), unit: item.unit, cost: toAmount(item.unitCostCents) }))
              .concat(newLine())
          : [newLine()],
    );
  }, [open, request, order, presetSupplier, items.data]);

  const save = useWMutation({
    run: () => {
      const body = {
        supplierId,
        expectedOn: expectedOn || null,
        notes: notes || null,
        requestId: request?.id ?? null,
        lines: lines
          .filter((line) => line.name.trim() && Number(line.qty) > 0)
          .map((line) => ({ itemId: line.itemId || null, description: line.name, qty: Number(line.qty), unit: line.unit || null, unitCostCents: cents(line.cost) })),
      };
      if (order) return patch(url(`orders/${order.id}`), { expectedOn: body.expectedOn, notes: body.notes, lines: body.lines }).then(() => ({ order }));
      return post<{ order: OrderDTO }>(url('orders'), body);
    },
    scopes: ['orders', 'requests'],
    done: (result) => (order ? 'Order saved' : `${(result as { order: OrderDTO }).order.number} drafted`),
    onDone: (result) => {
      onClose();
      if (!order) onCreated?.((result as { order: OrderDTO }).order);
    },
    silentErrors: true,
  });

  const supplier = suppliers.data?.suppliers.find((row) => row.id === supplierId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={order ? `Edit ${order.number}` : 'New purchase order'}
      sub={request ? `From the request “${request.title}”` : 'Saved as a draft until you send it.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="order-form" loading={save.isPending} disabled={!supplierId}>
            {order ? 'Save' : 'Save draft'}
          </Button>
        </>
      }
    >
      <form
        id="order-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['supplierId'])} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} error={fieldError(save.error, 'supplierId')} disabled={Boolean(order)} required>
            <option value="">Choose a supplier</option>
            {(suppliers.data?.suppliers ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Expected" type="date" value={expectedOn} onChange={(event) => setExpectedOn(event.target.value)} optional hint={supplier ? `Leave empty to use their ${supplier.leadTimeDays}-day delivery time.` : undefined} />
        </div>
        <LineEditor lines={lines} setLines={setLines} items={items.data?.items ?? []} showCost currency={workspace.currency} />
        <TextArea label="Notes for the supplier" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} optional />
      </form>
    </Modal>
  );
}

export function ReceiveForm({ open, onClose, order }: { open: boolean; onClose: () => void; order: OrderDTO | null }) {
  const { url, workspace } = useWorkspace();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open || !order) return;
    setAmounts(Object.fromEntries(order.lines.map((line) => [line.id, String(Math.max(0, line.qty - line.receivedQty))])));
  }, [open, order]);

  const save = useWMutation({
    run: () =>
      post(url(`orders/${order!.id}/receive`), {
        lines: Object.entries(amounts)
          .map(([lineId, value]) => ({ lineId, qty: Number(value || 0) }))
          .filter((line) => line.qty > 0),
      }),
    scopes: ['orders', 'items', 'restock', 'money', 'requests', 'suppliers'],
    done: 'Goods received. Stock and spend are updated.',
    onDone: onClose,
  });

  if (!order) return null;
  const total = order.lines.reduce((sum, line) => sum + Number(amounts[line.id] || 0) * line.unitCostCents, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receive ${order.number}`}
      sub={`From ${order.supplierName}. Enter what actually arrived.`}
      size="lg"
      footer={
        <>
          <span className="mr-auto text-[14px] font-semibold tabular-nums">{money(total, workspace.currency)}</span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={total <= 0 && Object.values(amounts).every((value) => !Number(value))}>
            Receive goods
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-line/70">
        {order.lines.map((line, index) => {
          const outstanding = Math.max(0, line.qty - line.receivedQty);
          return (
            <li key={line.id} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{line.description}</p>
                <p className="hint">
                  {qty(line.receivedQty)} of {qty(line.qty)} {line.unit ?? ''} in so far
                </p>
              </div>
              <label className="flex items-center gap-2">
                <span className="sr-only">Arrived for {line.description}</span>
                <input
                  type="number"
                  min={0}
                  max={outstanding}
                  step="any"
                  inputMode="decimal"
                  disabled={outstanding <= 0}
                  value={amounts[line.id] ?? ''}
                  onChange={(event) => setAmounts((current) => ({ ...current, [line.id]: event.target.value }))}
                  className="field h-10 w-24 px-3 text-right"
                  data-autofocus={index === 0 ? true : undefined}
                />
                <span className="w-12 text-[13px] text-ink-soft">{line.unit}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
