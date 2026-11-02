import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/walk.css';
import './styles/media.css';
import './styles/findings.css';
import './styles/export.css';
import './styles/desk.css';
import './styles/auth.css';
import { startSession } from './auth/session';
import { installFlushListeners } from './db/flush';
import { loadServer } from './server';
import { startEngine } from './sync/engine';
import { registerUpdates } from './pwa/updates';
import { toast } from './ui/components/toast';
import { App } from './app';

installFlushListeners(window);
registerUpdates((apply) => toast('A new version is ready', { action: { label: 'Reload', onClick: apply }, durationMs: 0 }));

void (async () => {
  const { remote, auth } = await loadServer();
  startEngine({ remote, auth, win: window });
  // Paint at once (the gate shows a loading screen) rather than wait for the network on a weak signal.
  render(<App />, document.getElementById('app')!);
  await startSession(auth);
})();
