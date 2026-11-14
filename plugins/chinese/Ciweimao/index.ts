import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { type Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

const CATEGORIES = [
  {
    label: '全部分类（最新更新） (All Categories - Latest Updates)',
    value: '0',
  },
  { label: '玄幻奇幻 (Fantasy)', value: 'yijiehuanxiang' },
  { label: '都市青春 (Urban & Youth)', value: 'qingchunrichang' },
  { label: '灵异未知 (Supernatural & Mystery)', value: 'shenmiweizhi' },
  { label: '历史军事 (History & Military)', value: 'zhanzhenglishi' },
  { label: '科幻无限 (Science Fiction)', value: 'weilaihuanxiang' },
  { label: '游戏竞技 (Games & Esports)', value: 'youxishijie' },
  { label: '仙侠武侠 (Xianxia & Wuxia)', value: 'rexuejingji' },
  { label: '免费同人 (Free Fan Fiction)', value: 'tongrenfenlei' },
  { label: '女频 (Female-Oriented)', value: 'nvpinfenlei' },
];

class Ciweimao extends NekoriBasePlugin {
  id = 'ciweimao.com';
  name = 'Ciweimao';
  icon = 'icon.svg';
  site = 'https://wap.ciweimao.com';
  version = '1.0.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  filters = {
    category: {
      type: FilterTypes.Picker,
      label: 'Category',
      value: '0',
      options: CATEGORIES,
    },
  } satisfies Filters;

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  };

  private readonly categoryTypeCache = new Map<string, string>();

  private async fetchDocument(url: string) {
    const response = await fetchApi(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Ciweimao request failed: HTTP ${response.status}`);
    }

    const html = await response.text();
    if (
      html.includes('J_ManMachineVerify') ||
      html.includes('man_machine_verify')
    ) {
      throw new Error(
        'Ciweimao requires a CAPTCHA for this page. Complete the verification in a browser and try again.',
      );
    }

    return loadCheerio(html);
  }

  private parseNovels($: ReturnType<typeof loadCheerio>): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('.book-item, .booklist > li, .recommend-list > li, .book-list > li').each(
      (_, element) => {
        const $item = $(element);
        const $link = $item.find('a[href*="/book/"]').first();
        const href = $link.attr('href');
        if (!href) return;

        const path = new URL(href, this.site).pathname;
        if (!/^\/book\/\d+\/?$/.test(path) || seen.has(path)) return;

        const $image = $item.find('img').first();
        const name =
          $item.find('.info h3').contents().first().text().trim() ||
          $item.find('h3').first().text().trim() ||
          $image.attr('alt')?.trim() ||
          $link.attr('title')?.trim();
        if (!name) return;

        const rawCover =
          $image.attr('data-original') ||
          $image.attr('data-src') ||
          $image.attr('src');
        const cover =
          rawCover && !rawCover.includes('/resources/images/cover.jpg')
            ? new URL(rawCover, this.site).href
            : defaultCover;

        seen.add(path);
        novels.push({ name, path, cover });
      },
    );

    return novels;
  }

  private async getCategoryType(category: string): Promise<string> {
    if (/^\d+$/.test(category)) return category;

    const cached = this.categoryTypeCache.get(category);
    if (cached) return cached;

    const $ = await this.fetchDocument(
      `https://mip.ciweimao.com/book_list/${encodeURIComponent(category)}/`,
    );
    const categoryType = $('#category_type').text().trim();
    if (!/^\d+$/.test(categoryType)) {
      throw new Error(
        `Ciweimao category type was not found for category "${category}".`,
      );
    }

    this.categoryTypeCache.set(category, categoryType);
    return categoryType;
  }

  private async fetchListingPage(
    categoryType: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = new URL('/index/book_list_data', this.site);
    url.searchParams.set('category_type', categoryType);
    url.searchParams.set('page', String(pageNo));

    const response = await fetchApi(url.href, { headers: this.headers });
    if (!response.ok) {
      throw new Error(
        `Ciweimao listing request failed: HTTP ${response.status}`,
      );
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') {
      throw new Error('Ciweimao returned an invalid listing response.');
    }

    const result = payload as { code?: unknown; html?: unknown };
    if (result.code === 360001) return [];
    if (typeof result.html !== 'string') {
      throw new Error('Ciweimao listing response did not contain HTML.');
    }

    return this.parseNovels(loadCheerio(result.html));
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (!Number.isInteger(pageNo) || pageNo < 1) {
      throw new Error('Page number must be a positive integer.');
    }

    const category = options?.filters?.category?.value || '0';
    const categoryType = await this.getCategoryType(category);
    return this.fetchListingPage(categoryType, pageNo);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term) return [];
    if (!Number.isInteger(pageNo) || pageNo < 1) {
      throw new Error('Page number must be a positive integer.');
    }

    // The WAP search endpoint redirects to a CAPTCHA; only search public homepage entries.
    const $ = await this.fetchDocument(this.site);
    const matches = this.parseNovels($).filter(novel =>
      novel.name.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    );
    const pageSize = 20;
    return matches.slice((pageNo - 1) * pageSize, pageNo * pageSize);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = new URL(novelPath, this.site).pathname;
    const bookId = path.match(/^\/book\/(\d+)\/?$/)?.[1];
    if (!bookId) {
      throw new Error(`Invalid Ciweimao book path: ${novelPath}`);
    }

    const $ = await this.fetchDocument(`${this.site}/book/${bookId}`);
    const name =
      $('.book-info h1.book').text().trim() ||
      $('meta[name="name"]').attr('content')?.trim() ||
      $('title').text().split('最新章节')[0].trim();
    if (!name) {
      throw new Error('Ciweimao book title was not found.');
    }

    const info = $('.book-info .info');
    const authorLine = info.find('.author').text().trim();
    const author = authorLine.split(/\s+著/)[0]?.trim() || undefined;
    const summary = $('.book-desc .desc-cnt').text().trim() || undefined;
    const coverUrl =
      $('.book-info .cover img').attr('data-original') ||
      $('.book-info .cover img').attr('data-src') ||
      $('meta[property="og:image"]').attr('content');
    const cover =
      coverUrl && !coverUrl.includes('/resources/images/cover.jpg')
        ? new URL(coverUrl, this.site).href
        : defaultCover;
    const intro = info.find('.intro').text();
    const status = intro.includes('已完结')
      ? NovelStatus.Completed
      : NovelStatus.Ongoing;

    const chapters: Plugin.ChapterItem[] = [];
    const chapterPaths = new Set<string>();
    $('.catalogue-list a[href*="/chapter/"]').each((index, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      const chapterId = href?.match(/\/chapter\/(\d+)/)?.[1];
      const chapterName = $link.text().trim();
      if (!chapterId || !chapterName) return;

      const chapterPath = `/chapter/${chapterId}`;
      if (chapterPaths.has(chapterPath)) return;
      chapterPaths.add(chapterPath);

      const number = chapterName.match(/第\s*(\d+)\s*章/);
      chapters.push({
        name: chapterName,
        path: chapterPath,
        chapterNumber: number ? Number(number[1]) : index + 1,
      });
    });

    return {
      name,
      path: `/book/${bookId}`,
      cover,
      author,
      summary,
      status,
      genres: authorLine.split('/')[1]?.trim(),
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const chapterId = chapterPath.match(/\/chapter\/(\d+)/)?.[1];
    if (!chapterId) {
      throw new Error(`Invalid Ciweimao chapter path: ${chapterPath}`);
    }

    const $ = await this.fetchDocument(
      `https://mip.ciweimao.com/chapter/${chapterId}`,
    );
    const $content = $('#J_BookRead');
    if ($content.length === 0 || !$content.text().trim()) {
      throw new Error(
        'Ciweimao chapter content was not found. It may be unavailable or require access on the site.',
      );
    }

    $content.find('script, style, .num-link, span').remove();
    return {
      state: 'ready',
      type: 'novel',
      html: $content.html() || '',
    };
  }

  override resolveUrl(path: string): string {
    return new URL(path, this.site).href;
  }
}

export default new Ciweimao();
