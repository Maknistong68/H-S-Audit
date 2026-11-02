/** The four server tables the app writes to; names are the Postgres table names. */
export type SyncTable = 'hs_audits' | 'hs_answers' | 'hs_positives' | 'hs_photos';

/** One field-level patch: `fields` are server column names, `at` is the writing device's epoch ms. */
export interface Change {
  table: SyncTable;
  key: Record<string, string>;
  fields: Record<string, unknown>;
  at: number;
}

/** A queued change waiting to reach the server. `kind: 'photo'` uploads the file before sending its row. */
export interface OutboxEntry {
  seq?: number;
  kind: 'patch' | 'photo';
  table: SyncTable;
  /** rowKey(table, change.key) */
  key: string;
  auditId: string;
  change: Change;
  attempts: number;
  lastError?: string;
}

/** A row in server shape (snake_case columns plus the sync columns). */
export type RemoteRow = Record<string, unknown> & {
  updated_at: number;
  updated_by?: string;
  field_at: Record<string, number>;
  server_at?: string;
};
