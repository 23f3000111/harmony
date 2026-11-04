import clsx from 'clsx';
import { ArrowRight, Building2, Eye, EyeOff, House, Layers, LoaderCircle, PackageSearch } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { DemoAccount, UserDTO } from '@harmony/shared';
import { fieldError, generalError, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { STATIC_DEMO } from '@/lib/platform';
import { itemVariants, listVariants } from '@/lib/motion';
import { Button } from '@/ui/Button';
import { FormError, TextField, usePasswordToggle } from '@/ui/Fields';
import { Avatar } from '@/ui/Primitives';
import { AuthLayout, Divider, GoogleButton } from './AuthLayout';

const ERRORS: Record<string, string> = {
  google_failed: 'Google sign-in didn’t finish. Try again.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_unavailable: 'Google sign-in isn’t set up on this server yet. Use your email and password.',
};

const EDITION_BADGE: Record<DemoAccount['edition'], { label: string; icon: typeof House; edition: string }> = {
  home: { label: 'Home', icon: House, edition: 'home' },
  people: { label: 'HR', icon: Building2, edition: 'people' },
  supply: { label: 'Procurement', icon: PackageSearch, edition: 'supply' },
  all: { label: 'All three', icon: Layers, edition: 'supply' },
};

export function useAfterSignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return { next: safe === '/' ? null : safe, go: () => navigate(safe, { replace: true }) };
}

export default function Login() {
  const { setUser, config } = useAuth();
  const [params] = useSearchParams();
  const { next, go } = useAfterSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const toggle = usePasswordToggle();
  const [demoEmail, setDemoEmail] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: (input: { email: string; password: string }) => post<{ user: UserDTO }>('/auth/login', input),
    onSuccess: (result) => {
      setUser(result.user);
      go();
    },
    onSettled: () => setDemoEmail(null),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  const queryError = ERRORS[params.get('error') ?? ''];

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <h1 className="page-title">Welcome back</h1>
        <p className="mt-2 text-ink-muted">Sign in to your home or office.</p>
        {STATIC_DEMO && (
          <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-[13.5px] leading-relaxed text-brand-800">
            This is a live demo running entirely in your browser. Try a demo account below, or create your own. Anything you add stays on this device.
          </p>
        )}

        <div className="mt-7">
          <GoogleButton next={next} />
        </div>
        <Divider text="or with email" />

        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={queryError ?? generalError(login.error, ['email'])} />
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} error={fieldError(login.error, 'email')} required />
          <div>
            <div className="relative">
              <TextField label="Password" type={toggle.type} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} error={fieldError(login.error, 'password')} className="pr-12" required />
              <button type="button" onClick={toggle.toggle} aria-label={toggle.visible ? 'Hide password' : 'Show password'} className="absolute right-2 top-[30px] grid size-9 place-items-center rounded-full text-ink-soft hover:bg-canvas">
                {toggle.visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
              </button>
            </div>
            <Link to="/forgot" className="mt-2 inline-block text-[13px] font-semibold text-brand-700 hover:underline">
              Forgot your password?
            </Link>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={login.isPending && !demoEmail}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-ink-muted">
          New here?{' '}
          <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>

        {config?.demoMode && config.demoAccounts.length > 0 && (
          <section className="mt-9 rounded-[26px] border border-line/70 bg-white p-4 shadow-card sm:p-5" aria-labelledby="demo-heading">
            <h2 id="demo-heading" className="card-title">
              Try a demo account
            </h2>
            <p className="hint mt-0.5">One tap signs you in. Every account has the password {config.demoPassword}.</p>
            <motion.ul variants={listVariants} initial="hidden" animate="show" className="mt-3 grid grid-cols-1 gap-1.5">
              {config.demoAccounts.map((account) => {
                const badge = EDITION_BADGE[account.edition];
                const busy = demoEmail === account.email;
                return (
                  <motion.li key={account.email} variants={itemVariants}>
                    <button
                      type="button"
                      disabled={login.isPending}
                      onClick={() => {
                        setDemoEmail(account.email);
                        login.mutate({ email: account.email, password: config.demoPassword ?? '' });
                      }}
                      className={clsx('group flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-canvas disabled:opacity-60', busy && 'bg-canvas')}
                    >
                      <Avatar name={account.name} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">{account.name}</span>
                          <span data-edition={badge.edition} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                            <badge.icon aria-hidden className="size-3" />
                            {badge.label}
                          </span>
                        </span>
                        <span className="block truncate text-[12.5px] text-ink-soft">
                          {account.role} · {account.blurb}
                        </span>
                      </span>
                      {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin text-brand-600" /> : <ArrowRight aria-hidden className="size-4 text-line transition-all group-hover:translate-x-0.5 group-hover:text-brand-600" />}
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>
          </section>
        )}
      </motion.div>
    </AuthLayout>
  );
}
