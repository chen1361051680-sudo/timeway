import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['src', 'public', 'scripts', 'test', 'e2e'])
  for (const file of await readdir(dir))
    if (/\.(m?js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
      if (result.status) process.exit(result.status);
    }
const result = spawnSync(process.execPath, ['--check', 'server.mjs'], { stdio: 'inherit' });
if (result.status) process.exit(result.status);
const html = await readFile('public/index.html', 'utf8');
for (const file of ['app.js', 'ui.js', 'styles.css']) await readFile('public/' + file);
if (!html.includes('type="module"') || !html.includes('viewport'))
  throw new Error('网页入口缺少模块或移动端配置');
console.log('Syntax and mobile asset checks passed.');
