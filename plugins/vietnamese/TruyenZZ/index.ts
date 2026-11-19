import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

class TruyenZZPlugin extends NekoriBasePlugin {
  id = 'truyenzz';
  name = 'Truyện ZZ';
  icon = 'icon.svg';
  site = 'https://truyenzz.net';
  version = '1.0.1';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  filters = {
    genre: {
      type: FilterTypes.Picker,
      label: 'Thể loại',
      value: '',
      options: [
        { label: 'Tất cả thể loại', value: '' },
        { label: 'Đồng Nhân/Fanfic', value: 'dong-nhan-fanfic' },
        { label: 'Đô Thị', value: 'do-thi' },
        { label: 'Hắc Ám Văn', value: 'hac-am-van' },
        { label: 'Hệ Thống', value: 'he-thong' },
        { label: 'Huyền Huyễn', value: 'huyen-huyen' },
        { label: 'Khoa Huyễn', value: 'khoa-huyen' },
        { label: 'Kiếm Hiệp', value: 'kiem-hiep' },
        { label: 'Lịch Sử', value: 'lich-su' },
        { label: 'Linh Dị', value: 'linh-di' },
        { label: 'Ngôn Tình', value: 'ngon-tinh' },
        { label: 'Sảng Văn', value: 'sang-van' },
        { label: 'Tây Huyễn', value: 'tay-huyen' },
        { label: 'Tiên Hiệp', value: 'tien-hiep' },
        { label: 'Trinh Thám', value: 'trinh-tham' },
        { label: 'Trùng Sinh', value: 'trung-sinh' },
        { label: 'Vô Địch Lưu', value: 'vo-dich-luu' },
        { label: 'Vô Hạn Lưu', value: 'vo-han-luu' },
        { label: 'Web Novel', value: 'web-novel' },
        { label: 'Xuyên Không', value: 'xuyen-khong' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Trạng thái',
      value: '',
      options: [
        { label: 'Tất cả trạng thái', value: '' },
        { label: 'Đang ra', value: 'dang-ra' },
        { label: 'Hoàn thành', value: 'hoan-thanh' },
      ],
    },
    novelType: {
      type: FilterTypes.Picker,
      label: 'Loại truyện',
      value: '',
      options: [
        { label: 'Tất cả loại truyện', value: '' },
        { label: 'Truyện thường', value: 'thuong' },
        { label: 'VIP', value: 'vip' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sắp xếp',
      value: '',
      options: [
        { label: 'Mặc định', value: '' },
        { label: 'Xem nhiều', value: 'xem-nhieu' },
        { label: 'Mới đăng', value: 'moi-dang' },
        { label: 'Tên A-Z', value: 'ten' },
      ],
    },
  } satisfies Filters;

  private absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.site}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private coverUrl(src: string | undefined): string | undefined {
    if (!src) return undefined;
    if (src.startsWith('/_next/image?')) {
      try {
        const decoded = new URL(src, this.site).searchParams.get('url');
        if (decoded) return this.absoluteUrl(decoded);
      } catch {
        return undefined;
      }
    }
    return this.absoluteUrl(src);
  }

  private parseNovels(body: string): Plugin.NovelItem[] {
    const $ = loadCheerio(body);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_index, element) => {
      const link = $(element);
      const path = link.attr('href');
      if (!path || !/^\/truyen\/[^/?#]+\/?$/.test(path) || seen.has(path))
        return;

      const name =
        link.find('h2').first().text().trim() ||
        link.find('h3').first().text().trim() ||
        link
          .contents()
          .filter((_i, node) => node.type === 'text')
          .first()
          .text()
          .trim();

      if (!name) return;

      seen.add(path);
      novels.push({
        name,
        path,
        cover: this.coverUrl(
          link.find('img').first().attr('src') ||
            link.find('img').first().attr('data-src'),
        ),
      });
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    if (pageNo > 1) params.set('trang', String(pageNo));

    const filters = options?.filters;
    if (filters?.genre?.value) {
      params.set('the-loai', filters.genre.value);
    }
    if (filters?.status?.value) {
      params.set('trang-thai', filters.status.value);
    }
    if (filters?.novelType?.value) {
      params.set('loai', filters.novelType.value);
    }
    if (options?.showLatestNovels) {
      params.set('sap-xep', 'moi-dang');
    } else if (filters?.sort?.value) {
      params.set('sap-xep', filters.sort.value);
    }

    const query = params.toString();
    const url = `${this.site}/truyen${query ? `?${query}` : ''}`;
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch popular novels: HTTP ${res.status}`);
    }
    return this.parseNovels(await res.text());
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({ q: searchTerm });
    if (pageNo > 1) params.set('trang', String(pageNo));

    const res = await fetchApi(`${this.site}/truyen?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to search novels: HTTP ${res.status}`);
    }
    return this.parseNovels(await res.text());
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = novelPath.startsWith('/') ? novelPath : `/${novelPath}`;
    const res = await fetchApi(this.absoluteUrl(path));
    if (!res.ok) {
      throw new Error(`Failed to parse novel: HTTP ${res.status}`);
    }

    const body = await res.text();
    const $ = loadCheerio(body);
    const name =
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.split(' – ')[0].trim() ||
      'Unknown Title';

    const summary =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      undefined;

    const status = /hoàn thành|full/i.test(summary || '')
      ? NovelStatus.Completed
      : NovelStatus.Ongoing;

    const genres: string[] = [];
    $('a[href*="the-loai="]').each((_index, element) => {
      const genre = $(element).text().trim();
      if (genre && !genres.includes(genre)) genres.push(genre);
    });

    const cover = this.coverUrl(
      $('article img[alt="' + name.replace(/"/g, '\\"') + '"]')
        .first()
        .attr('src') || $('meta[property="og:image"]').attr('content'),
    );

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    const pageCount = this.getChapterPageCount($);

    for (let page = 1; page <= pageCount; page++) {
      let pageBody = body;
      if (page > 1) {
        const separator = path.includes('?') ? '&' : '?';
        const pageUrl = `${this.absoluteUrl(path)}${separator}trang=${page}#danh-sach-chuong`;
        const pageRes = await fetchApi(pageUrl);
        if (!pageRes.ok) break;
        pageBody = await pageRes.text();
      }

      const page$ = loadCheerio(pageBody);
      page$('#danh-sach-chuong ul a[href*="/doc/"]').each((_index, element) => {
        const chapterPath = page$(element).attr('href');
        if (!chapterPath) return;
        if (
          !/^\/doc\/[^/?]+\/\d+\/?$/.test(chapterPath) ||
          seen.has(chapterPath)
        ) {
          return;
        }

        const match = chapterPath.match(/\/(\d+)\/?$/);
        const chapterNumber = match ? Number(match[1]) : undefined;
        const title = page$(element).text().trim();
        if (!/^Chương\s+\d+/i.test(title) && !/^Chapter\s+\d+/i.test(title)) {
          return;
        }
        seen.add(chapterPath);
        chapters.push({
          name: title || `Chương ${chapterNumber || chapters.length + 1}`,
          path: chapterPath,
          chapterNumber,
        });
      });
    }

    return {
      name,
      path,
      cover,
      summary,
      status,
      genres: genres.length ? genres.join(',') : undefined,
      chapters,
    };
  }

  private getChapterPageCount($: ReturnType<typeof loadCheerio>): number {
    let pageCount = 1;
    $('a[href*="#danh-sach-chuong"]').each((_index, element) => {
      const text = $(element).text().trim();
      const number = Number(text);
      if (Number.isFinite(number) && number > pageCount) pageCount = number;
    });
    return pageCount;
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const res = await fetchApi(this.absoluteUrl(chapterPath));
    if (!res.ok) {
      throw new Error(`Failed to parse chapter: HTTP ${res.status}`);
    }

    const $ = loadCheerio(await res.text());
    const paragraphs: string[] = [];

    $('p').each((_index, element) => {
      const text = $(element)
        .text()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s*\((Nguồn|Truyện ZZ)[^)]*\)\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) return;
      if (
        text === 'Đọc truyện chữ online miễn phí, cập nhật liên tục.' ||
        text.startsWith('Liên hệ Admin') ||
        /^© \d{4}/.test(text)
      ) {
        return;
      }
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      paragraphs.push(`<p>${escaped}</p>`);
    });

    if (!paragraphs.length) {
      throw new Error('Chapter content could not be found');
    }

    return {
      state: 'ready',
      type: 'novel',
      html: paragraphs.join('\n'),
    };
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (/^https?:\/\//i.test(path)) return path;
    return this.absoluteUrl(
      path.startsWith('/') ? path : `/${isNovel ? 'truyen/' : 'doc/'}${path}`,
    );
  }
}

export default new TruyenZZPlugin();
