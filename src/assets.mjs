import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const assetTypes = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
};
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));

// Only ordinary web assets inside public are served or packaged. Skip hidden
// files and symlinks so credentials and paths outside public remain inaccessible.
export async function publicAssets(directory = publicRoot, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...(await publicAssets(join(directory, entry.name), relative + '/')));
    else if (entry.isFile() && Object.hasOwn(assetTypes, entry.name.split('.').pop().toLowerCase()))
      files.push(relative);
  }
  return files.sort();
}
