import { useState } from 'preact/hooks';
import { buildBackup } from '../../db/backup';
import type { Snapshot } from '../../db/db';
import { repo } from '../../db/repo';
import { listSnapshots } from '../../db/snapshots';
import { preflight, type PreflightIssue } from '../../export/preflight';
import { BottomNav } from '../components/BottomNav';
import { PreflightList } from '../components/PreflightList';
import { Sheet } from '../components/Sheet';
import { SnapshotList } from '../components/SnapshotList';
import { toast } from '../components/toast';
import { TopBar } from '../components/TopBar';
import { saveOrShare } from '../download';
import { useAudit } from '../hooks/useAudit';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { paths } from '../paths';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type Kind = 'excel' | 'backup';

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function Export({ id }: { id: string }) {
  const view = useAudit(id);
  const snapshots = useLiveQuery<Snapshot[]>(() => listSnapshots(id), [id]);
  const [pending, setPending] = useState<{ kind: Kind; issues: PreflightIssue[] } | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const audit = view?.audit;

  async function run(kind: Kind) {
    setBusy(kind);
    try {
      if (kind === 'excel') {
        const { exportExcel } = await import('../../export/excel'); // ExcelJS is large; load it only when exporting
        const { bytes, filename } = await exportExcel(id);
        const how = await saveOrShare(bytes, filename, XLSX_MIME);
        toast(how === 'shared' ? 'Excel shared' : `Saved ${filename}`);
      } else {
        const { bytes, filename } = await buildBackup(id);
        const how = await saveOrShare(bytes, filename, 'application/zip');
        toast(how === 'shared' ? 'Backup shared' : `Saved ${filename}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed — try again', { durationMs: 8000 });
    } finally {
      setBusy(null);
    }
  }

  function request(kind: Kind) {
    if (!audit || !view) return;
    const issues = preflight(audit, view.answers);
    if (issues.length === 0) void run(kind);
    else setPending({ kind, issues });
  }

  if (view && !audit) {
    return (
      <>
        <TopBar title="Export" back={paths.home()} />
        <main class="screen">
          <p class="empty">
            This audit no longer exists. <a href={paths.home()}>Back to audits</a>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Export" back={paths.home()} subtitle={audit?.header.auditNo || 'Untitled audit'} />
      <main class="screen has-nav">
        {audit && (
          <section class="card export-card">
            <div class="export-status">
              <span class={`chip chip-${audit.status}`}>{audit.status === 'final' ? 'Final' : audit.status === 'archived' ? 'Archived' : 'Draft'}</span>
              <span class="muted">{audit.lastExportAt ? `Last exported ${relativeTime(audit.lastExportAt)}` : 'Never exported'}</span>
            </div>
            <div class="actions-row">
              <button type="button" class="btn btn-primary" disabled={busy !== null} onClick={() => request('excel')}>
                {busy === 'excel' ? 'Building Excel…' : 'Export Excel'}
              </button>
              <button type="button" class="btn" disabled={busy !== null} onClick={() => request('backup')}>
                {busy === 'backup' ? 'Building backup…' : 'Export backup'}
              </button>
            </div>
            <p class="muted small">
              Excel is the Book2-layout report with photos. The backup zip also holds the voice memos and can be re-opened in this app on another device.
            </p>
            <div class="actions-row">
              {audit.status === 'final' ? (
                <button type="button" class="btn btn-sm btn-ghost" onClick={() => void repo.setStatus(id, 'draft')}>
                  Back to draft
                </button>
              ) : (
                <button type="button" class="btn btn-sm btn-ghost" onClick={() => void repo.setStatus(id, 'final')}>
                  Mark as final
                </button>
              )}
            </div>
          </section>
        )}

        <SnapshotList auditId={id} snapshots={snapshots ?? []} />
      </main>

      <Sheet open={pending !== null} title="Before you export" onClose={() => setPending(null)}>
        {pending && <PreflightList issues={pending.issues} />}
        <div class="actions-row">
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              const kind = pending!.kind;
              setPending(null);
              void run(kind);
            }}
          >
            Export anyway
          </button>
          <button type="button" class="btn btn-ghost" onClick={() => setPending(null)}>
            Fix first
          </button>
        </div>
      </Sheet>

      <BottomNav auditId={id} />
    </>
  );
}
