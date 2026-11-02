import type { ComponentChildren } from 'preact';
import { useLocation } from 'preact-iso';
import { useEffect } from 'preact/hooks';
import { env, serverConfigured } from '../server/env';
import { useStore } from '../ui/hooks/useStore';
import { paths, routes } from '../ui/paths';
import { NoRole } from '../ui/screens/NoRole';
import { sessionStore } from './session';

const OPEN_ROUTES = new Set([routes.signIn, routes.welcome, routes.reset]);

/** Decides what the app shows: the sign-in screens, "not in the team", or the audits. */
export function AuthGate(props: { children: ComponentChildren }) {
  const state = useStore(sessionStore);
  const { path, route } = useLocation();
  const open = OPEN_ROUTES.has(path.replace(/\/$/, '') || '/');

  useEffect(() => {
    if (state.status === 'signed-out' && !open) route(paths.signIn(), true);
  }, [state.status, open, route]);

  if (!serverConfigured() && !env.fake) {
    return (
      <main class="screen auth-screen">
        <h1 class="auth-title">HSE Audit</h1>
        <p class="empty">This build has no server configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY and build again.</p>
      </main>
    );
  }
  if (open) return <>{props.children}</>;
  if (state.status === 'loading') {
    return (
      <main class="screen auth-screen" aria-busy="true">
        <h1 class="auth-title">HSE Audit</h1>
      </main>
    );
  }
  if (state.status === 'signed-out') return null;
  if (state.status === 'no-role') return <NoRole email={state.email} />;
  return <>{props.children}</>;
}
