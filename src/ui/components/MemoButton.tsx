import { useEffect, useMemo, useState } from 'preact/hooks';
import type { MediaOwner } from '../../db/db';
import { ownerKey } from '../../db/ids';
import { repo } from '../../db/repo';
import { createMemoRecorder } from '../../media/audio';
import { toast } from './toast';

export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function describeMicError(err: Error): string {
  if (err.name === 'NotAllowedError' || err.name === 'SecurityError') return "Microphone blocked — allow it in the browser's site settings";
  if (err.name === 'NotFoundError') return 'No microphone found on this device';
  return err.message || 'Recording failed';
}

/** Tap to record a voice memo on the item; tap again to stop. Clips cap at five minutes. */
export function MemoButton({ auditId, owner }: { auditId: string; owner: MediaOwner }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const key = ownerKey(owner);

  const recorder = useMemo(
    () =>
      createMemoRecorder({
        onTick: setElapsed,
        onDone: async (r) => {
          setRecording(false);
          setElapsed(0);
          try {
            await repo.addMedia({ auditId, owner, type: 'audio', data: r.data, mime: r.mime, durationMs: r.durationMs });
            toast('Memo saved');
          } catch {
            toast('Could not save the memo — try again', { durationMs: 6000 });
          }
        },
        onError: (err) => {
          setRecording(false);
          setElapsed(0);
          toast(describeMicError(err), { durationMs: 6000 });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auditId, key],
  );

  // Leaving the item while recording stops the clip; onDone still saves it.
  useEffect(() => () => recorder.stop(), [recorder]);

  async function toggle() {
    if (recorder.recording()) {
      recorder.stop();
    } else {
      setRecording(true);
      await recorder.start();
      if (!recorder.recording()) setRecording(false);
    }
  }

  return (
    <button type="button" class={`btn btn-sm${recording ? ' is-recording' : ''}`} aria-pressed={recording} onClick={toggle}>
      {recording ? `Stop recording ${formatClock(elapsed)}` : 'Record memo'}
    </button>
  );
}
