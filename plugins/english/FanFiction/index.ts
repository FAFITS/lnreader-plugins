import { fetchApi } from '@libs/fetch';
import { FilterOption, Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { CheerioAPI, load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

const GENRE_OPTIONS = [
  { label: 'Adventure', value: '6' },
  { label: 'Angst', value: '10' },
  { label: 'Crime', value: '18' },
  { label: 'Drama', value: '4' },
  { label: 'Family', value: '19' },
  { label: 'Fantasy', value: '14' },
  { label: 'Friendship', value: '21' },
  { label: 'General', value: '1' },
  { label: 'Horror', value: '8' },
  { label: 'Humor', value: '3' },
  { label: 'Hurt/Comfort', value: '20' },
  { label: 'Mystery', value: '7' },
  { label: 'Parody', value: '9' },
  { label: 'Poetry', value: '5' },
  { label: 'Romance', value: '2' },
  { label: 'Sci-Fi', value: '13' },
  { label: 'Spiritual', value: '15' },
  { label: 'Supernatural', value: '11' },
  { label: 'Suspense', value: '12' },
  { label: 'Tragedy', value: '16' },
  { label: 'Western', value: '17' },
] as const;

const KNOWN_GENRES = new Set<string>(GENRE_OPTIONS.map(({ label }) => label));

const FANDOM_CATEGORIES: Record<string, string> = {
  anime: 'Anime',
  book: 'Books',
  cartoon: 'Cartoons',
  comic: 'Comics',
  game: 'Games',
  misc: 'Misc',
  play: 'Plays',
  movie: 'Movies',
  tv: 'TV',
};

class FanFictionNet extends NekoriBasePlugin {
  id = 'fanfiction.net';
  name = 'FanFiction.Net';
  icon = 'icon.png';
  site = 'https://www.fanfiction.net';
  version = '1.0.5';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  private readonly suggestionPages = new Map<
    string,
    { expires: number; options: Promise<FilterOption[]> }
  >();

  filters = {
    fandoms: {
      type: FilterTypes.MultiText,
      label: 'Fandoms / Crossovers (Naruto, Naruto & Bleach, or a site path)',
      value: [] as string[],
      autocomplete: true,
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort By',
      value: '1',
      options: [
        { label: 'Sort: Update Date', value: '1' },
        { label: 'Publish Date', value: '2' },
        { label: 'Reviews', value: '3' },
        { label: 'Favorites', value: '4' },
        { label: 'Follows', value: '5' },
      ],
    },
    timeRange: {
      type: FilterTypes.Picker,
      label: 'Time Range',
      value: '0',
      options: [
        { label: 'Time Range: All', value: '0' },
        { label: 'Updated within 24 hours', value: '1' },
        { label: 'Updated within 1 week', value: '2' },
        { label: 'Updated within 1 month', value: '3' },
        { label: 'Updated within 6 months', value: '4' },
        { label: 'Updated within 1 Year', value: '5' },
        { label: 'Published within 24 hours', value: '11' },
        { label: 'Published within 1 week', value: '12' },
        { label: 'Published within 1 month', value: '13' },
        { label: 'Published within 6 months', value: '14' },
        { label: 'Published within 1 Year', value: '15' },
      ],
    },
    rating: {
      type: FilterTypes.Picker,
      label: 'Rating',
      value: '103',
      options: [
        { label: 'Rated K -> T', value: '103' },
        { label: 'Rating: All', value: '10' },
        { label: 'Rated K -> K+', value: '102' },
        { label: 'Rated K', value: '1' },
        { label: 'Rated K+', value: '2' },
        { label: 'Rated T', value: '3' },
        { label: 'Rated M', value: '4' },
      ],
    },
    language: {
      type: FilterTypes.Picker,
      label: 'Language',
      value: '0',
      options: [
        { label: 'Language: All', value: '0' },
        { label: 'English', value: '1' },
        { label: 'Español', value: '2' },
        { label: 'Français', value: '3' },
        { label: 'Deutsch', value: '4' },
        { label: '中文', value: '5' },
        { label: '日本語', value: '6' },
        { label: 'Português', value: '8' },
        { label: 'Русский', value: '10' },
        { label: 'Italiano', value: '11' },
        { label: 'Tiếng Việt', value: '37' },
        { label: 'Bahasa Indonesia', value: '32' },
        { label: '한국어', value: '36' },
        { label: 'Filipino', value: '21' },
        { label: 'Polski', value: '13' },
        { label: 'Türkçe', value: '30' },
      ],
    },
    genre: {
      type: FilterTypes.Picker,
      label: 'Genre (A)',
      value: '0',
      options: [{ label: 'Genre (A): All', value: '0' }, ...GENRE_OPTIONS],
    },
    genreB: {
      type: FilterTypes.Picker,
      label: 'Genre (B)',
      value: '0',
      options: [{ label: 'Genre (B): All', value: '0' }, ...GENRE_OPTIONS],
    },
    length: {
      type: FilterTypes.Picker,
      label: 'Length',
      value: '0',
      options: [
        { label: 'Length: All', value: '0' },
        { label: '< 1k words', value: '1' },
        { label: '< 5k words', value: '2' },
        { label: '> 1k words', value: '3' },
        { label: '> 5k words', value: '4' },
        { label: '> 10k words', value: '5' },
        { label: '> 20k words', value: '6' },
        { label: '> 40k words', value: '7' },
        { label: '> 60k words', value: '8' },
        { label: '> 100k words', value: '9' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '0',
      options: [
        { label: 'Status: All', value: '0' },
        { label: 'In-Progress', value: '1' },
        { label: 'Complete', value: '2' },
      ],
    },
  } satisfies Filters;

  getFilterSuggestions = async (
    filterKey: string,
    query: string,
  ): Promise<FilterOption[]> => {
    if (filterKey !== 'fandoms') return [];

    const input = query.trim().toLowerCase();
    const directPath = this.normalizeFandomPath(query);
    if (directPath) return [{ label: query.trim(), value: directPath }];
    if (!input) return [];
    const isCrossover = /[&+]|\s+x\s+|\bcrossovers?\b/i.test(input);
    const terms = input
      .replace(/\bcrossovers?\b\s*:?/g, '')
      .replace(
        /^(?:anime|books|cartoons|comics|games|misc|plays|movies|tv):\s*/,
        '',
      )
      .split(/\s+|[&+]/)
      .filter(term => term && term !== 'x');
    if (!terms.length) return [];
    const matches = (option: FilterOption) => {
      const text = `${option.label} ${option.value}`.toLowerCase();
      return terms.every(term => text.includes(term));
    };
    // Load independent indexes together to fit the host's suggestion timeout.
    // Cached promises also share these requests across successive keystrokes.
    const catalog = await this.collectSuggestionPages(
      Object.entries(FANDOM_CATEGORIES).map(([route, label]) =>
        this.getSuggestionPage(
          `${isCrossover ? '/crossovers' : ''}/${route}/`,
          isCrossover ? 'crossovers' : 'fandom',
          label,
        ),
      ),
      2800,
    );
    if (!isCrossover) return catalog.filter(matches).slice(0, 20);

    // Crossover indexes link to fandom directories; each directory contains
    // the actual pair/archive URLs, including FanFiction's numeric IDs.
    const seeds = catalog
      .map(option => ({
        option,
        score:
          terms.filter(term => option.label.toLowerCase().includes(term))
            .length +
          (terms.join(' ') ===
          option.label.replace(/^[^:]+:\s*/, '').toLowerCase()
            ? terms.length
            : 0),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const pairs = await this.collectSuggestionPages(
      seeds.map(({ option }) =>
        this.getSuggestionPage(option.value, 'pairs', option.label),
      ),
      1400,
    );
    const seen = new Set<string>();
    return pairs
      .filter(option => {
        // The same pair can be linked in reverse order by the two directories.
        const ids = option.value.match(/\/(\d+)\/(\d+)\/$/);
        const key = ids ? ids.slice(1).sort().join(':') : option.value;
        if (!matches(option) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  };

  private async collectSuggestionPages(
    pages: Promise<FilterOption[]>[],
    timeoutMs: number,
  ): Promise<FilterOption[]> {
    if (!pages.length) return [];
    const options: FilterOption[][] = [];
    let failure: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = pages.map((page, index) =>
      page.then(
        result => {
          options[index] = result;
        },
        error => {
          failure = error;
        },
      ),
    );
    try {
      await Promise.race([
        Promise.all(pending),
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    const collected = options.flat();
    if (!collected.length) {
      throw (
        failure ||
        new Error('FanFiction suggestions timed out. Please try again.')
      );
    }
    return collected;
  }

  private async getSuggestionPage(
    path: string,
    kind: 'fandom' | 'crossovers' | 'pairs',
    prefix: string,
  ): Promise<FilterOption[]> {
    const cached = this.suggestionPages.get(path);
    if (cached && cached.expires > Date.now()) return cached.options;

    const entry = {
      expires: Date.now() + 30 * 60 * 1000,
      options: this.fetchSuggestionPage(path, kind, prefix),
    };
    this.suggestionPages.set(path, entry);
    if (this.suggestionPages.size > 32) {
      const oldest = this.suggestionPages.keys().next().value;
      if (oldest !== undefined) this.suggestionPages.delete(oldest);
    }
    try {
      return await entry.options;
    } catch (error) {
      // A failed request or challenge page must be retried on the next query.
      if (this.suggestionPages.get(path) === entry)
        this.suggestionPages.delete(path);
      throw error;
    }
  }

  private async fetchSuggestionPage(
    path: string,
    kind: 'fandom' | 'crossovers' | 'pairs',
    prefix: string,
  ): Promise<FilterOption[]> {
    const res = await fetchApi(`${this.site}${path}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch fandom suggestions: HTTP ${res.status}`);
    }
    const $ = loadCheerio(await res.text());
    const options: FilterOption[] = [];
    const seen = new Set<string>();
    $('a[href]').each((_, element) => {
      const anchor = $(element);
      const name = anchor.text().trim();
      const href = anchor.attr('href');
      if (!name || !href) return;
      // Hermes hosts may not provide the browser's URL constructor. Do not
      // silently discard every anchor when that global is unavailable.
      const value = this.normalizeFandomPath(href, true);
      if (!value) return;
      const isFandom =
        kind === 'fandom' &&
        value.startsWith(path) &&
        value.slice(path.length).match(/^[^/]+\/$/);
      const isDirectory =
        kind === 'crossovers' && /^\/crossovers\/[^/]+\/\d+\/$/.test(value);
      const isPair =
        kind === 'pairs' && /^\/[^/]+[-_]Crossovers\/\d+\/\d+\/$/i.test(value);
      if ((!isFandom && !isDirectory && !isPair) || seen.has(value)) return;
      seen.add(value);
      options.push({
        label:
          kind === 'pairs'
            ? /\/0\/$/.test(value)
              ? `${prefix}: All crossovers`
              : `${prefix} & ${name}`
            : `${prefix}: ${name}`,
        value,
      });
    });
    if (!options.length) {
      throw new Error(
        'Fandom suggestions not found. The site may be blocked or its layout may have changed.',
      );
    }
    return options;
  }

  private normalizeFandomPath(
    value: string,
    allowDirectory = false,
  ): string | undefined {
    let path = value.trim();
    if (/^(?:https?:)?\/\//i.test(path)) {
      const absolute = path.match(
        /^(?:https?:)?\/\/(?:www\.|m\.)?fanfiction\.net(\/[^?#]*)?(?:[?#].*)?$/i,
      );
      if (!absolute) return undefined;
      path = absolute[1] || '/';
    }
    path = `/${path.replace(/^\/+/, '').split(/[?#]/)[0].replace(/\/+$/, '')}/`;
    if (
      /^\/(?:anime|book|cartoon|comic|game|misc|play|movie|tv)\/[^/]+\/$/.test(
        path,
      ) ||
      /^\/[^/]+[-_]Crossovers\/\d+\/\d+\/$/i.test(path) ||
      /^\/j\/\d+\/\d+\/\d+\/$/.test(path) ||
      (allowDirectory && /^\/crossovers\/[^/]+\/\d+\/$/.test(path))
    )
      return path;
    return undefined;
  }

  private async resolveFandomPath(value: string): Promise<string> {
    const input = value.trim();
    const directPath = this.normalizeFandomPath(input);
    if (directPath) return directPath;
    const suggestions = await this.getFilterSuggestions('fandoms', input);
    const key = input.toLowerCase();
    const match =
      suggestions.find(
        option =>
          option.label.toLowerCase() === key ||
          option.label.replace(/^[^:]+:\s*/, '').toLowerCase() === key,
      ) || (suggestions.length === 1 ? suggestions[0] : undefined);
    if (!match)
      throw new Error(
        'Select a fandom/crossover suggestion or enter its FanFiction path.',
      );
    return match.value;
  }

  private extractCoverUrl(rawUrl?: string): string | undefined {
    if (
      !rawUrl ||
      rawUrl.includes('d_60_90.jpg') ||
      rawUrl.includes('d_75_100.jpg')
    ) {
      return undefined;
    }
    // Upgrade thumbnail sizes (e.g. /75/, /60/, /90/) to high-resolution /180/
    let upgraded = rawUrl
      .replace(/\/75\/?$/, '/180/')
      .replace(/\/60\/?$/, '/180/');
    if (upgraded.startsWith('//')) {
      upgraded = `https:${upgraded}`;
    } else if (upgraded.startsWith('/')) {
      upgraded = `${this.site}${upgraded}`;
    }
    return upgraded;
  }

  private parseNovels($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    $('.z-list').each((_, el) => {
      const $el = $(el);
      const $title = $el.find('a.stitle');
      const name = $title.text().trim();
      const href = $title.attr('href');

      if (!name || !href) return;

      let path = href.startsWith('http') ? href.replace(this.site, '') : href;
      if (!path.startsWith('/')) path = `/${path}`;

      const $img = $el.find('img.cimage, img.lazy, img.cavatar, img').first();
      const rawCover =
        $img.attr('data-original') || $img.attr('data-src') || $img.attr('src');
      const cover = this.extractCoverUrl(rawCover);

      novels.push({
        name,
        path,
        cover,
      });
    });

    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const filters = options?.filters;
    const selected =
      filters?.fandoms?.value?.filter(value => value.trim()) || [];
    const paths = selected.length ? selected : ['/book/Harry-Potter/'];
    const fandomPaths = [
      ...new Set(
        await Promise.all(paths.map(path => this.resolveFandomPath(path))),
      ),
    ];

    const params = new URLSearchParams();

    const sort = options?.showLatestNovels ? '1' : filters?.sort?.value || '1';
    if (sort) params.set('srt', sort);

    if (filters?.timeRange?.value && filters.timeRange.value !== '0') {
      params.set('t', filters.timeRange.value);
    }
    if (filters?.rating?.value) {
      params.set('r', filters.rating.value);
    }
    if (filters?.language?.value && filters.language.value !== '0') {
      params.set('lan', filters.language.value);
    }
    if (filters?.genre?.value && filters.genre.value !== '0') {
      params.set('g1', filters.genre.value);
    }
    if (filters?.genreB?.value && filters.genreB.value !== '0') {
      params.set('g2', filters.genreB.value);
    }
    if (filters?.length?.value && filters.length.value !== '0') {
      params.set('len', filters.length.value);
    }
    if (filters?.status?.value && filters.status.value !== '0') {
      params.set('s', filters.status.value);
    }

    if (pageNo > 1) {
      params.set('p', String(pageNo));
    }

    const query = params.toString();
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    for (const fandomPath of fandomPaths) {
      const url = `${this.site}${fandomPath}${query ? `?${query}` : ''}`;
      const res = await fetchApi(url, { headers: this.headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch popular novels: HTTP ${res.status}`);
      }
      const $ = loadCheerio(await res.text());
      for (const novel of this.parseNovels($)) {
        if (seen.has(novel.path)) continue;
        seen.add(novel.path);
        novels.push(novel);
      }
    }
    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      keywords: searchTerm,
      ready: '1',
      type: 'story',
    });

    if (pageNo > 1) {
      params.set('ppage', String(pageNo));
    }

    const searchUrl = `${this.site}/search/?${params.toString()}`;
    const res = await fetchApi(searchUrl, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Failed to search novels: HTTP ${res.status}`);
    }

    const body = await res.text();
    const $ = loadCheerio(body);
    return this.parseNovels($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const normalizedPath = novelPath.startsWith('/')
      ? novelPath
      : `/${novelPath}`;
    const url = `${this.site}${normalizedPath}`;

    const res = await fetchApi(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Failed to parse novel: HTTP ${res.status}`);
    }

    const body = await res.text();
    const $ = loadCheerio(body);

    const name =
      $('#profile_top b.xcontrast_0').text().trim() ||
      $('#profile_top b').first().text().trim() ||
      $('title').text().split('|')[0].trim() ||
      'Unknown Title';

    const author =
      $('#profile_top a[href*="/u/"]').first().text().trim() || undefined;

    const summary =
      $('#profile_top div.xcontrast_txt').text().trim() ||
      $('#profile_top div.xcontrast_0').text().trim() ||
      $('#profile_top > div').first().text().trim() ||
      undefined;

    const $img = $(
      '#profile_top img.cimage, #profile_top img.lazy, #profile_top img.cavatar, #profile_top img',
    ).first();
    const rawCover =
      $img.attr('data-original') || $img.attr('data-src') || $img.attr('src');
    const cover = this.extractCoverUrl(rawCover);

    const infoText =
      $(
        '#profile_top span.xgroups, #profile_top div.xcontrast_2, #profile_top span.xcontrast_2',
      ).text() || $('#profile_top').text();

    const status = infoText.includes('Status: Complete')
      ? NovelStatus.Completed
      : NovelStatus.Ongoing;

    const matchedGenres: string[] = [];
    const infoParts = infoText.split(/\s*-\s*/);
    for (const part of infoParts) {
      const subParts = part.split('/').map(s => s.trim());
      for (const sub of subParts) {
        if (KNOWN_GENRES.has(sub) && !matchedGenres.includes(sub)) {
          matchedGenres.push(sub);
        }
      }
    }
    const genres =
      matchedGenres.length > 0 ? matchedGenres.join(', ') : undefined;

    const idMatch = normalizedPath.match(/\/s\/(\d+)/);
    const storyId = idMatch ? idMatch[1] : '';

    const chapters: Plugin.ChapterItem[] = [];
    const $options = $('#chap_select').first().find('option');

    if ($options.length > 0) {
      $options.each((idx, el) => {
        const $opt = $(el);
        const chapterNum = $opt.attr('value') || String(idx + 1);
        const chapterTitle = $opt.text().trim();
        chapters.push({
          name: chapterTitle || `Chapter ${chapterNum}`,
          path: `/s/${storyId}/${chapterNum}/`,
          chapterNumber: Number(chapterNum) || idx + 1,
        });
      });
    } else if (storyId) {
      chapters.push({
        name: name || 'Chapter 1',
        path: `/s/${storyId}/1/`,
        chapterNumber: 1,
      });
    }

    const xutimes = $('#profile_top span[data-xutime]')
      .map((_, el) => Number($(el).attr('data-xutime')))
      .get()
      .filter(t => !isNaN(t) && t > 0);

    if (xutimes.length > 0 && chapters.length > 0) {
      const latestTime = Math.max(...xutimes);
      const isoDate = new Date(latestTime * 1000).toISOString();
      chapters[chapters.length - 1].releaseTime = isoDate;
    }

    return {
      name,
      path: normalizedPath,
      cover,
      author,
      summary,
      status,
      genres,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const normalizedPath = chapterPath.startsWith('/')
      ? chapterPath
      : `/${chapterPath}`;
    const url = `${this.site}${normalizedPath}`;

    const res = await fetchApi(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Failed to parse chapter: HTTP ${res.status}`);
    }

    const body = await res.text();
    const $ = loadCheerio(body);

    const $story = $('#storytext');
    if ($story.length === 0) {
      throw new Error(
        'Chapter content not found. Site layout may have changed or the request was blocked.',
      );
    }

    $story.find('script, style').remove();
    const html = $story.html() || '';

    return {
      state: 'ready',
      type: 'novel',
      html,
    };
  }

  override resolveUrl(path: string): string {
    return `${this.site}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

export default new FanFictionNet();
