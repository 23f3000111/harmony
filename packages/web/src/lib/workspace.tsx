import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { canManage, canSeeMoney, FEATURES, VOCABULARY, type Edition, type EditionFeatures, type Vocabulary, type WorkspaceDTO } from '@harmony/shared';
import { api, ApiError } from './api';
import { useToast } from '@/ui/Toast';
import { firstName } from './format';
import { subscribeLive } from './platform';
import { PageSkeleton } from '@/ui/States';

const THEME_COLOR: Record<Edition, string> = { home: '#526c40', people: '#96398e', supply: '#1f58e0' };

export function applyEdition(edition: Edition) {
  document.documentElement.dataset.edition = edition;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[edition]);
  try {
    localStorage.setItem('harmony:edition', edition);
  } catch {
    // Private windows can refuse storage. The theme is only a convenience here.
  }
}

/** Sweeps the new theme across the screen from where the person clicked. */
export function sweepTheme(origin: { x: number; y: number } | null, change: () => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = (document as Document & { startViewTransition?: (callback: () => void) => { ready: Promise<void> } }).startViewTransition;
  if (!start || reduced) {
    change();
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = start.call(document, change);
  void transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
}

interface WorkspaceValue {
  workspace: WorkspaceDTO;
  id: string;
  edition: Edition;
  vocab: Vocabulary;
  features: EditionFeatures;
  today: string;
  isManager: boolean;
  isOwner: boolean;
  showMoney: boolean;
  live: boolean;
  /** The address of a page inside this workspace. */
  path(to?: string): string;
  /** The API address of something inside this workspace. */
  url(to?: string): string;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { wid = '' } = useParams();
  const query = useQuery({
    queryKey: ['w', wid, 'workspace'],
    queryFn: () => api<{ workspace: WorkspaceDTO }>(`/w/${wid}`),
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });
  const workspace = query.data?.workspace;
  const live = useRealtime(wid, workspace?.myMemberId, Boolean(workspace));

  useEffect(() => {
    if (workspace) applyEdition(workspace.edition);
  }, [workspace?.edition]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<WorkspaceValue | null>(() => {
    if (!workspace) return null;
    return {
      workspace,
      id: workspace.id,
      edition: workspace.edition,
      vocab: VOCABULARY[workspace.edition],
      features: FEATURES[workspace.edition],
      today: workspace.today,
      isManager: canManage(workspace.myRole),
      isOwner: workspace.myRole === 'owner',
      showMoney: canSeeMoney(workspace.myRole),
      live,
      path: (to = '') => `/w/${workspace.id}${to ? `/${to}` : ''}`,
      url: (to = '') => `/w/${workspace.id}${to ? `/${to}` : ''}`,
    };
  }, [workspace, live]);

  if (query.error) return <Navigate to="/" replace />;
  if (!value) return <PageSkeleton />;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}

/** Listens for changes made by anyone, refreshes the affected screens and mentions what happened. */
function useRealtime(workspaceId: string, myMemberId: string | undefined, enabled: boolean) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [live, setLive] = useState(false);
  const me = useRef(myMemberId);
  me.current = myMemberId;

  useEffect(() => {
    if (!enabled) return;
    return subscribeLive(`/w/${workspaceId}/stream`, {
      onStatus: setLive,
      onChange: (event) => {
        for (const scope of event.scopes) void client.invalidateQueries({ queryKey: ['w', workspaceId, scope] });
        void client.invalidateQueries({ queryKey: ['w', workspaceId, 'month'] });
        if (event.summary && event.actorName && event.actorId !== me.current) {
          toast({ title: `${firstName(event.actorName)} ${event.summary}`, person: event.actorName, tone: 'live' });
        }
      },
    });
  }, [workspaceId, enabled, client, toast]);

  return live;
}

/** A read from this workspace. `scope` decides which live updates refresh it. */
export function useWQuery<T>(scope: string, path: string, options: Partial<UseQueryOptions<T>> = {}) {
  const { id } = useWorkspace();
  return useQuery<T>({
    queryKey: ['w', id, scope, path],
    queryFn: ({ signal }) => api<T>(`/w/${id}${path}`, { signal }),
    staleTime: 10_000,
    ...options,
  });
}

/** Refreshes the listed areas once a change has saved. */
export function useInvalidate() {
  const client = useQueryClient();
  const { id } = useWorkspace();
  return useCallback(
    (...scopes: string[]) => {
      for (const scope of [...scopes, 'dashboard', 'month', 'activity']) void client.invalidateQueries({ queryKey: ['w', id, scope] });
    },
    [client, id],
  );
}

/** A change to this workspace. The toast and error handling that every form would repeat live here. */
export function useWMutation<TInput = void, TResult = unknown>(options: {
  run: (input: TInput) => Promise<TResult>;
  scopes: string[];
  done?: string | ((result: TResult, input: TInput) => string | undefined);
  onDone?: (result: TResult, input: TInput) => void;
  silentErrors?: boolean;
}) {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  return useMutation<TResult, Error, TInput>({
    mutationFn: options.run,
    onSuccess: (result, input) => {
      invalidate(...options.scopes);
      const message = typeof options.done === 'function' ? options.done(result, input) : options.done;
      if (message) toast({ title: message, tone: 'success' });
      options.onDone?.(result, input);
    },
    onError: (error) => {
      if (!options.silentErrors) toast({ title: error.message, tone: 'error' });
    },
  });
}

export function useOpenParam(name = 'open') {
  const location = useLocation();
  const navigate = useNavigate();
  const value = new URLSearchParams(location.search).get(name);
  const clear = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete(name);
    navigate({ search: params.toString() }, { replace: true });
  }, [location.search, name, navigate]);
  return [value, clear] as const;
}
