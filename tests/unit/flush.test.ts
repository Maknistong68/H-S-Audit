import { test, expect, vi } from 'vitest';
import { schedulePendingWrite, flushPendingWrites, installFlushListeners } from '../../src/db/flush';

test('debounces per key and flushes on demand', async () => {
  vi.useFakeTimers();
  const calls: string[] = [];
  schedulePendingWrite('n:A1', async () => { calls.push('first'); });
  schedulePendingWrite('n:A1', async () => { calls.push('second'); });
  await vi.advanceTimersByTimeAsync(299);
  expect(calls).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toEqual(['second']);
  schedulePendingWrite('n:A2', async () => { calls.push('a2'); });
  await flushPendingWrites();
  expect(calls).toEqual(['second', 'a2']);
  await vi.advanceTimersByTimeAsync(1000);
  expect(calls).toEqual(['second', 'a2']);
  vi.useRealTimers();
});

test('visibilitychange to hidden flushes', async () => {
  const listeners: Record<string, () => void> = {};
  const win = {
    addEventListener: (n: string, f: () => void) => { listeners[n] = f; },
    document: { visibilityState: 'hidden' },
  } as unknown as Window;
  installFlushListeners(win);
  const calls: string[] = [];
  schedulePendingWrite('k', async () => { calls.push('x'); });
  listeners['visibilitychange']();
  await flushPendingWrites();
  expect(calls).toEqual(['x']);
});
