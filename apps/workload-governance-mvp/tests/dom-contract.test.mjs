import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('every DOM ID referenced by the application exists in the HTML', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('app.mjs', root), 'utf8')
  ]);
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const referencedIds = new Set(
    [...app.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1])
  );
  const missing = [...referencedIds].filter((id) => !htmlIds.has(id));
  assert.deepEqual(missing, []);
});

test('the UI uses the checked external application module', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /<script type="module" src="\.\/app\.mjs"><\/script>/);
  assert.doesNotMatch(html, /<script type="module">/);
});
