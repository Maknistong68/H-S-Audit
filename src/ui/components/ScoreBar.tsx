export const pct = (ratio: number | null): string => (ratio === null ? 'N/A' : `${Math.round(ratio * 100)}%`);

export function ScoreBar({ label, ratio, detail, indent = false }: { label: string; ratio: number | null; detail: string; indent?: boolean }) {
  const width = ratio === null ? 0 : Math.round(ratio * 100);
  const tone = ratio === null ? 'na' : ratio >= 0.9 ? 'full' : ratio >= 0.6 ? 'partial' : 'no';
  return (
    <div class={`score-row${indent ? ' indent' : ''}`}>
      <div class="score-head">
        <span class="score-label">{label}</span>
        <span class="score-detail muted">{detail}</span>
        <span class={`score-pct tone-${tone}`}>{pct(ratio)}</span>
      </div>
      <div class="score-track" role="img" aria-label={`${label}: ${pct(ratio)}`}>
        <div class={`score-fill tone-${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
