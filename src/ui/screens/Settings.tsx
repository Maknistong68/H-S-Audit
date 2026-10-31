import { useEffect, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { PHOTO_COPIES_SETTING } from '../../media/photoCopy';
import { checkForUpdates } from '../../pwa/updates';
import { toast } from '../components/toast';
import { TopBar } from '../components/TopBar';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { paths } from '../paths';

// Matching the recogniser to the speaker's accent is the biggest single gain in dictation accuracy.
const LANGS = [
  { value: 'en-GB', label: 'English — UK accent' },
  { value: 'en-IN', label: 'English — Indian / Pakistani accent' },
  { value: 'en-PH', label: 'English — Filipino accent' },
  { value: 'en-US', label: 'English — US accent' },
  { value: 'en-AU', label: 'English — Australian accent' },
  { value: 'ar-SA', label: 'Arabic (العربية)' },
];

interface StorageInfo {
  persisted: boolean | null;
  usageMb: number | null;
  quotaMb: number | null;
}

async function readStorage(): Promise<StorageInfo> {
  const s = navigator.storage;
  if (!s) return { persisted: null, usageMb: null, quotaMb: null };
  const persisted = s.persisted ? await s.persisted() : null;
  const est = s.estimate ? await s.estimate() : undefined;
  const mb = (n?: number) => (n === undefined ? null : Math.round((n / 1_048_576) * 10) / 10);
  return { persisted, usageMb: mb(est?.usage), quotaMb: mb(est?.quota) };
}

function installed(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function Settings() {
  const lang = useLiveQuery(() => repo.getSetting('dictationLang', 'en-US'), []);
  const photoCopies = useLiveQuery(() => repo.getSetting(PHOTO_COPIES_SETTING, true), []);
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    void readStorage().then(setStorage);
  }, []);

  async function requestPersist() {
    const ok = navigator.storage?.persist ? await navigator.storage.persist() : false;
    toast(ok ? 'Storage is now persistent' : 'The browser did not grant persistent storage — installing the app to the home screen helps');
    setStorage(await readStorage());
  }

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <>
      <TopBar title="Settings" back={paths.home()} />
      <main class="screen">
        <section class="panel">
          <div class="panel-head">
            <h2>Dictation</h2>
          </div>
          <div class="panel-body">
            <div class="field">
              <label for="dictation-lang">Dictation language</label>
              <select id="dictation-lang" value={lang ?? 'en-US'} onChange={(e) => void repo.setSetting('dictationLang', (e.currentTarget as HTMLSelectElement).value)}>
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div class="panel-note">
            <p>For the most accurate dictation:</p>
            <ul class="tips">
              <li>Pick the accent closest to the person speaking.</li>
              <li>Hold the phone 15–20 cm from your mouth and turn away from generators and grinders.</li>
              <li>Speak in short sentences and pause between them. Say “full stop”, “comma” or “new line”.</li>
              <li>Site terms such as RAMS, PTW, NEOC, HSSE, LOTO, Aconex and Code A are corrected automatically.</li>
              <li>No signal? Use the microphone on the phone keyboard instead; Gboard and the iPhone keyboard can dictate offline.</li>
            </ul>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Photos</h2>
          </div>
          <div class="panel-body">
            <label class="switch">
              <input
                type="checkbox"
                checked={photoCopies ?? true}
                onChange={(e) => void repo.setSetting(PHOTO_COPIES_SETTING, (e.currentTarget as HTMLInputElement).checked)}
              />
              <span class="switch-track" aria-hidden="true" />
              <span class="switch-label">Keep a copy of each photo in Downloads</span>
            </label>
          </div>
          <p class="panel-note">
            Insurance against losing a draft: every photo added in the app is also saved to the phone. On Android it appears in the gallery under “Download”; on
            iPhone it goes to Files › Downloads (use Share → Save Image on a photo for the Photos app). The browser may ask once to allow multiple downloads.
          </p>
        </section>


        <section class="panel">
          <div class="panel-head">
            <h2>Storage</h2>
          </div>
          <div class="panel-body">
            {storage && (
              <p class="kv">
                <span>
                  <b>Persistent storage</b> {storage.persisted === null ? 'unknown' : storage.persisted ? 'on' : 'off'}
                </span>
                {storage.usageMb !== null && (
                  <span>
                    <b>Used</b> {storage.usageMb} MB{storage.quotaMb !== null ? ` of ${storage.quotaMb} MB` : ''}
                  </span>
                )}
              </p>
            )}
            {storage?.persisted === false && (
              <div class="actions-row" style={{ marginTop: '12px' }}>
                <button type="button" class="btn btn-sm" onClick={requestPersist}>
                  Request persistent storage
                </button>
              </div>
            )}
          </div>
          <p class="panel-note">Audits live only on this device. Export a backup before changing phones or clearing browser data.</p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>App</h2>
            <span class="status-text">Version {import.meta.env.VITE_APP_VERSION ?? 'dev'}</span>
          </div>
          <div class="panel-body">
            {!installed() && (
              <p class="muted small" style={{ marginBottom: '12px' }}>
                {isIos
                  ? 'Install to the home screen: tap Share, then “Add to Home Screen”. This keeps your audits safe from Safari’s storage clean-up.'
                  : 'Install to the home screen: open the browser menu and choose “Install app” or “Add to Home screen”.'}
              </p>
            )}
            <button
              type="button"
              class="btn btn-sm"
              onClick={() => void checkForUpdates().then((ok) => toast(ok ? 'Checked — you will be asked to reload if a new version is ready' : 'Updates are checked automatically when installed'))}
            >
              Check for updates
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
