import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

class QuyKiep implements Plugin.PagePlugin {
    id = 'quykiep';
    name = 'Quý Kiếp';
    icon = 'src/vi/quykiep/icon.png';
    site = 'https://quykiep.com';
    version = '1.0.3';

    imageRequestInit = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://quykiep.com',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
        },
    };

    parseNovels(loadedCheerio: CheerioAPI) {
        const novels: Plugin.NovelItem[] = [];

        // Hỗ trợ cả selector schema.org và cấu trúc flex của Next.js
        const novelItems = loadedCheerio('div[itemtype*="Book"], div.flex.flex-col:has(a[href*="/truyen/"])');

        novelItems.each((idx, ele) => {
            const data = loadedCheerio(ele);

            // Tìm link truyện: Có thể là link ảnh hoặc link tiêu đề
            const titleEl = data.find('a[href*="/truyen/"]').filter((i, el) => {
                return loadedCheerio(el).find('h3').length > 0 || loadedCheerio(el).attr('title') !== undefined;
            }).first();

            const name = titleEl.attr('title') || titleEl.find('h3').text().trim() || data.find('h3').text().trim();
            const path = titleEl.attr('href') || data.find('a[href*="/truyen/"]').first().attr('href');

            if (!name || !path) return;

            // Logic lấy ảnh bìa từ noscript hoặc img tag
            const noscriptHtml = data.find('noscript').html();
            let cover = noscriptHtml?.match(/src[sS]et="([^"]+)"/)?.[1]?.split(',')[0].trim().split(' ')[0];

            if (!cover) {
                cover = noscriptHtml?.match(/src="([^"]+)"/)?.[1];
            }

            if (!cover || cover.startsWith('data:')) {
                data.find('img').each((i, img) => {
                    const src = loadedCheerio(img).attr('src');
                    if (src && !src.startsWith('data:') && (src.includes('static.') || src.includes('/Data/'))) {
                        cover = src;
                        return false;
                    }
                    const srcset = loadedCheerio(img).attr('srcset')?.split(',')[0].trim().split(' ')[0];
                    if (srcset && !srcset.startsWith('data:')) {
                        cover = srcset;
                        return false;
                    }
                });
            }

            if (cover && !cover.startsWith('http')) {
                cover = this.site + cover;
            }

            if (name.length > 2 && !novels.some(n => n.path === path)) {
                novels.push({ name, path, cover });
            }
        });

        // Fallback cực mạnh nếu vẫn không tìm thấy gì
        if (novels.length === 0) {
            loadedCheerio('a[href^="/truyen/"]').each((idx, ele) => {
                const el = loadedCheerio(ele);
                const path = el.attr('href');
                const name = el.find('h3').text().trim() || el.text().trim();

                if (path && name && name.length > 2 && !novels.some(n => n.path === path)) {
                    // Tìm ảnh trong anh em hoặc cha nếu không có trong chính nó
                    const container = el.closest('div');
                    let cover = container.find('noscript img').attr('src') || container.find('img').not('[src^="data:"]').attr('src');

                    if (cover && !cover.startsWith('http')) {
                        cover = this.site + cover;
                    }

                    novels.push({ name, path, cover });
                }
            });
        }

        return novels;
    }

    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
    ): Promise<Plugin.NovelItem[]> {
        let url = this.site;

        if (filters && filters.sort.value) {
            url += `/${filters.sort.value}`;
        } else {
            url += '/truyen-hot-ds';
        }

        if (pageNo > 1) {
            url += `?page=${pageNo}`;
        }

        const result = await fetchApi(url);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);

        return this.parseNovels(loadedCheerio);
    }

    async parseNovel(
        novelPath: string,
    ): Promise<Plugin.SourceNovel & { totalPages: number }> {
        const url = this.site + novelPath;
        const result = await fetchApi(url);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel & { totalPages: number } = {
            path: novelPath,
            name: loadedCheerio('h1').text().trim() || 'Không có tiêu đề',
            chapters: [],
            totalPages: 1,
        };

        // On detail page, the cover is usually the largest image or has class object-cover
        //<meta property="og:image" content="https://static.quykiep.com/Data/dinh-cap-khi-van-lang-le-tu-luyen-ngan-nam/300.jpeg"/>
        let cover = loadedCheerio('meta[property="og:image"]').attr('content');
        if (cover && !cover.startsWith('http')) {
            cover = this.site + cover;
        }
        novel.cover = cover;

        novel.summary = loadedCheerio('h2:contains("Giới thiệu truyện")').nextUntil('h2').text().trim();
        novel.author = loadedCheerio('a[href^="/tac-gia/"]').first().text().trim();

        const genres: string[] = [];
        loadedCheerio('a[href*="tags="], a[href*="tag/"]').each((i, el) => {
            const text = loadedCheerio(el).text().trim();
            if (text && !genres.includes(text)) {
                genres.push(text);
            }
        });
        novel.genres = genres.join(',');

        const statusText = loadedCheerio('body').text();
        if (statusText.includes('Hoàn thành')) {
            novel.status = NovelStatus.Completed;
        } else if (statusText.includes('Đang ra')) {
            novel.status = NovelStatus.Ongoing;
        } else {
            novel.status = NovelStatus.Unknown;
        }

        // Get total pages for chapter list
        const chapterListUrl = `${url}/danh-sach-chuong`;
        const chapterResult = await fetchApi(chapterListUrl);
        const chapterBody = await chapterResult.text();
        const chapterCheerio = parseHTML(chapterBody);

        let lastPage = 1;
        chapterCheerio('a[href*="page="]').each((i, el) => {
            const pageAttr = chapterCheerio(el).attr('href');
            const page = Number(pageAttr?.match(/page=(\d+)/)?.[1]);
            if (page > lastPage) lastPage = page;
        });
        novel.totalPages = lastPage;

        novel.chapters = this.parseChapters(chapterCheerio);

        return novel;
    }

    parseChapters(loadedCheerio: CheerioAPI): Plugin.ChapterItem[] {
        const chapters: Plugin.ChapterItem[] = [];
        loadedCheerio('a[href*="/chuong-"]').each((i, el) => {
            const name = loadedCheerio(el).text().trim();
            const path = loadedCheerio(el).attr('href');
            if (name && path && path.includes('/chuong-') && !chapters.some(c => c.path === path)) {
                chapters.push({
                    name,
                    path,
                    releaseTime: '',
                });
            }
        });
        return chapters;
    }

    async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
        const url = `${this.site}${novelPath}/danh-sach-chuong?page=${page}`;
        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);
        const chapters = this.parseChapters(loadedCheerio);
        return {
            chapters,
        };
    }

    async parseChapter(chapterPath: string): Promise<string> {
        const result = await fetchApi(this.site + chapterPath);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);

        const chapterTitle = loadedCheerio('h1').text().trim();

        const contentContainer = loadedCheerio('#chapter-content').length ? loadedCheerio('#chapter-content') :
            loadedCheerio('.chapter-content').length ? loadedCheerio('.chapter-content') :
                loadedCheerio('.chapter-c').length ? loadedCheerio('.chapter-c') :
                    loadedCheerio('div.text-justify');

        contentContainer.find('script, iframe, ins, .ads, .ads-container').remove();

        let content = contentContainer.html() || '';

        if (!content) {
            content = loadedCheerio('body').text();
        }

        return `<h1>${chapterTitle}</h1>\n\n${content}`;
    }

    async searchNovels(
        searchTerm: string,
        pageNo: number,
    ): Promise<Plugin.NovelItem[]> {
        const searchUrl = `${this.site}/tim-kiem?keyword=${encodeURIComponent(searchTerm)}&page=${pageNo}`;

        const result = await fetchApi(searchUrl);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);

        return this.parseNovels(loadedCheerio);
    }

    filters = {
        sort: {
            type: FilterTypes.Picker,
            label: 'Sắp xếp',
            value: 'truyen-hot-ds',
            options: [
                { label: 'Truyện mới cập nhật', value: 'truyen-moi-ds' },
                { label: 'Truyện hot', value: 'truyen-hot-ds' },
                { label: 'Truyện full', value: 'truyen-full-ds' },
                { label: 'Truyện dịch', value: 'truyen-dich-ds' },
            ],
        },
    } satisfies Filters;
}

export default new QuyKiep();
