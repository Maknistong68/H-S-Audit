import { useLocation } from 'preact-iso';
import { useRef, useState } from 'preact/hooks';
import { importBackup } from '../../db/backup';
import { PURGE_FALLBACK_WORD, repo, type AuditSummary } from '../../db/repo';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { paths } from '../paths';
import { ProgressRing } from '../components/ProgressRing';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/toast';
import { TopBar } from '../components/TopBar';

const STATUS_LABEL = { draft: 'Draft', final: 'Final', archived: 'Archived' } as const;

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || 'No date';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Home() {
  const { route } = useLocation();
  const [showArchived, setShowArchived] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<AuditSummary | null>(null);
  const [typed, setTyped] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const audits = useLiveQuery(() => repo.listAudits({ includeArchived: showArchived }), [showArchived]);

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
      toast(warnings.length ? `Imported with warnings: ${warnings.join(' ')}` : 'Backup imported as a new audit', { durationMs: warnings.length ? 0 : 4000 });
      route(paths.walk(auditId));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The backup could not be imported', { durationMs: 0 });
    }
  }

  const expectedWord = purgeTarget ? purgeTarget.header.auditNo.trim() || PURGE_FALLBACK_WORD : '';
  const canPurge = purgeTarget !== null && typed.trim() === expectedWord;

  async function purge() {
    if (!purgeTarget || !canPurge) return;
    try {
      await repo.purgeAudit(purgeTarget.id, typed);
      toast('Audit purged');
      setPurgeTarget(null);
      setTyped('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not purge the audit');
    }
  }

  return (
    <>
      <TopBar
        title="HSE Audit"
        right={
          <a href={paths.settings()} class="btn btn-ghost btn-sm topbar-link">
            Settings
          </a>
        }
      />
      <main class="screen">
        <div class="actions-row">
          <button type="button" class="btn btn-primary" onClick={newAudit}>
            New audit
          </button>
          <button type="button" class="btn" onClick={() => fileInput.current?.click()}>
            Import backup
          </button>
          <input ref={fileInput} type="file" accept=".zip,application/zip" class="visually-hidden" aria-label="Backup file" onChange={onImportFile} />
          <button type="button" class="btn btn-ghost" onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived}>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>

        {audits === undefined ? null : audits.length === 0 ? (
          <p class="empty">No audits yet. Tap <strong>New audit</strong> to start one, or import a backup.</p>
        ) : (
          <ul class="list" aria-label="Audits">
            {audits.map((a) => (
              <li key={a.id} class="card audit-row">
                <ProgressRing value={a.answered} total={a.total} />
                <a href={a.header.auditNo ? paths.walk(a.id) : paths.header(a.id)} class="audit-row-main">
                  <span class="audit-row-title">{a.header.auditNo || 'Untitled audit'}</span>
                  <span class="audit-row-meta">
                    {a.header.contractorWo || 'No contractor'} · {formatDate(a.header.auditDate)}
                  </span>
                  <span class={`chip chip-${a.status}`}>{STATUS_LABEL[a.status]}</span>
                  {a.flagged > 0 && <span class="chip chip-flag">{a.flagged} flagged</span>}
                </a>
                <div class="audit-row-actions">
                  {a.status === 'archived' ? (
                    <>
                      <button type="button" class="btn btn-sm" onClick={() => repo.setStatus(a.id, 'draft')}>
                        Restore to drafts
                      </button>
                      <button type="button" class="btn btn-sm btn-danger" onClick={() => { setTyped(''); setPurgeTarget(a); }}>
                        Purge…
                      </button>
                    </>
                  ) : (
                    <button type="button" class="btn btn-sm btn-ghost" onClick={() => repo.archiveAudit(a.id)}>
                      Archive
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Sheet open={purgeTarget !== null} title="Purge audit" onClose={() => setPurgeTarget(null)}>
        <p>
          This permanently deletes the audit, its notes, photos, memos and snapshots. It cannot be undone.
        </p>
        <p>
          Type <strong>{expectedWord}</strong> to confirm.
        </p>
        <div class="field">
          <label for="purge-confirm">Type the audit number to confirm</label>
          <input id="purge-confirm" type="text" autocomplete="off" value={typed} onInput={(e) => setTyped((e.currentTarget as HTMLInputElement).value)} />
        </div>
        <div class="actions-row">
          <button type="button" class="btn btn-danger" disabled={!canPurge} onClick={purge}>
            Purge permanently
          </button>
          <button type="button" class="btn btn-ghost" onClick={() => setPurgeTarget(null)}>
            Keep audit
          </button>
        </div>
      </Sheet>
    </>
  );
}
