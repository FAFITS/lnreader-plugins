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

type PageFetchResult = {
  html: string;
  finalUrl: string;
  status: number;
  block?: BlockReason;
};

const CHAPTER_DATE_LINE_RE =
  /^\d{4}[/年]\d{1,2}[/月]\d{1,2}日?(?:\([月火水木金土日]\))?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;

const NAV_CHAPTER_NOISE_RE =
  /^(?:目\s*次|次の話|前の話|ホーム|ランキング|話一覧|各話一覧|本文|読者層が似ている作品)$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

function normalizeUrlProtocol(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
}

function encodeQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
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

function normalizeHamelnImageUrl(rawUrl: string): string {
  let normalized = normalizeUrlProtocol(rawUrl);
  if (normalized.startsWith('/')) {
    normalized = `https://img.syosetu.org${normalized}`;
  } else if (/^http:\/\//i.test(normalized)) {
    normalized = normalized.replace(/^http:\/\//i, 'https://');
  }
  return normalized.replace(
    /^https:\/\/(?:h\.)?syosetu\.org\/img\//i,
    'https://img.syosetu.org/img/',
  );
}

function cleanChapterLines(rawText: string): string {
  return rawText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(line => !CHAPTER_DATE_LINE_RE.test(line))
    .filter(line => line !== '(改)')
    .filter(line => !/^[●○◆◇■□★☆※・]$/.test(line))
    .join(' ')
    .trim();
}

class SyosetuOrgPlugin extends NekoriBasePlugin {
  id = 'syosetu.org';
  name = 'Hameln (ハーメルン)';
  icon = 'icon.svg';
  customCSS = 'style.css';
  customJS = 'reader.js';
  site = BASE_URL;
  version = '1.0.1';
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
  private ageCookieSynced = false;

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
    const ms = Number(
      raw ?? this.pluginSettings.syosetuOrgRequestDelay.value,
    );
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
    const normalized = normalizeUrlProtocol(rawPath);
    if (!normalized) return undefined;

    if (/^\d+$/.test(normalized)) {
      return { id: normalized, isR18: false };
    }

    const r18Prefix =
      /^\/?r18\//i.test(normalized) ||
      /^https?:\/\/h\.syosetu\.org/i.test(normalized) ||
      /[?&]mode=search_r18\b/i.test(normalized);

    const novelMatch = normalized.match(
      /(?:^|\/)novel\/(\d+)(?:\/(?:index\.html|(\d+)\.html))?\/?(?:[?#].*)?$/i,
    );
    if (novelMatch) {
      return {
        id: novelMatch[1],
        isR18: r18Prefix,
        chapterId: novelMatch[2],
      };
    }

    const legacySubdomainMatch = normalized.match(
      /^https?:\/\/novel\.syosetu\.org\/(\d+)(?:\/(?:index\.html|(\d+)\.html))?\/?(?:[?#].*)?$/i,
    );
    if (legacySubdomainMatch) {
      return {
        id: legacySubdomainMatch[1],
        isR18: false,
        chapterId: legacySubdomainMatch[2],
      };
    }

    const detailMatch = normalized.match(/[?&]nid=(\d+)(?:&|$)/i);
    if (
      detailMatch &&
      (/[?&]mode=(?:ss_detail|ss_detail3|ss_view_all)/i.test(normalized) ||
        /^https?:\/\/(?:h\.)?syosetu\.org\/\?/i.test(normalized))
    ) {
      return {
        id: detailMatch[1],
        isR18: r18Prefix,
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
    const normalized = normalizeUrlProtocol(pathOrUrl);
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (/^\/?r18\//i.test(normalized)) {
      const stripped = normalized.replace(/^\/?r18/i, '');
      return `${R18_BASE_URL}${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
    }
    return `${BASE_URL}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
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
      if (!this.ageCookieSynced) {
        const sharedOk = await setCookie(BASE_URL, {
          name: 'over18',
          value: 'off',
          domain: '.syosetu.org',
          path: '/',
        }).catch(() => false);
        for (const origin of [BASE_URL, R18_BASE_URL]) {
          await setCookie(origin, {
            name: 'over18',
            value: 'off',
            path: '/',
          }).catch(() => false);
        }
        if (sharedOk) {
          this.ageCookieSynced = true;
        }
      }
    } else {
      this.ageCookieSynced = false;
    }

    const customCookie = this.getSettingString('syosetuOrgCookie', '')
      .replace(/^cookie\s*:\s*/i, '')
      .replace(/[\r\n]+/g, ' ')
      .trim();
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
      /window\._cf_chl_opt\s*=|id=["']cf-browser-verification["']|\/cdn-cgi\/challenge-platform\/h\//i.test(
        html,
      )
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
      /<title[^>]*>\s*R18閲覧確認ページ\s*<\/title>|あなたは18歳以上ですか|あなたは成人ですか|この先はR-18作品|18歳未満の方の閲覧/.test(
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
        'Trang web hiện chặn một số dải IP ngoài Nhật Bản hoặc datacenter/CORS proxy công cộng. ' +
        'Hãy đổi mạng/VPN sạch hơn hoặc cấu hình Proxy/Mirror URL trong cài đặt plugin.'
      );
    }
    if (reason === 'cf_challenge') {
      return (
        'syosetu.org yêu cầu xác minh Cloudflare Managed Challenge (Just a moment...). ' +
        'Hãy mở trang trong WebView (hoặc Control -> Spawn New Tab trong Playground) để vượt qua xác minh và lưu cookie cf_clearance, rồi thử tải lại.'
      );
    }
    return (
      'Tác phẩm R-18 yêu cầu xác nhận độ tuổi (over18=off). ' +
      'Hãy bật tùy chọn Cho phép R-18 trong cài đặt plugin hoặc xác nhận trong WebView.'
    );
  }

  private async fetchPage(
    pathOrUrl: string,
    referer?: string,
  ): Promise<PageFetchResult> {
    const targetUrl = this.buildOriginUrl(pathOrUrl);
    const requestUrl = this.applyProxy(targetUrl);
    const allowR18 = this.getSettingBool('syosetuOrgAllowR18', true);
    const cookieHeader = await this.ensureAgeCookies(allowR18);
    const defaultReferer = targetUrl.startsWith(R18_BASE_URL)
      ? `${R18_BASE_URL}/`
      : `${BASE_URL}/`;

    const headers: Record<string, string> = {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      Referer: referer || defaultReferer,
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

      if ((response.status === 429 || response.status === 503) && attempt === 0) {
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

  private assertPageReady(res: PageFetchResult): void {
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

  private cleanAnchorText($: CheerioAPI, el: CheerioSelection): string {
    const clone = el.clone();
    clone
      .find(
        '.search_novel_order, .date, .episode-list__mark, .episode-list__date, .episode-list__revision, time',
      )
      .remove();
    clone.find('br').replaceWith('\n');
    return cleanChapterLines(clone.text());
  }

  private parseNovelList(html: string): Plugin.NovelItem[] {
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    const pushCandidate = (anchor: CheerioSelection) => {
      if (
        anchor.closest('#header, #footer, #nav2, .topicPath').length > 0
      ) {
        return;
      }

      const href = anchor.attr('href');
      if (!href || href.includes('#') || href.includes('mode=review')) return;
      const ref = this.parseTargetRef(href);
      if (!ref || ref.chapterId) return;

      const key = `${ref.isR18 ? 'r18' : 'std'}:${ref.id}`;
      if (seen.has(key)) return;

      const name = this.cleanAnchorText($, anchor);
      if (!name || NAV_CHAPTER_NOISE_RE.test(name)) {
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
          'div.blo_title_base > a[href*="/novel/"], a.blo_title_link[href*="/novel/"], h3 > a[href*="/novel/"], a.search_novel_title[href*="/novel/"]',
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
        'a.search_novel_title[href*="/novel/"], .search_box a[href*="/novel/"], div.section[id^="h"] a[href*="/novel/"]',
      ).each((_idx, el) => {
        pushCandidate($(el));
      });
    }

    // Mobile top page & author works (ul.entry)
    if (!novels.length) {
      $('ul.entry > li > a[href*="/novel/"]').each((_idx, el) => {
        pushCandidate($(el));
      });
    }

    // Desktop home / top sections (#main div.section.normal)
    if (!novels.length) {
      $('#main div.section.normal a[href*="/novel/"]').each((_idx, el) => {
        pushCandidate($(el));
      });
    }

    // Generic fallback for novel links outside chrome
    if (!novels.length) {
      $('a[href*="/novel/"]').each((_idx, el) => {
        pushCandidate($(el));
      });
    }

    return novels;
  }

  private hasSearchPageContent(
    $: CheerioAPI,
    pageNo: number,
  ): boolean {
    if (pageNo <= 1) return true;

    const activePageText = $('div.paging strong').first().text().trim();
    if (/^\d+$/.test(activePageText) && Number(activePageText) !== pageNo) {
      return false;
    }

    const hasPagination =
      $('div.paging a, a[href*="page="], a[rel="next"], a[rel="prev"]')
        .length > 0;
    if (!hasPagination) return false;

    if (pageNo > 2) {
      const hasAdjacent =
        $(`a[href*="page=${pageNo - 1}"]`).length > 0 ||
        $(`a[href*="page=${pageNo + 1}"]`).length > 0 ||
        $('a[rel="next"]').length > 0 ||
        Boolean(activePageText && Number(activePageText) === pageNo);
      if (!hasAdjacent) return false;
    }

    return true;
  }

  private async fetchSearchResults(
    params: Record<string, string>,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const res = await this.fetchPage(`${BASE_URL}/search/?${encodeQuery(params)}`);
    this.assertPageReady(res);

    const $ = loadCheerio(res.html);
    if (!this.hasSearchPageContent($, pageNo)) {
      return [];
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
    const params: Record<string, string> = {
      mode: 'search',
      type: searchSortType,
      search_type: '0',
      page: String(pageNo),
    };
    if (keyword) params.word = keyword;
    if (gensaku) params.gensaku = gensaku;

    return this.fetchSearchResults(params, pageNo);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term || !Number.isInteger(pageNo) || pageNo < 1) return [];

    return this.fetchSearchResults(
      {
        mode: 'search',
        word: term,
        type: '28',
        search_type: '0',
        page: String(pageNo),
      },
      pageNo,
    );
  }

  private extractTextWithBreaks(
    $: CheerioAPI,
    el: CheerioSelection,
  ): string {
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

  private extractEpisodeId(
    href: string | undefined,
    novelId: string,
  ): string | undefined {
    if (!href) return undefined;
    const trimmed = href.trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.includes('mode=') ||
      /(?:^|\/)index\.html(?:[?#].*)?$/i.test(trimmed)
    ) {
      return undefined;
    }

    const relMatch = trimmed.match(/^(?:\.\/)?(\d+)\.html(?:[?#].*)?$/i);
    if (relMatch) return relMatch[1];

    const ref = this.parseTargetRef(trimmed);
    if (ref && ref.id === novelId && ref.chapterId) {
      return ref.chapterId;
    }

    return undefined;
  }

  private pushChapter(
    chapters: Plugin.ChapterItem[],
    seen: Set<string>,
    novelId: string,
    isR18: boolean,
    chapterId: string,
    name: string,
    releaseTime: string | null,
    currentVolume?: string,
  ): void {
    const path = this.formatChapterPath(novelId, chapterId, isR18);
    if (seen.has(path)) return;
    seen.add(path);

    const chapter: Plugin.ChapterItem = {
      name: name || `第${chapterId}話`,
      path,
      releaseTime,
      chapterNumber: Number(chapterId),
    };
    if (currentVolume) {
      chapter.page = currentVolume;
    }
    chapters.push(chapter);
  }

  private parseSectionEpisodeList(
    $: CheerioAPI,
    novelId: string,
    isR18: boolean,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    const episodeLists = $('section.episode-list');
    if (!episodeLists.length) return chapters;

    let currentVolume: string | undefined;
    episodeLists.find('li').each((_idx, el) => {
      const $item = $(el);
      if ($item.hasClass('episode-list__chapter')) {
        const volTitle = (
          $item.find('.episode-list__chapter-title').first().text() ||
          $item.text()
        )
          .replace(/\s+/g, ' ')
          .trim();
        if (volTitle && !NAV_CHAPTER_NOISE_RE.test(volTitle)) {
          currentVolume = volTitle;
        }
        return;
      }

      const link = $item
        .find('a.episode-list__link, a[href]')
        .filter((_i, a) => Boolean(this.extractEpisodeId($(a).attr('href'), novelId)))
        .first();
      const chapterId = this.extractEpisodeId(link.attr('href'), novelId);
      if (!chapterId) return;

      const titleEl = link.find('.episode-list__title').first();
      const rawName = titleEl.length
        ? cleanChapterLines(titleEl.text())
        : this.cleanAnchorText($, link);

      const timeEl = link.find('time').first();
      const releaseTime = normalizeDate(
        timeEl.attr('datetime') || timeEl.text() || link.find('.episode-list__date').text(),
      );

      this.pushChapter(
        chapters,
        seen,
        novelId,
        isR18,
        chapterId,
        rawName,
        releaseTime,
        currentVolume,
      );
    });

    return chapters;
  }

  private parseTableChapters(
    $: CheerioAPI,
    novelId: string,
    isR18: boolean,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    $('table').each((_tIdx, tbl) => {
      const $table = $(tbl);
      if (
        $table.closest('#header, #footer, .section3').length > 0 ||
        !$table
          .find('a[href]')
          .toArray()
          .some(a => Boolean(this.extractEpisodeId($(a).attr('href'), novelId)))
      ) {
        return;
      }

      let currentVolume: string | undefined;
      $table.find('tr').each((_rIdx, row) => {
        const $row = $(row);
        const cells = $row.find('td, th');
        const link = $row
          .find('a[href]')
          .filter((_i, a) =>
            Boolean(this.extractEpisodeId($(a).attr('href'), novelId)),
          )
          .first();
        const chapterId = this.extractEpisodeId(link.attr('href'), novelId);

        if (!chapterId) {
          const colspanCell = cells.filter('[colspan]').first();
          if (colspanCell.length > 0 && $row.find('a[href]').length === 0) {
            const strongText = (
              colspanCell.find('strong, b').first().text() ||
              colspanCell.text()
            )
              .replace(/\s+/g, ' ')
              .trim();
            if (strongText && !NAV_CHAPTER_NOISE_RE.test(strongText)) {
              currentVolume = strongText;
            }
          }
          return;
        }

        const name = this.cleanAnchorText($, link);
        const timeEl = $row.find('time').first();
        const dateCellText =
          timeEl.attr('datetime') ||
          timeEl.text() ||
          cells.last().text();
        const releaseTime = normalizeDate(dateCellText);

        this.pushChapter(
          chapters,
          seen,
          novelId,
          isR18,
          chapterId,
          name,
          releaseTime,
          currentVolume,
        );
      });
    });

    return chapters;
  }

  private parseMobileEntryChapters(
    $: CheerioAPI,
    novelId: string,
    isR18: boolean,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    $('ul.entry').each((_uIdx, ul) => {
      const $ul = $(ul);
      if ($ul.closest('#header, #footer').length > 0) return;

      const hasEpisodes = $ul
        .find('a[href]')
        .toArray()
        .some(a => Boolean(this.extractEpisodeId($(a).attr('href'), novelId)));
      if (!hasEpisodes) return;

      let currentVolume: string | undefined;
      $ul.children('li').each((_lIdx, li) => {
        const $li = $(li);
        const link = $li
          .find('a[href]')
          .filter((_i, a) =>
            Boolean(this.extractEpisodeId($(a).attr('href'), novelId)),
          )
          .first();
        const chapterId = this.extractEpisodeId(link.attr('href'), novelId);

        if (!chapterId) {
          if ($li.find('a[href]').length === 0) {
            const heading = $li.text().replace(/\s+/g, ' ').trim();
            if (heading && !NAV_CHAPTER_NOISE_RE.test(heading)) {
              currentVolume = heading;
            }
          }
          return;
        }

        const name = this.cleanAnchorText($, link);
        const timeEl = link.find('time').first();
        const releaseTime = normalizeDate(
          timeEl.attr('datetime') ||
            timeEl.text() ||
            link.find('.date').first().text() ||
            link.text(),
        );

        this.pushChapter(
          chapters,
          seen,
          novelId,
          isR18,
          chapterId,
          name,
          releaseTime,
          currentVolume,
        );
      });
    });

    return chapters;
  }

  private parseFallbackChapters(
    $: CheerioAPI,
    novelId: string,
    isR18: boolean,
  ): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_idx, el) => {
      const $link = $(el);
      if (
        $link.hasClass('next_page_link') ||
        $link.hasClass('prev_page_link') ||
        $link.closest(
          '#header, #footer, #nav2, .novelnavi, .section3, .topicPath',
        ).length > 0
      ) {
        return;
      }

      const chapterId = this.extractEpisodeId($link.attr('href'), novelId);
      if (!chapterId) return;

      const name = this.cleanAnchorText($, $link);
      if (!name || NAV_CHAPTER_NOISE_RE.test(name)) return;

      const timeEl = $link.find('time').first();
      const releaseTime = normalizeDate(
        timeEl.attr('datetime') ||
          timeEl.text() ||
          $link.find('.date').first().text() ||
          $link.parent().find('.date, time').first().text(),
      );

      this.pushChapter(
        chapters,
        seen,
        novelId,
        isR18,
        chapterId,
        name,
        releaseTime,
      );
    });

    return chapters;
  }

  private extractChapters(
    $: CheerioAPI,
    novelId: string,
    isR18: boolean,
  ): Plugin.ChapterItem[] {
    const fromEpisodeList = this.parseSectionEpisodeList($, novelId, isR18);
    if (fromEpisodeList.length > 0) return fromEpisodeList;

    const fromTable = this.parseTableChapters($, novelId, isR18);
    if (fromTable.length > 0) return fromTable;

    const fromMobileEntry = this.parseMobileEntryChapters($, novelId, isR18);
    if (fromMobileEntry.length > 0) return fromMobileEntry;

    if ($('#honbun').length > 0) return [];
    return this.parseFallbackChapters($, novelId, isR18);
  }

  private async fetchNovelWithR18Fallback(
    ref: TargetRef,
  ): Promise<{ res: PageFetchResult; isR18: boolean }> {
    const canonicalPath = this.formatNovelPath(ref.id, ref.isR18);
    let res = await this.fetchPage(canonicalPath);
    let isR18 =
      ref.isR18 || /^https?:\/\/h\.syosetu\.org/i.test(res.finalUrl);

    if (!isR18 && this.getSettingBool('syosetuOrgAllowR18', true)) {
      const mentionsR18Host =
        res.block === 'r18_gate' ||
        new RegExp(`h\\.syosetu\\.org\\/novel\\/${ref.id}\\b`, 'i').test(
          res.html,
        );
      if (mentionsR18Host) {
        const retryRes = await this.fetchPage(
          this.formatNovelPath(ref.id, true),
          `${R18_BASE_URL}/`,
        );
        res = retryRes;
        isR18 = true;
      }
    }

    return { res, isR18 };
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const ref = this.parseTargetRef(novelPath);
    if (!ref) {
      throw new Error(`Invalid Hameln novel path: ${novelPath}`);
    }

    const { res, isR18 } = await this.fetchNovelWithR18Fallback(ref);
    this.assertPageReady(res);

    const resolvedPath = this.formatNovelPath(ref.id, isR18);
    const $ = loadCheerio(res.html);
    const maind = $('#maind');
    const root = maind.length ? maind : $('#main').length ? $('#main') : $('body');
    const headerScope = root.find('.ss').first().length
      ? root.find('.ss').first()
      : root;

    const title =
      root
        .find('[itemprop="name"]')
        .not('[itemprop="author"] [itemprop="name"]')
        .first()
        .text()
        .trim() ||
      $('#pagetitle a[href="./"], #maind a[href="./"]')
        .first()
        .text()
        .trim() ||
      root.find('.ss p span a[href="./"]').first().text().trim() ||
      $('#pagetitle h1, #pagetitle .title, h1').first().text().trim() ||
      $('title')
        .text()
        .replace(/\s*-\s*ハーメルン\s*$/, '')
        .trim() ||
      `Hameln ${ref.id}`;

    let author =
      root.find('[itemprop="author"] [itemprop="name"]').first().text().trim() ||
      root.find('[itemprop="author"] a').first().text().trim() ||
      root.find('[itemprop="author"]').first().text().trim() ||
      root
        .find('a[href*="/user/"], a[href*="mode=user"]')
        .filter((_i, el) => $(el).closest('#header, #footer').length === 0)
        .first()
        .text()
        .trim();

    if (!author) {
      const authorSource = $('#pagetitle').first().length
        ? $('#pagetitle').first()
        : headerScope;
      const headerText = this.extractTextWithBreaks($, authorSource);
      const authorMatch =
        headerText.match(/作者[：:]\s*([^\n]+)/) ||
        headerText.match(/(?:^|[\s\u3000])作[：:]\s*([^\n]+)/);
      if (authorMatch?.[1]) {
        author = authorMatch[1].trim();
      }
    }

    const ogImage =
      $('meta[property="og:image"]').attr('content')?.trim() ||
      $('meta[itemprop="image"]').attr('content')?.trim();
    const normalizedOg = ogImage ? normalizeUrlProtocol(ogImage) : '';
    const cover =
      normalizedOg &&
      /^https?:\/\//i.test(normalizedOg) &&
      !/banner|apple-touch-icon|icon-\d+x\d+/i.test(normalizedOg)
        ? normalizedOg
        : defaultCover;

    const genreList: string[] = [];
    const addGenre = (text: string) => {
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (cleaned && !genreList.includes(cleaned)) {
        genreList.push(cleaned);
      }
    };

    root
      .find('[itemprop="genre"] a, [itemprop="keywords"] a')
      .each((_i, el) => {
        addGenre($(el).text());
      });
    headerScope
      .find('a.alert_color, a[href*="mode=search"]')
      .filter((_i, el) => $(el).closest('#header, #footer').length === 0)
      .each((_i, el) => {
        addGenre($(el).text());
      });

    const ssDivs = root.find('.ss');
    let summary = '';
    if (ssDivs.length >= 2 && $('#honbun').length === 0) {
      const candidate = ssDivs.eq(1);
      if (
        candidate.find('section.episode-list, table, ul.entry').length === 0 &&
        candidate.attr('id') !== 'fmenu'
      ) {
        summary = this.extractTextWithBreaks($, candidate);
      }
    }
    if (!summary) {
      summary =
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[property="og:description"]').attr('content')?.trim() ||
        '';
    }

    let chapters = this.extractChapters($, ref.id, isR18);
    let status: string = NovelStatus.Unknown;

    for (const tag of genreList) {
      const inferred = this.parseStatusFromText(tag);
      if (inferred !== NovelStatus.Unknown) {
        status = inferred;
        break;
      }
    }

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
          let statusCellText = '';
          detail$('table tr').each((_idx, tr) => {
            if (statusCellText) return;
            const $tr = detail$(tr);
            const label = $tr
              .find('th, td.label')
              .first()
              .text()
              .replace(/\s+/g, '');
            if (/話数/.test(label)) {
              statusCellText = $tr.find('td').last().text();
            }
          });
          if (statusCellText) {
            const parsedStatus = this.parseStatusFromText(statusCellText);
            if (parsedStatus !== NovelStatus.Unknown) {
              status = parsedStatus;
            }
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
    trimBoundaryBreaks = false,
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
      const src = normalizeHamelnImageUrl(rawHref);
      const alt = $a.attr('alt')?.trim() || '挿絵';
      $a.replaceWith(
        `<p><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" /></p>`,
      );
      hasImages = true;
    });

    clone.find('img[src]').each((_i, el) => {
      const $img = $(el);
      const rawSrc = $img.attr('src')?.trim();
      if (!rawSrc) return;
      $img.attr('src', normalizeHamelnImageUrl(rawSrc));
      hasImages = true;
    });

    let html = (clone.html() || '').trim();
    if (trimBoundaryBreaks) {
      html = html
        .replace(/^(?:\s*(?:<br\s*\/?>|<hr\s*\/?>)\s*)+/gi, '')
        .replace(/(?:\s*(?:<br\s*\/?>|<hr\s*\/?>)\s*)+$/gi, '')
        .trim();
    }

    const hasText = clone.text().replace(/[\s\u3000]+/g, '').length > 0;
    return { html, hasText, hasImages };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const ref = this.parseTargetRef(chapterPath);
    if (!ref) {
      throw new Error(`Invalid Hameln chapter path: ${chapterPath}`);
    }

    let isR18 = ref.isR18;
    let normalizedPath = ref.chapterId
      ? this.formatChapterPath(ref.id, ref.chapterId, isR18)
      : this.formatNovelPath(ref.id, isR18);
    let res = await this.fetchPage(
      normalizedPath,
      this.buildOriginUrl(this.formatNovelPath(ref.id, isR18)),
    );

    if (!isR18 && this.getSettingBool('syosetuOrgAllowR18', true)) {
      const mentionsR18Host =
        res.block === 'r18_gate' ||
        new RegExp(`h\\.syosetu\\.org\\/novel\\/${ref.id}\\b`, 'i').test(
          res.html,
        );
      if (mentionsR18Host) {
        isR18 = true;
        normalizedPath = ref.chapterId
          ? this.formatChapterPath(ref.id, ref.chapterId, true)
          : this.formatNovelPath(ref.id, true);
        res = await this.fetchPage(
          normalizedPath,
          this.buildOriginUrl(this.formatNovelPath(ref.id, true)),
        );
      }
    }

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

    const titleSpan = $(
      '#maind span[style*="font-size:120%"], #maind span[style*="font-size: 120%"], #ss span[style*="font-size:120%"], #ss span[style*="font-size: 120%"], div.ss span[style*="font-size:120%"], div.ss span[style*="font-size: 120%"]',
    )
      .filter(
        (_i, el) =>
          $(el).find('a').length === 0 &&
          $(el).closest('#header, #footer').length === 0,
      )
      .first();

    let chapterTitle = '';
    if (titleSpan.length > 0) {
      const titleClone = titleSpan.clone();
      titleClone.find('br').replaceWith(' — ');
      chapterTitle = titleClone.text().replace(/\s+/g, ' ').trim();
    } else {
      chapterTitle = $('#pagetitle .subtitle, #ss > h2').first().text().trim();
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
        const rendered = this.renderBodyFragment($, maegaki, true);
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
        const rendered = this.renderBodyFragment($, atogaki, true);
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
