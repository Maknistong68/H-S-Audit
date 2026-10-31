import { joinText } from '../domain/text';

/** Minimal typing of the Web Speech API (not in lib.dom). */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult extends ArrayLike<RecognitionAlternative> {
  isFinal: boolean;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;
type SpeechWindow = { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };

function ctorOf(win: SpeechWindow | undefined): RecognitionCtor | undefined {
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition;
}

/** Dictation needs the browser's speech service, which on most phones means mobile signal. */
export function dictationAvailable(win: unknown, online: boolean): boolean {
  return online && ctorOf(win as SpeechWindow) !== undefined;
}

/** Appends dictated text to a note with a single separating space (none after a trailing newline). */
export const appendDictated = joinText;

export interface DictationCallbacks {
  onFinal(text: string): void;
  onInterim(text: string): void;
  onError(code: string): void;
  onEnd(): void;
}

export interface Dictation {
  start(): void;
  stop(): void;
}

export function createDictation(cb: DictationCallbacks, opts: { lang: string; win?: unknown }): Dictation {
  const Ctor = ctorOf((opts.win ?? globalThis) as SpeechWindow);
  let rec: RecognitionLike | null = null;

  return {
    start() {
      if (rec) return;
      if (!Ctor) {
        cb.onError('not-supported');
        cb.onEnd();
        return;
      }
      rec = new Ctor();
      rec.lang = opts.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) cb.onFinal(text);
          else interim += text;
        }
        cb.onInterim(interim);
      };
      rec.onerror = (e) => cb.onError(e.error ?? 'unknown');
      rec.onend = () => {
        rec = null;
        cb.onEnd();
      };
      try {
        rec.start();
      } catch {
        rec = null;
        cb.onError('start-failed');
        cb.onEnd();
      }
    },
    stop() {
      rec?.stop();
    },
  };
}
