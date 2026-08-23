import { NOVELS, WRITING_ARTICLES, getNovelChapters } from '../../data/writing';
import type {
  Novel,
  ManagedNovelChapter,
  WritingArticle,
  WritingComment,
  WritingDraft,
  WritingMediaAsset,
  WritingRevision,
} from '../../types/writing';

/*
 * Repository 是页面与存储实现之间的安全边界。
 * 当前静态站点只提供只读内容仓储；真正的发布、删除、上传和评论必须在
 * 未来经过身份验证的服务端 API 中实现，不能依靠前端隐藏按钮保护。
 */
export interface ContentRepository {
  listPublished(): Promise<readonly WritingArticle[]>;
  listNovels(): Promise<readonly Novel[]>;
  findArticle(idOrSlug: string): Promise<WritingArticle | null>;
  findNovel(idOrSlug: string): Promise<Novel | null>;
}

export interface DraftRepository {
  list(): Promise<readonly WritingDraft[]>;
  get(id: string): Promise<WritingDraft | null>;
  save(draft: WritingDraft): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface MediaRepository {
  list(): Promise<readonly WritingMediaAsset[]>;
  save(file: File): Promise<WritingMediaAsset>;
  remove(id: string): Promise<void>;
}

export interface RevisionRepository {
  list(contentId: string): Promise<readonly WritingRevision[]>;
  create(revision: WritingRevision): Promise<void>;
  restore(revisionId: string): Promise<WritingRevision | null>;
}

export interface ChapterRepository {
  list(novelId: string): Promise<readonly ManagedNovelChapter[]>;
  save(chapter: ManagedNovelChapter): Promise<void>;
  remove(chapterId: string): Promise<void>;
  reorder(novelId: string, chapterIds: readonly string[]): Promise<void>;
}

export interface CommentRepository {
  list(contentId: string): Promise<readonly WritingComment[]>;
  create(comment: WritingComment): Promise<void>;
  moderate(commentId: string, status: WritingComment['status']): Promise<void>;
}

export class StaticWritingRepository implements ContentRepository {
  async listPublished() {
    return WRITING_ARTICLES.filter(
      (content) => content.status === 'PUBLISHED' && content.visibility === 'PUBLIC',
    );
  }

  async listNovels() {
    return NOVELS.filter((novel) => novel.visibility === 'PUBLIC');
  }

  async findArticle(idOrSlug: string) {
    return WRITING_ARTICLES.find(
      (content) => content.id === idOrSlug || content.slug === idOrSlug,
    ) ?? null;
  }

  async findNovel(idOrSlug: string) {
    return NOVELS.find((novel) => novel.id === idOrSlug || novel.slug === idOrSlug) ?? null;
  }
}

export const getNovelWordCount = (novel: Novel) => getNovelChapters(novel)
  .reduce((total, chapter) => total + chapter.wordCount, 0);
