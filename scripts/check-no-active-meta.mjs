import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const roots = ['apps', 'packages'];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.css']);
const forbidden = [
  ['WHATSAPP', '_'].join(''),
  ['graph', 'facebook', 'com'].join('.'),
  ['/webhooks', 'whatsapp'].join('/'),
  ['whatsapp', 'message', 'id'].join('_'),
];
const violations = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(absolute);
      continue;
    }
    if (!extensions.has(extname(entry.name))) continue;
    const content = (await readFile(absolute, 'utf8')).toLowerCase();
    for (const token of forbidden) {
      if (content.includes(token.toLowerCase())) {
        violations.push(`${relative(root, absolute)} contains retired Meta token: ${token}`);
      }
    }
  }
}

for (const path of roots) await scan(join(root, path));

if (violations.length > 0) {
  console.error('Active source still contains retired Meta/WhatsApp dependencies:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('No active Meta/WhatsApp dependencies found.');
