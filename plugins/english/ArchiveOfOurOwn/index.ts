import { fetchApi } from '@libs/fetch';
import { FilterOption } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import {
  assertNoChallenge,
  checkResponse,
  createPluginError,
  PluginError,
} from '@libs/pluginError';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { CheerioAPI, load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

import { filters, TAG_FILTERS } from './filters';

class ArchiveOfOurOwn extends NekoriBasePlugin {
  id = 'archiveofourown';
  name = 'Archive of Our Own (AO3)';
  icon = 'icon.png';
  site = 'https://archiveofourown.org';
  version = '2.0.1';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.MIXED;
  filters = filters;

  private readonly headers = {
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  private readonly suggestions = new Map<
    string,
    { expires: number; result: Promise<FilterOption[]> }
  >();

  private normalizePath(input: string): string {
    let path = input.trim();
    if (/^(?:https?:)?\/\//i.test(path)) {
      const match = path.match(
        /^(?:https?:)?\/\/(?:www\.)?archiveofourown\.org(\/[^#]*)?(?:#.*)?$/i,
      );
      if (!match) throw new Error('Please enter an Archive of Our Own URL.');
      path = match[1] || '/';
    }
    path = `/${path.replace(/^\/+/, '').split(/[?#]/)[0]}`;
    const match = path.match(
      /^\/(?:works\/\d+(?:\/chapters\/\d+)?|chapters\/\d+)\/?$/,
    );
    if (!match) throw new Error('Invalid AO3 work or chapter path.');
    return path.replace(/\/$/, '');
  }

  private workPath(input: string): string {
    const path = this.normalizePath(input);
    const match = path.match(/^\/works\/\d+/);
    if (!match) throw new Error('Please enter an AO3 work URL.');
    return match[0];
  }

  private async request(
    path: string,
    headers?: Record<string, string>,
  ): Promise<string> {
    const url = `${this.site}${path}`;
    const response = checkResponse(
      await fetchApi(url, { headers: { ...this.headers, ...headers } }),
    );
    const body = await response.text();
    assertNoChallenge(body, url, response.url);
    if (/\/users\/login(?:[/?#]|$)|\/user_sessions\/new/.test(response.url)) {
      throw createPluginError(PluginError.AuthRequired);
    }
    return body;
  }

  private async document(path: string): Promise<CheerioAPI> {
    const $ = loadCheerio(await this.request(path));
    if (
      $('#main form#new_user, #main form[action="/users/login"]').length ||
      /only available to registered users|log in to (?:access|view) this work/i.test(
        $('#main .notice, #main .error').text(),
      )
    ) {
      throw createPluginError(PluginError.AuthRequired);
    }
    const error = $('#main .error').first().text().trim();
    if (error) {
      throw createPluginError(PluginError.InvalidResponse, { message: error });
    }
    return $;
  }

  getFilterSuggestions = async (
    filterKey: string,
    query: string,
  ): Promise<FilterOption[]> => {
    const config = Object.prototype.hasOwnProperty.call(TAG_FILTERS, filterKey)
      ? TAG_FILTERS[filterKey as keyof typeof TAG_FILTERS]
      : undefined;
    const term = query.trim();
    if (!config || term.length < 2) return [];
    const key = `${config.route}:${term.toLowerCase()}`;
    const cached = this.suggestions.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;

    const entry = {
      expires: Date.now() + 5 * 60 * 1000,
      result: this.fetchSuggestions(config.route, term),
    };
    this.suggestions.set(key, entry);
    if (this.suggestions.size > 64) {
      const oldest = this.suggestions.keys().next().value;
      if (oldest !== undefined) this.suggestions.delete(oldest);
    }
    try {
      return await entry.result;
    } catch (error) {
      if (this.suggestions.get(key) === entry) this.suggestions.delete(key);
      throw error;
    }
  };

  private async fetchSuggestions(
    route: string,
    term: string,
  ): Promise<FilterOption[]> {
    const body = await this.request(
      `/autocomplete/${route}?${new URLSearchParams({ term, format: 'json' })}`,
      {
        // Rails treats the document Accept header (with */*) as HTML and
        // redirects this JSON-only endpoint to /404 unless the format is set.
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${this.site}/works/search`,
      },
    );
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      throw createPluginError(PluginError.InvalidResponse, {
        message:
          'AO3 returned an invalid autocomplete response. Try opening the site in WebView.',
      });
    }
    if (!Array.isArray(data)) {
      throw createPluginError(PluginError.InvalidResponse);
    }
    const result: FilterOption[] = [];
    const seen = new Set<string>();
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const { id, name } = item;
      if (typeof id !== 'string' || typeof name !== 'string' || !id.trim())
        continue;
      if (seen.has(id)) continue;
      seen.add(id);
      // AO3's IDs here are tag names, not numeric database IDs.
      result.push({ label: name, value: id });
      if (result.length === 20) break;
    }
    return result;
  }

  private parseNovels($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    $('li.work.blurb').each((_, element) => {
      const title = $(element).find('h4.heading a[href]').first();
      const href = title.attr('href');
      const name = title.text().trim();
      if (!href || !name || !/^\/works\/\d+(?:[/?#]|$)/.test(href)) return;
      const path = this.workPath(href);
      if (seen.has(path)) return;
      seen.add(path);
      // AO3 blurbs have rating/category icons, not book covers.
      novels.push({ name, path });
    });
    if (
      !novels.length &&
      !$('ol.work.index, form[action="/works/search"]').length &&
      !/No results found\./i.test($('#main').text())
    ) {
      throw createPluginError(PluginError.InvalidResponse, {
        message:
          'AO3 work results not found. The site may be blocked or its layout may have changed.',
      });
    }
    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const selected = options?.filters;
    const params = new URLSearchParams({
      page: String(pageNo),
      'work_search[sort_column]': options?.showLatestNovels
        ? 'revised_at'
        : selected?.sort?.value || this.filters.sort.value,
      'work_search[sort_direction]': options?.showLatestNovels
        ? 'desc'
        : selected?.direction?.value || this.filters.direction.value,
    });
    for (const [key, { field }] of Object.entries(TAG_FILTERS)) {
      const values = selected?.[key as keyof typeof TAG_FILTERS]?.value;
      if (!Array.isArray(values)) continue;
      const names = [
        ...new Set(values.map(value => value.trim()).filter(Boolean)),
      ];
      if (names.length) params.set(`work_search[${field}]`, names.join(','));
    }
    const fields = {
      language_id: selected?.language?.value,
      complete: selected?.status?.value,
      rating_ids: selected?.rating?.value,
      crossover: selected?.crossover?.value,
      word_count: selected?.wordCount?.value,
      creators: selected?.creators?.value,
      query: selected?.query?.value,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value?.trim()) params.set(`work_search[${key}]`, value.trim());
    }
    if (selected?.singleChapter?.value)
      params.set('work_search[single_chapter]', '1');
    return this.parseNovels(await this.document(`/works/search?${params}`));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page: String(pageNo),
      'work_search[query]': searchTerm.trim(),
      'work_search[sort_column]': '_score',
      'work_search[sort_direction]': 'desc',
    });
    return this.parseNovels(await this.document(`/works/search?${params}`));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = this.workPath(novelPath);
    const $ = await this.document(`${path}?view_adult=true`);
    const preface = $('#workskin > .preface').first();
    const name = preface.find('h2.title').text().trim();
    if (!name) {
      throw createPluginError(PluginError.NovelNotFound, {
        message:
          'AO3 work not found. It may be restricted, unrevealed, or unavailable.',
      });
    }
    const byline = preface.find('.byline').first();
    const authors = byline
      .find('a[rel="author"]')
      .map((_, element) => $(element).text().trim())
      .get();
    const summary = preface.find('.summary blockquote').first();
    const paragraphs = summary
      .find('p')
      .map((_, element) => $(element).text().trim())
      .get();
    const tags = $('dl.work.meta dd.tags a.tag')
      .map((_, element) => $(element).text().trim())
      .get();
    const counts = $('dd.chapters')
      .first()
      .text()
      .trim()
      .match(/(\d+)\s*\/\s*(\d+|\?)/);
    const completed = !!counts && counts[2] !== '?' && counts[1] === counts[2];
    const chapters: Plugin.ChapterItem[] = [];
    $('#selected_id option').each((index, element) => {
      const option = $(element);
      const id = option.attr('value');
      if (!id || !/^\d+$/.test(id)) return;
      chapters.push({
        name: option.text().trim() || `Chapter ${index + 1}`,
        path: `${path}/chapters/${id}`,
        chapterNumber: index + 1,
      });
    });
    if (!chapters.length && Number(counts?.[1]) > 1) {
      // The full chapter index is small and does not download the entire work.
      const index = await this.document(`${path}/navigate?view_adult=true`);
      index('ol.chapter.index li').each((_, element) => {
        const link = index(element).find('a').first();
        const href = link.attr('href');
        if (!href || !href.startsWith(`${path}/chapters/`)) return;
        chapters.push({
          name: link.text().trim() || `Chapter ${chapters.length + 1}`,
          path: this.normalizePath(href),
          chapterNumber: chapters.length + 1,
          releaseTime: index(element)
            .find('.datetime')
            .text()
            .match(/\d{4}-\d{2}-\d{2}/)?.[0],
        });
      });
      if (!chapters.length) throw createPluginError(PluginError.EmptyContent);
    }
    if (!chapters.length) {
      if (
        !$('#chapters > .userstuff, #chapters .userstuff[role="article"]')
          .length
      )
        throw createPluginError(PluginError.EmptyContent);
      chapters.push({ name, path, chapterNumber: 1 });
    }
    const published = $('dd.published').first().text().trim();
    const updated = $('dd.status').first().text().trim();
    if (published && !chapters[0].releaseTime)
      chapters[0].releaseTime = published;
    if (updated && !chapters[chapters.length - 1].releaseTime)
      chapters[chapters.length - 1].releaseTime = updated;
    return {
      name,
      path,
      author: authors.length
        ? authors.join(', ')
        : byline.text().trim() || 'Anonymous',
      summary: paragraphs.length
        ? paragraphs.join('\n\n')
        : summary.text().trim(),
      genres: [...new Set(tags)].join(', '),
      status: counts
        ? completed
          ? NovelStatus.Completed
          : NovelStatus.Ongoing
        : NovelStatus.Unknown,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const path = this.normalizePath(chapterPath);
    const $ = await this.document(`${path}?view_adult=true`);
    const content = $(
      '#chapters .userstuff[role="article"], #chapters > .userstuff',
    ).first();
    if (!content.length) throw createPluginError(PluginError.EmptyContent);
    content.find('script, style, iframe, form, .landmark').remove();
    // Keep author formatting and images, but resolve relative resources for the reader.
    content.find('[href], [src]').each((_, element) => {
      const node = $(element);
      for (const attribute of ['href', 'src']) {
        const value = node.attr(attribute);
        if (!value) continue;
        if (/^\s*(?:javascript|vbscript):/i.test(value)) {
          node.removeAttr(attribute);
        } else if (value.startsWith('//')) {
          node.attr(attribute, `https:${value}`);
        } else if (value.startsWith('/')) {
          node.attr(attribute, `${this.site}${value}`);
        }
      }
    });
    const html = content.html()?.trim();
    if (
      !html ||
      (!content.text().trim() && !content.find('img, audio, video').length)
    )
      throw createPluginError(PluginError.EmptyContent);
    return { state: 'ready', type: 'novel', html };
  }

  override resolveUrl(path: string, isNovel = false): string {
    return `${this.site}${isNovel ? this.workPath(path) : this.normalizePath(path)}`;
  }
}

export default new ArchiveOfOurOwn();
