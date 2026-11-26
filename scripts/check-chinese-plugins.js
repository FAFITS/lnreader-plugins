import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const bundles = new Map();

async function loadPlugin(name, { request, cookies = {}, settings = {} } = {}) {
  if (!bundles.has(name)) {
    const result = await build({
      entryPoints: [`plugins/chinese/${name}/index.ts`],
      bundle: true,
      write: false,
      format: 'cjs',
      target: 'es2020',
      platform: 'node',
      plugins: [
        {
          name: 'plugin-host-boundary',
          setup(builder) {
            builder.onResolve({ filter: /^@(?:libs|nekori)\// }, args => {
              if (
                ['@nekori/plugin', '@nekori/pluginMetadata'].includes(args.path)
              ) {
                return {
                  path: path.resolve('src/nekori', `${args.path.slice(8)}.ts`),
                };
              }
              if (
                ['@libs/filterInputs', '@libs/novelStatus'].includes(args.path)
              ) {
                return {
                  path: path.resolve('src/libs', `${args.path.slice(6)}.ts`),
                };
              }
              return { path: args.path, external: true };
            });
          },
        },
      ],
    });
    bundles.set(name, result.outputFiles[0].text);
  }
  const calls = [];
  const mocks = {
    '@libs/fetch': {
      async fetchApi(url, init) {
        calls.push({ url: new URL(url), init });
        assert.ok(request, `Unexpected request: ${url}`);
        return request(new URL(url), init);
      },
    },
    '@libs/storage': { storage: { get: key => settings[key] } },
    '@libs/utils': {
      bytesToUtf8: bytes => new TextDecoder().decode(bytes),
    },
    '@nekori/cookie': {
      get: async () => ({}),
      set: async () => undefined,
      ...cookies,
    },
  };
  const module = { exports: {} };
  Function(
    'require',
    'module',
    'exports',
    bundles.get(name),
  )(
    id => (Object.hasOwn(mocks, id) ? mocks[id] : require(id)),
    module,
    module.exports,
  );
  return { plugin: module.exports.default, calls };
}

const json = data => Response.json(data);
const html = body =>
  new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
const statePage = state =>
  `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>`;
function deferred() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
}

// Unresolved library titles run in bounded parallel workers, without reordering
// results, repeating duplicate books, or failing the whole page on one error.
{
  let active = 0;
  let peak = 0;
  let fallbacks = 0;
  const rows = Array.from({ length: 7 }, (_, i) => ({
    book_id: String(i + 1),
    book_name: '\uE000',
  }));
  const { plugin } = await loadPlugin('Fanqie', {
    async request(url) {
      if (url.pathname === '/api/library/book_list') {
        return json({
          code: 0,
          data: {
            book_list: [
              ...rows,
              rows[0],
              { book_id: '8', book_name: '\uE3E8' },
            ],
          },
        });
      }
      assert.equal(url.pathname, '/api/book/info');
      fallbacks++;
      peak = Math.max(peak, ++active);
      await setImmediate();
      active--;
      const id = url.searchParams.get('bookId');
      if (id === '3') return new Response('', { status: 503 });
      return json({ data: { bookName: `标题${id}` } });
    },
  });
  const novels = await plugin.popularNovels(1, {});
  assert.equal(peak, 4);
  assert.equal(fallbacks, 7);
  assert.deepEqual(
    novels.map(novel => novel.path),
    Array.from({ length: 8 }, (_, i) => `/page/${i + 1}`),
  );
  assert.deepEqual(
    novels.map(novel => novel.name),
    ['标题1', '标题2', '\uE000', '标题4', '标题5', '标题6', '标题7', '体'],
  );
}

// Whitespace around initial-state assignment and empty/invalid volumes must not
// cause extra requests or shift volume names onto unrelated chapters.
{
  const { plugin, calls } = await loadPlugin('Fanqie', {
    request: () =>
      html(
        statePage({
          page: {
            bookName: '书名 { "quoted" }',
            chapterListWithVolume: [
              [],
              [{ itemId: '11', title: '第一章' }],
              null,
              [
                { itemId: '12', title: '第二章' },
                { itemId: '11', title: '重复' },
              ],
            ],
            volumeNameList: ['空卷', '第一卷', '无效', '第二卷'],
          },
        }),
      ),
  });
  const novel = await plugin.parseNovel('/page/1');
  assert.equal(novel.name, '书名 { "quoted" }');
  assert.deepEqual(
    novel.chapters.map(chapter => chapter.page),
    ['第一卷', '第二卷'],
  );
  assert.equal(calls.length, 1);
}

// Proxy fallback keeps mixed content, cleans watermarks, and never receives the
// site's login cookie. Reader font decoding remains Hermes-compatible.
{
  const { plugin, calls } = await loadPlugin('Fanqie', {
    settings: {
      fanqieProxyUrl: 'https://proxy.example',
      fanqieCookie: 'session=test',
    },
    request(url) {
      if (url.hostname === 'fanqienovel.com') {
        return html(
          statePage({ reader: { chapterData: { isChapterLock: true } } }),
        );
      }
      assert.equal(url.hostname, 'proxy.example');
      return json({
        code: 0,
        data: {
          content:
            '<p>\uE3E8 &amp; 正文</p><p>禁止传播直链</p><img src="//images.example/1.jpg">',
          author_speak: '作者的话',
        },
      });
    },
  });
  const content = await plugin.parseChapter('/reader/11');
  assert.equal(content.type, 'mixed');
  assert.equal(content.state, 'ready');
  assert.ok(content.html.includes('<p>D &amp; 正文</p>'));
  assert.ok(content.html.includes('https://images.example/1.jpg'));
  assert.ok(content.html.includes('作者的话'));
  assert.ok(!content.html.includes('禁止传播直链'));
  assert.equal(calls[0].init.headers.Cookie, 'session=test');
  assert.equal(calls[1].init?.headers?.Cookie, undefined);
}

// Tag labels retain their Chinese spelling, duplicate selections are collapsed,
// and latest mode respects an explicitly selected sort order.
{
  const { plugin, calls } = await loadPlugin('Ciweimao', {
    request: () => html(''),
  });
  const filters = {
    ipTags: { value: ['81', '81'] },
    attributeTags: { value: ['4'] },
  };
  await plugin.popularNovels(1, { filters, showLatestNovels: true });
  assert.ok(
    decodeURIComponent(calls[0].url.pathname).includes(
      '/0-0-uptime-0-0-0/fate-穿越/',
    ),
  );
  await plugin.popularNovels(1, {
    filters: { ...filters, sort: { value: 'total_click' } },
    showLatestNovels: true,
  });
  assert.ok(calls[1].url.pathname.includes('/0-0-total_click-0-0-0/'));
  await assert.rejects(
    plugin.popularNovels(1, { filters: { ipTags: { value: ['invalid'] } } }),
    /Unknown Ciweimao tag/,
  );
  assert.equal(calls.length, 2);
}

// An illustration-only chapter is valid on the first host. Broken hosts and
// placeholder-only pages fall back exactly once, with noise removed first.
for (const primary of ['image', 'network', 'placeholder']) {
  const { plugin, calls } = await loadPlugin('Ciweimao', {
    request(url) {
      if (url.hostname.startsWith('mip.')) {
        if (primary === 'network') throw new Error('Network failure');
        if (primary === 'placeholder') {
          return html(
            '<div id="J_BookRead"><span>1</span><img src="about:blank"></div>',
          );
        }
        return html(
          '<div id="J_BookRead"><span><img data-src="//images.example/a.jpg"></span></div>',
        );
      }
      return html(
        '<div id="J_BookRead"><script>bad()</script><p class="chapter">　正文<em>重点</em><span>1</span></p></div>',
      );
    },
  });
  const content = await plugin.parseChapter('/chapter/11');
  assert.equal(content.type, primary === 'image' ? 'image' : 'novel');
  assert.equal(calls.length, primary === 'image' ? 1 : 2);
  assert.ok(!content.html.includes('bad()'));
  assert.ok(!content.html.includes('about:blank'));
  if (primary !== 'image') {
    assert.ok(
      content.html.includes('<p class="chapter">正文<em>重点</em></p>'),
    );
  }
}

// Concurrent Qidian requests share CSRF initialization. Cookie persistence must
// not be replaced by a manual header that discards the user's session cookies.
{
  let reads = 0;
  const writes = [];
  const { plugin, calls } = await loadPlugin('Qidian', {
    cookies: {
      async get() {
        reads++;
        await setImmediate();
        return {};
      },
      async set(_site, cookie) {
        writes.push(cookie);
        await setImmediate();
      },
    },
    request: () =>
      json({
        code: 0,
        data: {
          records: [
            { bid: 1, bName: '书名' },
            { bid: 1, bName: '重复' },
            { bid: 'invalid', bName: '无效' },
          ],
        },
      }),
  });
  const pages = await Promise.all(
    Array.from({ length: 6 }, () =>
      plugin.popularNovels(1, { showLatestNovels: true }),
    ),
  );
  assert.equal(reads, 1);
  assert.equal(writes.length, 1);
  assert.ok(pages.every(page => page.length === 1));
  for (const call of calls) {
    assert.equal(call.url.searchParams.get('_csrfToken'), writes[0].value);
    assert.equal(call.url.searchParams.get('orderBy'), '4');
    assert.equal(call.init.headers.Cookie, undefined);
  }
  assert.equal(
    plugin.resolveUrl('https://www.qidian.com/other/'),
    'https://www.qidian.com/other/',
  );
  assert.equal(plugin.resolveUrl('book/1/'), 'https://www.qidian.com/book/1/');
}

// A 403 can arrive while another request is still reading the expired cookie.
// Wait for that read, then rotate once rather than retrying the rejected token.
{
  const firstRequest = deferred();
  const firstResponse = deferred();
  const secondRead = deferred();
  const secondCookies = deferred();
  let token = 'expired-token';
  let reads = 0;
  let rotations = 0;
  const { plugin, calls } = await loadPlugin('Qidian', {
    cookies: {
      async get() {
        if (++reads === 2) {
          secondRead.resolve();
          return secondCookies.promise;
        }
        return { _csrfToken: { value: token } };
      },
      async set(_site, cookie) {
        rotations++;
        await setImmediate();
        token = cookie.value;
      },
    },
    request(url) {
      if (!firstRequest.started) {
        firstRequest.started = true;
        firstRequest.resolve();
        return firstResponse.promise;
      }
      if (url.searchParams.get('_csrfToken') === 'expired-token') {
        return new Response('', { status: 403 });
      }
      return json({
        code: 0,
        data: { chapterInfo: { content: '<p>正文</p>' } },
      });
    },
  });
  const first = plugin.parseChapter('/chapter/1/11/');
  await firstRequest.promise;
  const second = plugin.parseChapter('/chapter/1/12/');
  await secondRead.promise;
  firstResponse.resolve(new Response('', { status: 403 }));
  await setImmediate();
  secondCookies.resolve({ _csrfToken: { value: 'expired-token' } });
  const contents = await Promise.all([first, second]);
  assert.ok(contents.every(content => content.html === '<p>正文</p>'));
  assert.equal(rotations, 1);
  assert.equal(calls.length, 4);
}

// Rotate CSRF after 403 and retry only once. Manual cookies are used only when
// the cookie writer is unavailable; chapter breaks and escaping survive.
for (const cookieWriterWorks of [true, false]) {
  let attempts = 0;
  let rotations = 0;
  const { plugin, calls } = await loadPlugin('Qidian', {
    cookies: {
      get: async () => ({ _csrfToken: { value: 'old-token' } }),
      async set() {
        rotations++;
        if (!cookieWriterWorks) throw new Error('Unavailable');
      },
    },
    request() {
      if (++attempts === 1) return new Response('', { status: 403 });
      return json({
        code: 0,
        data: { chapterInfo: { content: '<p>甲<br>乙 &amp; &lt;丙&gt;</p>' } },
      });
    },
  });
  const content = await plugin.parseChapter('/chapter/1/11/');
  assert.equal(content.html, '<p>甲</p><p>乙 &amp; &lt;丙&gt;</p>');
  assert.equal(rotations, 1);
  assert.equal(attempts, 2);
  const token = calls[1].url.searchParams.get('_csrfToken');
  assert.notEqual(token, 'old-token');
  assert.equal(
    calls[1].init.headers.Cookie,
    cookieWriterWorks ? undefined : `_csrfToken=${token}`,
  );
}
{
  const { plugin, calls } = await loadPlugin('Qidian', {
    request: () => new Response('', { status: 403 }),
  });
  await assert.rejects(plugin.parseChapter('/chapter/1/11/'), /HTTP 403/);
  assert.equal(calls.length, 2);
}

// Faloo uses the meta charset when HTTP omits it, retains text/image order, and
// preserves bare text, inline text, and line breaks in one traversal.
{
  const { plugin } = await loadPlugin('Faloo', {
    request: () =>
      new Response(
        '<meta charset="utf8"><div class="noveContent">开头<br>下一行<p>甲<img src="//images.example/a.jpg">乙 &amp; 丙</p><script>bad()</script></div>',
        { headers: { 'content-type': 'text/html' } },
      ),
  });
  const content = await plugin.parseChapter('/1_11.html');
  assert.equal(content.type, 'mixed');
  assert.equal(
    content.html,
    '<p>开头</p><p>下一行</p><p>甲</p><img src="https://images.example/a.jpg" /><p>乙 &amp; 丙</p>',
  );
}
{
  const prefix = new TextEncoder().encode('<div class="noveContent"><p>');
  const suffix = new TextEncoder().encode('</p></div>');
  const { plugin } = await loadPlugin('Faloo', {
    request: () =>
      new Response(
        new Uint8Array([...prefix, 0xd6, 0xd0, 0xce, 0xc4, ...suffix]),
      ),
  });
  assert.equal((await plugin.parseChapter('/1_11.html')).html, '<p>中文</p>');
}
{
  const { plugin } = await loadPlugin('Faloo', {
    request: () =>
      html(
        '<div class="noveContent"><p>预览正文</p><div class="c_c1"><p>请登录</p></div></div>',
      ),
  });
  const content = await plugin.parseChapter('/1_11.html');
  assert.equal(content.state, 'checkpoint');
  assert.equal(content.noCache, true);
  assert.equal(content.noPrefetch, true);
  assert.ok(content.html.startsWith('<p>预览正文</p>'));
}
{
  const { plugin, calls } = await loadPlugin('Faloo', {
    request(url) {
      if (url.pathname !== '/1.html') throw new Error('Directory unavailable');
      return html(
        '<h1 id="novelName">书名</h1><div class="DivTable"><a href="/1_11.html">第一章</a></div>',
      );
    },
  });
  const novel = await plugin.parseNovel('/1.html');
  assert.equal(novel.chapters[0].path, '/1_11.html');
  assert.equal(calls.length, 2);
}

// Invalid pagination must not cause requests to NaN/Infinity/fractional pages.
for (const name of ['Faloo', 'Fanqie', 'Qidian']) {
  const { plugin, calls } = await loadPlugin(name);
  for (const page of [0, -1, NaN, Infinity, 1.5]) {
    assert.deepEqual(await plugin.popularNovels(page, {}), []);
    assert.deepEqual(await plugin.searchNovels('书', page), []);
  }
  assert.equal(calls.length, 0);
}
{
  const { plugin, calls } = await loadPlugin('Ciweimao');
  for (const page of [0, -1, NaN, Infinity, 1.5]) {
    await assert.rejects(plugin.popularNovels(page, {}), /positive integer/);
    await assert.rejects(plugin.searchNovels('书', page), /positive integer/);
  }
  assert.equal(calls.length, 0);
}

// Latest sorting also applies to keyword listings; explicit sorting takes
// priority and zero-valued string filters must reach both Qidian endpoints.
{
  const { plugin, calls } = await loadPlugin('Qidian', {
    request: () => json({ code: 0, data: { records: [], bookInfo: { records: [] } } }),
  });
  await plugin.popularNovels(1, {
    showLatestNovels: true,
    filters: { keyword: { value: '书' }, access: { value: '0' }, status: { value: '0' } },
  });
  assert.equal(calls[0].url.pathname, '/webcommon/search/list');
  assert.equal(calls[0].url.searchParams.get('orderBy'), '4');
  assert.equal(calls[0].url.searchParams.get('vip'), '0');
  assert.equal(calls[0].url.searchParams.get('state'), '0');
  await plugin.popularNovels(1, {
    showLatestNovels: true,
    filters: { sort: { value: '3' }, access: { value: '0' }, status: { value: '0' } },
  });
  assert.equal(calls[1].url.pathname, '/webcommon/category/list');
  assert.equal(calls[1].url.searchParams.get('orderBy'), '3');
  assert.equal(calls[1].url.searchParams.get('isvip'), '0');
  assert.equal(calls[1].url.searchParams.get('isfinish'), '0');
  await plugin.popularNovels(1, {
    showLatestNovels: true,
    filters: { keyword: { value: '书' }, sort: { value: '3' } },
  });
  assert.equal(calls[2].url.searchParams.get('orderBy'), '3');
}

// HTTP failures must remain visible instead of masquerading as empty lists.
for (const name of ['Ciweimao', 'Faloo', 'Fanqie', 'Qidian']) {
  const { plugin } = await loadPlugin(name, {
    request: () => new Response('', { status: 503 }),
  });
  await assert.rejects(plugin.popularNovels(1, {}), /HTTP 503/);
  await assert.rejects(plugin.searchNovels('书', 1), /HTTP 503/);
}

// Script-only, counter-only, and empty API content must never become ready
// chapters. Ciweimao must exhaust both hosts before reporting no content.
for (const name of ['Ciweimao', 'Faloo', 'Fanqie', 'Qidian']) {
  const paths = {
    Ciweimao: '/chapter/11',
    Faloo: '/1_11.html',
    Fanqie: '/reader/11',
    Qidian: '/chapter/1/11/',
  };
  const { plugin, calls } = await loadPlugin(name, {
    settings: { fanqieProxyUrl: '' },
    request() {
      if (name === 'Ciweimao') {
        return html(
          '<div id="J_BookRead"><span>1</span><script>bad()</script></div>',
        );
      }
      if (name === 'Faloo') {
        return html(
          '<div class="noveContent"><script>bad()</script><p> </p></div>',
        );
      }
      if (name === 'Fanqie') {
        return html(statePage({ reader: { chapterData: { content: '' } } }));
      }
      return json({ code: 0, data: { chapterInfo: { content: '' } } });
    },
  });
  await assert.rejects(
    plugin.parseChapter(paths[name]),
    /empty|not found|unavailable/i,
  );
  assert.equal(calls.length, name === 'Ciweimao' ? 2 : 1);
}

// A disabled proxy leaves locked Fanqie content transient. A configured proxy
// retries a server error once and supports both documented item-ID templates.
{
  const { plugin, calls } = await loadPlugin('Fanqie', {
    settings: { fanqieProxyUrl: '' },
    request: () =>
      html(
        statePage({
          reader: {
            chapterData: { isChapterLock: true, content: '<p>预览</p>' },
          },
        }),
      ),
  });
  const result = await plugin.parseChapter('/reader/11');
  assert.equal(result.state, 'checkpoint');
  assert.equal(result.noCache, true);
  assert.equal(result.noPrefetch, true);
  assert.ok(result.html.includes('预览'));
  assert.equal(calls.length, 1);
}
for (const template of [
  'https://proxy.example/read/{itemId}',
  'https://proxy.example/read/{{item_id}}',
]) {
  let proxyAttempts = 0;
  const { plugin, calls } = await loadPlugin('Fanqie', {
    settings: { fanqieProxyUrl: template },
    request(url) {
      if (url.hostname === 'fanqienovel.com') {
        return html(
          statePage({ reader: { chapterData: { isChapterLock: true } } }),
        );
      }
      assert.equal(url.pathname, '/read/11');
      if (++proxyAttempts === 1) return new Response('', { status: 502 });
      return json({ code: 0, data: { data: { text: '<p>正文</p>' } } });
    },
  });
  const result = await plugin.parseChapter('/reader/11');
  assert.equal(result.state, 'ready');
  assert.equal(result.html, '<p>正文</p>');
  assert.equal(proxyAttempts, 2);
  assert.equal(calls.length, 3);
}

// Verification pages and malformed JSON must produce actionable errors.
{
  const { plugin, calls } = await loadPlugin('Ciweimao', {
    request: () => html('<div id="J_ManMachineVerify">Verify</div>'),
  });
  await assert.rejects(plugin.parseChapter('/chapter/11'), /CAPTCHA/);
  assert.equal(calls.length, 2);
}
for (const name of ['Fanqie', 'Qidian']) {
  const { plugin } = await loadPlugin(name, {
    request: () => html('not JSON'),
  });
  await assert.rejects(plugin.popularNovels(1, {}), /invalid JSON/i);
}
{
  const { plugin } = await loadPlugin('Qidian', {
    request: () => json({ code: 1, msg: 'API unavailable' }),
  });
  await assert.rejects(plugin.searchNovels('书', 1), /API unavailable/);
}

// The UTF-8 BOM takes precedence over a stale GBK header, while Faloo's legacy
// search encoding remains unchanged for Chinese titles.
{
  const body = new TextEncoder().encode(
    '\uFEFF<div class="noveContent"><p>中文</p></div>',
  );
  const { plugin } = await loadPlugin('Faloo', {
    request: () =>
      new Response(body, {
        headers: { 'content-type': 'text/html; charset=gbk' },
      }),
  });
  assert.equal((await plugin.parseChapter('/1_11.html')).html, '<p>中文</p>');
}
{
  const { plugin, calls } = await loadPlugin('Faloo', {
    request: () => html(''),
  });
  assert.deepEqual(await plugin.searchNovels('综漫', 2), []);
  assert.ok(calls[0].url.href.includes('/l/0/2.html?t=1&k=%u7EFC%u6F2B'));
}

// Mentioning VIP inside the story must not turn a readable chapter into an
// authentication checkpoint. Only the site's actual access notice should.
for (const text of [
  '他决定升级VIP会员，继续学习。',
  '升级VIP会员后，他继续学习。',
]) {
  const { plugin } = await loadPlugin('Faloo', {
    request: () => html(`<div class="noveContent"><p>${text}</p></div>`),
  });
  const result = await plugin.parseChapter('/1_11.html');
  assert.equal(result.state, 'ready');
  assert.equal(result.html, `<p>${text}</p>`);
}
for (const text of ['您还没有登录，请登录后在继续阅读！', '升级VIP会员']) {
  const { plugin } = await loadPlugin('Faloo', {
    request: () => html(`<div class="noveContent"><p>${text}</p></div>`),
  });
  const result = await plugin.parseChapter('/1_11.html');
  assert.equal(result.state, 'checkpoint');
  assert.equal(result.noCache, true);
  assert.equal(result.noPrefetch, true);
}

console.log(
  'Chinese plugin regressions passed (Fanqie, Ciweimao, Qidian, Faloo).',
);
