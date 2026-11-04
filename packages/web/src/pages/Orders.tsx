import clsx from 'clsx';
import { ArrowLeft, Ban, PackageCheck, Pencil, Printer, ReceiptText, Send, Truck } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { OrderDTO, SupplierDTO } from '@harmony/shared';
import { post } from '@/lib/api';
import { dayMonth, fullDate, money, qty, relativeDay } from '@/lib/format';
import { itemVariants, listVariants } from '@/lib/motion';
import { useWMutation, useWorkspace, useWQuery } from '@/lib/workspace';
import { useSuppliers } from '@/features/data';
import { OrderForm, ReceiveForm } from '@/features/procurementForms';
import { Button } from '@/ui/Button';
import { useConfirm } from '@/ui/Modal';
import { IconTile, PageHeader, Pill, Tabs, type Tone } from '@/ui/Primitives';
import { EmptyState, ListSkeleton, Loaded, PageSkeleton, ErrorState } from '@/ui/States';

const STATUS: Record<OrderDTO['status'], { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  sent: { label: 'Sent', tone: 'brand' },
  partial: { label: 'Part received', tone: 'sun' },
  received: { label: 'Received', tone: 'mint' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

type Tab = 'open' | 'draft' | 'received' | 'all';

export default function Orders() {
  const { path, workspace, today } = useWorkspace();
  const navigate = useNavigate();
  const query = useWQuery<{ orders: OrderDTO[] }>('orders', '/orders');
  const [tab, setTab] = useState<Tab>('open');
  const [creating, setCreating] = useState(false);

  const orders = useMemo(() => {
    const list = query.data?.orders ?? [];
    if (tab === 'open') return list.filter((order) => order.status === 'sent' || order.status === 'partial');
    if (tab === 'draft') return list.filter((order) => order.status === 'draft');
    if (tab === 'received') return list.filter((order) => order.status === 'received');
    return list;
  }, [query.data, tab]);
  const counts = useMemo(() => {
    const list = query.data?.orders ?? [];
    return {
      open: list.filter((order) => order.status === 'sent' || order.status === 'partial').length,
      draft: list.filter((order) => order.status === 'draft').length,
    };
  }, [query.data]);

  return (
    <>
      <PageHeader
        title="Purchase orders"
        sub="Draft, send and receive. Receiving updates stock and spend at the same time."
        actions={
          <Button icon={ReceiptText} onClick={() => setCreating(true)}>
            New order
          </Button>
        }
      />
      <Tabs
        className="mb-5"
        label="Which orders"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'open', label: 'On the way', count: counts.open },
          { value: 'draft', label: 'Drafts', count: counts.draft },
          { value: 'received', label: 'Received' },
          { value: 'all', label: 'All' },
        ]}
      />
      <div className="card overflow-hidden">
        <Loaded query={query} skeleton={<div className="p-6"><ListSkeleton rows={6} /></div>}>
          {() =>
            orders.length === 0 ? (
              <EmptyState icon={ReceiptText} title={tab === 'draft' ? 'No drafts' : tab === 'open' ? 'Nothing on the way' : 'No orders yet'} action={<Button variant="soft" icon={ReceiptText} onClick={() => setCreating(true)}>New order</Button>} />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[14px]">
                  <caption className="sr-only">Purchase orders</caption>
                  <thead>
                    <tr className="border-b border-line/70 text-[12.5px] text-ink-soft">
                      <th scope="col" className="px-5 py-3 font-semibold">Order</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Supplier</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Expected</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <motion.tbody variants={listVariants} initial="hidden" animate="show">
                    {orders.map((order) => {
                      const late = (order.status === 'sent' || order.status === 'partial') && order.expectedOn !== null && order.expectedOn < today;
                      return (
                        <motion.tr key={order.id} variants={itemVariants} onClick={() => navigate(path(`orders/${order.id}`))} className="cursor-pointer border-b border-line/50 transition-colors last:border-0 hover:bg-canvas/70">
                          <td className="px-5 py-3.5">
                            <Link to={path(`orders/${order.id}`)} className="font-semibold hover:underline" onClick={(event) => event.stopPropagation()}>
                              {order.number}
                            </Link>
                            <span className="block text-[12px] text-ink-soft">{order.lines.length} line{order.lines.length === 1 ? '' : 's'}</span>
                          </td>
                          <td className="px-3 py-3.5">{order.supplierName}</td>
                          <td className="px-3 py-3.5">
                            <Pill tone={late ? 'coral' : STATUS[order.status].tone}>{late ? 'Late' : STATUS[order.status].label}</Pill>
                          </td>
                          <td className={clsx('px-3 py-3.5', late ? 'font-semibold text-coral-600' : 'text-ink-muted')}>{order.receivedOn ? `In ${dayMonth(order.receivedOn)}` : order.expectedOn ? relativeDay(order.expectedOn, today) : '—'}</td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{money(order.totalCents, workspace.currency)}</td>
                        </motion.tr>
                      );
                    })}
                  </motion.tbody>
                </table>
              </div>
            )
          }
        </Loaded>
      </div>
      <OrderForm open={creating} onClose={() => setCreating(false)} onCreated={(order) => navigate(path(`orders/${order.id}`))} />
    </>
  );
}

export function OrderDetail() {
  const { orderId = '' } = useParams();
  const { path, url, workspace, today } = useWorkspace();
  const confirm = useConfirm();
  const query = useWQuery<{ order: OrderDTO }>('orders', `/orders/${orderId}`);
  const suppliers = useSuppliers();
  const [receiving, setReceiving] = useState(false);
  const [editing, setEditing] = useState(false);

  const send = useWMutation({ run: () => post(url(`orders/${orderId}/send`)), scopes: ['orders'], done: 'Order sent to the supplier' });
  const cancel = useWMutation({ run: () => post(url(`orders/${orderId}/cancel`)), scopes: ['orders', 'requests'], done: 'Order cancelled' });

  if (query.isPending) return <PageSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const order = query.data.order;
  const supplier: SupplierDTO | undefined = suppliers.data?.suppliers.find((row) => row.id === order.supplierId);
  const late = (order.status === 'sent' || order.status === 'partial') && order.expectedOn !== null && order.expectedOn < today;
  const steps = [
    { label: 'Drafted', date: order.createdAt.slice(0, 10), done: true },
    { label: 'Sent', date: order.orderedOn, done: order.status !== 'draft' && order.status !== 'cancelled' },
    { label: 'Received', date: order.receivedOn, done: order.status === 'received' },
  ];

  return (
    <>
      <Link to={path('orders')} className="no-print mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-muted hover:text-brand-700">
        <ArrowLeft aria-hidden className="size-4" />
        Purchase orders
      </Link>

      <section className="bg-ocean grain no-print relative mb-5 overflow-hidden rounded-banner p-6 text-white shadow-glow sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="banner-title !text-[2.2rem]">{order.number}</h1>
              <span className="rounded-full bg-white/20 px-3 py-1 text-[13px] font-semibold">{late ? 'Late' : STATUS[order.status].label}</span>
            </div>
            <p className="mt-2 text-white/80">
              {order.supplierName}
              {order.createdByName ? ` · raised by ${order.createdByName}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.status === 'draft' && (
              <>
                <Button variant="glass" icon={Pencil} onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button variant="white" icon={Send} onClick={() => send.mutate()} loading={send.isPending}>
                  Send to supplier
                </Button>
              </>
            )}
            {(order.status === 'sent' || order.status === 'partial') && (
              <Button variant="white" icon={PackageCheck} onClick={() => setReceiving(true)}>
                Receive goods
              </Button>
            )}
            <Button variant="glass" icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </div>
        <div className="mt-7 grid grid-cols-3 gap-3">
          {[
            ['Total', money(order.totalCents, workspace.currency)],
            ['Received', money(order.receivedCents, workspace.currency)],
            ['Expected', order.expectedOn ? dayMonth(order.expectedOn) : 'Not set'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/20 bg-white/12 p-3.5 backdrop-blur">
              <p className="text-[12px] text-white/75">{label}</p>
              <p className="mt-1 text-[17px] font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="card print-plain min-w-0 p-6 sm:p-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-ink-soft">Purchase order</p>
              <h2 className="text-[1.5rem] font-semibold tracking-tight">{order.number}</h2>
              <p className="text-ink-muted">{workspace.name}</p>
            </div>
            <div className="text-right text-[14px]">
              <p className="font-semibold">{order.supplierName}</p>
              {supplier?.contactName && <p className="text-ink-muted">{supplier.contactName}</p>}
              {supplier?.email && <p className="text-ink-muted">{supplier.email}</p>}
              {supplier?.phone && <p className="text-ink-muted">{supplier.phone}</p>}
            </div>
          </header>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[14px]">
              <caption className="sr-only">Order lines</caption>
              <thead>
                <tr className="border-b border-line text-[12.5px] text-ink-soft">
                  <th scope="col" className="py-2 font-semibold">Item</th>
                  <th scope="col" className="py-2 text-right font-semibold">Qty</th>
                  <th scope="col" className="py-2 text-right font-semibold">Unit price</th>
                  <th scope="col" className="py-2 text-right font-semibold">Received</th>
                  <th scope="col" className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.id} className="border-b border-line/60">
                    <td className="py-3 font-semibold">{line.description}</td>
                    <td className="py-3 text-right tabular-nums">
                      {qty(line.qty)} {line.unit}
                    </td>
                    <td className="py-3 text-right tabular-nums">{money(line.unitCostCents, workspace.currency)}</td>
                    <td className={clsx('py-3 text-right tabular-nums', line.receivedQty >= line.qty ? 'text-mint-700' : line.receivedQty > 0 ? 'text-sun-700' : 'text-ink-soft')}>{qty(line.receivedQty)}</td>
                    <td className="py-3 text-right font-semibold tabular-nums">{money(Math.round(line.qty * line.unitCostCents), workspace.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-4 text-right font-semibold">
                    Total
                  </td>
                  <td className="pt-4 text-right text-[17px] font-semibold tabular-nums">{money(order.totalCents, workspace.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {order.notes && <p className="mt-6 rounded-2xl bg-canvas px-4 py-3 text-[14px] text-ink-muted">{order.notes}</p>}
          <p className="hint mt-6">
            {order.orderedOn ? `Ordered ${fullDate(order.orderedOn)}.` : 'Not sent yet.'} {supplier ? `Payment within ${supplier.paymentTermsDays} days of delivery.` : ''}
          </p>
        </article>

        <aside className="no-print min-w-0 space-y-5">
          <section className="card p-5">
            <h2 className="card-title mb-4">Progress</h2>
            <ol className="space-y-4">
              {steps.map((step) => (
                <li key={step.label} className="flex items-center gap-3">
                  <span className={clsx('grid size-9 place-items-center rounded-xl', step.done ? 'bg-mint-500 text-white' : 'border-2 border-line text-ink-soft')}>
                    {step.done ? <PackageCheck aria-hidden className="size-4" /> : <Truck aria-hidden className="size-4" />}
                  </span>
                  <span>
                    <span className="block font-semibold">{step.label}</span>
                    <span className="hint block">{step.date ? fullDate(step.date) : order.status === 'cancelled' ? 'Cancelled' : 'Not yet'}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          {supplier && (
            <section className="card p-5">
              <div className="flex items-center gap-3">
                <IconTile icon={Truck} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{supplier.name}</p>
                  <p className="hint">{supplier.onTimePercent === null ? 'No deliveries recorded yet' : `${supplier.onTimePercent}% on time over ${supplier.ordersReceived} deliveries`}</p>
                </div>
              </div>
            </section>
          )}
          {(order.status === 'draft' || order.status === 'sent') && (
            <Button
              variant="danger"
              icon={Ban}
              className="w-full"
              onClick={async () => {
                if (await confirm({ title: `Cancel ${order.number}?`, text: order.requestId ? 'Its request goes back to approved so you can reorder.' : undefined, confirm: 'Cancel order', danger: true })) cancel.mutate();
              }}
            >
              Cancel order
            </Button>
          )}
        </aside>
      </div>
      <ReceiveForm open={receiving} onClose={() => setReceiving(false)} order={order} />
      <OrderForm open={editing} onClose={() => setEditing(false)} order={order} />
    </>
  );
}
