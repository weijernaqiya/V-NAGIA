export type WritingContentType =
  | 'FICTION'
  | 'SHORT_FICTION'
  | 'ESSAY'
  | 'NOTE'
  | 'WORLD'
  | 'CHARACTER'
  | 'LORE';

export type PublicationStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type ContentVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
export type NovelStatus =
  | 'PLANNING'
  | 'WRITING'
  | 'ONGOING'
  | 'COMPLETED'
  | 'HIATUS'
  | 'ARCHIVED';

export interface WritingImage {
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
  width?: number;
  height?: number;
}

export interface RelatedContentReference {
  id: string;
  section: 'WRITING' | 'IMAGE' | 'CINEMA' | 'MUSIC' | 'GAMES';
  title: string;
  href: string;
}

/*
 * 公共内容字段保持与页面组件分离。未来接入数据库时，API 返回同一形状，
 * 阅读页无需知道内容来自静态文件、本地草稿还是远程 ContentRepository。
 */
export interface WritingContentBase {
  id: string;
  slug: string;
  type: WritingContentType;
  title: string;
  titleEn?: string;
  subtitle?: string;
  summary: string;
  markdown: string;
  cover: WritingImage | null;
  heroImage: WritingImage | null;
  shareImage: string | null;
  status: PublicationStatus;
  visibility: ContentVisibility;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  tags: readonly string[];
  series: string | null;
  seriesIndex: number | null;
  relatedContent: readonly RelatedContentReference[];
  wordCount: number;
  readingTime: number;
  commentsEnabled: boolean;
}

export interface WritingArticle extends WritingContentBase {
  type: Exclude<WritingContentType, 'FICTION'>;
}

export interface NovelChapter {
  id: string;
  slug: string;
  number: number;
  label: string;
  title: string;
  titleEn?: string;
  summary: string;
  markdown: string;
  status: PublicationStatus;
  visibility: ContentVisibility;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  wordCount: number;
  readingTime: number;
}

export interface NovelPart {
  id: string;
  title: string;
  titleEn?: string;
  order: number;
  chapters: readonly NovelChapter[];
}

export interface NovelVolume {
  id: string;
  title: string;
  titleEn?: string;
  order: number;
  parts: readonly NovelPart[];
  chapters: readonly NovelChapter[];
}

export interface Novel {
  id: string;
  slug: string;
  type: 'FICTION';
  title: string;
  titleEn: string;
  subtitle?: string;
  summary: string;
  cover: WritingImage | null;
  heroImage: WritingImage | null;
  shareImage: string | null;
  status: NovelStatus;
  visibility: ContentVisibility;
  author: string;
  createdAt: string;
  updatedAt: string;
  tags: readonly string[];
  series: string | null;
  copyright: string;
  volumes: readonly NovelVolume[];
  chapters: readonly NovelChapter[];
  relatedContent: readonly RelatedContentReference[];
}

export interface WritingRevision {
  id: string;
  contentId: string;
  version: number;
  createdAt: string;
  note: string;
  markdown: string;
}

/* 作者端章节工作区在静态阶段附加 novelId，公共 Novel 数据仍保持只读。 */
export interface ManagedNovelChapter extends NovelChapter {
  novelId: string;
}

export interface WritingDraft {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  type: WritingContentType;
  status: PublicationStatus;
  visibility: ContentVisibility;
  tags: string[];
  markdown: string;
  updatedAt: string;
  novelId?: string;
  chapterId?: string;
}

export interface WritingMediaAsset extends WritingImage {
  id: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  size: number;
  createdAt: string;
  usedBy: readonly string[];
}

export interface WritingComment {
  id: string;
  contentId: string;
  paragraphId: string | null;
  parentId: string | null;
  author: string;
  body: string;
  createdAt: string;
  status: 'VISIBLE' | 'HIDDEN' | 'PENDING';
}
