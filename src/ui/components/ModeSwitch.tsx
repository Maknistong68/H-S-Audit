import type { WalkMode } from '../walk/walkState';

const MODES: { value: WalkMode; label: string }[] = [
  { value: 'sequence', label: 'Sequence' },
  { value: 'area', label: 'Area' },
  { value: 'search', label: 'Search' },
];

/** Three tabs with one sliding thumb (transform only). */
export function ModeSwitch({ value, onChange }: { value: WalkMode; onChange(mode: WalkMode): void }) {
  const index = Math.max(0, MODES.findIndex((m) => m.value === value));
  return (
    <div class="mode-switch" role="tablist" aria-label="Walk mode">
      <span class="mode-thumb" aria-hidden="true" style={{ transform: `translateX(${index * 100}%)` }} />
      {MODES.map((m) => (
        <button key={m.value} type="button" role="tab" aria-selected={value === m.value} class={value === m.value ? 'active' : ''} onClick={() => onChange(m.value)}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
