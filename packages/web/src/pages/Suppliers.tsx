import clsx from 'clsx';
import { Clock3, Mail, Pencil, Phone, ReceiptText, Truck } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SupplierDTO } from '@harmony/shared';
import { money } from '@/lib/format';
import { itemVariants, listVariants } from '@/lib/motion';
import { useWorkspace } from '@/lib/workspace';
import { useSuppliers } from '@/features/data';
import { OrderForm, SupplierForm } from '@/features/procurementForms';
import { Button, IconButton } from '@/ui/Button';
import { Avatar, PageHeader } from '@/ui/Primitives';
import { EmptyState, ListSkeleton, Loaded } from '@/ui/States';

export default function Suppliers() {
  const { isManager, workspace, path } = useWorkspace();
  const navigate = useNavigate();
  const query = useSuppliers();
  const [editing, setEditing] = useState<SupplierDTO | null | 'new'>(null);
  const [ordering, setOrdering] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Suppliers"
        sub="Who you buy from, how reliably they deliver, and what you’ve spent. Worked out from real orders."
        actions={
          isManager && (
            <Button icon={Truck} onClick={() => setEditing('new')}>
              New supplier
            </Button>
          )
        }
      />
      <Loaded query={query} skeleton={<div className="card p-6"><ListSkeleton /></div>}>
        {({ suppliers }) =>
          suppliers.length === 0 ? (
            <div className="card">
              <EmptyState icon={Truck} title="No suppliers yet" text="Add the companies you order from to raise purchase orders." action={isManager && <Button icon={Truck} onClick={() => setEditing('new')}>New supplier</Button>} />
            </div>
          ) : (
            <motion.ul variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {suppliers.map((supplier) => {
                const rate = supplier.onTimePercent;
                return (
                  <motion.li key={supplier.id} variants={itemVariants} className="card flex min-w-0 flex-col p-5">
                    <div className="flex items-start gap-3">
                      <Avatar name={supplier.name} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{supplier.name}</p>
                        <p className="truncate text-[12.5px] text-ink-soft">{supplier.category ?? 'General'}</p>
                      </div>
                      {isManager && <IconButton icon={Pencil} label={`Edit ${supplier.name}`} size="sm" onClick={() => setEditing(supplier)} />}
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <Stat label="On time" value={rate === null ? '—' : `${rate}%`} tone={rate === null ? undefined : rate >= 85 ? 'good' : rate >= 65 ? 'warn' : 'bad'} />
                      <Stat label="Spent" value={money(supplier.spentCents, workspace.currency, { compact: true })} />
                      <Stat label="Delivers in" value={`${supplier.leadTimeDays} d`} />
                    </div>
                    {rate !== null && (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                        <motion.div className={clsx('h-full rounded-full', rate >= 85 ? 'bg-mint-500' : rate >= 65 ? 'bg-sun-400' : 'bg-coral-500')} initial={{ width: 0 }} whileInView={{ width: `${rate}%` }} viewport={{ once: true }} transition={{ duration: 0.9 }} />
                      </div>
                    )}
                    <p className="hint mt-2">{supplier.ordersReceived ? `Based on ${supplier.ordersReceived} deliveries` : 'No deliveries recorded yet'}</p>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line/60 pt-4 text-[13px] text-ink-muted">
                      {supplier.contactName && <span>{supplier.contactName}</span>}
                      {supplier.email && (
                        <a href={`mailto:${supplier.email}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                          <Mail aria-hidden className="size-3.5" />
                          Email
                        </a>
                      )}
                      {supplier.phone && (
                        <a href={`tel:${supplier.phone}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                          <Phone aria-hidden className="size-3.5" />
                          {supplier.phone}
                        </a>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock3 aria-hidden className="size-3.5" />
                        Pay in {supplier.paymentTermsDays} days
                      </span>
                    </div>
                    {isManager && (
                      <Button variant="soft" size="sm" icon={ReceiptText} className="mt-4 self-start" onClick={() => setOrdering(supplier.id)}>
                        Order what’s running low
                      </Button>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>
          )
        }
      </Loaded>
      <SupplierForm open={editing !== null} onClose={() => setEditing(null)} supplier={editing === 'new' ? null : editing} />
      <OrderForm open={Boolean(ordering)} onClose={() => setOrdering(null)} supplierId={ordering ?? undefined} onCreated={(order) => navigate(path(`orders/${order.id}`))} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-2xl bg-canvas/80 px-3 py-2.5">
      <p className="text-[11.5px] text-ink-soft">{label}</p>
      <p className={clsx('mt-0.5 text-[16px] font-semibold tabular-nums', tone === 'good' && 'text-mint-700', tone === 'warn' && 'text-sun-700', tone === 'bad' && 'text-coral-600')}>{value}</p>
    </div>
  );
}
