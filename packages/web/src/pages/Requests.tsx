import clsx from 'clsx';
import { CalendarClock, Check, CircleSlash, Inbox, Plus, ReceiptText, Undo2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RequestDTO } from '@harmony/shared';
import { del, post } from '@/lib/api';
import { dayMonth, firstName, money, qty, timeAgo } from '@/lib/format';
import { itemVariants, listVariants } from '@/lib/motion';
import { useOpenParam, useWMutation, useWorkspace, useWQuery } from '@/lib/workspace';
import { DecisionForm, OrderForm, RequestForm } from '@/features/procurementForms';
import { Button } from '@/ui/Button';
import { Avatar, PageHeader, Pill, Tabs, type Tone } from '@/ui/Primitives';
import { EmptyState, ListSkeleton, Loaded } from '@/ui/States';
import { Modal, useConfirm } from '@/ui/Modal';

const STATUS: Record<RequestDTO['status'], { label: string; tone: Tone }> = {
  open: { label: 'Waiting', tone: 'sun' },
  approved: { label: 'Approved', tone: 'brand' },
  ordered: { label: 'Ordered', tone: 'brand' },
  done: { label: 'Done', tone: 'mint' },
  rejected: { label: 'Declined', tone: 'grey' },
};

export default function Requests() {
  const { vocab, isManager, edition, path } = useWorkspace();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'open' | 'all'>(isManager ? 'open' : 'all');
  const query = useWQuery<{ requests: RequestDTO[] }>('requests', `/requests${tab === 'open' ? '?status=open' : ''}`, { placeholderData: (previous) => previous });
  const [creating, setCreating] = useState(false);
  const [decision, setDecision] = useState<{ request: RequestDTO; kind: 'approve' | 'reject' } | null>(null);
  const [ordering, setOrdering] = useState<RequestDTO | null>(null);
  const [viewing, setViewing] = useState<RequestDTO | null>(null);
  const [openId, clearOpen] = useOpenParam();

  useEffect(() => {
    if (!openId || !query.data) return;
    const found = query.data.requests.find((request) => request.id === openId);
    if (found) setViewing(found);
    else if (tab === 'open') setTab('all');
    if (found || tab === 'all') clearOpen();
  }, [openId, query.data, clearOpen, tab]);

  return (
    <>
      <PageHeader
        title={vocab.requests}
        sub={isManager ? (edition === 'supply' ? 'Approve what the team needs, then turn it into a purchase order.' : 'What the team has asked for. Approving turns it into a job or a restock.') : 'Ask for what you need and follow it to the end.'}
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            New {vocab.request}
          </Button>
        }
      />
      {isManager && (
        <Tabs
          className="mb-5"
          label="Which requests"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'open', label: 'Waiting for you' },
            { value: 'all', label: 'All requests' },
          ]}
        />
      )}
      <Loaded query={query} skeleton={<div className="card p-6"><ListSkeleton /></div>}>
        {({ requests }) =>
          requests.length === 0 ? (
            <div className="card">
              <EmptyState icon={Inbox} title={tab === 'open' ? 'Nothing waiting' : 'No requests yet'} text={tab === 'open' ? 'Every request has been decided.' : 'Requests from the team show up here.'} action={<Button variant="soft" icon={Plus} onClick={() => setCreating(true)}>New {vocab.request}</Button>} />
            </div>
          ) : (
            <motion.ul variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AnimatePresence initial={false}>
                {requests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onOpen={() => setViewing(request)}
                    onDecide={(kind) => setDecision({ request, kind })}
                    onOrder={() => setOrdering(request)}
                    onOpenOrder={() => request.orderId && navigate(path(`orders/${request.orderId}`))}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          )
        }
      </Loaded>
      <RequestForm open={creating} onClose={() => setCreating(false)} />
      <DecisionForm open={Boolean(decision)} onClose={() => setDecision(null)} request={decision?.request ?? null} decision={decision?.kind ?? 'approve'} />
      {edition === 'supply' && <OrderForm open={Boolean(ordering)} onClose={() => setOrdering(null)} request={ordering} onCreated={(order) => navigate(path(`orders/${order.id}`))} />}
      <RequestDetail request={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function RequestCard({ request, onOpen, onDecide, onOrder, onOpenOrder }: { request: RequestDTO; onOpen: () => void; onDecide: (kind: 'approve' | 'reject') => void; onOrder: () => void; onOpenOrder: () => void }) {
  const { isManager, workspace, edition, url } = useWorkspace();
  const confirm = useConfirm();
  const status = STATUS[request.status];
  const mine = request.requestedById === workspace.myMemberId;
  const withdraw = useWMutation({ run: () => del(url(`requests/${request.id}`)), scopes: ['requests'], done: 'Request withdrawn' });
  const close = useWMutation({ run: () => post(url(`requests/${request.id}/done`)), scopes: ['requests'], done: 'Marked done' });

  return (
    <motion.li variants={itemVariants} layout exit={{ opacity: 0, scale: 0.96 }} className={clsx('card flex min-w-0 flex-col p-5', request.status === 'open' && request.priority === 'high' && 'ring-2 ring-coral-200')}>
      <div className="flex items-start gap-3">
        <Avatar name={request.requestedByName ?? 'Someone'} size={38} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-semibold">{request.title}</span>
          <span className="block truncate text-[12.5px] text-ink-soft">
            {mine ? 'You' : firstName(request.requestedByName ?? 'Someone')} · {timeAgo(request.createdAt)}
          </span>
        </button>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>
      {request.details && <p className="mt-3 line-clamp-2 text-[14px] text-ink-muted">{request.details}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {request.priority === 'high' && <Pill tone="coral">Urgent</Pill>}
        {request.neededBy && (
          <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[12px] font-semibold text-ink-muted">
            <CalendarClock aria-hidden className="size-3.5" />
            By {dayMonth(request.neededBy)}
          </span>
        )}
        {request.lines.slice(0, 3).map((line) => (
          <span key={line.name} className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700">
            {qty(line.qty)} × {line.name}
          </span>
        ))}
        {request.estimatedCents > 0 && isManager && <span className="rounded-full bg-canvas px-2.5 py-1 text-[12px] font-semibold text-ink">{money(request.estimatedCents, workspace.currency)}</span>}
      </div>
      {request.decisionNote && request.status !== 'open' && (
        <p className="mt-3 rounded-2xl bg-canvas px-3.5 py-2.5 text-[13px] text-ink-muted">
          <span className="font-semibold text-ink">{request.decidedByName ? firstName(request.decidedByName) : 'Manager'}:</span> {request.decisionNote}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/60 pt-4">
        {isManager && request.status === 'open' && (
          <>
            <Button size="sm" icon={Check} onClick={() => onDecide('approve')}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" icon={X} onClick={() => onDecide('reject')}>
              Decline
            </Button>
          </>
        )}
        {isManager && edition === 'supply' && request.status === 'approved' && (
          <Button size="sm" icon={ReceiptText} onClick={onOrder}>
            Raise purchase order
          </Button>
        )}
        {request.orderId && (
          <Button size="sm" variant="soft" icon={ReceiptText} onClick={onOpenOrder}>
            View order
          </Button>
        )}
        {isManager && edition === 'people' && request.status === 'approved' && (
          <Button size="sm" variant="soft" icon={Check} onClick={() => close.mutate()} loading={close.isPending}>
            Mark done
          </Button>
        )}
        {mine && request.status === 'open' && (
          <Button
            size="sm"
            variant="ghost"
            icon={Undo2}
            onClick={async () => {
              if (await confirm({ title: 'Withdraw this request?', confirm: 'Withdraw', danger: true })) withdraw.mutate();
            }}
          >
            Withdraw
          </Button>
        )}
        {request.status === 'rejected' && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
            <CircleSlash aria-hidden className="size-4" />
            Declined {request.decidedAt ? timeAgo(request.decidedAt) : ''}
          </span>
        )}
      </div>
    </motion.li>
  );
}

function RequestDetail({ request, onClose }: { request: RequestDTO | null; onClose: () => void }) {
  const { workspace, isManager } = useWorkspace();
  return (
    <Modal open={Boolean(request)} onClose={onClose} title={request?.title ?? ''} sub={request ? `${request.requestedByName ?? 'Someone'} · ${timeAgo(request.createdAt)}` : undefined}>
      {request && (
        <div className="space-y-4">
          <Pill tone={STATUS[request.status].tone}>{STATUS[request.status].label}</Pill>
          {request.details && <p className="text-ink-muted">{request.details}</p>}
          {request.lines.length > 0 && (
            <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">
              {request.lines.map((line) => (
                <li key={line.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
                  <span className="font-semibold">{line.name}</span>
                  <span className="text-ink-muted">
                    {qty(line.qty)} {line.unit ?? ''}
                    {isManager && line.unitCostCents > 0 ? ` · ${money(line.qty * line.unitCostCents, workspace.currency)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {request.decisionNote && <p className="rounded-2xl bg-canvas px-4 py-3 text-[14px]">{request.decisionNote}</p>}
        </div>
      )}
    </Modal>
  );
}
