import type { FilterOption } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';

import { FANDOM_OPTIONS } from './fandom-options';

export const DEFAULT_FANDOM_PATH = '/book/Harry-Potter/';

const SUGGESTION_LIMIT = 10;
const JUST_IN_PATH = '/j/0/0/0/';

const FEATURED_FANDOM_OPTIONS: readonly FilterOption[] = [
  // --- GENERAL ---
  { label: '★ Just In: All Categories', value: JUST_IN_PATH },

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
];

type FandomMeta = {
  id: string;
  slug: string;
  crossoverIndexPath: string;
};

type CrossoverIndexLink = {
  href: string;
  label: string;
  labelNormalized: string;
  hrefNormalized: string;
  id1: string;
  id2: string;
};

type IndexedFandom = {
  option: FilterOption;
  rank: number;
  category: string;
  isCrossover: boolean;
  nameNormalized: string;
  labelNormalized: string;
  valueNormalized: string;
  valueLower: string;
};

type ResolvedSingleFandom = {
  path: string;
  slug: string;
  nameNormalized: string;
  slugNormalized: string;
};

function makePairKey(pathA: string, pathB: string): string {
  const a = pathA.toLowerCase();
  const b = pathB.toLowerCase();
  return a <= b ? `${a}\0${b}` : `${b}\0${a}`;
}

const KNOWN_CROSSOVER_PAIRS = new Map<string, string>([
  [
    makePairKey('/book/Harry-Potter/', '/book/Percy-Jackson-and-the-Olympians/'),
    '/Harry-Potter-and-Percy-Jackson-and-the-Olympians-Crossovers/224/6447/',
  ],
  [
    makePairKey('/anime/Bleach/', '/anime/Naruto/'),
    '/Bleach-and-Naruto-Crossovers/1758/1402/',
  ],
  [
    makePairKey('/movie/Avengers/', '/book/Harry-Potter/'),
    '/Avengers-and-Harry-Potter-Crossovers/7941/224/',
  ],
  [
    makePairKey('/book/Harry-Potter/', '/movie/Star-Wars/'),
    '/Harry-Potter-and-Star-Wars-Crossovers/224/8/',
  ],
  [
    makePairKey('/anime/Naruto/', '/anime/RWBY/'),
    '/Naruto-and-RWBY-Crossovers/1402/10833/',
  ],
  [
    makePairKey('/anime/High-School-DxD/', '/anime/Naruto/'),
    '/High-School-DxD-%E3%83%8F%E3%82%A4%E3%82%B9%E3%82%AF%E3%83%BC%E3%83%ABD-D-and-Naruto-Crossovers/7944/1402/',
  ],
  [
    makePairKey(
      '/anime/High-School-DxD-%E3%83%8F%E3%82%A4%E3%82%B9%E3%82%AF%E3%83%BC%E3%83%ABD-D/',
      '/anime/Naruto/',
    ),
    '/High-School-DxD-%E3%83%8F%E3%82%A4%E3%82%B9%E3%82%AF%E3%83%BC%E3%83%ABD-D-and-Naruto-Crossovers/7944/1402/',
  ],
  [
    makePairKey('/movie/Avengers/', '/book/Percy-Jackson-and-the-Olympians/'),
    '/Avengers-and-Percy-Jackson-and-the-Olympians-Crossovers/7941/6447/',
  ],
  [
    makePairKey('/anime/Fairy-Tail/', '/anime/Naruto/'),
    '/Fairy-Tail-and-Naruto-Crossovers/5041/1402/',
  ],
  [
    makePairKey('/anime/Dragon-Ball-Z/', '/anime/Naruto/'),
    '/Dragon-Ball-Z-and-Naruto-Crossovers/232/1402/',
  ],
  [
    makePairKey('/anime/Fate-stay-night/', '/anime/Naruto/'),
    '/Fate-stay-night-and-Naruto-Crossovers/3103/1402/',
  ],
  [
    makePairKey('/book/Harry-Potter/', '/book/Twilight/'),
    '/Harry-Potter-and-Twilight-Crossovers/224/2458/',
  ],
  [
    makePairKey('/tv/Doctor-Who/', '/tv/Sherlock/'),
    '/Doctor-Who-and-Sherlock-Crossovers/21/5774/',
  ],
  [
    makePairKey('/book/Harry-Potter/', '/tv/Supernatural/'),
    '/Harry-Potter-and-Supernatural-Crossovers/224/2522/',
  ],
]);

const KNOWN_FANDOM_META: readonly [string, FandomMeta][] = [
  [
    '/book/harry-potter/',
    {
      id: '224',
      slug: 'Harry-Potter',
      crossoverIndexPath: '/crossovers/Harry-Potter/224/',
    },
  ],
  [
    '/book/percy-jackson-and-the-olympians/',
    {
      id: '6447',
      slug: 'Percy-Jackson-and-the-Olympians',
      crossoverIndexPath: '/crossovers/Percy-Jackson-and-the-Olympians/6447/',
    },
  ],
  [
    '/anime/bleach/',
    {
      id: '1758',
      slug: 'Bleach',
      crossoverIndexPath: '/crossovers/Bleach/1758/',
    },
  ],
  [
    '/anime/naruto/',
    {
      id: '1402',
      slug: 'Naruto',
      crossoverIndexPath: '/crossovers/Naruto/1402/',
    },
  ],
  [
    '/movie/avengers/',
    {
      id: '7941',
      slug: 'Avengers',
      crossoverIndexPath: '/crossovers/Avengers/7941/',
    },
  ],
  [
    '/movie/star-wars/',
    {
      id: '8',
      slug: 'Star-Wars',
      crossoverIndexPath: '/crossovers/Star-Wars/8/',
    },
  ],
  [
    '/anime/rwby/',
    {
      id: '10833',
      slug: 'RWBY',
      crossoverIndexPath: '/crossovers/RWBY/10833/',
    },
  ],
  [
    '/anime/high-school-dxd/',
    {
      id: '7944',
      slug: 'High-School-DxD-%E3%83%8F%E3%82%A4%E3%82%B9%E3%82%AF%E3%83%BC%E3%83%ABD-D',
      crossoverIndexPath:
        '/crossovers/High-School-DxD-%E3%83%8F%E3%82%A4%E3%82%B9%E3%82%AF%E3%83%BC%E3%83%ABD-D/7944/',
    },
  ],
  [
    '/anime/fairy-tail/',
    {
      id: '5041',
      slug: 'Fairy-Tail',
      crossoverIndexPath: '/crossovers/Fairy-Tail/5041/',
    },
  ],
  [
    '/anime/dragon-ball-z/',
    {
      id: '232',
      slug: 'Dragon-Ball-Z',
      crossoverIndexPath: '/crossovers/Dragon-Ball-Z/232/',
    },
  ],
  [
    '/anime/fate-stay-night/',
    {
      id: '3103',
      slug: 'Fate-stay-night',
      crossoverIndexPath: '/crossovers/Fate-stay-night/3103/',
    },
  ],
  [
    '/book/twilight/',
    {
      id: '2458',
      slug: 'Twilight',
      crossoverIndexPath: '/crossovers/Twilight/2458/',
    },
  ],
  [
    '/tv/doctor-who/',
    {
      id: '21',
      slug: 'Doctor-Who',
      crossoverIndexPath: '/crossovers/Doctor-Who/21/',
    },
  ],
  [
    '/tv/sherlock/',
    {
      id: '5774',
      slug: 'Sherlock',
      crossoverIndexPath: '/crossovers/Sherlock/5774/',
    },
  ],
  [
    '/tv/supernatural/',
    {
      id: '2522',
      slug: 'Supernatural',
      crossoverIndexPath: '/crossovers/Supernatural/2522/',
    },
  ],
];

const fandomMetaCache = new Map<string, FandomMeta>(KNOWN_FANDOM_META);
const crossoverIndexCache = new Map<string, CrossoverIndexLink[]>();
const resolvedCrossoverCache = new Map<string, string>();

let cachedCatalog: IndexedFandom[] | undefined;
let cachedByPath: Map<string, IndexedFandom> | undefined;

// eslint-disable-next-line no-control-regex
const NON_ASCII_REGEX = /[^\x00-\x7f]/;

export function normalizeSearchText(text: string): string {
  let folded = text;
  if (NON_ASCII_REGEX.test(text) && typeof text.normalize === 'function') {
    try {
      folded = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch {
      folded = text;
    }
  }
  return folded
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[\s\-_/:.,!?()[\]{}&+~*|\\★⚡×]+/g, ' ')
    .trim();
}

function extractFandomDisplayName(label: string): string {
  return label
    .replace(/^[★⚡\s]*(?:[^:]+:\s*)/, '')
    .replace(/\s*\([\d.]+K?\+?\)\s*$/i, '')
    .trim();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isCrossoverPath(path: string): boolean {
  return (
    /\/[^/]+-Crossovers\/\d+\/\d+\/?$/i.test(path) ||
    /^\/crossovers\//i.test(path)
  );
}

function extractPathCategory(path: string): string {
  const match = path.match(/^\/([^/]+)\//);
  return match ? match[1].toLowerCase() : '';
}

function extractPathSlug(path: string): string {
  const segments = path.replace(/^\/+|\/+$/g, '').split('/');
  return segments.length >= 2 ? segments[1] : segments[0] || '';
}

export function normalizeInputPath(rawInput: string): string | undefined {
  const trimmed = rawInput.trim();
  if (!trimmed) return undefined;

  const strippedOrigin = trimmed
    .replace(/^https?:\/\/(?:www\.|m\.)?fanfiction\.net/i, '')
    .split(/[?#]/)[0]
    .trim();

  if (!strippedOrigin.includes('/')) return undefined;

  const normalized = `/${strippedOrigin.replace(/^\/+|\/+$/g, '')}/`;
  return normalized !== '//' ? normalized : undefined;
}

function getIndexedFandoms(): IndexedFandom[] {
  if (cachedCatalog) return cachedCatalog;

  const seenPaths = new Set<string>();
  const seenCategoryNames = new Set<string>();
  const catalog: IndexedFandom[] = [];
  const byPath = new Map<string, IndexedFandom>();

  const append = (options: readonly FilterOption[], isFeatured: boolean) => {
    for (const option of options) {
      const valueLower = option.value.toLowerCase();
      if (seenPaths.has(valueLower)) continue;

      const crossover = isCrossoverPath(option.value);
      const category = crossover ? 'crossover' : extractPathCategory(option.value);
      const nameNormalized = normalizeSearchText(
        extractFandomDisplayName(option.label),
      );
      const categoryNameKey = `${category}\0${nameNormalized}`;

      // Avoid duplicating featured items whose canonical FFN path carries a non-ASCII suffix
      // (e.g., My Hero Academia / Attack on Titan) while the generated txt list uses an ASCII slug.
      if (!isFeatured && !crossover && seenCategoryNames.has(categoryNameKey)) {
        continue;
      }

      seenPaths.add(valueLower);
      if (isFeatured && !crossover && nameNormalized) {
        seenCategoryNames.add(categoryNameKey);
      }

      const indexed: IndexedFandom = {
        option,
        rank: catalog.length,
        category,
        isCrossover: crossover,
        nameNormalized,
        labelNormalized: normalizeSearchText(option.label),
        valueNormalized: normalizeSearchText(safeDecode(option.value)),
        valueLower,
      };
      catalog.push(indexed);
      byPath.set(valueLower, indexed);
    }
  };

  append(FEATURED_FANDOM_OPTIONS, true);
  append(FANDOM_OPTIONS, false);

  cachedCatalog = catalog;
  cachedByPath = byPath;
  return catalog;
}

export function searchFandomSuggestions(
  query: string,
  limit = SUGGESTION_LIMIT,
): FilterOption[] {
  const rawLower = query.trim().toLowerCase();
  const normalizedQuery = normalizeSearchText(query);
  if (!rawLower || !normalizedQuery) return [];

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const scored: { option: FilterOption; score: number; rank: number }[] = [];

  for (const item of getIndexedFandoms()) {
    let score = -1;

    if (
      item.nameNormalized === normalizedQuery ||
      item.valueLower === rawLower ||
      item.valueLower === `/${rawLower.replace(/^\/+|\/+$/g, '')}/`
    ) {
      score = 0;
    } else if (item.nameNormalized.startsWith(normalizedQuery)) {
      score = 1;
    } else if (item.nameNormalized.includes(` ${normalizedQuery}`)) {
      score = 2;
    } else if (item.nameNormalized.includes(normalizedQuery)) {
      score = 3;
    } else if (
      item.labelNormalized.includes(normalizedQuery) ||
      item.valueLower.includes(rawLower) ||
      item.valueNormalized.includes(normalizedQuery)
    ) {
      score = 4;
    } else if (
      tokens.length > 1 &&
      tokens.every(
        token =>
          item.labelNormalized.includes(token) ||
          item.valueNormalized.includes(token),
      )
    ) {
      score = 5;
    }

    if (score >= 0) {
      scored.push({ option: item.option, score, rank: item.rank });
    }
  }

  scored.sort((a, b) => a.score - b.score || a.rank - b.rank);
  const results = scored.slice(0, limit).map(entry => entry.option);

  // If user typed or pasted a direct FanFiction.Net path/URL not already in the top results,
  // offer it as a selectable suggestion as well.
  const directPath = normalizeInputPath(query);
  if (
    directPath &&
    directPath.split('/').filter(Boolean).length >= 2 &&
    !results.some(item => item.value.toLowerCase() === directPath.toLowerCase())
  ) {
    return [
      { label: `Path: ${directPath}`, value: directPath },
      ...results.slice(0, Math.max(0, limit - 1)),
    ];
  }

  return results;
}

function resolveSingleFandom(rawEntry: string): ResolvedSingleFandom {
  const trimmed = rawEntry.trim();
  const directPath = normalizeInputPath(trimmed);

  if (directPath) {
    getIndexedFandoms();
    const known = cachedByPath?.get(directPath.toLowerCase());
    const slug = extractPathSlug(directPath);
    const slugNormalized = normalizeSearchText(safeDecode(slug));
    return {
      path: known ? known.option.value : directPath,
      slug,
      nameNormalized: known ? known.nameNormalized : slugNormalized,
      slugNormalized,
    };
  }

  const bestMatch = searchFandomSuggestions(trimmed, 1)[0];
  if (!bestMatch) {
    throw new Error(
      `Fandom "${trimmed}" was not found. Pick a suggestion or enter its FanFiction.Net path directly (e.g. /anime/Naruto/).`,
    );
  }

  getIndexedFandoms();
  const known = cachedByPath?.get(bestMatch.value.toLowerCase());
  const slug = extractPathSlug(bestMatch.value);
  const slugNormalized = normalizeSearchText(safeDecode(slug));
  return {
    path: bestMatch.value,
    slug,
    nameNormalized: known ? known.nameNormalized : slugNormalized,
    slugNormalized,
  };
}

function parseFandomMetaFromHtml(html: string): FandomMeta | undefined {
  const $ = loadCheerio(html);
  let matchedHref: string | undefined;

  $('a[href*="/crossovers/"]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (href && /^\/crossovers\/[^/]+\/\d+\/?$/i.test(href)) {
      matchedHref = href;
      return false;
    }
    return undefined;
  });

  if (!matchedHref) {
    const regexMatch = html.match(/\/crossovers\/([^/"'\s]+)\/(\d+)\/?/i);
    if (regexMatch) {
      matchedHref = `/crossovers/${regexMatch[1]}/${regexMatch[2]}/`;
    }
  }

  if (!matchedHref) return undefined;

  const parts = matchedHref.match(/^\/crossovers\/([^/]+)\/(\d+)\/?$/i);
  if (!parts) return undefined;

  const slug = parts[1];
  const id = parts[2];
  return {
    id,
    slug,
    crossoverIndexPath: `/crossovers/${slug}/${id}/`,
  };
}

function parseCrossoverIndexLinks(html: string): CrossoverIndexLink[] {
  const $ = loadCheerio(html);
  const links: CrossoverIndexLink[] = [];
  const seen = new Set<string>();

  $('a[href*="-Crossovers/"]').each((_, el) => {
    const $el = $(el);
    const rawHref = $el.attr('href')?.trim();
    if (!rawHref) return;

    const match = rawHref.match(/^(\/[^/]+-Crossovers\/(\d+)\/(\d+)\/?)$/i);
    if (!match) return;

    const href = match[1].endsWith('/') ? match[1] : `${match[1]}/`;
    const hrefLower = href.toLowerCase();
    if (seen.has(hrefLower)) return;
    seen.add(hrefLower);

    const label = $el.text().trim();
    links.push({
      href,
      label,
      labelNormalized: normalizeSearchText(label),
      hrefNormalized: normalizeSearchText(safeDecode(href)),
      id1: match[2],
      id2: match[3],
    });
  });

  return links;
}

function matchCrossoverLink(
  links: readonly CrossoverIndexLink[],
  target: ResolvedSingleFandom,
  targetId?: string,
  allowFuzzy = false,
): string | undefined {
  if (targetId) {
    const byId = links.find(
      link => link.id1 === targetId || link.id2 === targetId,
    );
    if (byId) return byId.href;
  }

  const exactLabel = links.find(
    link =>
      link.labelNormalized === target.nameNormalized ||
      link.labelNormalized === target.slugNormalized,
  );
  if (exactLabel) return exactLabel.href;

  if (!allowFuzzy) return undefined;

  const prefixLabel = links.find(
    link =>
      target.nameNormalized.length > 0 &&
      (link.labelNormalized.startsWith(`${target.nameNormalized} `) ||
        target.nameNormalized.startsWith(`${link.labelNormalized} `)),
  );
  if (prefixLabel) return prefixLabel.href;

  const bySlug = links.find(
    link =>
      target.slugNormalized.length > 0 &&
      link.hrefNormalized.includes(target.slugNormalized),
  );
  if (bySlug) return bySlug.href;

  return undefined;
}

async function getFandomMeta(
  fandom: ResolvedSingleFandom,
  fetchHtml: (path: string) => Promise<string>,
): Promise<FandomMeta | undefined> {
  const key = fandom.path.toLowerCase();
  const cached = fandomMetaCache.get(key);
  if (cached) return cached;

  const html = await fetchHtml(fandom.path);
  const meta = parseFandomMetaFromHtml(html);
  if (meta) {
    fandomMetaCache.set(key, meta);
  }
  return meta;
}

async function getCrossoverIndexLinks(
  meta: FandomMeta,
  fetchHtml: (path: string) => Promise<string>,
): Promise<CrossoverIndexLink[]> {
  const cached = crossoverIndexCache.get(meta.id);
  if (cached) return cached;

  const html = await fetchHtml(meta.crossoverIndexPath);
  const links = parseCrossoverIndexLinks(html);
  if (links.length > 0) {
    crossoverIndexCache.set(meta.id, links);
  }
  return links;
}

async function resolveCrossoverPath(
  fandomA: ResolvedSingleFandom,
  fandomB: ResolvedSingleFandom,
  fetchHtml: (path: string) => Promise<string>,
): Promise<string> {
  const pairKey = makePairKey(fandomA.path, fandomB.path);
  const knownPreset = KNOWN_CROSSOVER_PAIRS.get(pairKey);
  if (knownPreset) return knownPreset;

  const cachedResolved = resolvedCrossoverCache.get(pairKey);
  if (cachedResolved) return cachedResolved;

  const metaA = await getFandomMeta(fandomA, fetchHtml);
  const cachedMetaB = fandomMetaCache.get(fandomB.path.toLowerCase());

  let linksA: CrossoverIndexLink[] = [];
  if (metaA) {
    linksA = await getCrossoverIndexLinks(metaA, fetchHtml);
    const matched = matchCrossoverLink(linksA, fandomB, cachedMetaB?.id);
    if (matched) {
      resolvedCrossoverCache.set(pairKey, matched);
      return matched;
    }
  }

  const metaB = cachedMetaB || (await getFandomMeta(fandomB, fetchHtml));
  if (linksA.length > 0) {
    const matched = matchCrossoverLink(linksA, fandomB, metaB?.id, !metaB);
    if (matched) {
      resolvedCrossoverCache.set(pairKey, matched);
      return matched;
    }
  }

  if (metaA && metaB) {
    const [first, second] =
      metaA.slug.toLowerCase().localeCompare(metaB.slug.toLowerCase()) <= 0
        ? [metaA, metaB]
        : [metaB, metaA];
    const constructed = `/${first.slug}-and-${second.slug}-Crossovers/${first.id}/${second.id}/`;
    resolvedCrossoverCache.set(pairKey, constructed);
    return constructed;
  }

  throw new Error(
    `Unable to resolve crossover between "${fandomA.path}" and "${fandomB.path}". Enter the FanFiction.Net crossover path directly.`,
  );
}

export async function resolveFandomEntries(
  rawValues: readonly string[] | string | undefined,
  fetchHtml: (path: string) => Promise<string>,
): Promise<string> {
  const list = Array.isArray(rawValues)
    ? rawValues
    : typeof rawValues === 'string' && rawValues.trim()
      ? [rawValues]
      : [];

  const entries = list.map(item => item.trim()).filter(Boolean);
  if (entries.length === 0) {
    return DEFAULT_FANDOM_PATH;
  }

  // If any entry is already an explicit crossover path (or preset crossover), use it directly.
  for (const entry of entries) {
    const directPath = normalizeInputPath(entry);
    if (directPath && isCrossoverPath(directPath)) {
      return directPath;
    }
  }

  if (entries.length === 1) {
    return resolveSingleFandom(entries[0]).path;
  }

  const distinctFandoms: ResolvedSingleFandom[] = [];
  const seenPaths = new Set<string>();

  for (const entry of entries) {
    const resolved = resolveSingleFandom(entry);
    if (isCrossoverPath(resolved.path)) {
      return resolved.path;
    }
    const key = resolved.path.toLowerCase();
    if (key === JUST_IN_PATH || seenPaths.has(key)) continue;
    seenPaths.add(key);
    distinctFandoms.push(resolved);
    if (distinctFandoms.length === 2) break;
  }

  if (distinctFandoms.length === 0) {
    return JUST_IN_PATH;
  }
  if (distinctFandoms.length === 1) {
    return distinctFandoms[0].path;
  }

  return resolveCrossoverPath(distinctFandoms[0], distinctFandoms[1], fetchHtml);
}
