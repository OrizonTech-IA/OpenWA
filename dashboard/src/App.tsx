import { useState, useEffect, useCallback, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { NumberCheckProvider } from './components/NumberCheckProvider';
import { useRole } from './hooks/useRole';
import { RoleProvider } from './components/RoleProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { API_BASE_URL } from './services/api';
import { clearActorState, isUserRole, resolveStartupValidation } from './utils/authLifecycle';
import { resolveRouterBasename } from './utils/routerBase';
import './App.css';

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Chats = lazy(() => import('./pages/Chats').then(m => ({ default: m.Chats })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));
const Templates = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then(m => ({ default: m.ApiKeys })));
const MessageTester = lazy(() => import('./pages/MessageTester').then(m => ({ default: m.MessageTester })));
const NumberChecker = lazy(() => import('./pages/NumberChecker').then(m => ({ default: m.NumberChecker })));
const Infrastructure = lazy(() => import('./pages/Infrastructure').then(m => ({ default: m.Infrastructure })));
const Plugins = lazy(() => import('./pages/Plugins'));
const Caio = lazy(() => import('./pages/Caio').then(m => ({ default: m.Caio })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function AppContent() {
  const routerBasename = resolveRouterBasename(window.location.pathname);
  // Capture the key ONCE at mount. Read live per render, the null→key transition when
  // handleLogin stores a fresh key would re-fire the startup re-validation effect below and
  // double the /auth/validate request on every sign-in — the effect is for genuine page
  // refreshes with a saved key only.
  // Account sessions under /platform use the gateway's HttpOnly cookie. A key left by the
  // legacy OpenWA login must never be reused there, or a second account in the same browser
  // tab would continue reading the previous account's sessions and chats.
  const [savedKey] = useState(() =>
    routerBasename === '/platform' ? null : sessionStorage.getItem('openwa_api_key'),
  );
  const [isAuthenticated, setIsAuthenticated] = useState(!!savedKey);
  const [isAccountSessionChecking, setIsAccountSessionChecking] = useState(() => routerBasename === '/platform' && !savedKey);
  const [, setApiKey] = useState(savedKey || '');
  const { setRole, role, setEngineType, setScoped, scoped } = useRole();

  useEffect(() => {
    if (routerBasename !== '/platform') return;
    sessionStorage.removeItem('openwa_api_key');
    sessionStorage.removeItem('openwa_user_role');
    sessionStorage.removeItem('openwa_engine_type');
    sessionStorage.removeItem('openwa_key_scoped');
  }, [routerBasename]);

  const handleLogin = (key: string, validatedRole?: string, engineType?: string, scoped = false) => {
    setApiKey(key);
    sessionStorage.setItem('openwa_api_key', key);

    // The login page's validate response already carried the role, so no second /auth/validate
    // round-trip is needed here. An absent or unrecognized role falls back to viewer, the
    // least-privileged default.
    setRole(isUserRole(validatedRole) ? validatedRole : 'viewer');
    setEngineType(engineType ?? null);
    setScoped(scoped);

    setIsAuthenticated(true);
  };

  const handleLogout = useCallback(() => {
    setApiKey('');
    setIsAuthenticated(false);
    setRole(null);
    setEngineType(null);
    setScoped(false);
    sessionStorage.removeItem('openwa_api_key');
    // Wipe the React Query cache too: it is keyed by resource, not actor, so without a full
    // clear a logout → login in the same tab with a different key/scope shows the previous
    // actor's sessions/messages/apiKeys/audit rows.
    clearActorState(queryClient);
    if (routerBasename === '/platform') {
      void fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).finally(() => {
        window.location.assign('/');
      });
    }
  }, [routerBasename, setRole, setEngineType, setScoped]);

  // Re-validate and refresh the role on mount if already authenticated
  useEffect(() => {
    // The account gateway authenticates `/platform` with its HttpOnly cookie. There is no
    // OpenWA API key for the browser to enter in that flow, so validate the account session
    // directly before mounting the dashboard instead of showing the legacy API-key login.
    if (!savedKey && routerBasename === '/platform') {
      fetch(`${API_BASE_URL}/auth/validate`, { method: 'POST', credentials: 'include' })
        .then(async res => {
          const decision = resolveStartupValidation(res.status, await res.json().catch(() => null));
          if (decision.action === 'role') {
            setRole(decision.role);
            setScoped(decision.scoped);
            if (decision.engineType) setEngineType(decision.engineType);
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
          }
        })
        .catch(() => setIsAuthenticated(false))
        .finally(() => setIsAccountSessionChecking(false));
      return;
    }

    setIsAccountSessionChecking(false);
    if (!savedKey) return;

    fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'POST',
      headers: { 'X-API-Key': savedKey },
    })
      .then(async res => {
        const decision = resolveStartupValidation(res.status, await res.json().catch(() => null));
        // Nothing cancels this request on logout. If the user has since signed out, or back in with
        // another key, the answer is about a key no longer in use: applying it would hand the new
        // session the old key's role, or log it out over the old key's 401.
        if (sessionStorage.getItem('openwa_api_key') !== savedKey) return;
        if (decision.action === 'logout') {
          handleLogout();
        } else if (decision.action === 'role') {
          setRole(decision.role);
          setScoped(decision.scoped);
          if (decision.engineType) setEngineType(decision.engineType);
        }
      })
      .catch(() => {
        // Network failure (API unreachable): keep the cached role so a transient outage at
        // page load doesn't eject the user — an explicit 401/403 above still logs out.
      });
  }, [savedKey, routerBasename, setRole, setEngineType, setScoped, handleLogout]);

  const loadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  if (isAccountSessionChecking) {
    return loadingFallback;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={loadingFallback}>
        <Login onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      {/* Above the routes, so a bulk Number Checker run survives leaving its page; a logout unmounts it. */}
      <NumberCheckProvider>
        <BrowserRouter basename={routerBasename}>
          <Suspense fallback={loadingFallback}>
            <Routes>
              <Route path="/" element={<Layout onLogout={handleLogout} userRole={role} />}>
                <Route index element={<Dashboard />} />
                <Route path="sessions" element={<Sessions />} />
                <Route path="chats" element={<Chats />} />
                <Route path="number-checker" element={<NumberChecker />} />
                <Route path="webhooks" element={<Webhooks />} />
                <Route path="templates" element={<Templates />} />
                {role === 'admin' && !scoped && <Route path="api-keys" element={<ApiKeys />} />}
                {role === 'admin' && <Route path="logs" element={<Logs />} />}
                <Route path="message-tester" element={<MessageTester />} />
                {role === 'admin' && !scoped && <Route path="infrastructure" element={<Infrastructure />} />}
                {role === 'admin' && !scoped && <Route path="plugins" element={<Plugins />} />}
                <Route path="caio" element={<Caio />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </NumberCheckProvider>
    </ToastProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <AppContent />
        </RoleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
