import type { SupabaseClient } from '@supabase/supabase-js';
import type { Member, Role } from '../db/db';
import { BASE } from '../ui/paths';
import { RemoteError } from './errors';
import type { RemoteAuth, Session } from './remote';
import { classify } from './supabaseRemote';

const appUrl = (path: string) => `${window.location.origin}${BASE}${path}`;

function throwing(error: { message: string; code?: string; status?: number } | null): void {
  if (error) throw classify(error);
}

export function createSupabaseAuth(client: SupabaseClient): RemoteAuth {
  const userId = async (): Promise<string> => {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new RemoteError('auth', 'Not signed in');
    return data.session.user.id;
  };

  return {
    async session(): Promise<Session | null> {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      return user ? { userId: user.id, email: user.email ?? '' } : null;
    },

    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        cb(user ? { userId: user.id, email: user.email ?? '' } : null);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      throwing(error);
    },

    async signOut() {
      await client.auth.signOut();
    },

    async resetPassword(email) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/reset') });
      throwing(error);
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      throwing(error);
    },

    async updateName(fullName) {
      const { error } = await client.auth.updateUser({ data: { full_name: fullName } });
      throwing(error);
      const { error: rpcError } = await client.rpc('hs_set_my_name', { name: fullName });
      throwing(rpcError);
    },

    async me(): Promise<Member | null> {
      const { data: sessionData } = await client.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return null;
      const { data, error } = await client.from('profiles').select('id, email, full_name, role').eq('id', user.id).maybeSingle();
      throwing(error);
      if (!data) return null;
      return { id: data.id, email: data.email, fullName: data.full_name, role: data.role as Role | null, confirmed: !!user.email_confirmed_at };
    },

    async invite(email, role) {
      const { data, error } = await client.functions.invoke<{ status: 'invited' | 'exists'; error?: string }>('invite-user', { body: { email: email.trim().toLowerCase(), role } });
      if (error) {
        const context = (error as { context?: Response }).context;
        let message = error.message;
        let status: number | undefined;
        if (context) {
          status = context.status;
          try {
            message = ((await context.json()) as { error?: string }).error ?? message;
          } catch {
            /* not JSON */
          }
        }
        throw classify({ message, status });
      }
      return data?.status ?? 'invited';
    },

    async setRole(id, role) {
      await userId();
      const { error } = await client.from('profiles').update({ role }).eq('id', id);
      throwing(error);
    },

    async listInvites() {
      const { data, error } = await client.from('invites').select('email, role, created_at').order('created_at', { ascending: false });
      throwing(error);
      return (data ?? []).map((i) => ({ email: i.email, role: i.role as Role, createdAt: i.created_at }));
    },
  };
}
