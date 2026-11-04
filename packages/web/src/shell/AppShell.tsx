import clsx from 'clsx';
import { Building2, Check, ChevronsUpDown, House, LogOut, Menu as MenuIcon, PackageSearch, Plus, Search, Settings as SettingsIcon, UserRound, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { EDITION_INFO, type Edition, type WorkspaceDTO } from '@harmony/shared';
import { Logo } from '@/art/Illustrations';
import { useAuth } from '@/lib/auth';
import { EASE, SPRING } from '@/lib/motion';
import { applyEdition, sweepTheme, useWorkspace } from '@/lib/workspace';
import { Avatar } from '@/ui/Primitives';
import { PageSkeleton } from '@/ui/States';
import { CommandPalette } from './CommandPalette';
import { QuickAdd } from './QuickAdd';
import { navFor, type NavItem } from './nav';

const EDITION_ICON: Record<Edition, typeof House> = { home: House, people: Building2, supply: PackageSearch };

export function AppShell() {
  const { workspace, edition, path, live } = useWorkspace();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const items = navFor(edition, workspace.myRole);

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-dvh">
      <div className="wash" aria-hidden />
      <a href="#main" className="sr-only z-[100] rounded-full bg-white px-4 py-2 font-semibold shadow-card focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>

      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line/80 bg-white/90 backdrop-blur-xl lg:flex">
        <SidebarContent items={items} onSearch={() => setPalette(true)} />
      </aside>

      <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line/70 bg-white/80 px-4 backdrop-blur-xl lg:hidden">
        <NavLink to={path()} className="flex min-w-0 items-center gap-2.5">
          <Logo size={34} />
          <span className="truncate font-semibold tracking-tight">{workspace.name}</span>
        </NavLink>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPalette(true)} aria-label="Search" className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-brand-50">
            <Search aria-hidden className="size-5" />
          </button>
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer} className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-brand-50">
            <MenuIcon aria-hidden className="size-5" />
          </button>
        </div>
      </header>

      <Drawer open={drawer} onClose={() => setDrawer(false)}>
        <SidebarContent items={items} onSearch={() => setPalette(true)} onClose={() => setDrawer(false)} />
      </Drawer>

      <main id="main" className="lg:pl-sidebar">
        <div className="mx-auto max-w-content px-4 pb-32 pt-6 sm:px-8 sm:pt-8 lg:pb-16">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </div>
      </main>

      <TabBar items={items.filter((item) => item.primary).slice(0, 4)} />
      <QuickAdd />
      <CommandPalette open={palette} onClose={() => setPalette(false)} items={items} />
      <span className="sr-only" aria-live="polite">
        {live ? 'Live updates on' : ''}
      </span>
    </div>
  );
}

function SidebarContent({ items, onSearch, onClose }: { items: NavItem[]; onSearch: () => void; onClose?: () => void }) {
  const { path, live } = useWorkspace();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
        <WorkspaceSwitcher />
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close menu" className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-brand-50">
            <X aria-hidden className="size-5" />
          </button>
        )}
      </div>

      <button type="button" onClick={onSearch} className="mx-5 mb-2 flex h-10 items-center gap-2.5 rounded-2xl border border-line bg-canvas/70 px-3.5 text-[13.5px] text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700">
        <Search aria-hidden className="size-4" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden rounded-md border border-line bg-white px-1.5 text-[11px] font-semibold text-ink-soft sm:inline">Ctrl K</kbd>
      </button>

      <p className="px-6 pb-1.5 pt-3 text-[12px] font-semibold text-ink-soft">Menu</p>
      <nav aria-label="Main" className="scroll-thin flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {items.map((item) => (
          <NavLink key={item.to} to={path(item.to)} end={item.to === ''} className="group relative block rounded-2xl outline-offset-[-2px]">
            {({ isActive }) => (
              <span className={clsx('relative flex items-center gap-3 rounded-2xl px-2.5 py-2 text-[14px] font-semibold transition-colors', isActive ? 'text-white' : 'text-ink-muted group-hover:bg-brand-50 group-hover:text-brand-700')}>
                {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-2xl bg-brand-600 shadow-glow" transition={SPRING} />}
                <span className={clsx('tile relative size-8 transition-colors', isActive ? 'bg-white/15' : 'bg-canvas group-hover:bg-white')}>
                  <item.icon aria-hidden className="size-[17px]" />
                </span>
                <span className="relative truncate">{item.label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line/70 p-3">
        <UserCard live={live} />
      </div>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { workspace, edition } = useWorkspace();
  const { workspaces } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const Icon = EDITION_ICON[edition];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const go = (target: WorkspaceDTO, event: React.MouseEvent) => {
    setOpen(false);
    if (target.id === workspace.id) return;
    sweepTheme({ x: event.clientX, y: event.clientY }, () => {
      applyEdition(target.edition);
      navigate(`/w/${target.id}`);
    });
  };

  return (
    <div ref={root} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full min-w-0 items-center gap-3 rounded-2xl p-1.5 text-left transition-colors hover:bg-brand-50"
      >
        <Logo size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight">{workspace.name}</span>
          <span className="flex items-center gap-1 truncate text-[12px] text-ink-soft">
            <Icon aria-hidden className="size-3" />
            {EDITION_INFO[edition].name}
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-soft" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="Workspaces"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
            transition={SPRING}
            className="absolute left-0 right-0 top-full z-50 mt-2 origin-top rounded-2xl border border-line/70 bg-white p-1.5 shadow-lift"
          >
            <p className="px-3 pb-1 pt-1.5 text-[12px] font-semibold text-ink-soft">Your workspaces</p>
            {(workspaces ?? []).map((item) => {
              const ItemIcon = EDITION_ICON[item.edition];
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={item.id === workspace.id}
                  onClick={(event) => go(item, event)}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-brand-50"
                >
                  <span data-edition={item.edition} className="tile size-9 text-white" style={{ backgroundImage: 'var(--gradient-brand)' }}>
                    <ItemIcon aria-hidden className="size-[17px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{item.name}</span>
                    <span className="block truncate text-[12px] text-ink-soft">{EDITION_INFO[item.edition].name}</span>
                  </span>
                  {item.id === workspace.id && <Check aria-hidden className="size-4 text-brand-600" />}
                </button>
              );
            })}
            <button type="button" onClick={() => navigate('/new')} className="mt-1 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] font-semibold text-brand-700 transition-colors hover:bg-brand-50">
              <span className="tile size-9 border border-dashed border-brand-300">
                <Plus aria-hidden className="size-4" />
              </span>
              New workspace
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserCard({ live }: { live: boolean }) {
  const { user, signOut } = useAuth();
  const { path } = useWorkspace();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-canvas/80 p-2.5">
      <span className="relative">
        <Avatar name={user.name} src={user.avatarUrl} size={38} />
        <span aria-hidden className={clsx('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white', live ? 'bg-mint-500' : 'bg-line')} />
      </span>
      <button type="button" onClick={() => navigate(path('settings'))} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-semibold leading-tight">{user.name}</span>
        <span className="block truncate text-[12px] text-ink-soft">{live ? 'Live' : user.email}</span>
      </button>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          navigate('/login');
        }}
        aria-label="Sign out"
        title="Sign out"
        className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-white hover:text-coral-600"
      >
        <LogOut aria-hidden className="size-[17px]" />
      </button>
    </div>
  );
}

function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('a,button')?.focus(), 40);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div aria-hidden className="absolute inset-0 bg-brand-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={SPRING}
            className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] bg-white shadow-lift"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function TabBar({ items }: { items: NavItem[] }) {
  const { path } = useWorkspace();
  return (
    <nav aria-label="Shortcuts" className="no-print fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-30 lg:hidden">
      <div className="mx-auto flex max-w-[460px] items-center justify-around rounded-[26px] border border-line/70 bg-white/92 px-2 py-1.5 shadow-lift backdrop-blur-xl">
        {items.map((item) => (
          <NavLink key={item.to} to={path(item.to)} end={item.to === ''} className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5">
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tab-active" className="absolute inset-0 rounded-2xl bg-brand-50" transition={SPRING} />}
                <item.icon aria-hidden className={clsx('relative size-[21px] transition-colors', isActive ? 'text-brand-600' : 'text-ink-soft')} />
                <span className={clsx('relative max-w-full truncate text-[10.5px] font-semibold', isActive ? 'text-brand-700' : 'text-ink-soft')}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <span className="w-14 shrink-0" aria-hidden />
      </div>
    </nav>
  );
}

export { SettingsIcon, UserRound };
