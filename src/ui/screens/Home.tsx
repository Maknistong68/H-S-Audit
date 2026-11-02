import { useLocation } from 'preact-iso';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sessionStore } from '../../auth/session';
import { importBackup } from '../../db/backup';
import { PURGE_FALLBACK_WORD, repo, type AuditFilter, type AuditSummary } from '../../db/repo';
import { relativeTime } from '../../domain/time';
import { engine } from '../../sync/engine';
import { listLocalOnly, uploadAllLocal } from '../../sync/uploadLocal';
import { canEdit, isAdmin } from '../../sync/writer';
import { Icon } from '../components/icons';
import { ProgressRing } from '../components/ProgressRing';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/toast';
import { TopBar } from '../components/TopBar';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useStore } from '../hooks/useStore';
import { paths } from '../paths';

const STATUS_LABEL = { draft: 'Draft', final: 'Final', archived: 'Archived' } as const;
const FILTERS: { value: AuditFilter; label: string; adminOnly?: boolean }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'archived', label: 'Archived' },
  { value: 'deleted', label: 'Deleted', adminOnly: true },
];

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || 'No date';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function matchesQuery(a: AuditSummary, q: string): boolean {
  if (!q) return true;
  const hay = `${a.header.auditNo} ${a.header.projectName} ${a.header.contractorWo}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function Home() {
  const { route } = useLocation();
  const session = useStore(sessionStore);
  const me = session.status === 'ready' ? session.me : null;
  const editor = canEdit(me?.role);
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AuditSummary | null>(null);
  const [typed, setTyped] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const audits = useLiveQuery(() => repo.listAudits({ filter, me: me?.id }), [filter, me?.id]);
  const members = useLiveQuery(() => repo.listMembers(), []);
  const localOnly = useLiveQuery(() => listLocalOnly(), []);

  // Live audit-list rows while this screen is open.
  useEffect(() => engine.current?.watchList(), []);

  const nameOf = (id?: string): string => {
    if (!id) return 'Someone';
    if (id === me?.id) return 'you';
    const m = members?.find((x) => x.id === id);
    return m?.fullName || m?.email || 'Someone';
  };

  async function newAudit() {
    const audit = await repo.createAudit();
    void navigator.storage?.persist?.().catch(() => undefined);
    route(paths.header(audit.id));
  }

  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const { auditId, warnings } = await importBackup(new Uint8Array(await file.arrayBuffer()));
      toast(warnings.length ? `Imported with warnings: ${warnings.join(' ')}` : 'Backup imported as a new team audit', { durationMs: warnings.length ? 0 : 4000 });
      route(paths.walk(auditId));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The backup could not be imported', { durationMs: 0 });
    }
  }

  async function upload() {
    setUploading(true);
    try {
      const n = await uploadAllLocal();
      toast(n === 1 ? 'Uploaded 1 audit to the team' : `Uploaded ${n} audits to the team`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not upload', { durationMs: 0 });
    } finally {
      setUploading(false);
    }
  }

  const expectedWord = deleteTarget ? deleteTarget.header.auditNo.trim() || PURGE_FALLBACK_WORD : '';
  const canDelete = deleteTarget !== null && typed.trim() === expectedWord;

  async function remove() {
    if (!deleteTarget || !canDelete) return;
    try {
      await repo.deleteAudit(deleteTarget.id, typed);
      toast('Audit deleted for the team');
      setDeleteTarget(null);
      setTyped('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete the audit');
    }
  }

  const visible = (audits ?? []).filter((a) => matchesQuery(a, query.trim()));
  const pendingLocal = localOnly?.length ?? 0;

  return (
    <>
      <TopBar
        title="HSE Audit"
        right={
          <a href={paths.settings()} class="btn btn-quiet btn-sm topbar-link">
            <Icon name="settings" size={20} />
            Settings
          </a>
        }
      />
      <main class="screen">
        {editor && (
          <div class="actions-row home-actions">
            <button type="button" class="btn btn-primary" onClick={newAudit}>
              <Icon name="plus" size={18} />
              New audit
            </button>
            <button type="button" class="btn" onClick={() => fileInput.current?.click()}>
              <Icon name="import" size={18} />
              Import backup
            </button>
            <input ref={fileInput} type="file" accept=".zip,application/zip" class="visually-hidden" aria-label="Backup file" onChange={onImportFile} />
          </div>
        )}

        {editor && pendingLocal > 0 && (
          <section class="panel upload-card" role="status">
            <div class="panel-body">
              <p>
                <strong>
                  {pendingLocal} audit{pendingLocal === 1 ? '' : 's'} on this phone {pendingLocal === 1 ? 'is' : 'are'} not in the team yet.
                </strong>{' '}
                Upload {pendingLocal === 1 ? 'it' : 'them'} so everyone can see and continue {pendingLocal === 1 ? 'it' : 'them'}.
              </p>
              <button type="button" class="btn btn-primary btn-sm" disabled={uploading} onClick={upload}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </section>
        )}

        <div class="home-filters">
          <div class="filter-row" role="group" aria-label="Show">
            {FILTERS.filter((f) => !f.adminOnly || isAdmin(me?.role)).map((f) => (
              <button key={f.value} type="button" class="filter-btn" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          <div class="field search-field">
            <label for="home-search" class="visually-hidden">
              Search audits
            </label>
            <input id="home-search" type="search" placeholder="Search audit no or project" value={query} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
          </div>
        </div>

        {audits === undefined ? null : visible.length === 0 ? (
          <section class="panel">
            <p class="empty">
              {query.trim()
                ? 'No audits match that search.'
                : filter === 'all'
                  ? editor
                    ? 'No audits yet. Tap New audit to start one; the whole team will see it.'
                    : 'No audits yet.'
                  : filter === 'mine'
                    ? 'You have not created an audit yet.'
                    : filter === 'archived'
                      ? 'Nothing archived.'
                      : 'Nothing deleted.'}
            </p>
          </section>
        ) : (
          <section class="panel">
            <ul class="rows" aria-label="Audits">
              {visible.map((a) => (
                <li key={a.id} class="list-row audit-row">
                  <ProgressRing value={a.answered} total={a.total} size={40} />
                  <a href={a.header.auditNo ? paths.walk(a.id) : paths.header(a.id)} class="list-row-main">
                    <span class="list-row-title">{a.header.auditNo || 'Untitled audit'}</span>
                    <span class="list-row-meta">{a.header.projectName || a.header.contractorWo || 'No project yet'}</span>
                    <span class="audit-row-facts">
                      <span>{formatDate(a.header.auditDate)}</span>
                      <span class={`status-text${a.status === 'final' ? ' is-final' : ''}`}>{STATUS_LABEL[a.status]}</span>
                      {a.flagged > 0 && <span class="status-text">{a.flagged} flagged</span>}
                    </span>
                    <span class="audit-row-edited">
                      {a.activityAt ? `Edited by ${nameOf(a.activityBy)} · ${relativeTime(a.activityAt)}` : 'Not edited yet'}
                      {a.pending > 0 && (
                        <span class="audit-row-pending">
                          {' · '}
                          {a.pending} change{a.pending === 1 ? '' : 's'} waiting
                        </span>
                      )}
                    </span>
                  </a>
                  <div class="list-row-side">
                    <Icon name="chevron-right" size={20} class="row-chevron" />
                    {editor && filter === 'deleted' ? (
                      <button type="button" class="btn btn-sm btn-quiet" onClick={() => void repo.restoreAudit(a.id)}>
                        Restore
                      </button>
                    ) : editor ? (
                      <>
                        {a.status === 'archived' ? (
                          <button type="button" class="btn btn-sm btn-quiet" onClick={() => void repo.setStatus(a.id, 'draft')}>
                            Restore to drafts
                          </button>
                        ) : (
                          <button type="button" class="btn btn-sm btn-quiet" onClick={() => void repo.archiveAudit(a.id)}>
                            Archive
                          </button>
                        )}
                        <button
                          type="button"
                          class="btn btn-sm btn-danger"
                          onClick={() => {
                            setTyped('');
                            setDeleteTarget(a);
                          }}
                        >
                          Delete for the team…
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Sheet open={deleteTarget !== null} title="Delete for the team" onClose={() => setDeleteTarget(null)}>
        <p>The audit disappears for everyone on the team. An admin can restore it from the Deleted list.</p>
        <p>
          Type <strong>{expectedWord}</strong> to confirm.
        </p>
        <div class="field">
          <label for="delete-confirm">Type the audit number to confirm</label>
          <input id="delete-confirm" type="text" autocomplete="off" value={typed} onInput={(e) => setTyped((e.currentTarget as HTMLInputElement).value)} />
        </div>
        <div class="actions-row">
          <button type="button" class="btn btn-danger btn-primary" disabled={!canDelete} onClick={remove}>
            Delete for the team
          </button>
          <button type="button" class="btn btn-quiet" onClick={() => setDeleteTarget(null)}>
            Keep audit
          </button>
        </div>
      </Sheet>
    </>
  );
}
