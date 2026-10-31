import { useState } from 'preact/hooks';
import type { Snapshot, SnapshotReason } from '../../db/db';
import { restoreSnapshot, takeSnapshot } from '../../db/snapshots';
import { Sheet } from './Sheet';
import { toast } from './toast';

const REASON_LABEL: Record<SnapshotReason, string> = {
  timer: 'Automatic',
  navigation: 'Leaving Walk',
  manual: 'Manual',
  'before-restore': 'Before a restore',
  'before-import': 'Imported',
};

export function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function SnapshotList({ auditId, snapshots }: { auditId: string; snapshots: Snapshot[] }) {
  const [confirm, setConfirm] = useState<Snapshot | null>(null);

  async function restore() {
    if (!confirm) return;
    try {
      await restoreSnapshot(confirm.id);
      toast(`Restored the snapshot from ${formatWhen(confirm.createdAt)}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not restore the snapshot', { durationMs: 6000 });
    }
    setConfirm(null);
  }

  return (
    <section class="findings-section">
      <div class="section-head">
        <h2>Snapshots</h2>
        <button type="button" class="btn btn-sm" onClick={() => void takeSnapshot(auditId, 'manual').then(() => toast('Snapshot taken'))}>
          Take snapshot now
        </button>
      </div>
      <p class="muted small">Restore points taken every 15 minutes while you work and whenever you leave Walk. The last 40 are kept.</p>
      {snapshots.length === 0 ? (
        <p class="empty">No snapshots yet.</p>
      ) : (
        <ul class="list snapshot-list">
          {snapshots.map((s) => (
            <li key={s.id} class="snapshot-row">
              <span>
                <strong>{formatWhen(s.createdAt)}</strong>
                <span class="muted"> · {REASON_LABEL[s.reason]}</span>
              </span>
              <button type="button" class="btn btn-sm" onClick={() => setConfirm(s)}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={confirm !== null} title="Restore snapshot" onClose={() => setConfirm(null)}>
        {confirm && (
          <p>
            Replace the current answers, notes and positive observations with the snapshot from <strong>{formatWhen(confirm.createdAt)}</strong>? The current state is saved as a
            snapshot first, so this can be undone. Photos and memos are kept.
          </p>
        )}
        <div class="actions-row">
          <button type="button" class="btn btn-primary" onClick={restore}>
            Restore this snapshot
          </button>
          <button type="button" class="btn btn-ghost" onClick={() => setConfirm(null)}>
            Keep current
          </button>
        </div>
      </Sheet>
    </section>
  );
}
