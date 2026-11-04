import { Eye, EyeOff, MailCheck, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EDITION_INFO, type Edition, type Role, type UserDTO } from '@harmony/shared';
import { api, ApiError, fieldError, generalError, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { STATIC_DEMO } from '@/lib/platform';
import { Button, LinkButton } from '@/ui/Button';
import { FormError, TextField, usePasswordToggle } from '@/ui/Fields';
import { Avatar } from '@/ui/Primitives';
import { AuthLayout, Divider, GoogleButton } from './AuthLayout';
import { useAfterSignIn } from './Login';

function PasswordField({ value, onChange, error, label = 'Password', autoComplete = 'new-password' }: { value: string; onChange: (value: string) => void; error?: string; label?: string; autoComplete?: string }) {
  const toggle = usePasswordToggle();
  return (
    <div className="relative">
      <TextField label={label} type={toggle.type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} error={error} hint="At least 8 characters." className="pr-12" required />
      <button type="button" onClick={toggle.toggle} aria-label={toggle.visible ? 'Hide password' : 'Show password'} className="absolute right-2 top-[30px] grid size-9 place-items-center rounded-full text-ink-soft hover:bg-canvas">
        {toggle.visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  );
}

export function Signup() {
  const { setUser } = useAuth();
  const { next } = useAfterSignIn();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signup = useMutation({
    mutationFn: () => post<{ user: UserDTO }>('/auth/signup', { name, email, password }),
    onSuccess: (result) => {
      setUser(result.user);
      navigate(next ?? '/new', { replace: true });
    },
  });

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <h1 className="page-title">Create your account</h1>
        <p className="mt-2 text-ink-muted">Then choose a home, an HR office or a procurement team to set up.</p>
        <div className="mt-7">
          <GoogleButton next={next ?? '/new'} label="Sign up with Google" />
        </div>
        <Divider text="or with email" />
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            signup.mutate();
          }}
        >
          <FormError message={generalError(signup.error, ['name', 'email', 'password'])} />
          <TextField label="Your name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} error={fieldError(signup.error, 'name')} required />
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} error={fieldError(signup.error, 'email')} required />
          <PasswordField value={password} onChange={setPassword} error={fieldError(signup.error, 'password')} />
          <Button type="submit" size="lg" className="w-full" loading={signup.isPending}>
            Create account
          </Button>
        </form>
        <p className="mt-6 text-center text-ink-muted">
          Already have an account?{' '}
          <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </AuthLayout>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const forgot = useMutation({ mutationFn: () => post<{ ok: true; devLink?: string }>('/auth/forgot', { email }) });

  return (
    <AuthLayout>
      {forgot.isSuccess ? (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-mint-50 text-mint-600">
            <MailCheck aria-hidden className="size-8" />
          </span>
          <h1 className="page-title mt-5">Check your email</h1>
          <p className="mt-2 text-ink-muted">If {email} has an account, a reset link is on its way. It works for one hour.</p>
          {forgot.data.devLink && (
            <p className="mt-5 rounded-2xl bg-sun-50 px-4 py-3 text-[13.5px] text-sun-700">
              Email isn’t set up on this server, so here’s the link directly:{' '}
              <a href={forgot.data.devLink} className="font-semibold underline">
                reset your password
              </a>
            </p>
          )}
          <LinkButton to="/login" variant="secondary" className="mt-7">
            Back to sign in
          </LinkButton>
        </motion.div>
      ) : (
        <>
          <h1 className="page-title">Reset your password</h1>
          <p className="mt-2 text-ink-muted">Enter your email and we’ll send you a link.</p>
          <form
            className="mt-7 space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              forgot.mutate();
            }}
          >
            <FormError message={generalError(forgot.error, ['email'])} />
            <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} error={fieldError(forgot.error, 'email')} required />
            <Button type="submit" size="lg" className="w-full" loading={forgot.isPending}>
              Send reset link
            </Button>
          </form>
          <p className="mt-6 text-center">
            <Link to="/login" className="font-semibold text-brand-700 hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}

export function Reset() {
  const { token = '' } = useParams();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => post<{ user: UserDTO }>('/auth/reset', { token, password }),
    onSuccess: (result) => {
      setUser(result.user);
      navigate('/', { replace: true });
    },
  });
  return (
    <AuthLayout>
      <h1 className="page-title">Choose a new password</h1>
      <p className="mt-2 text-ink-muted">You’ll be signed in straight after, and signed out everywhere else.</p>
      <form
        className="mt-7 space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          reset.mutate();
        }}
      >
        <FormError message={generalError(reset.error, ['password'])} />
        <PasswordField value={password} onChange={setPassword} error={fieldError(reset.error, 'password')} label="New password" />
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>
          Save and sign in
        </Button>
      </form>
      {reset.error instanceof ApiError && reset.error.status === 410 && (
        <p className="mt-4 text-center">
          <Link to="/forgot" className="font-semibold text-brand-700 hover:underline">
            Ask for a new link
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}

/** Shown instead of Google while no Google client ID is set, and only in demo mode. */
export function GoogleDemo() {
  const { setUser } = useAuth();
  const { go } = useAfterSignIn();
  const signIn = useMutation({
    mutationFn: () => post<{ user: UserDTO }>('/auth/google-demo'),
    onSuccess: (result) => {
      setUser(result.user);
      go();
    },
  });
  return (
    <AuthLayout>
      <div className="card p-6 text-center sm:p-8">
        <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-sun-50 text-sun-600">
          <ShieldCheck aria-hidden className="size-7" />
        </span>
        <h1 className="mt-4 text-[1.4rem] font-semibold tracking-tight">Google sign-in, demo version</h1>
        {STATIC_DEMO ? (
          <p className="mt-2 text-[14.5px] text-ink-muted">This demo runs entirely in your browser, with no server behind it, so Google can’t complete a sign-in here. This page stands in for Google and signs you in as a demo user. The full app signs in with real Google accounts.</p>
        ) : (
          <p className="mt-2 text-[14.5px] text-ink-muted">
            This server has no Google client ID yet, so this page stands in for Google. It signs you in as a shared demo user. To use real Google accounts, set <code className="rounded bg-canvas px-1">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-canvas px-1">GOOGLE_CLIENT_SECRET</code>.
          </p>
        )}
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-line p-3 text-left">
          <Avatar name="Demo Google User" size={40} />
          <div className="min-w-0">
            <p className="font-semibold">Demo Google User</p>
            <p className="truncate text-[13px] text-ink-soft">google.demo@example.com</p>
          </div>
        </div>
        <FormError message={generalError(signIn.error)} />
        <Button size="lg" className="mt-5 w-full" loading={signIn.isPending} onClick={() => signIn.mutate()}>
          Continue as the demo user
        </Button>
        <Link to="/login" className="mt-4 inline-block text-[14px] font-semibold text-ink-muted hover:text-brand-700">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}

interface InvitePreview {
  workspaceName: string;
  edition: Edition;
  role: Role;
  invitedBy: string | null;
  forName: string | null;
}

export function Invite() {
  const { token = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const preview = useQuery({ queryKey: ['invite', token], queryFn: () => api<InvitePreview>(`/invites/${token}`), retry: false });
  const accept = useMutation({
    mutationFn: () => post<{ workspaceId: string }>(`/invites/${token}/accept`),
    onSuccess: (result) => navigate(`/w/${result.workspaceId}`, { replace: true }),
  });
  const here = `/invite/${token}`;

  return (
    <AuthLayout>
      {preview.isPending ? (
        <div className="skeleton h-64 !rounded-card" />
      ) : preview.isError ? (
        <div className="text-center">
          <h1 className="page-title">This invite doesn’t work</h1>
          <p className="mt-2 text-ink-muted">{(preview.error as Error).message}</p>
          <LinkButton to="/" variant="secondary" className="mt-6">
            Go to Harmony
          </LinkButton>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <span data-edition={preview.data.edition} className="bg-brand-gradient grain mx-auto grid size-16 place-items-center rounded-[22px] text-[22px] font-semibold text-white shadow-glow">
            {preview.data.workspaceName[0]}
          </span>
          <h1 className="page-title mt-5">Join {preview.data.workspaceName}</h1>
          <p className="mt-2 text-ink-muted">
            {preview.data.invitedBy ? `${preview.data.invitedBy} invited you` : 'You’re invited'}
            {preview.data.forName ? ` as ${preview.data.forName}` : ''} on {EDITION_INFO[preview.data.edition].name}.
          </p>
          <FormError message={generalError(accept.error)} />
          {user ? (
            <Button size="lg" className="mt-7 w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
              Join as {user.name}
            </Button>
          ) : (
            <div className="mt-7 space-y-3">
              <LinkButton to={`/signup?next=${encodeURIComponent(here)}`} size="lg" className="w-full">
                Create an account to join
              </LinkButton>
              <LinkButton to={`/login?next=${encodeURIComponent(here)}`} variant="secondary" size="lg" className="w-full">
                I already have an account
              </LinkButton>
            </div>
          )}
        </motion.div>
      )}
    </AuthLayout>
  );
}
