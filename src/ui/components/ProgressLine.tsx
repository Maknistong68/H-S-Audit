export function ProgressLine({ answered, flagged, total }: { answered: number; flagged: number; total: number }) {
  const ratio = total === 0 ? 0 : answered / total;
  return (
    <div class="progress-line">
      <span class="progress-text">
        <b>{answered}</b> / {total} answered{flagged > 0 ? ` · ${flagged} flagged` : ''}
      </span>
      <div class="progress-track" role="progressbar" aria-label="Audit progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
        <div class="progress-fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}
