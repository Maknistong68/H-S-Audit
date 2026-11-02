import { useState } from 'preact/hooks';
import { buildBackup } from '../../db/backup';
import type { Snapshot } from '../../db/db';
import { repo } from '../../db/repo';
import { listSnapshots } from '../../db/snapshots';
import { relativeTime } from '../../domain/time';
import { preflight, type PreflightIssue } from '../../export/preflight';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/icons';
import { PreflightList } from '../components/PreflightList';
import { Sheet } from '../components/Sheet';
import { SnapshotList } from '../components/SnapshotList';
import { toast } from '../components/toast';
import { TopBar } from '../components/TopBar';
import { saveOrShare } from '../download';
import { useAudit } from '../hooks/useAudit';
import { useAuditChannel } from '../hooks/useAuditChannel';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { paths } from '../paths';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type Kind = 'excel' | 'backup';

export function Export({ id }: { id: string }) {
  const view = useAudit(id);
  const { deletedBy } = useAuditChannel(id);
  const snapshots = useLiveQuery<Snapshot[]>(() => listSnapshots(id), [id]);
  const [pending, setPending] = useState<{ kind: Kind; issues: PreflightIssue[] } | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const audit = view?.audit;

  async function run(kind: Kind) {
    setBusy(kind);
    try {
      if (kind === 'excel') {
        const { exportExcel } = await import('../../export/excel'); // ExcelJS is large; load it only when exporting
        const { bytes, filename, missingPhotos } = await exportExcel(id, { onProgress: (done, total) => setProgress({ done, total }) });
        setProgress(null);
        const how = await saveOrShare(bytes, filename, XLSX_MIME);
        toast(how === 'shared' ? 'Excel shared' : `Saved ${filename}`);
        if (missingPhotos > 0) toast(`${missingPhotos} photo${missingPhotos === 1 ? ' was' : 's were'} not available offline; thumbnails were used`, { durationMs: 8000 });
      } else {
        const { server } = await import('../../server');
        const { bytes, filename, missingPhotos } = await buildBackup(id, { remote: server().remote, onProgress: (done, total) => setProgress({ done, total }) });
        setProgress(null);
        const how = await saveOrShare(bytes, filename, 'application/zip');
        toast(how === 'shared' ? 'Backup shared' : `Saved ${filename}`);
        if (missingPhotos > 0) toast(`${missingPhotos} photo${missingPhotos === 1 ? ' was' : 's were'} not available offline; thumbnails were used`, { durationMs: 8000 });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed — try again', { durationMs: 8000 });
    } finally {
      setBusy(null);
      setProgress(null);
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

  if (view?.audit?.deletedAt !== undefined || deletedBy) {
    return (
      <>
        <TopBar title="Export" back={paths.home()} />
        <main class="screen">
          <p class="empty" role="alert">
            This audit was deleted by {deletedBy ?? 'a teammate'}. Nothing you entered is lost; an admin can restore it. <a href={paths.home()}>Back to audits</a>
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
          <section class="panel">
            <div class="panel-head">
              <h2>Report</h2>
              <span class="status-text">
                {audit.status === 'final' ? 'Final' : audit.status === 'archived' ? 'Archived' : 'Draft'}
                {' · '}
                {audit.lastExportAt ? `Last exported ${relativeTime(audit.lastExportAt)}` : 'Never exported'}
              </span>
            </div>
            <div class="panel-body export-actions">
              <button type="button" class="btn btn-primary btn-block" disabled={busy !== null} onClick={() => request('excel')}>
                <Icon name="share" size={18} />
                {busy === 'excel' ? (progress && progress.done < progress.total ? `Downloading ${progress.total - progress.done} photo${progress.total - progress.done === 1 ? '' : 's'}…` : 'Building Excel…') : 'Export Excel'}
              </button>
              <p class="muted small">The Book2-layout workbook with photos, built on this phone. Share it to Teams or email, or save it.</p>
              <button type="button" class="btn btn-block" disabled={busy !== null} onClick={() => request('backup')}>
                <Icon name="archive" size={18} />
                {busy === 'backup' ? (progress && progress.done < progress.total ? `Downloading ${progress.total - progress.done} photo${progress.total - progress.done === 1 ? '' : 's'}…` : 'Building backup…') : 'Export backup'}
              </button>
              <p class="muted small">A zip with everything, including voice memos. Import backup on another phone or on the PC re-opens it.</p>
            </div>
            <div class="panel-note export-final">
              {audit.status === 'final' ? (
                <button type="button" class="btn btn-sm btn-quiet" onClick={() => void repo.setStatus(id, 'draft')}>
                  Back to draft
                </button>
              ) : (
                <button type="button" class="btn btn-sm btn-quiet" onClick={() => void repo.setStatus(id, 'final')}>
                  <Icon name="check" size={18} />
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
          <button type="button" class="btn btn-quiet" onClick={() => setPending(null)}>
            Fix first
          </button>
        </div>
      </Sheet>

      <BottomNav auditId={id} />
    </>
  );
}
