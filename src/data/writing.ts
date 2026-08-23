import type {
  Novel,
  NovelChapter,
  WritingArticle,
  WritingContentType,
} from '../types/writing';

const EDEN_CHAPTERS = Object.freeze([
  {
    id: 'eden-chapter-01',
    slug: 'chapter-01',
    number: 1,
    label: 'CHAPTER 01',
    title: '边界以外',
    titleEn: 'BEYOND THE BOUNDARY',
    summary: '列车驶入没有被地图记录的白色地带。',
    markdown: `## I — 进入白域

列车离开最后一座城市时，没有人宣布旅程已经开始。窗外的建筑只是逐渐变矮，随后被一片没有名字的白取代。

黎安把手放在冰冷的玻璃上。远处有一道几乎与地平线重合的银线，它始终靠近，却从未抵达列车。

> [!FEATURED]
> 世界并不是在尽头结束。它只是在那里，变得越来越难以命名。

## II — 未完成的站台

午夜之后，列车在一座没有时刻表的站台停下。广播里只有一阵很轻的电流声，像某个人在另一个时代呼吸。[^signal]

黎安带走了一枚写着 **EDEN** 的旧票根。纸张背面只有一句话：[[Eden]] 并非目的地。

[^signal]: 后来的档案把这段声音称为“第一信号”。`,
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    createdAt: '2026-01-08T10:00:00+08:00',
    updatedAt: '2026-08-18T21:30:00+08:00',
    publishedAt: '2026-08-18T21:30:00+08:00',
    wordCount: 2480,
    readingTime: 8,
  },
  {
    id: 'eden-chapter-02',
    slug: 'chapter-02',
    number: 2,
    label: 'CHAPTER 02',
    title: '静默地图',
    titleEn: 'THE SILENT MAP',
    summary: '一张不会显示当前位置的地图，开始记录他们尚未走过的路。',
    markdown: `## I — 地图室

地图室位于旧站台的地下。所有抽屉都空着，只有中央桌面铺着一张缓慢变化的纸。

纸上没有城市，也没有海岸。每当黎安靠近，一条极细的线便向他的方向延伸，却总在指尖前停下。

## II — 两种距离

“距离不是用来抵达的。”守图人说，“有些距离只负责证明，你仍在移动。”

黎安没有回答。他第一次意识到，地图记录的或许不是世界，而是观察者与世界之间尚未消失的间隔。`,
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    createdAt: '2026-02-12T10:00:00+08:00',
    updatedAt: '2026-08-20T19:10:00+08:00',
    publishedAt: '2026-08-20T19:10:00+08:00',
    wordCount: 2710,
    readingTime: 9,
  },
  {
    id: 'eden-chapter-03',
    slug: 'chapter-03',
    number: 3,
    label: 'CHAPTER 03',
    title: '趋近之海',
    titleEn: 'THE APPROACHING SEA',
    summary: '尚未公开的第三章。',
    markdown: '海面在黎明前显现。',
    status: 'DRAFT',
    visibility: 'PRIVATE',
    createdAt: '2026-08-21T09:00:00+08:00',
    updatedAt: '2026-08-21T23:40:00+08:00',
    publishedAt: null,
    wordCount: 1960,
    readingTime: 6,
  },
] satisfies readonly NovelChapter[]);

export const NOVELS = Object.freeze([
  {
    id: 'novel-eden',
    slug: 'eden',
    type: 'FICTION',
    title: '伊甸',
    titleEn: 'EDEN',
    subtitle: '一部关于边界、记忆与未抵达之地的小说',
    summary: '一列离开既有地图的夜行列车，将三名旅人带向一座只存在于趋近过程中的城市。',
    cover: null,
    heroImage: null,
    shareImage: null,
    status: 'ONGOING',
    visibility: 'PUBLIC',
    author: 'V. NAGIA',
    createdAt: '2026-01-08T10:00:00+08:00',
    updatedAt: '2026-08-20T19:10:00+08:00',
    tags: ['奇幻', '记忆', '旅程'],
    series: null,
    copyright: '© 2026 V. NAGIA. All rights reserved.',
    volumes: [
      {
        id: 'eden-volume-01',
        title: '卷一：白色边境',
        titleEn: 'VOLUME I — THE WHITE FRONTIER',
        order: 1,
        parts: [],
        chapters: EDEN_CHAPTERS,
      },
    ],
    chapters: [],
    relatedContent: [
      {
        id: 'world-eden',
        section: 'WRITING',
        title: 'EDEN WORLD ARCHIVE',
        href: '/writing/world/eden',
      },
    ],
  },
] satisfies readonly Novel[]);

export const WRITING_ARTICLES = Object.freeze([
  {
    id: 'essay-asymptotic-writing',
    slug: 'writing-toward-the-unfinished',
    type: 'ESSAY',
    title: '在尚未抵达之处写作',
    titleEn: 'WRITING TOWARD THE UNFINISHED',
    subtitle: '关于完成、生成与渐近',
    summary: '写作不一定通向一个封闭的终点；它也可以是一种持续修正距离的方式。',
    markdown: `## 完成并不是唯一尺度

我们习惯用“完成”判断一件作品是否成立。但有些文字真正保存的，恰恰是它在形成过程中不断改变方向的痕迹。

写作因此更像一条渐近线：它承认极限存在，也承认抵达并不是价值的前提。

## 保留距离

修订不是把所有缝隙封死。好的修订会让结构更精确，同时保留读者进入作品所需要的空白。

> [!FEATURED]
> 未完成并不等于缺失。它也可能是一种仍然拥有未来的形式。

这也是 ASYMPTOTE 的写作空间希望保存的东西：不是最终答案，而是一次次趋近留下的坐标。`,
    cover: null,
    heroImage: null,
    shareImage: null,
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    createdAt: '2026-07-02T14:00:00+08:00',
    updatedAt: '2026-08-16T20:20:00+08:00',
    publishedAt: '2026-08-16T20:20:00+08:00',
    tags: ['写作', '现代性', '渐近'],
    series: null,
    seriesIndex: null,
    relatedContent: [],
    wordCount: 1680,
    readingTime: 6,
    commentsEnabled: false,
  },
  {
    id: 'note-station-after-rain',
    slug: 'station-after-rain',
    type: 'NOTE',
    title: '雨后的站台',
    titleEn: 'A STATION AFTER RAIN',
    subtitle: '创作札记 01',
    summary: '关于一段潮湿声音和《伊甸》第一章的起点。',
    markdown: `## 记录

雨停后的站台会短暂失去时间感。铁轨反射天空，远处的灯被水面拉成没有终点的线。

《伊甸》的第一幕来自这个瞬间：旅程尚未开始，世界已经轻微地离开了原位。`,
    cover: null,
    heroImage: null,
    shareImage: null,
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    createdAt: '2026-08-10T22:00:00+08:00',
    updatedAt: '2026-08-10T22:00:00+08:00',
    publishedAt: '2026-08-10T22:00:00+08:00',
    tags: ['伊甸', '创作过程'],
    series: '伊甸札记',
    seriesIndex: 1,
    relatedContent: [
      {
        id: 'novel-eden',
        section: 'WRITING',
        title: 'EDEN / 伊甸',
        href: '/writing/fiction/eden',
      },
    ],
    wordCount: 620,
    readingTime: 3,
    commentsEnabled: false,
  },
  {
    id: 'world-eden',
    slug: 'eden',
    type: 'WORLD',
    title: '伊甸世界档案',
    titleEn: 'EDEN WORLD ARCHIVE',
    subtitle: 'WORLD FILE 001',
    summary: '关于白色边境、静默地图与趋近之海的基础记录。',
    markdown: `## 白色边境

既有地图最北端以外的无名区域。它并非永久覆盖着雪，而是会逐渐抹去观察者熟悉的颜色。

## 静默地图

一种不标记当前位置的地图。它只记录尚未走过的道路，以及道路与观察者之间不断缩短的距离。

## 档案状态

当前记录仍不完整。更多地点与人物将在小说章节公开后补入。`,
    cover: null,
    heroImage: null,
    shareImage: null,
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    createdAt: '2026-08-14T18:00:00+08:00',
    updatedAt: '2026-08-19T12:30:00+08:00',
    publishedAt: '2026-08-19T12:30:00+08:00',
    tags: ['伊甸', '世界', '设定'],
    series: '伊甸档案',
    seriesIndex: 1,
    relatedContent: [
      {
        id: 'novel-eden',
        section: 'WRITING',
        title: 'EDEN / 伊甸',
        href: '/writing/fiction/eden',
      },
    ],
    wordCount: 940,
    readingTime: 4,
    commentsEnabled: false,
  },
] satisfies readonly WritingArticle[]);

export const getNovelChapters = (novel: Novel) => [
  ...novel.chapters,
  ...novel.volumes.flatMap((volume) => [
    ...volume.chapters,
    ...volume.parts.flatMap((part) => part.chapters),
  ]),
].sort((left, right) => left.number - right.number);

export const getPublicNovelChapters = (novel: Novel) => getNovelChapters(novel).filter(
  (chapter) => chapter.status === 'PUBLISHED' && chapter.visibility === 'PUBLIC',
);

export const getWritingContentHref = (content: WritingArticle) => {
  const routeByType: Record<Exclude<WritingContentType, 'FICTION'>, string> = {
    SHORT_FICTION: 'short',
    ESSAY: 'essay',
    NOTE: 'note',
    WORLD: 'world',
    CHARACTER: 'character',
    LORE: 'lore',
  };

  return `/writing/${routeByType[content.type]}/${content.slug}`;
};

export const getPublicWritingArticles = () => WRITING_ARTICLES.filter(
  (content) => content.status === 'PUBLISHED' && content.visibility === 'PUBLIC',
);

export const findNovel = (slug: string) => NOVELS.find((novel) => novel.slug === slug);

export const findChapter = (novel: Novel, slug: string) => getPublicNovelChapters(novel)
  .find((chapter) => chapter.slug === slug);

export const formatWritingDate = (isoDate: string | null) => {
  if (!isoDate) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoDate));
};

export const WRITING_TYPE_LABELS: Record<WritingContentType, string> = {
  FICTION: '长篇小说',
  SHORT_FICTION: '短篇小说',
  ESSAY: '文章',
  NOTE: '札记',
  WORLD: '世界档案',
  CHARACTER: '人物档案',
  LORE: '设定档案',
};

export const PUBLICATION_STATUS_LABELS = {
  DRAFT: '草稿',
  REVIEW: '待审阅',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
} as const;

export const NOVEL_STATUS_LABELS = {
  PLANNING: '计划中',
  WRITING: '写作中',
  ONGOING: '连载中',
  COMPLETED: '已完成',
  HIATUS: '暂停',
  ARCHIVED: '已归档',
} as const;
