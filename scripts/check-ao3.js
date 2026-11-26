import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const requests = [];
let mode = 'ready';
let workHtml = '';
let chapterIndexHtml = '';

// Match the external AO3/Rails contract: the autocomplete controller only
// responds to JSON, while browser-like Accept headers default to HTML.
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  requests.push({ url, headers: request.headers });
  if (url.pathname === '/works/123' || url.pathname === '/works/123/navigate') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      url.pathname.endsWith('/navigate') ? chapterIndexHtml : workHtml,
    );
    return;
  }
  if (url.pathname === '/works/search') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      mode === 'catalog'
        ? '<div id="main"><ol class="work index"><li class="work blurb"><h4 class="heading"><a href="/works/123">Example Work</a></h4></li></ol></div>'
        : '<div id="main"><ol class="work index"></ol></div>',
    );
    return;
  }
  if (mode === 'blocked') {
    response.writeHead(403, { 'cf-mitigated': 'challenge' });
    response.end('<title>Just a moment...</title>');
    return;
  }
  if (mode === 'challenge') {
    response.end('<title>Just a moment...</title>');
    return;
  }
  if (mode === 'invalid') {
    response.end('<html>Unexpected HTML</html>');
    return;
  }
  const isJson =
    url.searchParams.get('format') === 'json' ||
    request.headers.accept === 'application/json';
  if (!isJson) {
    response.writeHead(404, { 'content-type': 'text/html' });
    response.end('Unknown format');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  const name = url.searchParams.get('term');
  response.end(
    JSON.stringify(
      mode === 'empty'
        ? []
        : [
            { id: name, name },
            { id: name, name },
          ],
    ),
  );
});

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const bundle = await build({
    entryPoints: ['plugins/english/ArchiveOfOurOwn/index.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    plugins: [
      {
        name: 'ao3-test-fetch',
        setup(build) {
          build.onResolve({ filter: /^@libs\/fetch$/ }, args => ({
            path: args.path,
            external: true,
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  Function(
    'require',
    'module',
    'exports',
    bundle.outputFiles[0].text,
  )(
    name =>
      name === '@libs/fetch'
        ? {
            fetchApi: async (url, init) => {
              const parsed = new URL(url);
              const response = await fetch(
                `${base}${parsed.pathname}${parsed.search}`,
                init,
              );
              Object.defineProperty(response, 'url', { value: url });
              return response;
            },
          }
        : require(name),
    module,
    module.exports,
  );
  const plugin = module.exports.default;
  const query = 'Harry & Draco / 魔法';
  for (const [key, route] of Object.entries({
    fandoms: 'fandom',
    characters: 'character',
    relationships: 'relationship',
    tags: 'freeform',
    excludedTags: 'tag',
  })) {
    assert.deepEqual(await plugin.getFilterSuggestions(key, query), [
      { label: query, value: query },
    ]);
    const { url, headers } = requests.at(-1);
    assert.equal(url.pathname, `/autocomplete/${route}`);
    assert.equal(url.searchParams.get('term'), query);
    assert.equal(url.searchParams.get('format'), 'json');
    assert.equal(headers.accept, 'application/json');
    assert.equal(headers['x-requested-with'], 'XMLHttpRequest');
    assert.equal(headers.referer, `${plugin.site}/works/search`);
  }
  const cachedCount = requests.length;
  await plugin.getFilterSuggestions('fandoms', query);
  assert.equal(requests.length, cachedCount);
  for (const key of ['sort', '__proto__']) {
    assert.deepEqual(await plugin.getFilterSuggestions(key, query), []);
  }
  assert.deepEqual(await plugin.getFilterSuggestions('fandoms', 'a'), []);
  assert.equal(requests.length, cachedCount);

  const concurrentCount = requests.length;
  await Promise.all([
    plugin.getFilterSuggestions('fandoms', 'shared request'),
    plugin.getFilterSuggestions('fandoms', 'shared request'),
  ]);
  assert.equal(requests.length, concurrentCount + 1);

  assert.deepEqual(await plugin.searchNovels('Harry', 1), []);
  assert.match(requests.at(-1).headers.accept, /text\/html/);
  assert.equal(requests.at(-1).headers['x-requested-with'], undefined);

  for (const failure of ['blocked', 'challenge', 'invalid']) {
    mode = failure;
    await assert.rejects(plugin.getFilterSuggestions('tags', failure));
    mode = 'ready';
    assert.deepEqual(await plugin.getFilterSuggestions('tags', failure), [
      { label: failure, value: failure },
    ]);
  }
  mode = 'empty';
  assert.deepEqual(await plugin.getFilterSuggestions('tags', 'no matches'), []);

  mode = 'catalog';
  for (const results of [
    await plugin.searchNovels('Example Work', 1),
    await plugin.popularNovels(1, {}),
  ]) {
    assert.deepEqual(results, [{ name: 'Example Work', path: 'works/123' }]);
  }
  workHtml = `<div id="main">
    <dl class="work meta"><dd class="chapters">2/2</dd></dl>
    <select id="selected_id"><option value="456">1. An abbreviated title...</option><option value="789">2. Another title...</option></select>
    <div id="workskin"><div class="preface"><h2 class="title">Example Work</h2></div>
    <div id="chapters"><div class="userstuff">Chapter text</div></div></div>
  </div>`;
  chapterIndexHtml = `<ol class="chapter index">
    <li><a href="/works/123/chapters/456">1. A full title &amp; more</a><span class="datetime">(2026-01-01)</span></li>
    <li><a href="/works/123/chapters/789">2. A second full title</a><span class="datetime">(2026-02-01)</span></li>
  </ol>`;
  const identities = novel =>
    novel.chapters.map(({ name, path }) => ({ name, path }));
  const legacy = await plugin.parseNovel('works/123');
  assert.equal(legacy.path, 'works/123');
  // Exact chapter identities emitted by LNReader's plugins/english/ao3.ts.
  assert.deepEqual(identities(legacy), [
    { name: '1. A full title & more', path: 'works/123/chapters/456' },
    { name: '2. A second full title', path: 'works/123/chapters/789' },
  ]);
  assert.equal(legacy.chapters[1].releaseTime, '2026-02-01');
  const modern = await plugin.parseNovel('/works/123');
  assert.equal(modern.path, '/works/123');
  assert.deepEqual(identities(modern), [
    { name: '1. An abbreviated title...', path: '/works/123/chapters/456' },
    { name: '2. Another title...', path: '/works/123/chapters/789' },
  ]);
  const absolute = await plugin.parseNovel(`${plugin.site}/works/123`);
  assert.deepEqual(identities(absolute), identities(modern));
  assert.equal(
    plugin.resolveUrl(legacy.chapters[0].path),
    plugin.resolveUrl(modern.chapters[0].path),
  );

  workHtml = workHtml
    .replace('2/2', '1/1')
    .replace(/<select[\s\S]*?<\/select>/, '');
  chapterIndexHtml =
    '<ol class="chapter index"><li><a href="/works/123/chapters/456">1. One-shot</a></li></ol>';
  assert.deepEqual(identities(await plugin.parseNovel('works/123')), [
    { name: '1. One-shot', path: 'works/123/chapters/456' },
  ]);
  assert.deepEqual(identities(await plugin.parseNovel('/works/123')), [
    { name: 'Example Work', path: '/works/123' },
  ]);
  chapterIndexHtml = '<ol class="chapter index"></ol>';
  assert.deepEqual(identities(await plugin.parseNovel('works/123')), [
    { name: 'Example Work', path: 'works/123' },
  ]);
  workHtml = workHtml.replace('1/1', '2/2');
  await assert.rejects(plugin.parseNovel('works/123'));
  console.log(
    'AO3 checks passed: autocomplete, LNReader chapter identities and full titles, one-shots, existing 2.x entries, URL resolution and incomplete index rejection.',
  );
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
