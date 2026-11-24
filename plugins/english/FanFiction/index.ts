import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { FilterOption, Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { CheerioAPI, load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

import {
  normalizeSearchText,
  resolveFandomPath,
  searchFandomSuggestions,
} from './fandom-search';

const GENRE_OPTIONS: readonly FilterOption[] = [
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
];

const KNOWN_GENRES = new Set<string>(GENRE_OPTIONS.map(({ label }) => label));

const GENRE_LOOKUP = new Map<string, string>();
for (const genre of GENRE_OPTIONS) {
  GENRE_LOOKUP.set(genre.value, genre.value);
  GENRE_LOOKUP.set(genre.label.toLowerCase(), genre.value);
  GENRE_LOOKUP.set(normalizeSearchText(genre.label), genre.value);
}

function searchGenreSuggestions(query: string, limit = 6): FilterOption[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const scored: { option: FilterOption; score: number }[] = [];
  for (const genre of GENRE_OPTIONS) {
    const normalizedLabel = normalizeSearchText(genre.label);
    let score = -1;
    if (normalizedLabel === normalizedQuery || genre.value === query.trim()) {
      score = 0;
    } else if (normalizedLabel.startsWith(normalizedQuery)) {
      score = 1;
    } else if (normalizedLabel.includes(normalizedQuery)) {
      score = 2;
    }
    if (score >= 0) {
      // Chip text shows `value`, so use the readable genre label and map to IDs in popularNovels.
      scored.push({
        option: { label: genre.label, value: genre.label },
        score,
      });
    }
  }

  scored.sort(
    (a, b) => a.score - b.score || a.option.label.localeCompare(b.option.label),
  );
  return scored.slice(0, limit).map(entry => entry.option);
}

function resolveGenreIds(rawGenres?: string[]): string[] {
  if (!Array.isArray(rawGenres) || rawGenres.length === 0) return [];
  const resolved: string[] = [];
  for (const entry of rawGenres) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const genreId =
      GENRE_LOOKUP.get(trimmed) ||
      GENRE_LOOKUP.get(trimmed.toLowerCase()) ||
      GENRE_LOOKUP.get(normalizeSearchText(trimmed));
    if (genreId && !resolved.includes(genreId)) {
      resolved.push(genreId);
      if (resolved.length === 2) break;
    }
  }
  return resolved;
}

class FanFictionNet extends NekoriBasePlugin {
  id = 'fanfiction.net';
  name = 'FanFiction.Net';
  icon = 'icon.png';
  site = 'https://www.fanfiction.net';
  version = '1.1.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  filters = {
    fandom: {
      type: FilterTypes.TextInput,
      label: 'Fandom / Crossover (search or path, default: Harry Potter)',
      value: '',
      autocomplete: true,
    },
    genres: {
      type: FilterTypes.MultiText,
      label: 'Genres (up to 2, e.g. Adventure, Romance)',
      value: [],
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

  async getFilterSuggestions(
    filterKey: string,
    query: string,
  ): Promise<FilterOption[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (filterKey === 'fandom') {
      return searchFandomSuggestions(trimmed, 6);
    }
    if (filterKey === 'genres') {
      return searchGenreSuggestions(trimmed, 6);
    }
    return [];
  }

  private extractCoverUrl(rawUrl?: string): string {
    if (
      !rawUrl ||
      rawUrl.includes('d_60_90.jpg') ||
      rawUrl.includes('d_75_100.jpg')
    ) {
      return defaultCover;
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
    const fandomPath = resolveFandomPath(filters?.fandom?.value);

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

    const [genreA, genreB] = resolveGenreIds(filters?.genres?.value);
    if (genreA) {
      params.set('g1', genreA);
    }
    if (genreB) {
      params.set('g2', genreB);
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
    const url = `${this.site}${fandomPath}${query ? `?${query}` : ''}`;

    const res = await fetchApi(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch popular novels: HTTP ${res.status}`);
    }

    const body = await res.text();
    const $ = loadCheerio(body);
    return this.parseNovels($);
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
