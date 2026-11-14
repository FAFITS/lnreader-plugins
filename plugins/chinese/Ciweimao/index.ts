import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { type Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

const CATEGORIES = [
  {
    label: '全部分类（最新更新） (All Categories - Latest Updates)',
    value: '0',
  },
  { label: '玄幻奇幻 (Fantasy)', value: 'yijiehuanxiang' },
  { label: '都市青春 (Urban & Youth)', value: 'qingchunrichang' },
  { label: '灵异未知 (Supernatural & Mystery)', value: 'shenmiweizhi' },
  { label: '历史军事 (History & Military)', value: 'zhanzhenglishi' },
  { label: '科幻无限 (Science Fiction)', value: 'weilaihuanxiang' },
  { label: '游戏竞技 (Games & Esports)', value: 'youxishijie' },
  { label: '仙侠武侠 (Xianxia & Wuxia)', value: 'rexuejingji' },
  { label: '免费同人 (Free Fan Fiction)', value: 'tongrenfenlei' },
  { label: '女频 (Female-Oriented)', value: 'nvpinfenlei' },
];

const IP_TAGS = [
  { label: 'fate (Fate)', value: '81' },
  { label: '型月 (Type-Moon)', value: '37' },
  { label: '明日方舟 (Arknights)', value: '157' },
  { label: '星穹铁道 (Honkai: Star Rail)', value: '169' },
  { label: '奥特曼 (Ultraman)', value: '85' },
  { label: '崩坏 (Honkai)', value: '156' },
  { label: '舰娘 (Kantai Collection)', value: '79' },
  { label: '俺春物 (My Teen Romantic Comedy SNAFU)', value: '76' },
  { label: '赛马娘 (Uma Musume)', value: '158' },
  { label: '路人女主 (Saekano)', value: '82' },
  { label: '幻想乡 (Gensokyo)', value: '10' },
  { label: '火影 (Naruto)', value: '53' },
  { label: '约会大作战 (Date A Live)', value: '74' },
  { label: '原神 (Genshin Impact)', value: '155' },
  { label: '游戏王 (Yu-Gi-Oh!)', value: '165' },
  { label: '假面骑士 (Kamen Rider)', value: '163' },
  { label: '魔禁 (A Certain Magical Index)', value: '75' },
  { label: '龙族 (Dragon Raja)', value: '52' },
  { label: '宝可梦 (Pokémon)', value: '166' },
  { label: 'RE0 (Re:Zero)', value: '78' },
  { label: '海贼王 (One Piece)', value: '83' },
  { label: '孤独摇滚 (Bocchi the Rock!)', value: '164' },
  { label: '战锤 (Warhammer)', value: '192' },
  { label: '绝区零 (Zenless Zone Zero)', value: '177' },
  { label: '特摄 (Tokusatsu)', value: '162' },
  { label: '一拳超人 (One-Punch Man)', value: '77' },
  { label: 'EVA (Evangelion)', value: '80' },
  { label: '樱花庄 (The Pet Girl of Sakurasou)', value: '84' },
  { label: '艾尔登法环 (Elden Ring)', value: '159' },
  { label: '死神 (Bleach)', value: '167' },
  { label: '龙女仆 (Miss Kobayashi’s Dragon Maid)', value: '87' },
  { label: '哈利波特 (Harry Potter)', value: '161' },
  { label: '白色相簿 (White Album)', value: '73' },
  { label: '咒术回战 (Jujutsu Kaisen)', value: '208' },
  { label: '魔兽 (Warcraft)', value: '28' },
  { label: 'mygo (MyGO!!!!!)', value: '204' },
  { label: '怪物猎人 (Monster Hunter)', value: '193' },
  {
    label: '地错 (Is It Wrong to Try to Pick Up Girls in a Dungeon?)',
    value: '207',
  },
  { label: '英雄无敌 (Heroes of Might and Magic)', value: '24' },
  { label: '鸣潮 (Wuthering Waves)', value: '197' },
  { label: '终末地 (Arknights: Endfield)', value: '200' },
  { label: '铠甲勇士 (Armor Hero)', value: '179' },
  { label: '一人之下 (The Outcast)', value: '183' },
  { label: '碧蓝航线 (Azur Lane)', value: '222' },
  { label: '狐妖小红娘 (Fox Spirit Matchmaker)', value: '180' },
  { label: '无敌少侠 (Invincible)', value: '202' },
  { label: 'JOJO (JoJo’s Bizarre Adventure)', value: '206' },
  { label: '秦时明月 (The Legend of Qin)', value: '178' },
  { label: '电锯人 (Chainsaw Man)', value: '205' },
  { label: 'Ben10 (Ben 10)', value: '201' },
];

const ATTRIBUTE_TAGS = [
  { label: '综漫 (Anime Crossover)', value: '54' },
  { label: '多女主 (Multiple Heroines)', value: '7' },
  { label: '无敌 (Overpowered Protagonist)', value: '41' },
  { label: '无限流 (Infinite Flow)', value: '16' },
  { label: '修罗场 (Love Rivalry)', value: '65' },
  { label: '同人 (Fan Fiction)', value: '23' },
  { label: '爽文 (Power Fantasy)', value: '2' },
  { label: '非人 (Non-Human Protagonist)', value: '72' },
  { label: '穿越 (Transmigration)', value: '4' },
  { label: '战斗 (Action)', value: '67' },
  { label: '种田 (Farming)', value: '3' },
  { label: '恋爱 (Romance)', value: '44' },
  { label: '克苏鲁 (Cthulhu Mythos)', value: '71' },
  { label: '轻小说 (Light Novel)', value: '6' },
  { label: '脑洞大开 (Wild Imagination)', value: '47' },
  { label: 'ACG (Anime, Comics & Games)', value: '15' },
  { label: '校园 (School Life)', value: '51' },
  { label: '爆笑 (Comedy)', value: '18' },
  { label: '魔法 (Magic)', value: '66' },
  { label: '科幻 (Science Fiction)', value: '56' },
  { label: '异世 (Another World)', value: '29' },
  { label: '机甲 (Mecha)', value: '21' },
  { label: '纯爱 (Pure Romance)', value: '60' },
  { label: '升级 (Leveling)', value: '14' },
  { label: '青春 (Youth)', value: '42' },
  { label: '重生 (Rebirth)', value: '5' },
  { label: '白学 (White Album Drama)', value: '38' },
  { label: '技术流 (Technical Protagonist)', value: '32' },
  { label: '治愈 (Healing)', value: '55' },
  { label: '卡牌 (Cards)', value: '45' },
  { label: '网游 (Online Game)', value: '22' },
  { label: '少女乐队 (Girls’ Band)', value: '190' },
  { label: '热血 (Hot-Blooded)', value: '1' },
  { label: '末世 (Post-Apocalyptic)', value: '19' },
  { label: '冒险 (Adventure)', value: '50' },
  { label: '慢热 (Slow Burn)', value: '46' },
  { label: '妖怪 (Yokai)', value: '68' },
  { label: '都市 (Urban)', value: '88' },
  { label: '生活 (Daily Life)', value: '12' },
  { label: '救亡 (Salvation)', value: '11' },
  { label: '废萌 (Cute and Clueless)', value: '8' },
  { label: '扮猪吃虎 (Hidden Strength)', value: '17' },
  { label: '玄幻 (Fantasy)', value: '89' },
  { label: '吸血鬼 (Vampires)', value: '70' },
  { label: '腹黑 (Scheming)', value: '39' },
  { label: '丧尸 (Zombies)', value: '26' },
  { label: '原创 (Original)', value: '175' },
  { label: '赛博朋克 (Cyberpunk)', value: '160' },
  { label: '推理 (Mystery)', value: '31' },
  { label: '魔性 (Uncanny)', value: '57' },
  { label: '幽灵 (Ghosts)', value: '69' },
  { label: '神话 (Mythology)', value: '153' },
  { label: '生化 (Biopunk)', value: '36' },
  { label: '奇幻 (Fantasy)', value: '173' },
  { label: '聊天群 (Group Chat)', value: '203' },
  { label: '东京 (Tokyo)', value: '171' },
  { label: '星际高达 (Gundam in Space)', value: '152' },
  { label: '中式克苏鲁 (Chinese Cthulhu)', value: '151' },
  { label: '社团 (Clubs)', value: '63' },
  { label: '国风 (Chinese Style)', value: '172' },
  { label: '废柴流 (Loser Protagonist)', value: '20' },
  { label: '宅斗 (Domestic Power Struggle)', value: '13' },
  { label: '国漫 (Chinese Animation)', value: '182' },
  { label: '美漫 (American Comics)', value: '223' },
];

const SORT_OPTIONS = [
  { label: '默认排序 (Default)', value: '' },
  { label: '人气排序 (Popularity)', value: 'week_click' },
  { label: '更新时间排序 (Recently Updated)', value: 'uptime' },
  { label: '总推荐排序 (Recommendations)', value: 'total_recommend' },
  { label: '总收藏排序 (Favorites)', value: 'total_favor' },
  { label: '总月票排序 (Monthly Votes)', value: 'total_yp' },
  { label: '周点击排序 (Weekly Views)', value: 'week_no_vip_click' },
  { label: '月点击排序 (Monthly Views)', value: 'month_no_vip_click' },
  { label: '总点击排序 (Total Views)', value: 'total_click' },
  { label: '总吐槽排序 (Comments)', value: 'total_tsukkomi' },
  { label: '均订排序 (Average Subscriptions)', value: 'average_buy' },
  { label: '字数排序 (Word Count)', value: 'total_word_count' },
];

class Ciweimao extends NekoriBasePlugin {
  id = 'ciweimao.com';
  name = 'Ciweimao';
  icon = 'icon.svg';
  site = 'https://wap.ciweimao.com';
  version = '1.0.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  filters = {
    category: {
      type: FilterTypes.Picker,
      label: 'Category',
      value: '0',
      options: CATEGORIES,
    },
    ipTags: {
      type: FilterTypes.CheckboxGroup,
      label: 'IP Tags',
      value: [],
      options: IP_TAGS,
    },
    attributeTags: {
      type: FilterTypes.CheckboxGroup,
      label: 'Attributes',
      value: [],
      options: ATTRIBUTE_TAGS,
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort By',
      value: '',
      options: SORT_OPTIONS,
    },
    wordCount: {
      type: FilterTypes.Picker,
      label: 'Word Count',
      value: '0',
      options: [
        { label: '不限 (Any)', value: '0' },
        { label: '30万以下 (Under 300K)', value: '1' },
        { label: '30万-50万 (300K-500K)', value: '2' },
        { label: '50万-100万 (500K-1M)', value: '3' },
        { label: '100万-200万 (1M-2M)', value: '4' },
        { label: '200万以上 (Over 2M)', value: '5' },
      ],
    },
    progress: {
      type: FilterTypes.Picker,
      label: 'Progress',
      value: '0',
      options: [
        { label: '全部 (All)', value: '0' },
        { label: '完本 (Completed)', value: '1' },
        { label: '连载 (Ongoing)', value: '2' },
      ],
    },
    access: {
      type: FilterTypes.Picker,
      label: 'Access',
      value: '0',
      options: [
        { label: '不限 (Any)', value: '0' },
        { label: '只看免费 (Free Only)', value: '1' },
        { label: '只看VIP (VIP Only)', value: '2' },
      ],
    },
    updateTime: {
      type: FilterTypes.Picker,
      label: 'Updated',
      value: '0',
      options: [
        { label: '不限 (Any)', value: '0' },
        { label: '三日内 (Within 3 Days)', value: '1' },
        { label: '七日内 (Within 7 Days)', value: '2' },
        { label: '半月内 (Within 15 Days)', value: '3' },
        { label: '一月内 (Within 1 Month)', value: '4' },
      ],
    },
    novelId: {
      type: FilterTypes.TextInput,
      label: 'Novel ID (enter an ID to open that novel)',
      value: '',
    },
  } satisfies Filters;

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  };

  private readonly categoryTypeCache = new Map<string, string>();

  private async fetchDocument(url: string) {
    const response = await fetchApi(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Ciweimao request failed: HTTP ${response.status}`);
    }

    const html = await response.text();
    if (
      html.includes('J_ManMachineVerify') ||
      html.includes('man_machine_verify')
    ) {
      throw new Error(
        'Ciweimao requires a CAPTCHA for this page. Complete the verification in a browser and try again.',
      );
    }

    return loadCheerio(html);
  }

  private parseNovels($: ReturnType<typeof loadCheerio>): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('.book-item, .booklist > li, .recommend-list > li, .book-list > li').each(
      (_, element) => {
        const $item = $(element);
        const $link = $item.find('a[href*="/book/"]').first();
        const href = $link.attr('href');
        if (!href) return;

        const path = new URL(href, this.site).pathname;
        if (!/^\/book\/\d+\/?$/.test(path) || seen.has(path)) return;

        const $image = $item.find('img').first();
        const name =
          $item.find('.info h3').contents().first().text().trim() ||
          $item.find('h3').first().text().trim() ||
          $image.attr('alt')?.trim() ||
          $link.attr('title')?.trim();
        if (!name) return;

        const rawCover =
          $image.attr('data-original') ||
          $image.attr('data-src') ||
          $image.attr('src');
        const cover =
          rawCover && !rawCover.includes('/resources/images/cover.jpg')
            ? new URL(rawCover, this.site).href
            : defaultCover;

        seen.add(path);
        novels.push({ name, path, cover });
      },
    );

    return novels;
  }

  private async getCategoryType(category: string): Promise<string> {
    if (/^\d+$/.test(category)) return category;

    const cached = this.categoryTypeCache.get(category);
    if (cached) return cached;

    const $ = await this.fetchDocument(
      `https://mip.ciweimao.com/book_list/${encodeURIComponent(category)}/`,
    );
    const categoryType = $('#category_type').text().trim();
    if (!/^\d+$/.test(categoryType)) {
      throw new Error(
        `Ciweimao category type was not found for category "${category}".`,
      );
    }

    this.categoryTypeCache.set(category, categoryType);
    return categoryType;
  }

  private async fetchListingPage(
    categoryType: string,
    pageNo: number,
    filters?: Plugin.PopularNovelsOptions<typeof this.filters>['filters'],
  ): Promise<Plugin.NovelItem[]> {
    const url = new URL('/index/book_list_data', this.site);
    url.searchParams.set('category_type', categoryType);
    url.searchParams.set('page', String(pageNo));
    if (filters?.sort?.value) {
      url.searchParams.set('order', filters.sort.value);
    }
    if (filters?.wordCount?.value && filters.wordCount.value !== '0') {
      url.searchParams.set('filter_word', filters.wordCount.value);
    }
    if (filters?.progress?.value && filters.progress.value !== '0') {
      url.searchParams.set('filter_up_status', filters.progress.value);
    }
    if (filters?.access?.value && filters.access.value !== '0') {
      url.searchParams.set('filter_is_paid', filters.access.value);
    }
    if (filters?.updateTime?.value && filters.updateTime.value !== '0') {
      url.searchParams.set('filter_uptime', filters.updateTime.value);
    }
    const tagIds = [
      ...(filters?.ipTags?.value || []),
      ...(filters?.attributeTags?.value || []),
    ];
    if (tagIds.length > 0) {
      const availableTags = [...IP_TAGS, ...ATTRIBUTE_TAGS];
      const tagNames: Record<string, string> = {};
      for (const tagId of tagIds) {
        const tag = availableTags.find(option => option.value === tagId);
        if (!tag) {
          throw new Error(`Unknown Ciweimao tag ID: ${tagId}`);
        }

        const englishLabelStart = tag.label.indexOf(' (');
        tagNames[tagId] =
          englishLabelStart >= 0
            ? tag.label.slice(0, englishLabelStart)
            : tag.label;
      }
      url.searchParams.set('tag_jason', JSON.stringify(tagNames));
    }

    const response = await fetchApi(url.href, { headers: this.headers });
    if (!response.ok) {
      throw new Error(
        `Ciweimao listing request failed: HTTP ${response.status}`,
      );
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') {
      throw new Error('Ciweimao returned an invalid listing response.');
    }

    const result = payload as { code?: unknown; html?: unknown };
    if (result.code === 360001) return [];
    if (typeof result.html !== 'string') {
      throw new Error('Ciweimao listing response did not contain HTML.');
    }

    return this.parseNovels(loadCheerio(result.html));
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (!Number.isInteger(pageNo) || pageNo < 1) {
      throw new Error('Page number must be a positive integer.');
    }

    const category = options?.filters?.category?.value || '0';
    const novelIdInput = options?.filters?.novelId?.value.trim();
    if (novelIdInput) {
      const idMatch = novelIdInput.match(
        /^(?:https?:\/\/(?:wap|www)\.ciweimao\.com)?\/?(?:book\/)?(\d+)\/?$/i,
      );
      if (!idMatch) {
        throw new Error('Enter a Ciweimao novel ID or a Ciweimao book URL.');
      }

      const novel = await this.parseNovel(`/book/${idMatch[1]}`);
      return [{ name: novel.name, path: novel.path, cover: novel.cover }];
    }

    const categoryType = await this.getCategoryType(category);
    return this.fetchListingPage(categoryType, pageNo, options?.filters);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term) return [];
    if (!Number.isInteger(pageNo) || pageNo < 1) {
      throw new Error('Page number must be a positive integer.');
    }

    // The WAP search endpoint redirects to a CAPTCHA; only search public homepage entries.
    const $ = await this.fetchDocument(this.site);
    const matches = this.parseNovels($).filter(novel =>
      novel.name.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    );
    const pageSize = 20;
    return matches.slice((pageNo - 1) * pageSize, pageNo * pageSize);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = new URL(novelPath, this.site).pathname;
    const bookId = path.match(/^\/book\/(\d+)\/?$/)?.[1];
    if (!bookId) {
      throw new Error(`Invalid Ciweimao book path: ${novelPath}`);
    }

    const $ = await this.fetchDocument(`${this.site}/book/${bookId}`);
    const name =
      $('.book-info h1.book').text().trim() ||
      $('meta[name="name"]').attr('content')?.trim() ||
      $('title').text().split('最新章节')[0].trim();
    if (!name) {
      throw new Error('Ciweimao book title was not found.');
    }

    const info = $('.book-info .info');
    const authorLine = info.find('.author').text().trim();
    const author = authorLine.split(/\s+著/)[0]?.trim() || undefined;
    const summary = $('.book-desc .desc-cnt').text().trim() || undefined;
    const coverUrl =
      $('.book-info .cover img').attr('data-original') ||
      $('.book-info .cover img').attr('data-src') ||
      $('meta[property="og:image"]').attr('content');
    const cover =
      coverUrl && !coverUrl.includes('/resources/images/cover.jpg')
        ? new URL(coverUrl, this.site).href
        : defaultCover;
    const intro = info.find('.intro').text();
    const status = intro.includes('已完结')
      ? NovelStatus.Completed
      : NovelStatus.Ongoing;

    const chapters: Plugin.ChapterItem[] = [];
    const chapterPaths = new Set<string>();
    $('.catalogue-list a[href*="/chapter/"]').each((index, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      const chapterId = href?.match(/\/chapter\/(\d+)/)?.[1];
      const chapterName = $link.text().trim();
      if (!chapterId || !chapterName) return;

      const chapterPath = `/chapter/${chapterId}`;
      if (chapterPaths.has(chapterPath)) return;
      chapterPaths.add(chapterPath);

      const number = chapterName.match(/第\s*(\d+)\s*章/);
      chapters.push({
        name: chapterName,
        path: chapterPath,
        chapterNumber: number ? Number(number[1]) : index + 1,
      });
    });

    return {
      name,
      path: `/book/${bookId}`,
      cover,
      author,
      summary,
      status,
      genres: authorLine.split('/')[1]?.trim(),
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const chapterId = chapterPath.match(/\/chapter\/(\d+)/)?.[1];
    if (!chapterId) {
      throw new Error(`Invalid Ciweimao chapter path: ${chapterPath}`);
    }

    const $ = await this.fetchDocument(
      `https://mip.ciweimao.com/chapter/${chapterId}`,
    );
    const $content = $('#J_BookRead');
    if ($content.length === 0 || !$content.text().trim()) {
      throw new Error(
        'Ciweimao chapter content was not found. It may be unavailable or require access on the site.',
      );
    }

    $content.find('script, style, .num-link, span').remove();
    $content.find('p.chapter').each((_, element) => {
      const $paragraph = $(element);
      const html = $paragraph.html();
      if (html) {
        $paragraph.html(html.replace(/^[\s\u3000]+/, ''));
      }
    });

    return {
      state: 'ready',
      type: 'novel',
      html: $content.html() || '',
    };
  }

  override resolveUrl(path: string): string {
    return new URL(path, this.site).href;
  }
}

export default new Ciweimao();
