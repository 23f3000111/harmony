import clsx from 'clsx';
import { Copy, Link2, MoreHorizontal, Pencil, Phone, UserMinus, UserPlus, UsersRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { MemberStats } from '@harmony/shared';
import { del, post } from '@/lib/api';
import { itemVariants, listVariants } from '@/lib/motion';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { useMembers } from '@/features/data';
import { MemberForm, roleLabel } from '@/features/taskForms';
import { Button } from '@/ui/Button';
import { Menu } from '@/ui/Menu';
import { Modal, useConfirm } from '@/ui/Modal';
import { Avatar, PageHeader, Pill } from '@/ui/Primitives';
import { EmptyState, ListSkeleton, Loaded } from '@/ui/States';
import { useToast } from '@/ui/Toast';

export default function People() {
  const { vocab, isManager, edition } = useWorkspace();
  const query = useMembers();
  const [editing, setEditing] = useState<MemberStats | null | 'new'>(null);
  const [invite, setInvite] = useState<{ url: string; name: string | null } | null>(null);

  return (
    <>
      <PageHeader
        title={vocab.people}
        sub={edition === 'home' ? 'Everyone who helps at home. Kids and helpers don’t need an account to have chores.' : 'Everyone on the team, with what’s on their plate this week.'}
        actions={
          isManager && (
            <>
              <InviteButton onCreated={(url) => setInvite({ url, name: null })} />
              <Button icon={UserPlus} onClick={() => setEditing('new')}>
                Add a person
              </Button>
            </>
          )
        }
      />
      <Loaded query={query} skeleton={<div className="card p-6"><ListSkeleton /></div>}>
        {({ members }) =>
          members.length === 0 ? (
            <div className="card">
              <EmptyState icon={UsersRound} title="Just you so far" />
            </div>
          ) : (
            <motion.ul variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {members.map((member) => (
                <MemberCard key={member.id} member={member} onEdit={() => setEditing(member)} onInvite={(url) => setInvite({ url, name: member.name })} />
              ))}
            </motion.ul>
          )
        }
      </Loaded>
      <MemberForm open={editing !== null} onClose={() => setEditing(null)} member={editing === 'new' ? null : editing} />
      <InviteModal invite={invite} onClose={() => setInvite(null)} />
    </>
  );
}

function InviteButton({ onCreated }: { onCreated: (url: string) => void }) {
  const { url } = useWorkspace();
  const create = useWMutation({ run: () => post<{ url: string }>(url('invites'), { role: 'member' }), scopes: ['members'], onDone: (result) => onCreated(result.url) });
  return (
    <Button variant="secondary" icon={Link2} onClick={() => create.mutate()} loading={create.isPending}>
      Invite link
    </Button>
  );
}

function MemberCard({ member, onEdit, onInvite }: { member: MemberStats; onEdit: () => void; onInvite: (url: string) => void }) {
  const { isManager, workspace, url } = useWorkspace();
  const confirm = useConfirm();
  const me = member.id === workspace.myMemberId;
  const invite = useWMutation({ run: () => post<{ url: string }>(url('invites'), { memberId: member.id, role: member.role }), scopes: ['members'], onDone: (result) => onInvite(result.url) });
  const remove = useWMutation({ run: () => del(url(`members/${member.id}`)), scopes: ['members', 'tasks'], done: `${member.name} removed. Their open tasks are free for anyone.` });
  const canChange = isManager && (member.role !== 'owner' || workspace.myRole === 'owner');

  return (
    <motion.li variants={itemVariants} className="card flex min-w-0 flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar name={member.name} src={member.avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">
            {member.name}
            {me && <span className="ml-1.5 text-[12px] font-normal text-ink-soft">(you)</span>}
          </p>
          <p className="truncate text-[12.5px] text-ink-soft">{[member.title, member.department].filter(Boolean).join(' · ') || roleLabel(member.role)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill tone={member.role === 'member' ? 'grey' : 'brand'} dot={false}>
              {roleLabel(member.role)}
            </Pill>
            {!member.hasLogin && <Pill tone="sun">{member.invitePending ? 'Invite sent' : 'No login'}</Pill>}
          </div>
        </div>
        {canChange && (
          <Menu
            trigger={(props) => (
              <button type="button" aria-label={`More for ${member.name}`} className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-canvas" {...props}>
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
            )}
            items={[
              { label: 'Edit', icon: Pencil, onSelect: onEdit },
              ...(!member.hasLogin ? [{ label: member.invitePending ? 'New invite link' : 'Invite to sign in', icon: Link2, onSelect: () => invite.mutate() }] : []),
              {
                label: me ? 'Leave this workspace' : 'Remove',
                icon: UserMinus,
                danger: true,
                onSelect: async () => {
                  if (await confirm({ title: me ? 'Leave this workspace?' : `Remove ${member.name}?`, text: 'Finished work keeps their name. Open tasks become free for anyone.', confirm: me ? 'Leave' : 'Remove', danger: true })) remove.mutate();
                },
              },
            ]}
          />
        )}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        {[
          ['Open', member.openTasks, 'text-brand-700'],
          ['Late', member.overdueTasks, member.overdueTasks ? 'text-coral-600' : 'text-ink'],
          ['Done this week', member.doneThisWeek, 'text-mint-700'],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-2xl bg-canvas/80 px-2 py-2.5">
            <p className={clsx('text-[19px] font-semibold tabular-nums', tone as string)}>{value as number}</p>
            <p className="text-[11.5px] text-ink-soft">{label as string}</p>
          </div>
        ))}
      </div>
      {member.phone && (
        <a href={`tel:${member.phone}`} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-brand-700">
          <Phone aria-hidden className="size-3.5" />
          {member.phone}
        </a>
      )}
    </motion.li>
  );
}

function InviteModal({ invite, onClose }: { invite: { url: string; name: string | null } | null; onClose: () => void }) {
  const { toast } = useToast();
  const { workspace } = useWorkspace();
  const whatsapp = invite ? `https://wa.me/?text=${encodeURIComponent(`Join ${workspace.name} on Harmony: ${invite.url}`)}` : '#';
  return (
    <Modal open={Boolean(invite)} onClose={onClose} title={invite?.name ? `Invite ${invite.name}` : 'Invite someone'} sub="Anyone with this link can join for the next 14 days. It works once." size="sm">
      {invite && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-canvas/70 p-2 pl-4">
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{invite.url}</span>
            <Button
              size="sm"
              icon={Copy}
              onClick={async () => {
                await navigator.clipboard?.writeText(invite.url).catch(() => undefined);
                toast({ title: 'Link copied', tone: 'success' });
              }}
            >
              Copy
            </Button>
          </div>
          <a href={whatsapp} target="_blank" rel="noreferrer" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#25d366] font-semibold text-white transition-transform hover:-translate-y-0.5">
            Share on WhatsApp
          </a>
        </div>
      )}
    </Modal>
  );
}
