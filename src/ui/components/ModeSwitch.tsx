import type { WalkMode } from '../walk/walkState';

const MODES: { value: WalkMode; label: string }[] = [
  { value: 'sequence', label: 'Sequence' },
  { value: 'area', label: 'Area' },
  { value: 'search', label: 'Search' },
];

export function ModeSwitch({ value, onChange }: { value: WalkMode; onChange(mode: WalkMode): void }) {
  return (
    <div class="mode-switch" role="tablist" aria-label="Walk mode">
      {MODES.map((m) => (
        <button key={m.value} type="button" role="tab" aria-selected={value === m.value} class={value === m.value ? 'active' : ''} onClick={() => onChange(m.value)}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
