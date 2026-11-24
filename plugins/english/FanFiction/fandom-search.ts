import type { FilterOption } from '@libs/filterInputs';

import { FANDOM_OPTIONS } from './fandom-options';

export const DEFAULT_FANDOM_PATH = '/book/Harry-Potter/';

const SUGGESTION_LIMIT = 6;

const FEATURED_FANDOM_OPTIONS: readonly FilterOption[] = [
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
];

type IndexedFandom = {
  option: FilterOption;
  rank: number;
  nameNormalized: string;
  labelNormalized: string;
  valueNormalized: string;
  valueLower: string;
};

let cachedCatalog: IndexedFandom[] | undefined;

export function normalizeSearchText(text: string): string {
  const folded =
    typeof text.normalize === 'function'
      ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      : text;
  return folded
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\p{L}\p{N}]+/gu, ' ')
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

function getIndexedFandoms(): IndexedFandom[] {
  if (cachedCatalog) return cachedCatalog;

  const seenPaths = new Set<string>();
  const catalog: IndexedFandom[] = [];

  const append = (options: readonly FilterOption[]) => {
    for (const option of options) {
      const key = option.value.toLowerCase();
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);

      catalog.push({
        option,
        rank: catalog.length,
        nameNormalized: normalizeSearchText(
          extractFandomDisplayName(option.label),
        ),
        labelNormalized: normalizeSearchText(option.label),
        valueNormalized: normalizeSearchText(safeDecode(option.value)),
        valueLower: key,
      });
    }
  };

  append(FEATURED_FANDOM_OPTIONS);
  append(FANDOM_OPTIONS);

  cachedCatalog = catalog;
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
  return scored.slice(0, limit).map(entry => entry.option);
}

export function resolveFandomPath(rawInput?: string): string {
  const trimmed = rawInput?.trim();
  if (!trimmed) return DEFAULT_FANDOM_PATH;

  const strippedOrigin = trimmed
    .replace(/^https?:\/\/(?:www\.|m\.)?fanfiction\.net/i, '')
    .split(/[?#]/)[0]
    .trim();

  if (strippedOrigin.includes('/')) {
    const normalized = `/${strippedOrigin.replace(/^\/+|\/+$/g, '')}/`;
    if (normalized !== '//') {
      return normalized;
    }
  }

  const bestMatch = searchFandomSuggestions(trimmed, 1)[0];
  return bestMatch ? bestMatch.value : DEFAULT_FANDOM_PATH;
}
