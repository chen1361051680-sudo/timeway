import './check.mjs';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('dist/public', { recursive: true });
for (const file of ['index.html', 'app.js', 'ui.js', 'styles.css'])
  await copyFile('public/' + file, 'dist/public/' + file);
await writeFile(
  'dist/manifest.json',
  JSON.stringify(
    {
      version: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      builtAt: new Date().toISOString(),
      files: ['index.html', 'app.js', 'ui.js', 'styles.css'],
    },
    null,
    2,
  ),
);
console.log(
  'Static assets packaged in dist/public. Native server serves the source public directory; no compilation required.',
);
