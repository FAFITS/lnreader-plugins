import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const categories = [
  { file: 'anime.txt', label: 'Anime', route: 'anime' },
  { file: 'book.txt', label: 'Books', route: 'book' },
  { file: 'cartoons.txt', label: 'Cartoons', route: 'cartoon' },
  { file: 'comics.txt', label: 'Comics', route: 'comic' },
  { file: 'games.txt', label: 'Games', route: 'game' },
];

function fandomSlug(name) {
  return name
    .replace(/&/g, ' ')
    .replace(/['’]/g, '-')
    .replace(/[\\/]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

const options = [];
const seenPaths = new Set();

for (const category of categories) {
  const contents = fs.readFileSync(path.join(directory, category.file), 'utf8');
  for (const rawLine of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^(.*?)\s+\(([\d.]+)\s*(K)?\)$/i);
    if (!match) {
      throw new Error(`Invalid fandom row in ${category.file}: ${line}`);
    }

    const [, name, count, thousands] = match;
    const numberOfStories = Number(count) * (thousands ? 1000 : 1);
    if (numberOfStories <= 50) continue;

    const slug = fandomSlug(name);
    if (!slug) {
      throw new Error(`Unable to create a fandom path for "${name}".`);
    }

    const value = `/${category.route}/${encodeURIComponent(slug)}/`;
    if (seenPaths.has(value)) continue;
    seenPaths.add(value);
    options.push({
      label: `${category.label}: ${name} (${count}${thousands || ''})`,
      value,
    });
  }
}

const source = [
  '// Generated from the adjacent fandom lists.',
  '// Run: node plugins/english/FanFiction/generate-fandom-options.mjs',
  'export const FANDOM_OPTIONS = [',
  ...options.map(
    ({ label, value }) =>
      `  { label: ${JSON.stringify(label)}, value: ${JSON.stringify(value)} },`,
  ),
  '] satisfies { label: string; value: string }[];',
  '',
].join('\n');

fs.writeFileSync(path.join(directory, 'fandom-options.ts'), source);
