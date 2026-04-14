import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

class NovelBin implements Plugin.PagePlugin {
    id = 'novelbin.me';
    name = 'Novel Bin';
    icon = 'src/en/novelbin/icon.png';
    site = 'https://novelbin.me';
    version = '1.0.0';

    headers = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://novelbin.me/',
    };

    parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
        const novels: Plugin.NovelItem[] = [];
        loadedCheerio('.list.list-novel > .row').each((idx, ele) => {
            const titleEl = loadedCheerio(ele).find('h3.novel-title > a');
            const novelName = titleEl.text().trim();
            const novelUrl = titleEl.attr('href');

            const imgEl = loadedCheerio(ele).find('img.cover');
            let novelCover =
                imgEl.attr('data-src') || imgEl.attr('src') || defaultCover;

            // một ví dụ về kết quả của novelCover : https://images.novelbin.me/novel_200_89/i-can-gain-one-skill-point-per-second.jpg
            // muốn biến url thành https://images.novelbin.me/novel/the-prime-minister-seduced-me-to-have-babies.jpg
            const regex = /\/novel_\d+_\d+\//;
            const match = novelCover.match(regex);
            if (match) {
                novelCover = novelCover.replace(match[0], '/novel/');
            }
            console.log(novelCover);
            if (novelUrl && novelName) {
                novels.push({
                    name: novelName,
                    cover: novelCover,
                    path: novelUrl.replace(this.site, ''),
                });
            }
        });

        return novels;
    }

    parseChapterList(loadedCheerio: CheerioAPI): Plugin.ChapterItem[] {
        return loadedCheerio('ul.list-chapter > li > a')
            .toArray()
            .map(ele => {
                const href = ele.attribs['href'] || '';
                const path = href.replace(this.site, '');
                const name =
                    loadedCheerio(ele).find('span').text().trim() ||
                    loadedCheerio(ele).text().trim();
                const chapterMatch = name.match(/Chapter\s+([\d.]+)/i);
                return {
                    name,
                    path,
                    chapterNumber: chapterMatch ? Number(chapterMatch[1]) : undefined,
                };
            });
    }

    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
    ): Promise<Plugin.NovelItem[]> {
        let url = `${this.site}/sort/novelbin-hot?page=${pageNo}`;

        if (filters) {
            if (filters.tag?.value) {
                url = `${this.site}/tag/${encodeURIComponent(filters.tag.value)}?page=${pageNo}`;
            } else if (filters.genre?.value) {
                url = `${this.site}/novelbin-genres/${filters.genre.value}?page=${pageNo}`;
            } else if (filters.sort?.value) {
                url = `${this.site}/sort/${filters.sort.value}?page=${pageNo}`;
            }
        }

        const result = await fetchApi(url, { headers: this.headers });
        const body = await result.text();
        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    }

    async parseNovel(
        novelPath: string,
    ): Promise<Plugin.SourceNovel & { totalPages: number }> {
        const url = this.site + novelPath;
        const result = await fetchApi(url, { headers: this.headers });
        const body = await result.text();
        const loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel & { totalPages: number } = {
            path: novelPath,
            name: '',
            chapters: [],
            totalPages: 1,
        };

        novel.name =
            loadedCheerio('.col-info-desc .desc h3.title').first().text().trim() ||
            loadedCheerio('meta[property="og:novel:novel_name"]').attr('content') ||
            loadedCheerio('.books .desc h3.title').text().trim() ||
            'Unknown';

        const bookImg = loadedCheerio('.books .book img');
        novel.cover =
            bookImg.attr('data-src') ||
            bookImg.attr('src') ||
            loadedCheerio('meta[property="og:image"]').attr('content') ||
            defaultCover;

        novel.summary = loadedCheerio('.desc-text').text().trim();

        const authorLi = loadedCheerio('ul.info-meta li').filter((_, el) => {
            return loadedCheerio(el).find('h3').text().includes('Author');
        });
        novel.author = authorLi.find('a').text().trim();

        const genreLi = loadedCheerio('ul.info-meta li').filter((_, el) => {
            return loadedCheerio(el).find('h3').text().includes('Genre');
        });
        novel.genres = genreLi
            .find('a')
            .map((_, el) => loadedCheerio(el).text().trim())
            .toArray()
            .join(',');

        const statusLi = loadedCheerio('ul.info-meta li').filter((_, el) => {
            return loadedCheerio(el).find('h3').text().includes('Status');
        });
        const statusText = statusLi.find('a').text().trim().toLowerCase();

        if (statusText.includes('ongoing')) {
            novel.status = NovelStatus.Ongoing;
        } else if (statusText.includes('completed') || statusText.includes('full')) {
            novel.status = NovelStatus.Completed;
        } else {
            novel.status = NovelStatus.Unknown;
        }

        const ratingText = loadedCheerio('span[itemprop="ratingValue"]')
            .text()
            .trim();
        if (ratingText) {
            novel.rating = parseFloat(ratingText) / 2;
        }

        const novelId = novelPath.replace('/novel-book/', '');
        const ajaxUrl = `${this.site}/ajax/chapter-archive?novelId=${novelId}`;
        const ajaxResult = await fetchApi(ajaxUrl, { headers: this.headers });
        const ajaxBody = await ajaxResult.text();
        const ajaxCheerio = parseHTML(ajaxBody);
        novel.chapters = this.parseChapterList(ajaxCheerio);
        novel.totalPages = 1;

        return novel;
    }

    async parsePage(
        novelPath: string,
        page: string,
    ): Promise<Plugin.SourcePage> {
        const novelId = novelPath.replace('/novel-book/', '');
        const ajaxUrl = `${this.site}/ajax/chapter-archive?novelId=${novelId}`;
        const result = await fetchApi(ajaxUrl, { headers: this.headers });
        const body = await result.text();
        const loadedCheerio = parseHTML(body);
        const chapters = this.parseChapterList(loadedCheerio);

        return { chapters };
    }

    async parseChapter(chapterPath: string): Promise<string> {
        const url = this.site + chapterPath;
        const result = await fetchApi(url, { headers: this.headers });
        const body = await result.text();
        if (body.includes('Just a moment...')) {
            throw new Error('Please go to Webview and check Captcha');
        }
        const loadedCheerio = parseHTML(body);

        loadedCheerio('#chr-content script').remove();
        loadedCheerio('#chr-content .ads').remove();
        loadedCheerio('#chr-content .ads-holder').remove();
        loadedCheerio('#chr-content .ad').remove();
        loadedCheerio('#chr-content ins').remove();
        loadedCheerio('#chr-content iframe').remove();

        let chapterText = loadedCheerio('#chr-content').html();

        if (!chapterText) {
            chapterText = loadedCheerio('#chapter-content').html();
        }
        if (!chapterText) {
            chapterText = loadedCheerio('.chapter-content').html();
        }
        if (!chapterText) {
            chapterText = loadedCheerio('.chr-c').html();
        }

        return chapterText || '';
    }

    async searchNovels(
        searchTerm: string,
        pageNo: number,
    ): Promise<Plugin.NovelItem[]> {
        const searchUrl = `${this.site}/search?keyword=${encodeURIComponent(searchTerm)}&page=${pageNo}`;

        const result = await fetchApi(searchUrl, { headers: this.headers });
        const body = await result.text();
        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    }

    filters = {
        sort: {
            type: FilterTypes.Picker,
            label: 'Sort By',
            value: '',
            options: [
                { label: 'Hot', value: 'novelbin-hot' },
                { label: 'Latest Release', value: 'novelbin-daily-update' },
                { label: 'Completed', value: 'novelbin-complete' },
                { label: 'Most Popular', value: 'novelbin-popular' },
            ],
        },
        genre: {
            type: FilterTypes.Picker,
            label: 'Genre',
            value: '',
            options: [
                { label: 'All', value: '' },
                { label: 'Action', value: 'action' },
                { label: 'Adventure', value: 'adventure' },
                { label: 'Anime & Comics', value: 'anime-&-comics' },
                { label: 'Comedy', value: 'comedy' },
                { label: 'Drama', value: 'drama' },
                { label: 'Eastern', value: 'eastern' },
                { label: 'Fan-fiction', value: 'fan-fiction' },
                { label: 'Fantasy', value: 'fantasy' },
                { label: 'Game', value: 'game' },
                { label: 'Gender Bender', value: 'gender-bender' },
                { label: 'Harem', value: 'harem' },
                { label: 'Historical', value: 'historical' },
                { label: 'Horror', value: 'horror' },
                { label: 'Isekai', value: 'isekai' },
                { label: 'Josei', value: 'josei' },
                { label: 'Litrpg', value: 'litrpg' },
                { label: 'Magic', value: 'magic' },
                { label: 'Magical Realism', value: 'magical-realism' },
                { label: 'Martial Arts', value: 'martial-arts' },
                { label: 'Mature', value: 'mature' },
                { label: 'Mecha', value: 'mecha' },
                { label: 'Military', value: 'military' },
                { label: 'Modern Life', value: 'modern-life' },
                { label: 'Mystery', value: 'mystery' },
                { label: 'Psychological', value: 'psychological' },
                { label: 'Reincarnation', value: 'reincarnation' },
                { label: 'Romance', value: 'romance' },
                { label: 'School Life', value: 'school-life' },
                { label: 'Sci-fi', value: 'sci-fi' },
                { label: 'Seinen', value: 'seinen' },
                { label: 'Shoujo', value: 'shoujo' },
                { label: 'Shoujo Ai', value: 'shoujo-ai' },
                { label: 'Shounen', value: 'shounen' },
                { label: 'Shounen Ai', value: 'shounen-ai' },
                { label: 'Slice of Life', value: 'slice-of-life' },
                { label: 'Smut', value: 'smut' },
                { label: 'Sports', value: 'sports' },
                { label: 'Supernatural', value: 'supernatural' },
                { label: 'System', value: 'system' },
                { label: 'Thriller', value: 'thriller' },
                { label: 'Tragedy', value: 'tragedy' },
                { label: 'Urban', value: 'urban' },
                { label: 'Video Games', value: 'video-games' },
                { label: 'War', value: 'war' },
                { label: 'Wuxia', value: 'wuxia' },
                { label: 'Xianxia', value: 'xianxia' },
                { label: 'Xuanhuan', value: 'xuanhuan' },
                { label: 'Yaoi', value: 'yaoi' },
                { label: 'Yuri', value: 'yuri' },
            ],
        },
        tag: {
            type: FilterTypes.TextInput,
            label: 'Tag',
            value: '',
        },
    } satisfies Filters;
}

export default new NovelBin();
