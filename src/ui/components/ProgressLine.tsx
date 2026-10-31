export function ProgressLine({ answered, flagged, total }: { answered: number; flagged: number; total: number }) {
  return (
    <div class="progress-line">
      <span>
        {answered} / {total} answered{flagged > 0 ? ` · ${flagged} flagged` : ''}
      </span>
      <progress value={answered} max={total} aria-label="Audit progress" />
    </div>
  );
}
