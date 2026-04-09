import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

class TruyenFullVision implements Plugin.PluginBase {
  id = 'truyenfull.vision';
  name = 'TruyenFull.vision';
  icon = 'src/vi/truyenfull/icon.png';
  site = 'https://truyenfull.vision';
  version = '1.0.0';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site,
    },
  };

  private normalizeCoverUrl(rawUrl?: string): string {
    if (!rawUrl) return defaultCover;
    if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
    if (rawUrl.startsWith('/')) return `${this.site}${rawUrl}`;
    return rawUrl;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}/danh-sach/`;

    const sort = options.filters?.sort?.value || 'truyen-hot';
    url += sort;

    if (pageNo > 1) {
      url += `/trang-${pageNo}/`;
    }

    const response = await fetchApi(url);
    const html = await response.text();
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('.list-truyen .row').each((_, element) => {
      const titleElement = $(element).find('h3.truyen-title a');
      const name = titleElement.text().trim();
      const path = titleElement.attr('href')?.replace(this.site, '');
      const cover = $(element).find('img.lazyimg').attr('data-src') || $(element).find('img').attr('src');

      if (name && path) {
        novels.push({
          name,
          path,
          cover: this.normalizeCoverUrl(cover),
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchApi(`${this.site}${novelPath}`);
    const html = await response.text();
    const $ = loadCheerio(html);

    const name = $('h3.title').text().trim();
    const cover = $('.book img').attr('src');
    const summary = $('.desc-text').html() || '';

    const author = $('.info a[itemprop="author"]').text().trim();
    const genres = $('.info a[itemprop="genre"]')
      .map((_, el) => $(el).text())
      .get()
      .join(',');

    const statusText = $('.info .text-success, .info .text-primary, .info .text-info').text().trim();
    let status: string = NovelStatus.Unknown;
    if (statusText.toLowerCase().includes('đang ra')) {
      status = NovelStatus.Ongoing;
    } else if (statusText.toLowerCase().includes('full') || statusText.toLowerCase().includes('hoàn thành')) {
      status = NovelStatus.Completed;
    }

    const chapters: Plugin.ChapterItem[] = [];

    $('.list-chapter li a').each((_, el) => {
      const chapterName = $(el).text().trim();
      const chapterPath = $(el).attr('href')?.replace(this.site, '');
      if (chapterName && chapterPath) {
        chapters.push({
          name: chapterName,
          path: chapterPath,
        });
      }
    });

    return {
      path: novelPath,
      name,
      cover: this.normalizeCoverUrl(cover),
      summary,
      author,
      genres,
      status,
      chapters,
    };
  }

  async parsePage(novelPath: string, pageNo: number): Promise<Plugin.ChapterItem[]> {
    const url = `${this.site}${novelPath}trang-${pageNo}/#list-chapter`;
    const response = await fetchApi(url);
    const html = await response.text();
    const $ = loadCheerio(html);

    const chapters: Plugin.ChapterItem[] = [];
    $('.list-chapter li a').each((_, el) => {
      const name = $(el).text().trim();
      const path = $(el).attr('href')?.replace(this.site, '');
      if (name && path) {
        chapters.push({ name, path });
      }
    });

    return chapters;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchApi(`${this.site}${chapterPath}`);
    const html = await response.text();
    const $ = loadCheerio(html);

    const title = $('.chapter-title').text().trim();
    const content = $('#chapter-c').html() || $('.chapter-c').html() || '';

    if (!content) {
      throw new Error('Could not find chapter content');
    }

    return `<h4>${title}</h4><div class="chapter-content">${content}</div>`;
  }

  async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/tim-kiem/?tukhoa=${encodeURIComponent(searchTerm)}${pageNo > 1 ? `&page=${pageNo}` : ''}`;
    const response = await fetchApi(url);
    const html = await response.text();
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('.list-truyen .row').each((_, element) => {
      const titleElement = $(element).find('h3.truyen-title a');
      const name = titleElement.text().trim();
      const path = titleElement.attr('href')?.replace(this.site, '');
      const cover = $(element).find('img.lazyimg').attr('data-src') || $(element).find('img').attr('src');

      if (name && path) {
        novels.push({
          name,
          path,
          cover: this.normalizeCoverUrl(cover),
        });
      }
    });

    return novels;
  }

  filters = {
    sort: {
      label: 'Sắp xếp',
      value: 'truyen-hot',
      options: [
        { label: 'Truyện Hot', value: 'truyen-hot' },
        { label: 'Truyện Mới Cập Nhật', value: 'truyen-moi' },
        { label: 'Truyện Full', value: 'truyen-full' },
        { label: 'Tiên Hiệp Hay', value: 'tien-hiep-hay' },
        { label: 'Kiếm Hiệp Hay', value: 'kiem-hiep-hay' },
        { label: 'Ngôn Tình Hay', value: 'ngon-tinh-hay' },
        { label: 'Truyện Teen Hay', value: 'truyen-teen-hay' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  resolveUrl = (path: string) => new URL(path, this.site).toString();
}

export default new TruyenFullVision();
