import type { PreflightIssue } from '../../export/preflight';

export function PreflightList({ issues }: { issues: PreflightIssue[] }) {
  const unanswered = issues.filter((i) => i.kind === 'unanswered');
  const noNote = issues.filter((i) => i.kind === 'no-note');
  const header = issues.filter((i) => i.kind === 'header');
  const groups = [
    { key: 'unanswered', title: `${unanswered.length} unanswered`, hint: 'Unanswered questions count as 0 points in the Excel.', items: unanswered },
    { key: 'no-note', title: `${noNote.length} without a note`, hint: 'No or Partial without an observation note.', items: noNote },
    { key: 'header', title: `${header.length} header field${header.length === 1 ? '' : 's'} empty`, hint: '', items: header },
  ].filter((g) => g.items.length > 0);
  return (
    <div class="preflight">
      {groups.map((g) => (
        <section key={g.key} class="preflight-group">
          <h3>{g.title}</h3>
          {g.hint && <p class="muted small">{g.hint}</p>}
          <p class="preflight-refs">{g.items.map((i) => i.label).join(', ')}</p>
        </section>
      ))}
    </div>
  );
}
