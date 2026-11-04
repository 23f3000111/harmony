import clsx from 'clsx';
import { ArrowLeft, Building2, Check, House, PackageSearch, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BRAND, EDITION_INFO, EDITIONS, type Edition, type WorkspaceDTO } from '@harmony/shared';
import { Logo } from '@/art/Illustrations';
import { fieldError, generalError, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SPRING } from '@/lib/motion';
import { applyEdition, sweepTheme } from '@/lib/workspace';
import { Button } from '@/ui/Button';
import { FormError, TextField } from '@/ui/Fields';
import { PageSkeleton } from '@/ui/States';

/** Sends people to the workspace they used last, or to set one up. */
export function Start() {
  const { workspaces, workspacesLoading, user } = useAuth();
  if (workspacesLoading || !workspaces) return <PageSkeleton />;
  if (workspaces.length === 0) return <Navigate to="/new" replace />;
  const target = workspaces.find((workspace) => workspace.id === user?.lastWorkspaceId) ?? workspaces[0]!;
  return <Navigate to={`/w/${target.id}`} replace />;
}

const ICONS: Record<Edition, typeof House> = { home: House, people: Building2, supply: PackageSearch };

const POINTS: Record<Edition, string[]> = {
  home: ['Chores everyone can see and tick', 'A pantry that writes the shopping list', 'Bills, budget and the month ahead'],
  people: ['Delegate jobs and see what’s done', 'Pantry and cleaning stock that restocks itself', 'Staff requests with one-tap approval'],
  supply: ['Purchase requests and approvals', 'Purchase orders, deliveries and receiving', 'Forecasts of what runs out and when'],
};

export function NewWorkspace() {
  const { workspaces, user } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [edition, setEdition] = useState<Edition>('home');
  const [name, setName] = useState('');
  const [starter, setStarter] = useState(true);

  useEffect(() => {
    applyEdition(edition);
  }, [edition]);

  const create = useMutation({
    mutationFn: () => post<{ workspace: WorkspaceDTO }>('/workspaces', { name: name || EDITION_INFO[edition].namePlaceholder, edition, starter }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['workspaces'] });
      navigate(`/w/${result.workspace.id}`, { replace: true });
    },
  });

  return (
    <div className="min-h-dvh">
      <div className="wash" aria-hidden />
      <header className="mx-auto flex max-w-content items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <Logo size={36} />
          <span className="text-[17px] font-semibold tracking-tight">{BRAND.name}</span>
        </span>
        {workspaces && workspaces.length > 0 && (
          <Link to="/" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-muted hover:text-brand-700">
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </Link>
        )}
      </header>
      <main className="mx-auto max-w-content px-5 pb-20 pt-6 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-[640px]">
          <h1 className="banner-title">{workspaces?.length ? 'Set up another space' : `Welcome${user ? `, ${user.name.split(' ')[0]}` : ''}. What are you running?`}</h1>
          <p className="mt-3 text-[16px] text-ink-muted">Pick one to start. You can add the others later and switch between them in one tap.</p>
        </motion.div>

        <div role="radiogroup" aria-label="Edition" className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3">
          {EDITIONS.map((value) => {
            const Icon = ICONS[value];
            const selected = edition === value;
            return (
              <motion.button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                data-edition={value}
                onClick={(event) => {
                  if (value === edition) return;
                  sweepTheme({ x: event.clientX, y: event.clientY }, () => setEdition(value));
                }}
                whileHover={{ y: -4 }}
                transition={SPRING}
                className={clsx('relative overflow-hidden rounded-card border-2 bg-white p-6 text-left shadow-card transition-colors', selected ? 'border-brand-500' : 'border-transparent')}
              >
                <span className="bg-brand-gradient grain grid size-14 place-items-center rounded-[20px] text-white shadow-glow">
                  <Icon aria-hidden className="size-7" />
                </span>
                <span className="mt-5 block text-[1.25rem] font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                  {EDITION_INFO[value].name}
                </span>
                <span className="mt-1 block text-[14px] text-ink-muted">{EDITION_INFO[value].audience}</span>
                <ul className="mt-5 space-y-2">
                  {POINTS[value].map((point) => (
                    <li key={point} className="flex items-start gap-2 text-[14px]">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
                      {point}
                    </li>
                  ))}
                </ul>
                {selected && (
                  <motion.span layoutId="edition-check" className="absolute right-5 top-5 grid size-7 place-items-center rounded-full bg-brand-600 text-white" transition={SPRING}>
                    <Check aria-hidden className="size-4" />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>

        <form
          className="card mt-6 grid grid-cols-1 items-end gap-5 p-6 md:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-4">
            <FormError message={generalError(create.error, ['name'])} />
            <TextField label={`Name your ${EDITION_INFO[edition].spaceNoun}`} value={name} onChange={(event) => setName(event.target.value)} placeholder={EDITION_INFO[edition].namePlaceholder} error={fieldError(create.error, 'name')} />
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-canvas/80 p-3.5">
              <input type="checkbox" checked={starter} onChange={(event) => setStarter(event.target.checked)} className="mt-0.5 size-5 accent-[rgb(var(--brand-600))]" />
              <span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <Sparkles aria-hidden className="size-4 text-brand-600" />
                  Start with common items and routines
                </span>
                <span className="block text-[13px] text-ink-muted">Delete what you don’t need instead of typing everything in. Bill amounts are left for you to fill.</span>
              </span>
            </label>
          </div>
          <Button type="submit" size="lg" loading={create.isPending}>
            Create {EDITION_INFO[edition].name}
          </Button>
        </form>
      </main>
    </div>
  );
}
