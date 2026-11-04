import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { PublicConfig, UserDTO, WorkspaceDTO } from '@harmony/shared';
import { api, post } from './api';

interface AuthValue {
  user: UserDTO | null;
  loading: boolean;
  config: PublicConfig | undefined;
  workspaces: WorkspaceDTO[] | undefined;
  workspacesLoading: boolean;
  setUser(user: UserDTO | null): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: UserDTO | null }>('/auth/me'), staleTime: 60_000, retry: 1 });
  const config = useQuery({ queryKey: ['config'], queryFn: () => api<PublicConfig>('/auth/config'), staleTime: Infinity });
  const user = me.data?.user ?? null;

  const workspaces = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: () => api<{ workspaces: WorkspaceDTO[] }>('/workspaces'),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const setUser = useCallback(
    (next: UserDTO | null) => {
      client.setQueryData(['me'], { user: next });
      if (!next) client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' && query.queryKey[0] !== 'config' });
    },
    [client],
  );

  const signOut = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    setUser(null);
  }, [setUser]);

  useEffect(() => {
    // Any request answered with "sign in to continue" means this session has ended.
    const onSignedOut = () => {
      if (client.getQueryData<{ user: UserDTO | null }>(['me'])?.user) setUser(null);
    };
    window.addEventListener('harmony:signed-out', onSignedOut);
    return () => window.removeEventListener('harmony:signed-out', onSignedOut);
  }, [client, setUser]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading: me.isLoading,
      config: config.data,
      workspaces: workspaces.data?.workspaces,
      workspacesLoading: workspaces.isLoading,
      setUser,
      signOut,
    }),
    [user, me.isLoading, config.data, workspaces.data, workspaces.isLoading, setUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
