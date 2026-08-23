import type {
  ChapterRepository,
  DraftRepository,
  MediaRepository,
  RevisionRepository,
} from './repositories';
import type {
  ManagedNovelChapter,
  WritingDraft,
  WritingMediaAsset,
  WritingRevision,
} from '../../types/writing';

const DRAFT_STORAGE_KEY = 'asymptote.writing.drafts.v1';
const REVISION_STORAGE_KEY = 'asymptote.writing.revisions.v1';
const CHAPTER_STORAGE_KEY = 'asymptote.writing.chapters.v1';
const MEDIA_DATABASE_NAME = 'asymptote-writing-media';
const MEDIA_STORE_NAME = 'media';
const ACCEPTED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_LOCAL_MEDIA_SIZE = 6 * 1024 * 1024;

/*
 * localStorage 只是静态站点阶段的草稿适配器，不是服务器备份。
 * 编辑器只依赖 DraftRepository；未来换成 API 时可以直接替换本类，
 * 不需要改写自动保存、恢复草稿或离开页面保护。
 */
export class BrowserDraftRepository implements DraftRepository {
  async list() {
    try {
      const value = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      return value ? JSON.parse(value) as WritingDraft[] : [];
    } catch {
      return [];
    }
  }

  async get(id: string) {
    return (await this.list()).find((draft) => draft.id === id) ?? null;
  }

  async save(draft: WritingDraft) {
    const drafts = [...await this.list()];
    const existingIndex = drafts.findIndex((item) => item.id === draft.id);
    if (existingIndex >= 0) drafts[existingIndex] = draft;
    else drafts.unshift(draft);
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  }

  async remove(id: string) {
    const drafts = (await this.list()).filter((draft) => draft.id !== id);
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  }
}

/*
 * 版本记录与草稿分开保存：自动保存可以频繁覆盖当前草稿，
 * 只有作者明确保存版本时才追加不可变快照，避免长时间写作产生大量无意义记录。
 */
export class BrowserRevisionRepository implements RevisionRepository {
  private async readAll() {
    try {
      const value = window.localStorage.getItem(REVISION_STORAGE_KEY);
      return value ? JSON.parse(value) as WritingRevision[] : [];
    } catch {
      return [];
    }
  }

  async list(contentId: string) {
    return (await this.readAll())
      .filter((revision) => revision.contentId === contentId)
      .sort((left, right) => right.version - left.version);
  }

  async create(revision: WritingRevision) {
    const revisions = await this.readAll();
    const withoutSameId = revisions.filter((item) => item.id !== revision.id);
    withoutSameId.push(revision);
    window.localStorage.setItem(REVISION_STORAGE_KEY, JSON.stringify(withoutSameId));
  }

  async restore(revisionId: string) {
    return (await this.readAll()).find((revision) => revision.id === revisionId) ?? null;
  }
}

/*
 * 小说章节管理同样通过 Repository 隔离存储。静态数据只作为首次种子，
 * 作者的改名、排序与状态调整写入浏览器副本，不会意外改动公开构建内容。
 */
export class BrowserChapterRepository implements ChapterRepository {
  constructor(private readonly seed: readonly ManagedNovelChapter[] = []) {}

  private async readAll() {
    try {
      const value = window.localStorage.getItem(CHAPTER_STORAGE_KEY);
      if (value) return JSON.parse(value) as ManagedNovelChapter[];
    } catch {
      // 损坏的本地章节数据会退回只读种子，避免管理页完全不可用。
    }

    const initial = this.seed.map((chapter) => ({ ...chapter }));
    window.localStorage.setItem(CHAPTER_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  private writeAll(chapters: readonly ManagedNovelChapter[]) {
    window.localStorage.setItem(CHAPTER_STORAGE_KEY, JSON.stringify(chapters));
  }

  async list(novelId: string) {
    return (await this.readAll())
      .filter((chapter) => chapter.novelId === novelId)
      .sort((left, right) => left.number - right.number);
  }

  async save(chapter: ManagedNovelChapter) {
    const chapters = [...await this.readAll()];
    const index = chapters.findIndex((item) => item.id === chapter.id);
    if (index >= 0) chapters[index] = chapter;
    else chapters.push(chapter);
    this.writeAll(chapters);
  }

  async remove(chapterId: string) {
    this.writeAll((await this.readAll()).filter((chapter) => chapter.id !== chapterId));
  }

  async reorder(novelId: string, chapterIds: readonly string[]) {
    const order = new Map(chapterIds.map((id, index) => [id, index + 1]));
    const now = new Date().toISOString();
    const chapters = (await this.readAll()).map((chapter) => (
      chapter.novelId === novelId && order.has(chapter.id)
        ? { ...chapter, number: order.get(chapter.id) ?? chapter.number, updatedAt: now }
        : chapter
    ));
    this.writeAll(chapters);
  }
}

interface StoredMediaRecord extends Omit<WritingMediaAsset, 'src'> {
  blob: Blob;
}

const openMediaDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(MEDIA_DATABASE_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(MEDIA_STORE_NAME)) {
      request.result.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const runMediaTransaction = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) => {
  const database = await openMediaDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE_NAME, mode);
    operation(transaction.objectStore(MEDIA_STORE_NAME), resolve, reject);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
};

/* 图片二进制放入 IndexedDB，避免大图挤爆 localStorage；它们仍只存在当前浏览器。 */
export class BrowserMediaRepository implements MediaRepository {
  async list() {
    const records = await runMediaTransaction<StoredMediaRecord[]>('readonly', (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as StoredMediaRecord[]);
      request.onerror = () => reject(request.error);
    });

    return records.map(({ blob, ...asset }) => ({
      ...asset,
      src: URL.createObjectURL(blob),
    }));
  }

  async save(file: File) {
    if (!ACCEPTED_MEDIA_TYPES.has(file.type)) throw new Error('UNSUPPORTED IMAGE FORMAT');
    if (file.size > MAX_LOCAL_MEDIA_SIZE) throw new Error('IMAGE EXCEEDS 6 MB');

    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      const source = URL.createObjectURL(file);
      image.onload = () => {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
        URL.revokeObjectURL(source);
      };
      image.onerror = () => {
        URL.revokeObjectURL(source);
        reject(new Error('IMAGE COULD NOT BE READ'));
      };
      image.src = source;
    });

    const id = crypto.randomUUID();
    const record: StoredMediaRecord = {
      id,
      fileName: file.name,
      mimeType: file.type as WritingMediaAsset['mimeType'],
      size: file.size,
      createdAt: new Date().toISOString(),
      usedBy: [],
      alt: '',
      width: dimensions.width,
      height: dimensions.height,
      blob: file,
    };

    await runMediaTransaction<void>('readwrite', (store, resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    const { blob: _blob, ...asset } = record;
    return { ...asset, src: URL.createObjectURL(file) };
  }

  async remove(id: string) {
    await runMediaTransaction<void>('readwrite', (store, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
