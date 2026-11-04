import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Logo } from '@/art/Illustrations';
import { useAuth } from '@/lib/auth';
import { STATIC_DEMO } from '@/lib/platform';
import { WorkspaceProvider } from '@/lib/workspace';
import { AppShell } from '@/shell/AppShell';
import { LinkButton } from '@/ui/Button';
import { PageSkeleton } from '@/ui/States';

const Login = lazy(() => import('@/pages/auth/Login'));
const Signup = lazy(() => import('@/pages/auth/Account').then((module) => ({ default: module.Signup })));
const Forgot = lazy(() => import('@/pages/auth/Account').then((module) => ({ default: module.Forgot })));
const Reset = lazy(() => import('@/pages/auth/Account').then((module) => ({ default: module.Reset })));
const GoogleDemo = lazy(() => import('@/pages/auth/Account').then((module) => ({ default: module.GoogleDemo })));
const Invite = lazy(() => import('@/pages/auth/Account').then((module) => ({ default: module.Invite })));
const Start = lazy(() => import('@/pages/Start').then((module) => ({ default: module.Start })));
const NewWorkspace = lazy(() => import('@/pages/Start').then((module) => ({ default: module.NewWorkspace })));
const Board = lazy(() => import('@/pages/Board'));
const Dashboard = lazy(() => import('@/pages/dashboard/Dashboard'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Items = lazy(() => import('@/pages/Items'));
const Restock = lazy(() => import('@/pages/Restock'));
const Requests = lazy(() => import('@/pages/Requests'));
const Orders = lazy(() => import('@/pages/Orders'));
const OrderDetail = lazy(() => import('@/pages/Orders').then((module) => ({ default: module.OrderDetail })));
const Suppliers = lazy(() => import('@/pages/Suppliers'));
const Meals = lazy(() => import('@/pages/Meals'));
const Month = lazy(() => import('@/pages/Month'));
const Spending = lazy(() => import('@/pages/Spending'));
const Checklists = lazy(() => import('@/pages/Checklists'));
const People = lazy(() => import('@/pages/People'));
const Settings = lazy(() => import('@/pages/Settings'));

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" role="status" aria-label="Loading">
      <span className="animate-pulse">
        <Logo size={56} />
      </span>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
      <div>
        <p className="banner-title text-brand-600">404</p>
        <h1 className="page-title mt-3">There’s nothing at this address</h1>
        <p className="mt-2 text-ink-muted">The link may be old, or the page was moved.</p>
        <LinkButton to="/" className="mt-6">
          Go home
        </LinkButton>
      </div>
    </div>
  );
}

// GitHub Pages can't route deep links to the app, so the demo keeps its routes after the #.
const Router = STATIC_DEMO ? HashRouter : BrowserRouter;

export function App() {
  return (
    <Router>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/reset/:token" element={<Reset />} />
          <Route path="/auth/google-demo" element={<GoogleDemo />} />
          <Route path="/invite/:token" element={<Invite />} />
          <Route path="/board/:token" element={<Board />} />
          <Route path="/" element={<RequireAuth><Start /></RequireAuth>} />
          <Route path="/new" element={<RequireAuth><NewWorkspace /></RequireAuth>} />
          <Route
            path="/w/:wid"
            element={
              <RequireAuth>
                <WorkspaceProvider>
                  <AppShell />
                </WorkspaceProvider>
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="items" element={<Items />} />
            <Route path="restock" element={<Restock />} />
            <Route path="requests" element={<Requests />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:orderId" element={<OrderDetail />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="meals" element={<Meals />} />
            <Route path="month" element={<Month />} />
            <Route path="spending" element={<Spending />} />
            <Route path="checklists" element={<Checklists />} />
            <Route path="people" element={<People />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Suspense fallback={<PageSkeleton />}><NotFound /></Suspense>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
