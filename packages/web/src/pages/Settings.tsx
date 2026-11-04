import { Copy, ExternalLink, KeyRound, LogOut, MonitorSmartphone, RefreshCw, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { EDITION_INFO, type UserDTO } from '@harmony/shared';
import { Illustration } from '@/art/Illustrations';
import { del, fieldError, generalError, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { appLink, STATIC_DEMO } from '@/lib/platform';
import { useWMutation, useWorkspace } from '@/lib/workspace';
import { ExportButton } from '@/ui/ExportButton';
import { Button } from '@/ui/Button';
import { FormError, SelectField, TextField } from '@/ui/Fields';
import { useConfirm } from '@/ui/Modal';
import { CardHeader, PageHeader } from '@/ui/Primitives';
import { useToast } from '@/ui/Toast';
import { useMutation } from '@tanstack/react-query';

const TIMEZONES = ['Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Manila', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Australia/Sydney', 'America/New_York', 'UTC'];
const CURRENCIES = ['MYR', 'SGD', 'IDR', 'THB', 'PHP', 'INR', 'AED', 'GBP', 'AUD', 'USD', 'EUR'];

export default function Settings() {
  const { workspace, isManager, isOwner, url, path, edition } = useWorkspace();
  const { user, setUser, signOut } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { toast } = useToast();
  const client = useQueryClient();
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '#board') document.getElementById('board')?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash]);

  return (
    <>
      <PageHeader title="Settings" sub={`${workspace.name} · ${EDITION_INFO[edition].name}`} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {user && <ProfileCard user={user} onSaved={setUser} />}
        {user && !user.isDemo && <PasswordCard user={user} />}
        {isManager && <WorkspaceCard />}
        {isManager && <BoardCard />}
        {isManager && (
          <section className="card p-5 sm:p-6">
            <CardHeader title="Your data" hint="Download it any time. It’s yours." />
            <div className="flex flex-wrap gap-2">
              {[
                ['Tasks', 'export/tasks.csv', 'tasks.csv'],
                ['Stock', 'export/items.csv', 'stock.csv'],
                ['Spending', 'export/expenses.csv', 'spending.csv'],
              ].map(([label, file, filename]) => (
                <ExportButton key={file} path={url(file)} filename={filename!} label={`${label} (CSV)`} size="sm" />
              ))}
              {isOwner && <ExportButton path={url('export/all.json')} filename="harmony-export.json" label="Everything (JSON)" size="sm" variant="soft" />}
            </div>
          </section>
        )}
        {user?.isDemo && (
          <section className="card p-5 sm:p-6">
            <CardHeader title="Demo data" hint="This is a shared demo. Start it fresh whenever you like." />
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={async () => {
                if (!(await confirm({ title: 'Reset the demo?', text: 'All three demo workspaces go back to how they started, for everyone using them.', confirm: 'Reset demo' }))) return;
                await post('/demo/reset');
                await client.invalidateQueries();
                toast({ title: 'Demo data reset', tone: 'success' });
                navigate('/');
              }}
            >
              Reset the demo
            </Button>
          </section>
        )}
        <section className="card border-coral-100 p-5 sm:p-6">
          <CardHeader title="Leave or delete" />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={LogOut}
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
            >
              Sign out
            </Button>
            {isOwner && !workspace.isDemo && (
              <Button
                variant="danger"
                icon={Trash2}
                onClick={async () => {
                  if (!(await confirm({ title: `Delete ${workspace.name}?`, text: 'Everything in it is deleted for everyone. Download your data first if you need it.', confirm: 'Delete workspace', danger: true }))) return;
                  await del(url());
                  await client.invalidateQueries({ queryKey: ['workspaces'] });
                  navigate('/');
                }}
              >
                Delete workspace
              </Button>
            )}
            {user && !user.isDemo && (
              <Button
                variant="danger"
                icon={ShieldAlert}
                onClick={async () => {
                  if (!(await confirm({ title: 'Delete your account?', text: 'Workspaces only you can reach are deleted too. This can’t be undone.', confirm: 'Delete my account', danger: true }))) return;
                  try {
                    await del('/auth/me');
                    setUser(null);
                    navigate('/login');
                  } catch (error) {
                    toast({ title: (error as Error).message, tone: 'error' });
                  }
                }}
              >
                Delete account
              </Button>
            )}
          </div>
          <p className="hint mt-3">{path() && 'Signed in as ' + (user?.email ?? '')}</p>
        </section>
      </div>
    </>
  );
}

function ProfileCard({ user, onSaved }: { user: UserDTO; onSaved: (user: UserDTO) => void }) {
  const [name, setName] = useState(user.name);
  const { toast } = useToast();
  const save = useMutation({
    mutationFn: () => patch<{ user: UserDTO }>('/auth/me', { name }),
    onSuccess: (result) => {
      onSaved(result.user);
      toast({ title: 'Saved', tone: 'success' });
    },
  });
  return (
    <section className="card p-5 sm:p-6">
      <CardHeader title="You" hint={user.email} />
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={user.isDemo ? 'Demo accounts are shared, so their names stay fixed.' : generalError(save.error, ['name'])} />
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} disabled={user.isDemo} error={fieldError(save.error, 'name')} />
        <div className="flex items-center justify-between gap-3">
          <p className="hint flex items-center gap-1.5">
            <UserRound aria-hidden className="size-3.5" />
            {user.hasGoogle ? 'Signs in with Google' : 'Signs in with email'}
            {user.hasPassword && user.hasGoogle ? ' or a password' : ''}
          </p>
          <Button type="submit" size="sm" loading={save.isPending} disabled={user.isDemo || name === user.name}>
            Save
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordCard({ user }: { user: UserDTO }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const { toast } = useToast();
  const save = useMutation({
    mutationFn: () => post('/auth/me/password', { current: current || undefined, next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      toast({ title: 'Password changed. Other devices were signed out.', tone: 'success' });
    },
  });
  return (
    <section className="card p-5 sm:p-6">
      <CardHeader title={user.hasPassword ? 'Change password' : 'Add a password'} hint={user.hasPassword ? 'Signs you out everywhere else.' : 'So you can sign in without Google too.'} />
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['current', 'next'])} />
        {user.hasPassword && <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} error={fieldError(save.error, 'current')} />}
        <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} error={fieldError(save.error, 'next')} hint="At least 8 characters." />
        <div className="flex justify-end">
          <Button type="submit" size="sm" icon={KeyRound} loading={save.isPending} disabled={!next}>
            Save password
          </Button>
        </div>
      </form>
    </section>
  );
}

function WorkspaceCard() {
  const { workspace, url } = useWorkspace();
  const client = useQueryClient();
  const [name, setName] = useState(workspace.name);
  const [currency, setCurrency] = useState(workspace.currency);
  const [timezone, setTimezone] = useState(workspace.timezone);
  const save = useWMutation({
    run: () => patch(url(), { name, currency, timezone }),
    scopes: ['workspace'],
    done: 'Workspace saved',
    onDone: () => void client.invalidateQueries({ queryKey: ['workspaces'] }),
    silentErrors: true,
  });
  return (
    <section className="card p-5 sm:p-6">
      <CardHeader title="Workspace" />
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['name'])} />
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} error={fieldError(save.error, 'name')} />
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {CURRENCIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SelectField>
          <SelectField label="Time zone" value={timezone} onChange={(event) => setTimezone(event.target.value)} hint="Decides when “today” starts.">
            {[...new Set([timezone, ...TIMEZONES])].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SelectField>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </section>
  );
}

function BoardCard() {
  const { workspace, url, edition } = useWorkspace();
  const client = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();
  const link = workspace.boardToken ? appLink(`/board/${workspace.boardToken}`) : null;
  const refresh = () => client.invalidateQueries({ queryKey: ['w', workspace.id, 'workspace'] });
  const create = useWMutation({ run: () => post(url('board-token')), scopes: ['workspace'], done: 'New board link ready', onDone: () => void refresh() });
  const remove = useWMutation({ run: () => del(url('board-token')), scopes: ['workspace'], done: 'Board link turned off', onDone: () => void refresh() });

  return (
    <section id="board" className="card scroll-mt-24 overflow-hidden xl:col-span-2">
      <div className="grid grid-cols-1 items-center gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <CardHeader title={edition === 'home' ? 'The fridge board' : 'The wall board'} hint={edition === 'home' ? 'Open this link on an old tablet on the fridge, or on anyone’s phone. They see today’s chores and the shopping list, and can tick things off without an account. No money is shown.' : 'Put this on a screen in the office, or share it with staff who don’t sign in. It shows today’s jobs and the restock list. No money is shown.'} />
          {link ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-canvas/70 p-2 pl-4">
                <MonitorSmartphone aria-hidden className="size-4 shrink-0 text-ink-soft" />
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{link}</span>
                <Button
                  size="sm"
                  icon={Copy}
                  onClick={async () => {
                    await navigator.clipboard?.writeText(link).catch(() => undefined);
                    toast({ title: 'Board link copied', tone: 'success' });
                  }}
                >
                  Copy
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={link} target={STATIC_DEMO ? undefined : '_blank'} rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-50 px-4 text-[13px] font-semibold text-brand-700 hover:bg-brand-100">
                  <ExternalLink aria-hidden className="size-3.5" />
                  Open the board
                </a>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={RefreshCw}
                  onClick={async () => {
                    if (await confirm({ title: 'Replace the link?', text: 'The old link stops working straight away.', confirm: 'Replace link' })) create.mutate();
                  }}
                >
                  Replace link
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate()}>
                  Turn off
                </Button>
              </div>
            </div>
          ) : (
            <Button icon={MonitorSmartphone} onClick={() => create.mutate()} loading={create.isPending}>
              Create a board link
            </Button>
          )}
        </div>
        <Illustration name="board" className="mx-auto hidden h-36 w-auto md:block" />
      </div>
    </section>
  );
}
