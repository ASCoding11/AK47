// Builds the static GitHub Pages site into docs/.
// It is the same web app as public/, with the exchange running in the browser.
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs');

const files = {
  'index.html': 'public/index.html',
  'style.css': 'public/style.css',
  'app.js': 'public/app.js',
  'transport.js': 'pages/transport.js',
  'local-api.js': 'src/local-api.js',
  'local-engine.js': 'src/local-engine.js',
  'site-config.js': 'src/site-config.js',
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const [to, from] of Object.entries(files)) await copyFile(join(ROOT, from), join(OUT, to));
// Serve files as-is (no Jekyll processing).
await writeFile(join(OUT, '.nojekyll'), '');
console.log(`Built ${Object.keys(files).length} files into docs/`);
