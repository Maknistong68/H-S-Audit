import { test, expect, vi } from 'vitest';
import { fitWithin, processPhoto, UnsupportedPhotoError } from '../../src/media/photo';
import { pickAudioMime, createMemoRecorder, MEMO_MAX_MS } from '../../src/media/audio';
import { dictationAvailable, appendDictated, createDictation } from '../../src/media/dictation';

test('fitWithin', () => {
  expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
});

test('undecodable photo throws UnsupportedPhotoError', async () => {
  await expect(
    processPhoto(new Blob([new Uint8Array([1])]), {
      decode: async () => {
        throw new Error('x');
      },
    }),
  ).rejects.toBeInstanceOf(UnsupportedPhotoError);
});

test('pickAudioMime prefers opus then mp4', () => {
  expect(pickAudioMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
  expect(pickAudioMime(() => true)).toBe('audio/webm;codecs=opus');
  expect(pickAudioMime(() => false)).toBeNull();
});

test('memo recorder collects chunks, ticks, and auto-stops at the cap', async () => {
  vi.useFakeTimers();
  let t = 0;
  const now = () => t;
  class FakeRecorder {
    static isTypeSupported() { return true; }
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    state = 'inactive';
    constructor(public stream: unknown, public opts: unknown) {}
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2])]) });
      this.onstop?.();
    }
  }
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const ticks: number[] = [];
  const done = vi.fn();
  const err = vi.fn();
  const rec = createMemoRecorder(
    { onTick: (ms) => ticks.push(ms), onDone: done, onError: err },
    { getStream: async () => stream, Recorder: FakeRecorder as unknown as typeof MediaRecorder, now, setInterval, clearInterval },
  );
  await rec.start();
  expect(rec.recording()).toBe(true);
  t = 1000;
  await vi.advanceTimersByTimeAsync(1000);
  expect(ticks.at(-1)).toBe(1000);
  t = MEMO_MAX_MS;
  await vi.advanceTimersByTimeAsync(1000);
  await vi.runOnlyPendingTimersAsync();
  expect(rec.recording()).toBe(false);
  expect(done).toHaveBeenCalledOnce();
  expect(done.mock.calls[0][0]).toMatchObject({ mime: 'audio/webm;codecs=opus', durationMs: MEMO_MAX_MS });
  expect(new Uint8Array(done.mock.calls[0][0].data)).toEqual(new Uint8Array([1, 2]));
  expect(track.stop).toHaveBeenCalled();
  expect(err).not.toHaveBeenCalled();
  vi.useRealTimers();
});

test('memo recorder stops and saves when the page is hidden', async () => {
  vi.useRealTimers();
  class FakeRecorder {
    static isTypeSupported() { return true; }
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    state = 'inactive';
    constructor(public stream: unknown, public opts: unknown) {}
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array([9])]) });
      this.onstop?.();
    }
  }
  let hidden: (() => void) | null = null;
  const stream = { getTracks: () => [{ stop: () => {} }] } as unknown as MediaStream;
  const done = vi.fn();
  const rec = createMemoRecorder(
    { onTick: () => {}, onDone: done, onError: vi.fn() },
    {
      getStream: async () => stream,
      Recorder: FakeRecorder as unknown as typeof MediaRecorder,
      now: () => 0,
      onPageHidden: (fn) => {
        hidden = fn;
        return () => {
          hidden = null;
        };
      },
    },
  );
  await rec.start();
  expect(hidden).not.toBeNull();
  hidden!();
  await new Promise((r) => setTimeout(r, 20));
  expect(rec.recording()).toBe(false);
  expect(done).toHaveBeenCalledOnce();
  expect(hidden).toBeNull(); // listener released with the microphone
});

test('dictation availability and text joining', () => {
  expect(dictationAvailable({ webkitSpeechRecognition: class {} }, true)).toBe(true);
  expect(dictationAvailable({ webkitSpeechRecognition: class {} }, false)).toBe(false);
  expect(dictationAvailable({}, true)).toBe(false);
  expect(appendDictated('', ' hello ')).toBe('hello');
  expect(appendDictated('a', 'b')).toBe('a b');
  expect(appendDictated('a\n', 'b')).toBe('a\nb');
});

test('dictation splits final and interim, forwards errors', () => {
  let inst: FakeRecognition | undefined;
  class FakeRecognition {
    lang = '';
    continuous = false;
    interimResults = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    constructor() { inst = this; }
    start() {}
    stop() { this.onend?.(); }
  }
  const final = vi.fn();
  const interim = vi.fn();
  const error = vi.fn();
  const end = vi.fn();
  const d = createDictation(
    { onFinal: final, onInterim: interim, onError: error, onEnd: end },
    { lang: 'ar-SA', win: { webkitSpeechRecognition: FakeRecognition } },
  );
  d.start();
  expect(inst).toMatchObject({ lang: 'ar-SA', continuous: true, interimResults: true });
  inst!.onresult!({
    resultIndex: 0,
    results: [
      Object.assign([{ transcript: 'no permit ' }], { isFinal: true }),
      Object.assign([{ transcript: 'at the' }], { isFinal: false }),
    ],
  });
  expect(final).toHaveBeenCalledWith('no permit ');
  expect(interim).toHaveBeenCalledWith('at the');
  inst!.onerror!({ error: 'network' });
  expect(error).toHaveBeenCalledWith('network');
  d.stop();
  expect(end).toHaveBeenCalled();
});
