import { appendText } from '../domain/text';
import { contextWordsFor, correctTranscript, HSE_PHRASES, pickBestAlternative, type Alternative } from './vocabulary';

/** Minimal typing of the Web Speech API (not in lib.dom). */
interface RecognitionResult extends ArrayLike<Alternative> {
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
  maxAlternatives?: number;
  phrases?: unknown;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;
type PhraseCtor = new (phrase: string, boost: number) => unknown;
type SpeechWindow = { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor; SpeechRecognitionPhrase?: PhraseCtor };

function ctorOf(win: SpeechWindow | undefined): RecognitionCtor | undefined {
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition;
}

/** Dictation needs the browser's speech service, which on most phones means mobile signal. */
export function dictationAvailable(win: unknown, online: boolean): boolean {
  return online && ctorOf(win as SpeechWindow) !== undefined;
}

/** Appends dictated text to a note: HSE corrections, spoken punctuation, sentence capitals. */
export function appendDictated(note: string, text: string): string {
  return appendText(note, correctTranscript(text));
}

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

const MAX_ALTERNATIVES = 5;
const PHRASE_BOOST = 5;

/**
 * Continuous dictation that asks the recogniser for five guesses per phrase and keeps the one that fits audit
 * language and the current question best. Where the browser supports phrase hints, the HSE vocabulary and the
 * question's own words are passed as hints; if the recogniser rejects them, dictation restarts without.
 */
export function createDictation(cb: DictationCallbacks, opts: { lang: string; win?: unknown; context?: string }): Dictation {
  const win = (opts.win ?? globalThis) as SpeechWindow;
  const Ctor = ctorOf(win);
  const context = contextWordsFor(opts.context ?? '');
  let rec: RecognitionLike | null = null;
  let usePhrases = typeof win.SpeechRecognitionPhrase === 'function';
  let restarting = false;
  let stopped = false;

  const begin = () => {
    if (!Ctor) {
      cb.onError('not-supported');
      cb.onEnd();
      return;
    }
    const r = new Ctor();
    rec = r;
    r.lang = opts.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = MAX_ALTERNATIVES;
    if (usePhrases && 'phrases' in r) {
      try {
        const Phrase = win.SpeechRecognitionPhrase!;
        r.phrases = [...HSE_PHRASES, ...context.slice(0, 20)].map((p) => new Phrase(p, PHRASE_BOOST));
      } catch {
        usePhrases = false;
      }
    }
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) cb.onFinal(correctTranscript(pickBestAlternative(Array.from(result), context)));
        else interim += result[0]?.transcript ?? '';
      }
      cb.onInterim(correctTranscript(interim));
    };
    r.onerror = (e) => {
      if (e.error === 'phrases-not-supported' && usePhrases && !stopped) {
        usePhrases = false;
        restarting = true;
        return;
      }
      cb.onError(e.error ?? 'unknown');
    };
    r.onend = () => {
      rec = null;
      if (restarting) {
        restarting = false;
        begin();
        return;
      }
      cb.onEnd();
    };
    try {
      r.start();
    } catch {
      rec = null;
      cb.onError('start-failed');
      cb.onEnd();
    }
  };

  return {
    start() {
      if (rec) return;
      stopped = false;
      begin();
    },
    stop() {
      stopped = true;
      restarting = false;
      rec?.stop();
    },
  };
}
