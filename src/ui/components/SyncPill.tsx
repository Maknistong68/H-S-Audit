import { syncStatus } from '../../sync/status';
import { useStore } from '../hooks/useStore';
import { Icon } from './icons';
import { toast } from './toast';

/** Offline · Syncing (n) · Up to date · Problem. Tapping a problem shows what went wrong. */
export function SyncPill() {
  const status = useStore(syncStatus);
  const label =
    status.kind === 'offline' ? 'Offline' : status.kind === 'syncing' ? `Syncing${status.pending > 0 ? ` (${status.pending})` : ''}` : status.kind === 'synced' ? 'Up to date' : 'Problem';
  const detail =
    status.kind === 'offline' && status.pending > 0
      ? `${status.pending} change${status.pending === 1 ? '' : 's'} waiting for a connection`
      : status.kind === 'problem'
        ? status.message
        : undefined;
  return (
    <button
      type="button"
      class={`sync-pill is-${status.kind}`}
      role="status"
      aria-label={`Sync status: ${label}${detail ? `. ${detail}` : ''}`}
      title={detail}
      onClick={() => detail && toast(detail, { durationMs: 8000 })}
    >
      <Icon name={status.kind === 'synced' ? 'check' : status.kind === 'problem' ? 'warning' : 'sync'} size={14} />
      <span>{label}</span>
    </button>
  );
}
