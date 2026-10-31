import { useLocation } from 'preact-iso';
import { useEffect, useState } from 'preact/hooks';
import type { AuditHeader as HeaderFields } from '../../db/db';
import { repo } from '../../db/repo';
import { useAudit } from '../hooks/useAudit';
import { paths } from '../paths';
import { Icon } from '../components/icons';
import { toast } from '../components/toast';
import { TopBar } from '../components/TopBar';

const FIELDS: { key: keyof HeaderFields; label: string; type?: string; wide?: boolean }[] = [
  { key: 'auditNo', label: 'Audit no' },
  { key: 'auditDate', label: 'Audit date', type: 'date' },
  { key: 'contractorWo', label: 'Contractor / WO', wide: true },
  { key: 'projectName', label: 'Project name', wide: true },
  { key: 'auditors', label: 'Auditors', wide: true },
  { key: 'contactNumber', label: 'Contact number', type: 'tel' },
];

export function AuditHeader({ id }: { id: string }) {
  const { route } = useLocation();
  const view = useAudit(id);
  const [form, setForm] = useState<HeaderFields | null>(null);
  const [inflight, setInflight] = useState(0);

  useEffect(() => {
    if (view?.audit && form === null) setForm(view.audit.header);
  }, [view?.audit, form]);

  function update(key: keyof HeaderFields, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setInflight((n) => n + 1);
    repo
      .updateHeader(id, { [key]: value })
      .catch(() => toast('Could not save — try again'))
      .finally(() => setInflight((n) => n - 1));
  }

  if (view && !view.audit) {
    return (
      <>
        <TopBar title="Audit header" back={paths.home()} />
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
      <TopBar title="Audit header" back={paths.home()} subtitle={form?.auditNo || 'New audit'} />
      <main class="screen">
        {form && (
          <form
            class="panel"
            onSubmit={(e) => {
              e.preventDefault();
              route(paths.walk(id));
            }}
          >
            <div class="panel-head">
              <h2>Audit details</h2>
              <span class="save-status" role="status">
                {inflight > 0 ? 'Saving…' : 'All changes saved'}
              </span>
            </div>
            <div class="panel-body field-grid">
              {FIELDS.map((f) => (
                <div class={`field${f.wide ? ' span-2' : ''}`} key={f.key}>
                  <label for={`hdr-${f.key}`}>{f.label}</label>
                  <input id={`hdr-${f.key}`} type={f.type ?? 'text'} value={form[f.key]} autocomplete="off" onInput={(e) => update(f.key, (e.currentTarget as HTMLInputElement).value)} />
                </div>
              ))}
            </div>
            <div class="panel-body panel-actions">
              <button type="submit" class="btn btn-primary btn-block">
                Start walk
                <Icon name="next" size={18} />
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
