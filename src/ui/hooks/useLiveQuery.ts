import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/** Re-runs `querier` whenever the Dexie tables it read change. Undefined until the first result. */
export function useLiveQuery<T>(querier: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: (v) => setValue(v),
      error: (err) => console.error('live query failed', err),
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
