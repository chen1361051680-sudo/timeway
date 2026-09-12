import './check.mjs';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { publicAssets } from '../src/assets.mjs';
const files = await publicAssets();
for (const file of files) {
  const destination = 'dist/public/' + file;
  await mkdir(dirname(destination), { recursive: true });
  await copyFile('public/' + file, destination);
}
await writeFile(
  'dist/manifest.json',
  JSON.stringify(
    {
      version: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      builtAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  ),
);
console.log(
  'Static assets packaged in dist/public. Native server serves the source public directory; no compilation required.',
);
