import { Filters, FilterTypes } from '@libs/filterInputs';

// Search fields and autocomplete routes follow otwcode/otwarchive's
// WorkSearchForm and AutocompleteController.
export const TAG_FILTERS = {
  fandoms: { field: 'fandom_names', route: 'fandom' },
  characters: { field: 'character_names', route: 'character' },
  relationships: { field: 'relationship_names', route: 'relationship' },
  tags: { field: 'freeform_names', route: 'freeform' },
  excludedTags: { field: 'excluded_tag_names', route: 'tag' },
} as const;

export const filters = {
  fandoms: {
    type: FilterTypes.MultiText,
    label: 'Fandoms (all selected tags must match)',
    value: [] as string[],
    autocomplete: true,
  },
  characters: {
    type: FilterTypes.MultiText,
    label: 'Characters',
    value: [] as string[],
    autocomplete: true,
  },
  relationships: {
    type: FilterTypes.MultiText,
    label: 'Relationships',
    value: [] as string[],
    autocomplete: true,
  },
  tags: {
    type: FilterTypes.MultiText,
    label: 'Additional Tags',
    value: [] as string[],
    autocomplete: true,
  },
  excludedTags: {
    type: FilterTypes.MultiText,
    label: 'Exclude Tags (any tag type)',
    value: [] as string[],
    autocomplete: true,
  },
  sort: {
    type: FilterTypes.Picker,
    label: 'Sort By',
    value: 'kudos_count',
    options: [
      { label: 'Kudos', value: 'kudos_count' },
      { label: 'Date Updated', value: 'revised_at' },
      { label: 'Date Posted', value: 'created_at' },
      { label: 'Hits', value: 'hits' },
      { label: 'Bookmarks', value: 'bookmarks_count' },
      { label: 'Comments', value: 'comments_count' },
      { label: 'Word Count', value: 'word_count' },
      { label: 'Title', value: 'title_to_sort_on' },
      { label: 'Creator', value: 'authors_to_sort_on' },
    ],
  },
  direction: {
    type: FilterTypes.Picker,
    label: 'Sort Direction',
    value: 'desc',
    options: [
      { label: 'Descending', value: 'desc' },
      { label: 'Ascending', value: 'asc' },
    ],
  },
  language: {
    type: FilterTypes.Picker,
    label: 'Language',
    value: '',
    options: [
      { label: 'All Languages', value: '' },
      { label: 'English', value: 'en' },
      { label: 'Tiếng Việt', value: 'vi' },
      { label: '中文-普通话 简体', value: 'zh' },
      { label: '中文-普通話 繁體', value: 'zh-TW' },
      { label: '日本語', value: 'ja' },
      { label: '한국어', value: 'ko' },
      { label: 'Français', value: 'fr' },
      { label: 'Deutsch', value: 'de' },
      { label: 'Español', value: 'es' },
      { label: 'Italiano', value: 'it' },
      { label: 'Português brasileiro', value: 'ptBR' },
      { label: 'Português europeu', value: 'ptPT' },
      { label: 'Русский', value: 'ru' },
      { label: 'Bahasa Indonesia', value: 'id' },
      { label: 'Polski', value: 'pl' },
      { label: 'ไทย', value: 'th' },
      { label: 'Türkçe', value: 'tr' },
      { label: 'Українська', value: 'uk' },
    ],
  },
  status: {
    type: FilterTypes.Picker,
    label: 'Completion Status',
    value: '',
    options: [
      { label: 'All Works', value: '' },
      { label: 'Complete Works Only', value: 'T' },
      { label: 'Works in Progress Only', value: 'F' },
    ],
  },
  rating: {
    type: FilterTypes.Picker,
    label: 'Rating',
    value: '',
    options: [
      { label: 'All Ratings', value: '' },
      { label: 'Not Rated', value: '9' },
      { label: 'General Audiences', value: '10' },
      { label: 'Teen And Up Audiences', value: '11' },
      { label: 'Mature', value: '12' },
      { label: 'Explicit', value: '13' },
    ],
  },
  crossover: {
    type: FilterTypes.Picker,
    label: 'Crossovers',
    value: '',
    options: [
      { label: 'Include Crossovers', value: '' },
      { label: 'Exclude Crossovers', value: 'F' },
      { label: 'Only Crossovers', value: 'T' },
    ],
  },
  singleChapter: {
    type: FilterTypes.Switch,
    label: 'Single Chapter Only',
    value: false,
  },
  wordCount: {
    type: FilterTypes.TextInput,
    label: 'Word Count (e.g. 1000-50000 or >10000)',
    value: '',
  },
  creators: {
    type: FilterTypes.TextInput,
    label: 'Creator',
    value: '',
  },
  query: {
    type: FilterTypes.TextInput,
    label: 'Search Within Results',
    value: '',
  },
} satisfies Filters;
