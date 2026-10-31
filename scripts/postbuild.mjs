// GitHub Pages serves 404.html for unknown paths; a copy of index.html lets deep links load the SPA.
import { copyFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');
