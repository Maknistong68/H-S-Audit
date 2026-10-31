import type { Result } from '../../domain/types';

export const RESULT_OPTIONS: { value: Result; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'partial', label: 'Partial' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
];

/** One connected segmented control; the chosen segment fills with its result colour. Tapping it again clears. */
export function ResultControl({ value, onChange }: { value?: Result; onChange(r: Result | undefined): void }) {
  return (
    <div class="seg" role="group" aria-label="Result">
      {RESULT_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          class={`seg-btn seg-${o.value}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? undefined : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
