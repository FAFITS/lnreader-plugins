import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { CheerioAPI, load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

import { FANDOM_OPTIONS } from './fandom-options';

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

function uniqueFandomOptions(options: { label: string; value: string }[]) {
  const seen = new Set<string>();
  return options.filter(option => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

class FanFictionNet extends NekoriBasePlugin {
  id = 'fanfiction.net';
  name = 'FanFiction.Net';
  icon = 'icon.png';
  site = 'https://www.fanfiction.net';
  version = '1.0.1';
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
    customFandom: {
      type: FilterTypes.TextInput,
      label: 'Custom Fandom / Crossover Path (e.g. /anime/Naruto/)',
      value: '',
    },
    fandom: {
      type: FilterTypes.Picker,
      label: 'Fandom / Category',
      value: '/book/Harry-Potter/',
      options: uniqueFandomOptions([
        // --- GENERAL ---
        { label: '★ Just In: All Categories', value: '/j/0/0/0/' },

        // --- BOOKS ---
        { label: 'Books: Harry Potter (840K+)', value: '/book/Harry-Potter/' },
        { label: 'Books: Twilight (220K+)', value: '/book/Twilight/' },
        {
          label: 'Books: Percy Jackson (78K+)',
          value: '/book/Percy-Jackson-and-the-Olympians/',
        },
        {
          label: 'Books: Lord of the Rings (57K+)',
          value: '/book/Lord-of-the-Rings/',
        },
        { label: 'Books: Hunger Games (44K+)', value: '/book/Hunger-Games/' },
        { label: 'Books: Warriors (25K+)', value: '/book/Warriors/' },
        {
          label: 'Books: A Song of Ice and Fire / GoT',
          value: '/book/A-song-of-Ice-and-Fire/',
        },
        {
          label: 'Books: Mortal Instruments',
          value: '/book/Mortal-Instruments/',
        },
        {
          label: 'Books: Chronicles of Narnia',
          value: '/book/Chronicles-of-Narnia/',
        },

        // --- ANIME / MANGA ---
        { label: 'Anime: Naruto (444K+)', value: '/anime/Naruto/' },
        { label: 'Anime: Inuyasha (122K+)', value: '/anime/InuYasha/' },
        {
          label: 'Anime: Hetalia (116K+)',
          value: '/anime/Hetalia-Axis-Powers/',
        },
        { label: 'Anime: Bleach (85K+)', value: '/anime/Bleach/' },
        { label: 'Anime: Fairy Tail (70K+)', value: '/anime/Fairy-Tail/' },
        { label: 'Anime: Yu-Gi-Oh (68K+)', value: '/anime/Yu-Gi-Oh/' },
        {
          label: 'Anime: Dragon Ball Z (55K+)',
          value: '/anime/Dragon-Ball-Z/',
        },
        {
          label: 'Anime: Fullmetal Alchemist (50K+)',
          value: '/anime/Fullmetal-Alchemist/',
        },
        { label: 'Anime: Digimon (48K+)', value: '/anime/Digimon/' },
        { label: 'Anime: Sailor Moon (46K+)', value: '/anime/Sailor-Moon/' },
        { label: 'Anime: One Piece (46K+)', value: '/anime/One-Piece/' },
        {
          label: 'Anime: Gundam Wing/AC (42K+)',
          value: '/anime/Gundam-Wing-AC/',
        },
        { label: 'Anime: RWBY (35K+)', value: '/anime/RWBY/' },
        { label: 'Anime: Death Note (35K+)', value: '/anime/Death-Note/' },
        {
          label: 'Anime: Katekyo Hitman Reborn! (34K+)',
          value: '/anime/Katekyo-Hitman-Reborn/',
        },
        {
          label: 'Anime: My Hero Academia (31K+)',
          value:
            '/anime/My-Hero-Academia-%E5%83%95%E3%81%AE%E3%83%98%E3%83%BC%E3%83%AD%E3%83%BC%E3%82%A2%E3%82%AB%E3%83%87%E3%83%9F%E3%82%A2/',
        },
        {
          label: 'Anime: Attack on Titan (30K+)',
          value:
            '/anime/Attack-on-Titan-%E9%80%B2%E6%92%83%E3%81%AE%E5%B7%A8%E4%BA%BA/',
        },
        {
          label: 'Anime: Fate/stay night (8.7K+)',
          value: '/anime/Fate-stay-night/',
        },
        { label: 'Anime: Hunter X Hunter', value: '/anime/Hunter-X-Hunter/' },
        { label: 'Anime: Code Geass', value: '/anime/Code-Geass/' },

        // --- MOVIES ---
        { label: 'Movies: Star Wars (62K+)', value: '/movie/Star-Wars/' },
        {
          label: 'Movies: Avengers / Marvel (39K+)',
          value: '/movie/Avengers/',
        },
        {
          label: 'Movies: Pirates of the Caribbean',
          value: '/movie/Pirates-of-the-Caribbean/',
        },
        {
          label: 'Movies: How to Train Your Dragon',
          value: '/movie/How-to-Train-Your-Dragon/',
        },
        {
          label: 'Movies: High School Musical',
          value: '/movie/High-School-Musical/',
        },
        { label: 'Movies: Transformers', value: '/movie/Transformers/' },

        // --- TV SHOWS ---
        { label: 'TV: Supernatural (125K+)', value: '/tv/Supernatural/' },
        { label: 'TV: Glee (108K+)', value: '/tv/Glee/' },
        { label: 'TV: Doctor Who (75K+)', value: '/tv/Doctor-Who/' },
        { label: 'TV: Sherlock (60K+)', value: '/tv/Sherlock/' },
        {
          label: 'TV: Once Upon a Time (48K+)',
          value: '/tv/Once-Upon-a-Time/',
        },
        {
          label: 'TV: Vampire Diaries (40K+)',
          value: '/tv/Vampire-Diaries/',
        },
        {
          label: 'TV: Buffy: The Vampire Slayer',
          value: '/tv/Buffy-The-Vampire-Slayer/',
        },
        { label: 'TV: Teen Wolf (30K+)', value: '/tv/Teen-Wolf/' },
        { label: 'TV: Criminal Minds (24K+)', value: '/tv/Criminal-Minds/' },

        // --- GAMES ---
        { label: 'Games: Pokemon (100K+)', value: '/game/Pokemon/' },
        {
          label: 'Games: Kingdom Hearts (74K+)',
          value: '/game/Kingdom-Hearts/',
        },
        {
          label: 'Games: Sonic the Hedgehog (48K+)',
          value: '/game/Sonic-the-Hedgehog/',
        },
        {
          label: 'Games: Final Fantasy VII (43K+)',
          value: '/game/Final-Fantasy-VII/',
        },
        {
          label: 'Games: Legend of Zelda (38K+)',
          value: '/game/Legend-of-Zelda/',
        },
        { label: 'Games: Mass Effect (20K+)', value: '/game/Mass-Effect/' },
        { label: 'Games: Genshin Impact', value: '/game/Genshin-Impact/' },

        // --- CARTOONS ---
        {
          label: 'Cartoons: Avatar: The Last Airbender (45K+)',
          value: '/cartoon/Avatar-Last-Airbender/',
        },
        {
          label: 'Cartoons: Miraculous: Ladybug & Cat Noir (36K+)',
          value: '/cartoon/Miraculous-Tales-of-Ladybug-Cat-Noir/',
        },
        {
          label: 'Cartoons: Teen Titans (33K+)',
          value: '/cartoon/Teen-Titans/',
        },
        {
          label: 'Cartoons: Danny Phantom (25K+)',
          value: '/cartoon/Danny-Phantom/',
        },
        {
          label: 'Cartoons: My Little Pony (25K+)',
          value: '/cartoon/My-Little-Pony/',
        },
        {
          label: 'Cartoons: Young Justice (18K+)',
          value: '/cartoon/Young-Justice/',
        },

        // --- COMICS ---
        { label: 'Comics: Batman (18K+)', value: '/comic/Batman/' },
        { label: 'Comics: X-Men (14K+)', value: '/comic/X-Men/' },
        { label: 'Comics: Spider-Man', value: '/comic/Spider-Man/' },
        { label: 'Comics: Justice League', value: '/comic/Justice-League/' },

        // --- TOP CROSSOVERS ---
        {
          label: '⚡ Crossover: Harry Potter & Percy Jackson',
          value:
            '/Harry-Potter-and-Percy-Jackson-and-the-Olympians-Crossovers/224/6447/',
        },
        {
          label: '⚡ Crossover: Bleach & Naruto',
          value: '/Bleach-and-Naruto-Crossovers/1758/1402/',
        },
        {
          label: '⚡ Crossover: Avengers & Harry Potter',
          value: '/Avengers-and-Harry-Potter-Crossovers/7941/224/',
        },
        {
          label: '⚡ Crossover: Harry Potter & Star Wars',
          value: '/Harry-Potter-and-Star-Wars-Crossovers/224/8/',
        },
        {
          label: '⚡ Crossover: Naruto & RWBY',
          value: '/Naruto-and-RWBY-Crossovers/1402/10833/',
        },
        {
          label: '⚡ Crossover: High School DxD & Naruto',
          value:
            '/High-School-DxD-%E3%83%8F%E3%82%A4%E3%82%B9%E3%82%AF%E3%83%BC%E3%83%ABD-D-and-Naruto-Crossovers/7944/1402/',
        },
        {
          label: '⚡ Crossover: Avengers & Percy Jackson',
          value:
            '/Avengers-and-Percy-Jackson-and-the-Olympians-Crossovers/7941/6447/',
        },
        {
          label: '⚡ Crossover: Fairy Tail & Naruto',
          value: '/Fairy-Tail-and-Naruto-Crossovers/5041/1402/',
        },
        {
          label: '⚡ Crossover: Dragon Ball Z & Naruto',
          value: '/Dragon-Ball-Z-and-Naruto-Crossovers/232/1402/',
        },
        {
          label: '⚡ Crossover: Fate/stay night & Naruto',
          value: '/Fate-stay-night-and-Naruto-Crossovers/3103/1402/',
        },
        {
          label: '⚡ Crossover: Twilight & Harry Potter',
          value: '/Harry-Potter-and-Twilight-Crossovers/224/2458/',
        },
        {
          label: '⚡ Crossover: Doctor Who & Sherlock',
          value: '/Doctor-Who-and-Sherlock-Crossovers/21/5774/',
        },
        {
          label: '⚡ Crossover: Supernatural & Harry Potter',
          value: '/Harry-Potter-and-Supernatural-Crossovers/224/2522/',
        },
        ...FANDOM_OPTIONS,
      ]),
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
    let fandomPath =
      filters?.customFandom?.value?.trim() ||
      filters?.fandom?.value ||
      '/book/Harry-Potter/';
    if (!fandomPath.startsWith('/')) {
      fandomPath = `/${fandomPath}`;
    }
    if (!fandomPath.endsWith('/')) {
      fandomPath = `${fandomPath}/`;
    }

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
