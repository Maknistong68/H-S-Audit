import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/walk.css';
import './styles/media.css';
import './styles/findings.css';
import './styles/export.css';
import { installFlushListeners } from './db/flush';
import { App } from './app';

installFlushListeners(window);

render(<App />, document.getElementById('app')!);
