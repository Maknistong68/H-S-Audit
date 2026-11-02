import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Contractor, Member } from '../db/db';
import type { Change, RemoteRow, SyncTable } from '../sync/types';
import { RemoteError } from './errors';
import type { ChannelHandlers, PresenceState, Remote } from './remote';

const TABLES: SyncTable[] = ['hs_audits', 'hs_answers', 'hs_positives', 'hs_photos'];
export const PHOTO_BUCKET = 'hs-photos';

/** The argument of the SQL function hs_apply(changes jsonb). */
export function toRpcChanges(changes: Change[]): unknown {
  return changes.map((c) => ({ table: c.table, key: c.key, fields: c.fields, at: c.at }));
}

/** A row from a `realtime.broadcast_changes` message. */
export function rowFromBroadcast(payload: { operation: string; table: string; record: Record<string, unknown> | null }): { table: SyncTable; row: RemoteRow } | null {
  if (!payload.record || !TABLES.includes(payload.table as SyncTable)) return null;
  return { table: payload.table as SyncTable, row: payload.record as RemoteRow };
}

/** Every transport error becomes one of the kinds the engine and the screens react to. */
export function classify(error: { code?: string; status?: number; statusCode?: string | number; message: string }): RemoteError {
  const message = error.message || 'Request failed';
  const status = Number(error.status ?? error.statusCode ?? NaN);
  const code = error.code ?? '';
  if (code === 'PGRST301' || code.startsWith('invalid_credentials') || code === 'refresh_token_not_found' || status === 401) return new RemoteError('auth', message);
  if (code === '42501' || status === 403) return new RemoteError('permission', message);
  if (code === 'P0001' || code === '22P02' || code === '23514' || status === 404 || status === 400) return new RemoteError('validation', message);
  if (/failed to fetch|load failed|network|fetch failed/i.test(message) || status === 0) return new RemoteError('network', message);
  return new RemoteError('unknown', message);
}

type Result<T> = { data: T | null; error: { message: string; code?: string; status?: number; statusCode?: string | number } | null };

function unwrap<T>(result: Result<T>): T {
  if (result.error) throw classify(result.error);
  return result.data as T;
}

async function call<T>(fn: () => PromiseLike<Result<T>>): Promise<T> {
  try {
    return unwrap(await fn());
  } catch (err) {
    if (err instanceof RemoteError) throw err;
    throw classify({ message: err instanceof Error ? err.message : String(err) });
  }
}

export function createSupabaseRemote(client: SupabaseClient): Remote {
  const channels = new Map<string, RealtimeChannel>();

  return {
    async apply(changes) {
      const data = await call<{ applied: number; skipped: number }>(() => client.rpc('hs_apply', { changes: toRpcChanges(changes) }));
      return { applied: data?.applied ?? 0, skipped: data?.skipped ?? 0 };
    },

    async pull(table, since, limit) {
      let query = client.from(table).select('*').order('server_at', { ascending: true }).limit(limit);
      if (since !== null) query = query.gt('server_at', since);
      return (await call<RemoteRow[]>(() => query)) ?? [];
    },

    async uploadPhoto(path, data) {
      const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, new Blob([data], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: false });
      if (!error) return;
      const status = Number((error as { statusCode?: string | number }).statusCode ?? (error as { status?: number }).status ?? NaN);
      if (status === 409 || /already exists|duplicate/i.test(error.message)) return; // the file is there: good enough
      throw classify(error as { message: string; statusCode?: string | number });
    },

    async downloadPhoto(path) {
      const blob = await call<Blob>(() => client.storage.from(PHOTO_BUCKET).download(path));
      return blob.arrayBuffer();
    },

    async directory() {
      const rows = (await call<{ id: string; email: string; full_name: string | null; role: Member['role']; confirmed: boolean }[]>(() => client.rpc('hs_team_directory'))) ?? [];
      return rows.map((r) => ({ id: r.id, email: r.email, fullName: r.full_name, role: r.role, confirmed: !!r.confirmed }));
    },

    async contractors() {
      const rows = (await call<{ id: string; name: string; contract_no: string | null }[]>(() => client.rpc('hs_contractors'))) ?? [];
      return rows.map((r): Contractor => ({ id: r.id, name: r.name, ...(r.contract_no ? { contractNo: r.contract_no } : {}) }));
    },

    subscribe(topic, handlers, presence) {
      const channel = client.channel(topic, { config: { private: true, presence: { key: presence?.userId ?? 'anon', enabled: true } } });
      const onBroadcast = (message: { [key: string]: unknown }) => {
        const payload = message.payload as { operation: string; table: string; record: Record<string, unknown> | null } | undefined;
        const parsed = payload ? rowFromBroadcast(payload) : null;
        if (parsed) handlers.onRow(parsed.table, parsed.row);
      };
      channel.on('broadcast', { event: 'INSERT' }, onBroadcast);
      channel.on('broadcast', { event: 'UPDATE' }, onBroadcast);
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const others = Object.values(state)
          .flat()
          .filter((p) => p.userId && p.userId !== presence?.userId)
          .map((p) => ({ userId: p.userId, name: p.name, itemId: p.itemId ?? null, at: p.at }));
        handlers.onPresence?.(others);
      });
      channels.set(topic, channel);
      void client.realtime.setAuth().then(() => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            handlers.onStatus('subscribed');
            if (presence) void channel.track(presence);
          } else if (status === 'CLOSED') handlers.onStatus('closed');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handlers.onStatus('error');
        });
      });
      return () => {
        channels.delete(topic);
        void client.removeChannel(channel);
      };
    },

    track(topic, presence) {
      const channel = channels.get(topic);
      if (channel) void channel.track(presence);
    },
  };
}
