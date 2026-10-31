import { test, expect, vi } from 'vitest';
import { fitWithin, processPhoto, UnsupportedPhotoError } from '../../src/media/photo';
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

test('dictation availability and text joining', () => {
  expect(dictationAvailable({ webkitSpeechRecognition: class {} }, true)).toBe(true);
  expect(dictationAvailable({ webkitSpeechRecognition: class {} }, false)).toBe(false);
  expect(dictationAvailable({}, true)).toBe(false);
  expect(appendDictated('', ' hello ')).toBe('Hello');
  expect(appendDictated('a', 'b')).toBe('a b');
  expect(appendDictated('a\n', 'b')).toBe('a\nB');
  expect(appendDictated('No permit.', 'workers were exposed')).toBe('No permit. Workers were exposed');
  expect(appendDictated('', 'the ram\'s were missing full stop')).toBe('The RAMS were missing.');
});

test('dictation asks for five guesses, keeps the best audit-language one, and biases toward HSE phrases', () => {
  let inst: FakeRec | undefined;
  class Phrase {
    constructor(public phrase: string, public boost: number) {}
  }
  class FakeRec {
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    phrases: unknown[] = [];
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    constructor() { inst = this; }
    start() {}
    stop() { this.onend?.(); }
  }
  const final = vi.fn();
  const d = createDictation(
    { onFinal: final, onInterim: vi.fn(), onError: vi.fn(), onEnd: vi.fn() },
    { lang: 'en-GB', win: { webkitSpeechRecognition: FakeRec, SpeechRecognitionPhrase: Phrase }, context: 'Are approved RAMS available for all current tasks?' },
  );
  d.start();
  expect(inst!.maxAlternatives).toBe(5);
  expect((inst!.phrases as Phrase[]).map((p) => p.phrase)).toContain('RAMS');
  inst!.onresult!({
    resultIndex: 0,
    results: [Object.assign([{ transcript: 'the rums were not a proved', confidence: 0.6 }, { transcript: 'the rams were not approved', confidence: 0.55 }], { isFinal: true })],
  });
  expect(final).toHaveBeenCalledWith('the RAMS were not approved');
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
