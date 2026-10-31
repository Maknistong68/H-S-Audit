import { useEffect, useRef, useState } from 'preact/hooks';
import { createDictation, dictationAvailable, type Dictation } from '../../media/dictation';
import { toast } from './toast';

export function DictateButton(props: { lang: string; onText(text: string): void; onInterim(text: string): void }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [on, setOn] = useState(false);
  const dictation = useRef<Dictation | null>(null);
  // Recognition results arrive long after start(); always hand them to the latest callbacks.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => () => dictation.current?.stop(), []);

  const available = dictationAvailable(window, online);

  function start() {
    dictation.current = createDictation(
      {
        onFinal: (text) => latest.current.onText(text),
        onInterim: (text) => latest.current.onInterim(text),
        onError: (code) => {
          if (code === 'network') toast('No signal for dictation — record a memo instead', { durationMs: 6000 });
          else if (code === 'not-allowed' || code === 'service-not-allowed') toast("Microphone blocked — allow it in the browser's site settings", { durationMs: 6000 });
          else if (code !== 'aborted' && code !== 'no-speech') toast(`Dictation stopped (${code})`);
        },
        onEnd: () => {
          setOn(false);
          latest.current.onInterim('');
          dictation.current = null;
        },
      },
      { lang: props.lang },
    );
    setOn(true);
    dictation.current.start();
  }

  return (
    <button
      type="button"
      class="btn btn-sm"
      disabled={!available}
      title={available ? undefined : 'Needs mobile signal'}
      aria-pressed={on}
      onClick={() => (on ? dictation.current?.stop() : start())}
    >
      {on ? 'Stop dictating' : 'Dictate'}
    </button>
  );
}
