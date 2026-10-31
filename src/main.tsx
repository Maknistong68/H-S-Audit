import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/walk.css';
import './styles/media.css';
import './styles/findings.css';
import './styles/export.css';
import './styles/desk.css';
import { installFlushListeners } from './db/flush';
import { registerUpdates } from './pwa/updates';
import { toast } from './ui/components/toast';
import { App } from './app';

installFlushListeners(window);
registerUpdates((apply) => toast('A new version is ready', { action: { label: 'Reload', onClick: apply }, durationMs: 0 }));

render(<App />, document.getElementById('app')!);
