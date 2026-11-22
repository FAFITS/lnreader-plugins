import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import { set as setCookie } from '@nekori/cookie';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { type CheerioAPI, load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

const BASE_URL = 'https://syosetu.org';
const R18_BASE_URL = 'https://h.syosetu.org';

type CheerioSelection = ReturnType<CheerioAPI>;

type TargetRef = {
  id: string;
  isR18: boolean;
  chapterId?: string;
};

type BlockReason = 'geo_blocked' | 'cf_challenge' | 'r18_gate';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  const jpMatch = trimmed.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jpMatch) {
    return `${jpMatch[1]}-${jpMatch[2].padStart(2, '0')}-${jpMatch[3].padStart(2, '0')}`;
  }

  return null;
}

class SyosetuOrgPlugin extends NekoriBasePlugin {
  id = 'syosetu.org';
  name = 'Hameln (ハーメルン)';
  icon = 'icon.svg';
  customCSS = 'style.css';
  customJS = 'reader.js';
  site = BASE_URL;
  version = '1.0.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.MIXED;

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: `${BASE_URL}/`,
    },
  };

  pluginSettings: Plugin.PluginSettings = {
    syosetuOrgProxyUrl: {
      type: 'Text',
      label:
        'Proxy / Mirror URL (tùy chọn khi dùng IP ngoài Nhật Bản; hỗ trợ {url}, {encodedUrl} hoặc base URL)',
      value: '',
    },
    syosetuOrgCookie: {
      type: 'Text',
      label:
        'Cookie tùy chỉnh (tùy chọn: cf_clearance=...; over18=off; autologin=...)',
      value: '',
    },
    syosetuOrgAllowR18: {
      type: 'Switch',
      label: 'Cho phép R-18 (gửi cookie over18=off & hỗ trợ h.syosetu.org)',
      value: true,
    },
    syosetuOrgIncludeAuthorNotes: {
      type: 'Switch',
      label: 'Hiển thị lời tác giả (前書き / 後書き)',
      value: true,
    },
    syosetuOrgFetchStatus: {
      type: 'Switch',
      label:
        'Tải thêm trang ?mode=ss_detail để lấy trạng thái truyện (tốn thêm 1 request)',
      value: false,
    },
    syosetuOrgRequestDelay: {
      type: 'Select',
      label: 'Khoảng cách giữa các request (ms)',
      value: '1000',
      options: [
        { label: 'Không giới hạn (0 ms)', value: '0' },
        { label: '500 ms', value: '500' },
        { label: '1000 ms (khuyên dùng)', value: '1000' },
        { label: '1500 ms (an toàn)', value: '1500' },
        { label: '2500 ms', value: '2500' },
      ],
    },
  };

  filters = {
    keyword: {
      type: FilterTypes.TextInput,
      label: 'Từ khóa (キーワード)',
      value: '',
    },
    browse: {
      type: FilterTypes.Picker,
      label: 'Chế độ duyệt (モード)',
      value: 'popular',
      options: [
        { label: 'Đánh giá cao (総合評価順)', value: 'popular' },
        { label: 'Mới cập nhật (更新順)', value: 'latest' },
        { label: 'Bảng xếp hạng (ランキング)', value: 'rank' },
        { label: 'Trang chủ (トップ)', value: 'top' },
      ],
    },
    gensaku: {
      type: FilterTypes.Picker,
      label: 'Thể loại gốc (原作)',
      value: '',
      options: [
        { label: 'Tất cả (すべて)', value: '' },
        { label: 'Original (オリジナル)', value: '原作：オリジナル' },
      ],
    },
    customGensaku: {
      type: FilterTypes.TextInput,
      label: 'Tác phẩm gốc tùy chỉnh (vd: 東方Project)',
      value: '',
    },
  } satisfies Filters;

  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestTime = 0;

  private getSettingString(key: string, fallback: string): string {
    const val = storage.get(key);
    return typeof val === 'string' ? val.trim() : fallback;
  }

  private getSettingBool(key: string, fallback: boolean): boolean {
    const val = storage.get(key);
    return typeof val === 'boolean' ? val : fallback;
  }

  private getRequestDelay(): number {
    const raw = storage.get('syosetuOrgRequestDelay');
    const ms = Number(raw ?? this.pluginSettings.syosetuOrgRequestDelay.value);
    return Number.isFinite(ms) && ms >= 0 ? ms : 1000;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitForRequestSlot(): Promise<void> {
    const scheduled = this.requestQueue.then(async () => {
      const requestDelay = this.getRequestDelay();
      const elapsed = Date.now() - this.lastRequestTime;
      if (this.lastRequestTime > 0 && elapsed < requestDelay) {
        await this.delay(requestDelay - elapsed);
      }
      this.lastRequestTime = Date.now();
    });
    this.requestQueue = scheduled.catch(() => undefined);
    await scheduled;
  }

  private parseTargetRef(rawPath: string): TargetRef | undefined {
    const trimmed = rawPath.trim();
    if (!trimmed) return undefined;

    if (/^\d+$/.test(trimmed)) {
      return { id: trimmed, isR18: false };
    }

    const r18Prefix =
      /^\/?r18\//i.test(trimmed) ||
      /^https?:\/\/h\.syosetu\.org/i.test(trimmed);

    const novelMatch = trimmed.match(
      /(?:^|\/)novel\/(\d+)(?:\/(\d+)\.html)?\/?(?:[?#].*)?$/i,
    );
    if (novelMatch) {
      return {
        id: novelMatch[1],
        isR18: r18Prefix,
        chapterId: novelMatch[2],
      };
    }

    const legacySubdomainMatch = trimmed.match(
      /^https?:\/\/novel\.syosetu\.org\/(\d+)(?:\/(\d+)\.html)?\/?(?:[?#].*)?$/i,
    );
    if (legacySubdomainMatch) {
      return {
        id: legacySubdomainMatch[1],
        isR18: false,
        chapterId: legacySubdomainMatch[2],
      };
    }

    return undefined;
  }

  private formatNovelPath(id: string, isR18: boolean): string {
    return isR18 ? `/r18/novel/${id}/` : `/novel/${id}/`;
  }

  private formatChapterPath(
    id: string,
    chapterId: string,
    isR18: boolean,
  ): string {
    return isR18
      ? `/r18/novel/${id}/${chapterId}.html`
      : `/novel/${id}/${chapterId}.html`;
  }

  private buildOriginUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (/^\/?r18\//i.test(pathOrUrl)) {
      const stripped = pathOrUrl.replace(/^\/?r18/i, '');
      return `${R18_BASE_URL}${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
    }
    return `${BASE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
  }

  private applyProxy(targetUrl: string): string {
    const proxy = this.getSettingString('syosetuOrgProxyUrl', '').replace(
      /\/+$/,
      '',
    );
    if (!proxy) return targetUrl;

    if (/\{url\}|\{encodedUrl\}/i.test(proxy)) {
      return proxy
        .replace(/\{encodedUrl\}/gi, encodeURIComponent(targetUrl))
        .replace(/\{url\}/gi, targetUrl);
    }

    if (/^https?:\/\//i.test(proxy)) {
      return targetUrl.replace(/^https?:\/\/(?:h\.)?syosetu\.org/i, proxy);
    }

    return targetUrl;
  }

  private async ensureAgeCookies(allowR18: boolean): Promise<string> {
    const cookieParts: string[] = [];
    if (allowR18) {
      cookieParts.push('over18=off');
      for (const origin of [BASE_URL, R18_BASE_URL]) {
        await setCookie(origin, {
          name: 'over18',
          value: 'off',
          path: '/',
        }).catch(() => undefined);
      }
    }

    const customCookie = this.getSettingString('syosetuOrgCookie', '');
    if (customCookie) {
      cookieParts.push(customCookie);
    }
    return cookieParts.join('; ');
  }

  private detectBlockReason(
    status: number,
    html: string,
    headers?: Headers,
  ): BlockReason | undefined {
    const cfMitigated = headers?.get('cf-mitigated')?.toLowerCase() || '';
    if (
      cfMitigated === 'challenge' ||
      /<title[^>]*>\s*(?:Just a moment[.…]*|Please Wait[.…]* \| Cloudflare|しばらくお待ちください[.…]*)\s*<\/title>/i.test(
        html,
      ) ||
      /window\._cf_chl_opt\s*=|id=["']cf-browser-verification["']/i.test(html)
    ) {
      return 'cf_challenge';
    }

    if (
      status === 403 &&
      (/<title[^>]*>\s*Attention Required!\s*\|\s*Cloudflare\s*<\/title>/i.test(
        html,
      ) ||
        /Sorry,\s*you have been blocked/i.test(html) ||
        /cloudflare/i.test(html))
    ) {
      return 'geo_blocked';
    }

    if (
      /<title[^>]*>\s*R18閲覧確認ページ\s*<\/title>|あなたは18歳以上ですか|この先はR-18作品/.test(
        html,
      )
    ) {
      return 'r18_gate';
    }

    return undefined;
  }

  private formatBlockMessage(reason: BlockReason, status: number): string {
    if (reason === 'geo_blocked') {
      return (
        `Truy cập syosetu.org bị Cloudflare WAF chặn (HTTP ${status} - Sorry, you have been blocked). ` +
        'Trang web hiện chặn IP ngoài Nhật Bản và IP datacenter/CORS proxy công cộng. ' +
        'Hãy dùng VPN/proxy có IP Nhật Bản (ưu tiên IP dân cư/sạch) hoặc cấu hình Proxy/Mirror URL trong cài đặt plugin.'
      );
    }
    if (reason === 'cf_challenge') {
      return (
        'syosetu.org yêu cầu xác minh Cloudflare Managed Challenge (Just a moment...). ' +
        'Hãy mở trang trong WebView (hoặc Spawn New Tab trong Playground) để vượt qua xác minh và lưu cookie cf_clearance, rồi thử tải lại.'
      );
    }
    return (
      'Tác phẩm R-18 yêu cầu xác nhận độ tuổi (over18=off). ' +
      'Hãy bật tùy chọn Cho phép R-18 trong cài đặt plugin hoặc xác nhận trong WebView.'
    );
  }

  private async fetchPage(
    pathOrUrl: string,
    referer = `${BASE_URL}/`,
  ): Promise<{
    html: string;
    finalUrl: string;
    status: number;
    block?: BlockReason;
  }> {
    const targetUrl = this.buildOriginUrl(pathOrUrl);
    const requestUrl = this.applyProxy(targetUrl);
    const allowR18 = this.getSettingBool('syosetuOrgAllowR18', true);
    const cookieHeader = await this.ensureAgeCookies(allowR18);

    const headers: Record<string, string> = {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      Referer: referer,
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
    };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    for (let attempt = 0; attempt <= 1; attempt++) {
      await this.waitForRequestSlot();
      const response = await fetchApi(requestUrl, { headers });
      const html = await response.text();
      const block = this.detectBlockReason(
        response.status,
        html,
        response.headers,
      );

      if (block) {
        return {
          html,
          finalUrl: response.url || targetUrl,
          status: response.status,
          block,
        };
      }

      if (
        (response.status === 429 || response.status === 503) &&
        attempt === 0
      ) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter >= 0
            ? Math.min(retryAfter * 1000, 10000)
            : 2500;
        await this.delay(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `Hameln request failed (${targetUrl}): HTTP ${response.status}`,
        );
      }

      return {
        html,
        finalUrl: response.url || targetUrl,
        status: response.status,
      };
    }

    throw new Error(`Hameln request failed (${targetUrl})`);
  }

  private assertPageReady(res: {
    html: string;
    status: number;
    block?: BlockReason;
  }): void {
    if (res.block) {
      throw new Error(this.formatBlockMessage(res.block, res.status));
    }
    if (
      /投稿者が削除、もしくは間違ったアドレスを指定しています|この作品は投稿者によって削除されました|この作品は完全非公開設定です|この小説は非公開設定になっています/.test(
        res.html,
      )
    ) {
      throw new Error('Tác phẩm đã bị tác giả xóa hoặc đặt ở chế độ riêng tư.');
    }
  }

  private cleanTitleText($: CheerioAPI, el: CheerioSelection): string {
    const clone = el.clone();
    clone.find('.search_novel_order, .date').remove();
    return clone.text().replace(/\s+/g, ' ').trim();
  }

  private parseNovelList(html: string): Plugin.NovelItem[] {
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    const pushCandidate = (anchor: CheerioSelection) => {
      const href = anchor.attr('href');
      if (!href || href.includes('#') || href.includes('mode=review')) return;
      const ref = this.parseTargetRef(href);
      if (!ref || ref.chapterId) return;

      const key = `${ref.isR18 ? 'r18' : 'std'}:${ref.id}`;
      if (seen.has(key)) return;

      const name = this.cleanTitleText($, anchor);
      if (!name || /^(?:目\s*次|次の話|前の話|ホーム|ランキング)$/.test(name)) {
        return;
      }

      seen.add(key);
      novels.push({
        name,
        path: this.formatNovelPath(ref.id, ref.isR18),
        cover: defaultCover,
      });
    };

    // Desktop search & ranking cards (.section3)
    $('.section3').each((_idx, el) => {
      const container = $(el);
      const primary = container
        .find(
          'div.blo_title_base > a[href*="/novel/"], a.search_novel_title[href*="/novel/"]',
        )
        .first();
      if (primary.length) {
        pushCandidate(primary);
        return;
      }
      const fallback = container.find('a[href*="/novel/"]').first();
      if (fallback.length) pushCandidate(fallback);
    });

    // Mobile / modern search & ranking cards (.search_box, .section)
    if (!novels.length) {
      $(
        'a.search_novel_title[href*="/novel/"], .search_box a[href*="/novel/"]',
      ).each((_idx, el) => {
        pushCandidate($(el));
      });
    }

    // Home / top page & author works (ul.entry)
    if (!novels.length) {
      $('ul.entry > li > a[href*="/novel/"]').each((_idx, el) => {
        pushCandidate($(el));
      });
    }

    // Generic fallback for novel links
    if (!novels.length) {
      $('a[href*="/novel/"]').each((_idx, el) => {
        pushCandidate($(el));
      });
    }

    return novels;
  }

  private async fetchSearchResults(
    params: URLSearchParams,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const res = await this.fetchPage(
      `${BASE_URL}/search/?${params.toString()}`,
    );
    this.assertPageReady(res);

    // Avoid repeating page 1 endlessly when pageNo exceeds total pages
    if (pageNo > 1) {
      const $ = loadCheerio(res.html);
      const hasPagination = $('a[href*="page="], a[rel="next"]').length > 0;
      if (!hasPagination) return [];
      const hasAdjacent =
        $(`a[href*="page=${pageNo - 1}"]`).length > 0 ||
        $(`a[href*="page=${pageNo + 1}"]`).length > 0 ||
        $('a[rel="next"]').length > 0;
      if (pageNo > 2 && !hasAdjacent) return [];
    }

    return this.parseNovelList(res.html);
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (!Number.isInteger(pageNo) || pageNo < 1) return [];

    const filters = options?.filters;
    const keyword = filters?.keyword?.value?.trim() || '';
    const customGensakuRaw = filters?.customGensaku?.value?.trim() || '';
    const selectedGensaku = filters?.gensaku?.value || '';
    const gensaku = customGensakuRaw
      ? customGensakuRaw.startsWith('原作：') ||
        customGensakuRaw.startsWith('原作:')
        ? customGensakuRaw
        : `原作：${customGensakuRaw}`
      : selectedGensaku;

    const browse = options?.showLatestNovels
      ? 'latest'
      : filters?.browse?.value || 'popular';

    if (browse === 'rank' && !keyword && !gensaku) {
      if (pageNo > 1) return [];
      const res = await this.fetchPage(`${BASE_URL}/?mode=rank`);
      this.assertPageReady(res);
      return this.parseNovelList(res.html);
    }

    if (browse === 'top' && !keyword && !gensaku) {
      if (pageNo > 1) return [];
      const res = await this.fetchPage(`${BASE_URL}/`);
      this.assertPageReady(res);
      return this.parseNovelList(res.html);
    }

    const searchSortType = browse === 'latest' ? '0' : '28';
    const params = new URLSearchParams({
      mode: 'search',
      type: searchSortType,
      search_type: '0',
      page: String(pageNo),
    });
    if (keyword) params.set('word', keyword);
    if (gensaku) params.set('gensaku', gensaku);

    return this.fetchSearchResults(params, pageNo);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term || !Number.isInteger(pageNo) || pageNo < 1) return [];

    const params = new URLSearchParams({
      mode: 'search',
      word: term,
      type: '28',
      search_type: '0',
      page: String(pageNo),
    });

    return this.fetchSearchResults(params, pageNo);
  }

  private extractTextWithBreaks($: CheerioAPI, el: CheerioSelection): string {
    const clone = el.clone();
    clone.find('script, style, hr').remove();
    clone.find('br').replaceWith('\n');
    return clone
      .text()
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private parseStatusFromText(text: string): string {
    if (/完結/.test(text)) return NovelStatus.Completed;
    if (/連載中/.test(text)) return NovelStatus.Ongoing;
    if (/未完/.test(text)) return NovelStatus.OnHiatus;
    if (/短編/.test(text)) return NovelStatus.Completed;
    if (/連載/.test(text)) return NovelStatus.Ongoing;
    return NovelStatus.Unknown;
  }

  private extractChapters(
    $: CheerioAPI,
    novelId: string,
    isR18: boolean,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    // Modern layout (2026+): section.episode-list
    const episodeList = $('section.episode-list');
    if (episodeList.length > 0) {
      let currentVolume: string | undefined;
      episodeList.find('li').each((_idx, el) => {
        const $item = $(el);
        if ($item.hasClass('episode-list__chapter')) {
          const volTitle = $item
            .find('.episode-list__chapter-title')
            .text()
            .replace(/\s+/g, ' ')
            .trim();
          if (volTitle) currentVolume = volTitle;
          return;
        }

        const link = $item
          .find('a.episode-list__link, a[href*=".html"]')
          .first();
        const href = link.attr('href');
        const epMatch = href?.match(/(\d+)\.html/);
        if (!href || !epMatch) return;

        const chapterId = epMatch[1];
        const path = this.formatChapterPath(novelId, chapterId, isR18);
        if (seen.has(path)) return;
        seen.add(path);

        const titleEl = link.find('.episode-list__title').first();
        const rawName = titleEl.length
          ? titleEl.text()
          : this.cleanTitleText($, link);
        const name = rawName.replace(/\s+/g, ' ').trim() || `第${chapterId}話`;

        const timeEl = link.find('time').first();
        const releaseTime = normalizeDate(
          timeEl.attr('datetime') || timeEl.text(),
        );

        const chapter: Plugin.ChapterItem = {
          name,
          path,
          releaseTime,
          chapterNumber: Number(chapterId),
        };
        if (currentVolume) chapter.page = currentVolume;
        chapters.push(chapter);
      });

      if (chapters.length > 0) return chapters;
    }

    // Legacy layout: div#maind table
    const table = $('div#maind table').first();
    if (table.length > 0) {
      let currentVolume: string | undefined;
      table.find('tr').each((_idx, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        const hasChapterLink = $row.find('a[href*=".html"]').length > 0;
        const colspanCell = cells.filter('[colspan]').first();
        if (!hasChapterLink && colspanCell.length > 0) {
          const strongText = colspanCell
            .find('strong')
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim();
          if (strongText) {
            currentVolume = strongText;
            return;
          }
        }

        const link = $row.find('a[href*=".html"]').first();
        const href = link.attr('href');
        if (!href || href.includes('index.html')) return;
        const epMatch = href.match(/(\d+)\.html/);
        if (!epMatch) return;

        const chapterId = epMatch[1];
        const path = this.formatChapterPath(novelId, chapterId, isR18);
        if (seen.has(path)) return;
        seen.add(path);

        const name =
          link.text().replace(/\s+/g, ' ').trim() || `第${chapterId}話`;
        const dateCellText =
          cells.last().find('time').attr('datetime') || cells.last().text();
        const releaseTime = normalizeDate(dateCellText);

        const chapter: Plugin.ChapterItem = {
          name,
          path,
          releaseTime,
          chapterNumber: Number(chapterId),
        };
        if (currentVolume) chapter.page = currentVolume;
        chapters.push(chapter);
      });
    }

    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const ref = this.parseTargetRef(novelPath);
    if (!ref) {
      throw new Error(`Invalid Hameln novel path: ${novelPath}`);
    }

    const canonicalPath = this.formatNovelPath(ref.id, ref.isR18);
    const res = await this.fetchPage(canonicalPath);
    this.assertPageReady(res);

    const isR18 =
      ref.isR18 || /^https?:\/\/h\.syosetu\.org/i.test(res.finalUrl);
    const resolvedPath = this.formatNovelPath(ref.id, isR18);

    const $ = loadCheerio(res.html);
    const maind = $('#maind');

    const title =
      maind.find('span[itemprop="name"]').first().text().trim() ||
      maind.find('.ss p span a').first().text().trim() ||
      $('title')
        .text()
        .replace(/\s*-\s*ハーメルン\s*$/, '')
        .trim() ||
      `Hameln ${ref.id}`;

    let author =
      maind.find('span[itemprop="author"] a').first().text().trim() ||
      maind.find('[itemprop="author"]').first().text().trim() ||
      maind.find('.ss p a[href*="/user/"]').first().text().trim();

    if (!author) {
      const firstSsText = maind.find('.ss').first().text();
      const authorMatch = firstSsText.match(/作(?:者)?[：:]\s*([^\n]+)/);
      if (authorMatch?.[1]) {
        author = authorMatch[1].trim();
      }
    }

    const ogImage =
      $('meta[property="og:image"]').attr('content')?.trim() ||
      $('meta[itemprop="image"]').attr('content')?.trim();
    const cover =
      ogImage && /^https?:\/\//i.test(ogImage) ? ogImage : defaultCover;

    const genreList: string[] = [];
    const addGenre = (text: string) => {
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (cleaned && !genreList.includes(cleaned)) {
        genreList.push(cleaned);
      }
    };

    maind
      .find('[itemprop="genre"] a, [itemprop="keywords"] a')
      .each((_i, el) => {
        addGenre($(el).text());
      });
    maind
      .find('.ss')
      .first()
      .find('a.alert_color, a[href*="mode=search"]')
      .each((_i, el) => {
        addGenre($(el).text());
      });

    const ssDivs = maind.find('.ss');
    let summary = '';
    if (ssDivs.length >= 2 && $('#honbun').length === 0) {
      summary = this.extractTextWithBreaks($, ssDivs.eq(1));
    }
    if (!summary) {
      summary =
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[property="og:description"]').attr('content')?.trim() ||
        '';
    }

    let chapters = this.extractChapters($, ref.id, isR18);
    let status: string = NovelStatus.Unknown;

    // Oneshot (短編): the novel TOC URL renders #honbun directly
    if (chapters.length === 0 && $('#honbun').length > 0) {
      status = NovelStatus.Completed;
      chapters = [
        {
          name: title || '短編',
          path: resolvedPath,
          chapterNumber: 1,
        },
      ];
    }

    if (this.getSettingBool('syosetuOrgFetchStatus', false)) {
      try {
        const detailOrigin = isR18 ? R18_BASE_URL : BASE_URL;
        const detailRes = await this.fetchPage(
          `${detailOrigin}/?mode=ss_detail&nid=${ref.id}`,
          this.buildOriginUrl(resolvedPath),
        );
        if (!detailRes.block) {
          const detail$ = loadCheerio(detailRes.html);
          const detailText = detail$('table').text();
          if (detailText) {
            status = this.parseStatusFromText(detailText);
          }
        }
      } catch {
        // Optional detail metadata; ignore secondary failures
      }
    }

    return {
      name: title,
      path: resolvedPath,
      cover,
      author: author || undefined,
      summary: summary || undefined,
      genres: genreList.length ? genreList.join(', ') : undefined,
      status,
      chapters,
    };
  }

  private renderBodyFragment(
    $: CheerioAPI,
    container: CheerioSelection,
  ): { html: string; hasText: boolean; hasImages: boolean } {
    const clone = container.clone();
    clone
      .find('script, style, noscript, #maegaki_open, #atogaki_open, .novelnavi')
      .remove();

    let hasImages = false;
    clone.find('a[name="img"][href], a[href*="/img/user/"]').each((_i, el) => {
      const $a = $(el);
      const rawHref = $a.attr('href')?.trim();
      if (!rawHref) return;
      const src = rawHref
        .replace(/^http:\/\//i, 'https://')
        .replace(
          /^https:\/\/syosetu\.org\/img\//i,
          'https://img.syosetu.org/img/',
        );
      const alt = $a.attr('alt')?.trim() || '挿絵';
      $a.replaceWith(
        `<p><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" /></p>`,
      );
      hasImages = true;
    });

    if (clone.find('img').length > 0) {
      hasImages = true;
    }

    const html = (clone.html() || '').trim();
    const hasText = clone.text().replace(/[\s\u3000]+/g, '').length > 0;
    return { html, hasText, hasImages };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const ref = this.parseTargetRef(chapterPath);
    if (!ref) {
      throw new Error(`Invalid Hameln chapter path: ${chapterPath}`);
    }

    const normalizedPath = ref.chapterId
      ? this.formatChapterPath(ref.id, ref.chapterId, ref.isR18)
      : this.formatNovelPath(ref.id, ref.isR18);

    const res = await this.fetchPage(
      normalizedPath,
      this.buildOriginUrl(this.formatNovelPath(ref.id, ref.isR18)),
    );

    if (res.block) {
      const message = this.formatBlockMessage(res.block, res.status);
      return {
        state: 'checkpoint',
        type: 'novel',
        html:
          `<div class="hameln-checkpoint">` +
          `<p><strong>${escapeHtml(message)}</strong></p>` +
          `<p>URL: <code>${escapeHtml(this.buildOriginUrl(normalizedPath))}</code></p>` +
          `<button type="button" class="hameln-retry-btn">Thử tải lại / Reload</button>` +
          `</div>`,
        checkpointMessage: message,
        noCache: true,
        noPrefetch: true,
      };
    }

    this.assertPageReady(res);

    const $ = loadCheerio(res.html);
    const honbun = $('#honbun').first();
    if (honbun.length === 0) {
      throw new Error(
        `Hameln chapter body (#honbun) was not found for ${normalizedPath}`,
      );
    }

    const includeNotes = this.getSettingBool(
      'syosetuOrgIncludeAuthorNotes',
      true,
    );

    const titleSpan = $('#maind div.ss span[style*="font-size:120%"]')
      .filter((_i, el) => $(el).find('a').length === 0)
      .first();
    let chapterTitle = '';
    if (titleSpan.length > 0) {
      const titleClone = titleSpan.clone();
      titleClone.find('br').replaceWith(' — ');
      chapterTitle = titleClone.text().replace(/\s+/g, ' ').trim();
    }

    const sections: string[] = [];
    let hasText = false;
    let hasImages = false;

    if (chapterTitle) {
      sections.push(`<h1>${escapeHtml(chapterTitle)}</h1>`);
      hasText = true;
    }

    if (includeNotes) {
      const maegaki = $('#maegaki').first();
      if (maegaki.length > 0) {
        const rendered = this.renderBodyFragment($, maegaki);
        if (rendered.html) {
          sections.push(
            `<div class="hameln-maegaki">${rendered.html}</div><hr />`,
          );
          hasText = hasText || rendered.hasText;
          hasImages = hasImages || rendered.hasImages;
        }
      }
    }

    const mainBody = this.renderBodyFragment($, honbun);
    if (mainBody.html) {
      sections.push(`<div class="hameln-honbun">${mainBody.html}</div>`);
      hasText = hasText || mainBody.hasText;
      hasImages = hasImages || mainBody.hasImages;
    }

    if (includeNotes) {
      const atogaki = $('#atogaki').first();
      if (atogaki.length > 0) {
        const rendered = this.renderBodyFragment($, atogaki);
        if (rendered.html) {
          sections.push(
            `<hr /><div class="hameln-atogaki">${rendered.html}</div>`,
          );
          hasText = hasText || rendered.hasText;
          hasImages = hasImages || rendered.hasImages;
        }
      }
    }

    if (!sections.length) {
      throw new Error('Hameln chapter content was empty');
    }

    const type: Plugin.ChapterContentType =
      hasText && hasImages ? 'mixed' : hasImages ? 'image' : 'novel';

    return {
      state: 'ready',
      type,
      html: sections.join('\n'),
    };
  }

  override resolveUrl(path: string, isNovel = true): string {
    const ref = this.parseTargetRef(path);
    if (ref) {
      const target =
        !isNovel && ref.chapterId
          ? this.formatChapterPath(ref.id, ref.chapterId, ref.isR18)
          : this.formatNovelPath(ref.id, ref.isR18);
      return this.buildOriginUrl(target);
    }
    return this.buildOriginUrl(path);
  }
}

export default new SyosetuOrgPlugin();
