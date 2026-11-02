import type { Contractor, Member, Role } from '../db/db';
import type { Change, RemoteRow, SyncTable } from '../sync/types';

export type { Contractor, Member, Role };

/** Who is in an audit right now and which question they have open. */
export interface PresenceState {
  userId: string;
  name: string;
  itemId: string | null;
  at: number;
}

export interface ChannelHandlers {
  onRow(table: SyncTable, row: RemoteRow): void;
  /** Everyone else on the channel. */
  onPresence?(others: PresenceState[]): void;
  onStatus(status: 'subscribed' | 'closed' | 'error'): void;
}

/** Everything the phone asks of the server; one implementation over Supabase, one in memory for tests. */
export interface Remote {
  apply(changes: Change[]): Promise<{ applied: number; skipped: number }>;
  /**
   * Rows of `table` changed after `sinceServerAt` (an ISO timestamp, or null for everything), ascending by
   * server_at. With `inclusive`, rows stamped exactly `sinceServerAt` are included too (page boundaries).
   */
  pull(table: SyncTable, sinceServerAt: string | null, limit: number, opts?: { inclusive?: boolean }): Promise<RemoteRow[]>;
  /** A duplicate upload (the file is already there) counts as success. */
  uploadPhoto(path: string, data: ArrayBuffer): Promise<void>;
  downloadPhoto(path: string): Promise<ArrayBuffer>;
  directory(): Promise<Member[]>;
  contractors(): Promise<Contractor[]>;
  /** Live rows (and presence) for a topic: `audit:<id>` or `team:audits`. Returns the unsubscribe function. */
  subscribe(topic: string, handlers: ChannelHandlers, presence?: PresenceState): () => void;
  track(topic: string, presence: PresenceState): void;
}

export interface Session {
  userId: string;
  email: string;
}

export interface RemoteAuth {
  session(): Promise<Session | null>;
  onChange(cb: (s: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Sends the reset email; its link opens the app's /reset screen. */
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateName(fullName: string): Promise<void>;
  /** The signed-in account's own profile, or null when there is no session or no profile. */
  me(): Promise<Member | null>;
  invite(email: string, role: Role): Promise<'invited' | 'exists'>;
  setRole(userId: string, role: Role | null): Promise<void>;
  listInvites(): Promise<{ email: string; role: Role; createdAt: string }[]>;
}
