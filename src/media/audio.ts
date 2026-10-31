export const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
export const MEMO_MAX_MS = 300_000;
const TICK_MS = 1000;

export function pickAudioMime(isTypeSupported: (mime: string) => boolean): string | null {
  return AUDIO_MIME_CANDIDATES.find((m) => isTypeSupported(m)) ?? null;
}

export interface MemoResult {
  data: ArrayBuffer;
  mime: string;
  durationMs: number;
}

export interface MemoCallbacks {
  onTick(elapsedMs: number): void;
  onDone(result: MemoResult): void;
  onError(error: Error): void;
}

export interface MemoDeps {
  getStream?: () => Promise<MediaStream>;
  Recorder?: typeof MediaRecorder;
  now?: () => number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  /** Subscribes to "the page went to the background"; returns an unsubscribe. */
  onPageHidden?: (fn: () => void) => () => void;
}

function listenForHidden(fn: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onChange = () => {
    if (document.visibilityState === 'hidden') fn();
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

export interface MemoRecorder {
  start(): Promise<void>;
  stop(): void;
  recording(): boolean;
}

/**
 * Tap-to-record voice memo. Stops itself at MEMO_MAX_MS, stops (and so saves) when the page goes to the
 * background — phones cut the microphone there — and always releases the microphone.
 */
export function createMemoRecorder(cb: MemoCallbacks, deps: MemoDeps = {}): MemoRecorder {
  const getStream = deps.getStream ?? (() => navigator.mediaDevices.getUserMedia({ audio: true }));
  const Recorder = deps.Recorder ?? (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  const now = deps.now ?? (() => Date.now());
  const setI = deps.setInterval ?? globalThis.setInterval;
  const clearI = deps.clearInterval ?? globalThis.clearInterval;
  const onPageHidden = deps.onPageHidden ?? listenForHidden;

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let unsubscribeHidden: (() => void) | undefined;
  let mime = '';
  let active = false;

  const release = () => {
    if (timer !== undefined) clearI(timer);
    timer = undefined;
    unsubscribeHidden?.();
    unsubscribeHidden = undefined;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    active = false;
  };

  const stop = () => {
    if (!active || !recorder) return;
    if (timer !== undefined) clearI(timer);
    timer = undefined;
    if (recorder.state !== 'inactive') recorder.stop();
    else release();
  };

  const start = async () => {
    if (active) return;
    if (!Recorder) {
      cb.onError(new Error('Voice recording is not supported in this browser'));
      return;
    }
    try {
      stream = await getStream();
    } catch (err) {
      cb.onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    mime = pickAudioMime((m) => Recorder.isTypeSupported(m)) ?? '';
    recorder = new Recorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    startedAt = now();
    active = true;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      release();
      cb.onError(new Error('Recording failed'));
    };
    recorder.onstop = () => {
      const durationMs = now() - startedAt;
      const blob = new Blob(chunks, { type: mime || chunks[0]?.type || 'application/octet-stream' });
      release();
      blob
        .arrayBuffer()
        .then((data) => cb.onDone({ data, mime: blob.type, durationMs }))
        .catch((err: unknown) => cb.onError(err instanceof Error ? err : new Error(String(err))));
    };

    recorder.start(TICK_MS);
    unsubscribeHidden = onPageHidden(stop);
    timer = setI(() => {
      const elapsed = now() - startedAt;
      cb.onTick(elapsed);
      if (elapsed >= MEMO_MAX_MS) stop();
    }, TICK_MS);
  };

  return { start, stop, recording: () => active };
}
