import {
  BrowserChapterRepository,
  BrowserDraftRepository,
  BrowserMediaRepository,
  BrowserRevisionRepository,
} from '../lib/writing/browserRepositories';
import { countWritingText, renderWritingMarkdown } from '../lib/writing/markdown';
import {
  BrowserWritingExportService,
  draftToExportDocument,
} from '../lib/writing/exportService';
import { PUBLICATION_STATUS_LABELS, WRITING_TYPE_LABELS } from '../data/writing';
import type {
  ManagedNovelChapter,
  WritingDraft,
  WritingMediaAsset,
  WritingRevision,
} from '../types/writing';

type EditorMode = 'write' | 'split' | 'preview';
type EditorCommand =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inline-code'
  | 'quote'
  | 'featured-quote'
  | 'list'
  | 'ordered-list'
  | 'link'
  | 'footnote'
  | 'margin-note'
  | 'annotation'
  | 'superscript'
  | 'subscript'
  | 'table'
  | 'code'
  | 'divider';

interface NovelWorkspaceSeed {
  id: string;
  title: string;
  chapters: ManagedNovelChapter[];
}

const LAST_DRAFT_KEY = 'asymptote.writing.last-draft.v1';
const EMERGENCY_DRAFT_KEY = 'asymptote.writing.emergency-draft.v1';
const initializedEditors = new WeakSet<Element>();

const readEmergencyDraft = () => {
  try {
    const value = window.localStorage.getItem(EMERGENCY_DRAFT_KEY);
    return value ? JSON.parse(value) as WritingDraft : null;
  } catch {
    return null;
  }
};

const initializeWritingEditor = async () => {
  const root = document.querySelector<HTMLElement>('[data-writing-editor]');
  if (!root || initializedEditors.has(root)) return;
  initializedEditors.add(root);

  const initialNode = root.querySelector<HTMLScriptElement>('[data-editor-initial]');
  const textarea = root.querySelector<HTMLTextAreaElement>('[data-editor-markdown]');
  const preview = root.querySelector<HTMLElement>('[data-editor-preview]');
  const panes = root.querySelector<HTMLElement>('[data-editor-panes]');
  if (!initialNode?.textContent || !textarea || !preview || !panes) return;

  const draftRepository = new BrowserDraftRepository();
  const mediaRepository = new BrowserMediaRepository();
  const revisionRepository = new BrowserRevisionRepository();
  const exportService = new BrowserWritingExportService();
  const chapterSeedNode = root.querySelector<HTMLScriptElement>('[data-editor-chapter-seed]');
  const novelSeed = chapterSeedNode?.textContent
    ? JSON.parse(chapterSeedNode.textContent) as NovelWorkspaceSeed[]
    : [];
  const chapterRepository = new BrowserChapterRepository(
    novelSeed.flatMap((novel) => novel.chapters),
  );
  const initialDraft = JSON.parse(initialNode.textContent) as WritingDraft;
  const storedDrafts = await draftRepository.list();
  const lastDraftId = window.localStorage.getItem(LAST_DRAFT_KEY);
  let current = storedDrafts.find((draft) => draft.id === lastDraftId)
    ?? storedDrafts[0]
    ?? initialDraft;
  const emergencyDraft = readEmergencyDraft();
  let mediaAssets: readonly WritingMediaAsset[] = [];
  let dirty = false;
  let saveTimer = 0;
  let mode: EditorMode = 'split';

  const title = root.querySelector<HTMLInputElement>('[data-editor-title]');
  const subtitle = root.querySelector<HTMLInputElement>('[data-editor-subtitle]');
  const type = root.querySelector<HTMLSelectElement>('[data-editor-type]');
  const status = root.querySelector<HTMLSelectElement>('[data-editor-status]');
  const visibility = root.querySelector<HTMLSelectElement>('[data-editor-visibility]');
  const tags = root.querySelector<HTMLInputElement>('[data-editor-tags]');
  const saveStatus = root.querySelector<HTMLElement>('[data-editor-save-status]');
  const draftList = root.querySelector<HTMLOListElement>('[data-editor-draft-list]');
  const draftCount = root.querySelector<HTMLElement>('[data-editor-draft-count]');
  const mediaPanel = root.querySelector<HTMLElement>('[data-editor-media]');
  const mediaList = root.querySelector<HTMLOListElement>('[data-editor-media-list]');
  const mediaStatus = root.querySelector<HTMLElement>('[data-editor-media-status]');
  const revisionPanel = root.querySelector<HTMLElement>('[data-editor-revisions]');
  const revisionList = root.querySelector<HTMLOListElement>('[data-editor-revision-list]');
  const revisionStatus = root.querySelector<HTMLElement>('[data-editor-revision-status]');
  const revisionNote = root.querySelector<HTMLInputElement>('[data-editor-revision-note]');
  const revisionCompare = root.querySelector<HTMLElement>('[data-editor-revision-compare]');
  const chapterPanel = root.querySelector<HTMLElement>('[data-editor-chapters]');
  const chapterList = root.querySelector<HTMLOListElement>('[data-editor-chapter-list]');
  const chapterStatus = root.querySelector<HTMLElement>('[data-editor-chapter-status]');
  const novelSelect = root.querySelector<HTMLSelectElement>('[data-editor-novel-select]');
  const recovery = root.querySelector<HTMLElement>('[data-editor-recovery]');
  const recoveryDescription = recovery?.querySelector<HTMLElement>('[data-editor-recovery-description]');
  const commandPalette = root.querySelector<HTMLDialogElement>('[data-editor-command-palette]');
  const commandSearch = commandPalette?.querySelector<HTMLInputElement>('[data-editor-command-search]');

  const getDraftFromFields = (): WritingDraft => ({
    id: current.id,
    slug: current.slug,
    title: title?.value.trim() || '未命名记录',
    subtitle: subtitle?.value.trim() ?? '',
    type: (type?.value ?? 'ESSAY') as WritingDraft['type'],
    status: (status?.value ?? 'DRAFT') as WritingDraft['status'],
    visibility: (visibility?.value ?? 'PRIVATE') as WritingDraft['visibility'],
    tags: (tags?.value ?? '').split(/[\/，,]/).map((tag) => tag.trim()).filter(Boolean),
    markdown: textarea.value,
    updatedAt: new Date().toISOString(),
    novelId: current.novelId,
    chapterId: current.chapterId,
  });

  const resolveLocalMedia = (markdown: string) => mediaAssets.reduce((resolved, asset) => (
    resolved.replaceAll(`media:${asset.id}`, asset.src)
  ), markdown);

  const updatePreview = () => {
    preview.innerHTML = renderWritingMarkdown(resolveLocalMedia(textarea.value));
    const count = countWritingText(textarea.value);
    const selected = countWritingText(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd));
    const characterCount = root.querySelector('[data-editor-character-count]');
    const wordCount = root.querySelector('[data-editor-word-count]');
    const selectionCount = root.querySelector('[data-editor-selection-count]');
    if (characterCount) characterCount.textContent = String(count.characters);
    if (wordCount) wordCount.textContent = String(count.words);
    if (selectionCount) selectionCount.textContent = String(selected.characters);
  };

  const setSaveState = (value: '保存中…' | '已保存' | '保存失败') => {
    if (!saveStatus) return;
    saveStatus.textContent = value;
    saveStatus.dataset.saveState = value === '保存中…'
      ? 'saving'
      : value === '已保存'
        ? 'saved'
        : 'error';
  };

  const renderDraftList = async () => {
    if (!draftList) return;
    const drafts = await draftRepository.list();
    if (draftCount) draftCount.textContent = String(drafts.length).padStart(2, '0');
    draftList.replaceChildren();
    drafts.forEach((draft) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const removeButton = document.createElement('button');
      const name = document.createElement('strong');
      const meta = document.createElement('span');
      item.className = 'writing-studio__draft-item';
      button.type = 'button';
      button.className = 'writing-studio__draft-open';
      button.toggleAttribute('aria-current', draft.id === current.id);
      name.textContent = draft.title || '未命名记录';
      meta.textContent = `${WRITING_TYPE_LABELS[draft.type]} / ${PUBLICATION_STATUS_LABELS[draft.status]}`;
      button.append(name, meta);
      button.addEventListener('click', () => loadDraft(draft));
      removeButton.type = 'button';
      removeButton.className = 'writing-studio__draft-remove';
      removeButton.textContent = '删除';
      removeButton.ariaLabel = `删除草稿 ${draft.title || '未命名记录'}`;
      removeButton.addEventListener('click', () => armLocalRemoval(removeButton, async () => {
        await draftRepository.remove(draft.id);
        const remaining = await draftRepository.list();
        if (draft.id === current.id) loadDraft(remaining[0] ?? initialDraft);
        await renderDraftList();
      }));
      item.append(button, removeButton);
      draftList.append(item);
    });
  };

  /* 本地删除采用二次确认文字，不弹出阻断写作流程的浏览器对话框。 */
  const armLocalRemoval = (button: HTMLButtonElement, remove: () => Promise<void>) => {
    if (button.dataset.armed === 'true') {
      void remove();
      return;
    }
    button.dataset.armed = 'true';
    const previous = button.textContent;
    button.textContent = '再次确认';
    window.setTimeout(() => {
      if (!button.isConnected) return;
      delete button.dataset.armed;
      button.textContent = previous;
    }, 2600);
  };

  const saveDraft = async () => {
    window.clearTimeout(saveTimer);
    setSaveState('保存中…');
    try {
      current = getDraftFromFields();
      await draftRepository.save(current);
      if (current.novelId && current.chapterId) {
        const chapters = await chapterRepository.list(current.novelId);
        const chapter = chapters.find((item) => item.id === current.chapterId);
        if (chapter) {
          await chapterRepository.save({
            ...chapter,
            title: current.title,
            markdown: current.markdown,
            status: current.status,
            visibility: current.visibility,
            updatedAt: current.updatedAt,
            wordCount: countWritingText(current.markdown).characters,
          });
        }
      }
      window.localStorage.setItem(LAST_DRAFT_KEY, current.id);
      if (readEmergencyDraft()?.id === current.id) {
        window.localStorage.removeItem(EMERGENCY_DRAFT_KEY);
        if (recovery) recovery.hidden = true;
      }
      dirty = false;
      setSaveState('已保存');
      await renderDraftList();
      if (chapterPanel && !chapterPanel.hasAttribute('inert')) await renderChapters();
    } catch (error) {
      console.error('[ASYMPTOTE Writing] 本地草稿保存失败。', error);
      setSaveState('保存失败');
    }
  };

  const scheduleSave = () => {
    dirty = true;
    setSaveState('保存中…');
    /*
     * 自动保存有 760ms 防抖窗口；输入发生时先同步写入极小的紧急副本，
     * 浏览器若在 Repository 提交前异常退出，下次进入仍可由作者选择恢复。
     */
    try {
      window.localStorage.setItem(EMERGENCY_DRAFT_KEY, JSON.stringify(getDraftFromFields()));
    } catch (error) {
      console.warn('[ASYMPTOTE Writing] 无法写入紧急恢复副本。', error);
    }
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveDraft(), 760);
  };

  function loadDraft(draft: WritingDraft) {
    current = draft;
    if (title) title.value = draft.title;
    if (subtitle) subtitle.value = draft.subtitle;
    if (type) type.value = draft.type;
    if (status) status.value = draft.status;
    if (visibility) visibility.value = draft.visibility;
    if (tags) tags.value = draft.tags.join(' / ');
    textarea.value = draft.markdown;
    window.localStorage.setItem(LAST_DRAFT_KEY, draft.id);
    dirty = false;
    updatePreview();
    void renderDraftList();
    if (revisionPanel && !revisionPanel.hasAttribute('inert')) void renderRevisions();
  }

  const createNewDraft = () => {
    const now = new Date().toISOString();
    loadDraft({
      ...initialDraft,
      id: crypto.randomUUID(),
      slug: `draft-${Date.now()}`,
      title: '未命名记录',
      subtitle: '',
      type: 'ESSAY',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      tags: [],
      markdown: '## 第一节\n\n',
      updatedAt: now,
    });
    setSaveState('保存中…');
    void saveDraft().then(() => {
      title?.focus();
      title?.select();
    });
  };

  const replaceSelection = (before: string, after = '', placeholder = '') => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder;
    textarea.setRangeText(`${before}${selected}${after}`, start, end, 'end');
    textarea.focus();
    updatePreview();
    scheduleSave();
  };

  const runCommand = (command: EditorCommand) => {
    const commands: Record<EditorCommand, () => void> = {
      heading1: () => replaceSelection('# ', '', '作品标题'),
      heading2: () => replaceSelection('## ', '', '章节标题'),
      heading3: () => replaceSelection('### ', '', '小节标题'),
      heading4: () => replaceSelection('#### ', '', '四级标题'),
      heading5: () => replaceSelection('##### ', '', '五级标题'),
      heading6: () => replaceSelection('###### ', '', '六级标题'),
      bold: () => replaceSelection('**', '**', '强调文字'),
      italic: () => replaceSelection('*', '*', '斜体文字'),
      strike: () => replaceSelection('~~', '~~', '删除文字'),
      'inline-code': () => replaceSelection('`', '`', '行内代码'),
      quote: () => replaceSelection('> ', '', '引用文字'),
      'featured-quote': () => replaceSelection('> [!FEATURED]\n> ', '', '摘句'),
      list: () => replaceSelection('- ', '', '列表项目'),
      'ordered-list': () => replaceSelection('1. ', '', '编号项目'),
      link: () => replaceSelection('[', '](https://)', '链接文字'),
      footnote: () => {
        const id = String((textarea.value.match(/\[\^[^\]]+\]/g) ?? []).length + 1);
        replaceSelection('', `[^${id}]\n\n[^${id}]: 脚注内容`, '需要注释的文字');
      },
      'margin-note': () => replaceSelection('{{旁注:', '}}', '旁注内容'),
      annotation: () => replaceSelection(
        '\n:::annotation 修订说明\n',
        '\n:::\n',
        '这里写作者批注。',
      ),
      superscript: () => replaceSelection('^{', '}', '上标'),
      subscript: () => replaceSelection('_{', '}', '下标'),
      table: () => replaceSelection(
        '\n| 项目 | 内容 |\n| --- | --- |\n| ',
        ' | 说明 |\n',
        '记录',
      ),
      code: () => replaceSelection('```\n', '\n```', '代码'),
      divider: () => replaceSelection('\n\n---\n\n'),
    };
    commands[command]();
  };

  const setMode = (nextMode: EditorMode) => {
    mode = nextMode;
    panes.dataset.mode = mode;
    root.querySelectorAll<HTMLButtonElement>('[data-editor-mode]').forEach((button) => {
      button.ariaPressed = String(button.dataset.editorMode === mode);
    });
  };

  const setMediaOpen = (open: boolean) => {
    if (!mediaPanel) return;
    if (open) {
      [revisionPanel, chapterPanel].forEach((panel) => {
        panel?.setAttribute('aria-hidden', 'true');
        panel?.setAttribute('inert', '');
      });
    }
    mediaPanel.ariaHidden = String(!open);
    mediaPanel.toggleAttribute('inert', !open);
    root.toggleAttribute('data-media-open', open);
    root.toggleAttribute('data-tool-open', open);
  };

  const insertMedia = (asset: WritingMediaAsset) => {
    const alt = asset.alt || asset.fileName.replace(/\.[^.]+$/, '');
    replaceSelection(`\n![${alt}](media:${asset.id} "${asset.fileName}")\n`);
    setMediaOpen(false);
  };

  const renderMedia = async () => {
    if (!mediaList) return;
    try {
      mediaAssets = await mediaRepository.list();
      mediaList.replaceChildren();
      mediaAssets.forEach((asset) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        const image = document.createElement('img');
        const label = document.createElement('span');
        button.type = 'button';
        image.src = asset.src;
        image.alt = asset.alt;
        label.textContent = `${asset.fileName} / ${asset.width ?? '?'}×${asset.height ?? '?'}`;
        button.append(image, label);
        button.addEventListener('click', () => insertMedia(asset));
        item.append(button);
        mediaList.append(item);
      });
      if (mediaStatus) mediaStatus.textContent = mediaAssets.length ? `${mediaAssets.length} 项本地素材` : '尚无本地图片';
      updatePreview();
    } catch (error) {
      if (mediaStatus) mediaStatus.textContent = '媒体库不可用';
      console.error('[ASYMPTOTE Writing] 媒体库读取失败。', error);
    }
  };

  const saveMediaFiles = async (files: FileList | File[]) => {
    if (mediaStatus) mediaStatus.textContent = '导入中…';
    for (const file of Array.from(files)) {
      try {
        await mediaRepository.save(file);
      } catch (error) {
        if (mediaStatus) {
          const message = error instanceof Error ? error.message : '';
          mediaStatus.textContent = message.includes('6 MB')
            ? '图片超过 6 MB'
            : message.includes('FORMAT')
              ? '不支持此图片格式'
              : '导入失败';
        }
        return;
      }
    }
    await renderMedia();
  };

  const setToolPanelOpen = (panel: HTMLElement | null, open: boolean) => {
    [mediaPanel, revisionPanel, chapterPanel].forEach((candidate) => {
      if (!candidate) return;
      const active = candidate === panel && open;
      candidate.ariaHidden = String(!active);
      candidate.toggleAttribute('inert', !active);
    });
    root.toggleAttribute('data-tool-open', open);
    root.toggleAttribute('data-media-open', open && panel === mediaPanel);
  };

  const renderRevisions = async () => {
    if (!revisionList) return;
    const revisions = await revisionRepository.list(current.id);
    revisionList.replaceChildren();

    if (revisions.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'writing-tool-panel__empty';
      empty.textContent = '尚无版本记录';
      revisionList.append(empty);
      return;
    }

    revisions.forEach((revision) => {
      const item = document.createElement('li');
      const identity = document.createElement('div');
      const version = document.createElement('strong');
      const note = document.createElement('span');
      const time = document.createElement('time');
      const actions = document.createElement('div');
      const compare = document.createElement('button');
      const restore = document.createElement('button');

      version.textContent = `版本 ${String(revision.version).padStart(2, '0')}`;
      note.textContent = revision.note || '未填写修改说明';
      time.dateTime = revision.createdAt;
      time.textContent = new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(revision.createdAt));
      identity.append(version, note, time);

      compare.type = 'button';
      compare.textContent = '比较';
      compare.addEventListener('click', () => compareRevision(revision));
      restore.type = 'button';
      restore.textContent = '恢复';
      restore.addEventListener('click', () => void restoreRevision(revision.id));
      actions.append(compare, restore);
      item.append(identity, actions);
      revisionList.append(item);
    });
  };

  const createRevision = async (fallbackNote = '手动保存') => {
    await saveDraft();
    const revisions = await revisionRepository.list(current.id);
    const latest = revisions[0];
    if (latest?.markdown === current.markdown) {
      if (revisionStatus) revisionStatus.textContent = '正文没有变化，未重复建立版本。';
      return;
    }

    const revision: WritingRevision = {
      id: crypto.randomUUID(),
      contentId: current.id,
      version: Math.max(0, ...revisions.map((item) => item.version)) + 1,
      createdAt: new Date().toISOString(),
      note: revisionNote?.value.trim() || fallbackNote,
      markdown: current.markdown,
    };
    await revisionRepository.create(revision);
    if (revisionNote) revisionNote.value = '';
    if (revisionStatus) revisionStatus.textContent = `版本 ${revision.version} 已保存到本地。`;
    await renderRevisions();
  };

  const compareRevision = (revision: WritingRevision) => {
    if (!revisionCompare) return;
    const oldText = revision.markdown;
    const newText = textarea.value;
    let prefix = 0;
    while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) {
      prefix += 1;
    }
    let suffix = 0;
    while (
      suffix < oldText.length - prefix
      && suffix < newText.length - prefix
      && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) suffix += 1;

    const removed = oldText.slice(prefix, oldText.length - suffix);
    const added = newText.slice(prefix, newText.length - suffix);
    const summary = revisionCompare.querySelector<HTMLElement>('[data-editor-revision-compare-summary]');
    const previewNode = revisionCompare.querySelector<HTMLElement>('[data-editor-revision-compare-preview]');
    if (summary) {
      summary.textContent = `与版本 ${revision.version} 相比：替换 ${removed.length} 个字符，写入 ${added.length} 个字符。`;
    }
    if (previewNode) {
      const excerpt = (value: string) => value.length > 260 ? `${value.slice(0, 260)}…` : value;
      previewNode.textContent = `版本内容\n${excerpt(removed) || '（无）'}\n\n当前内容\n${excerpt(added) || '（无）'}`;
    }
    revisionCompare.hidden = false;
  };

  const restoreRevision = async (revisionId: string) => {
    const revision = await revisionRepository.restore(revisionId);
    if (!revision || revision.contentId !== current.id) return;
    textarea.value = revision.markdown;
    updatePreview();
    scheduleSave();
    if (revisionStatus) revisionStatus.textContent = `已恢复版本 ${revision.version}，正在保存为当前草稿。`;
  };

  const currentNovelId = () => novelSelect?.value || novelSeed[0]?.id || '';

  const updateChapter = async (
    chapter: ManagedNovelChapter,
    patch: Partial<ManagedNovelChapter>,
  ) => {
    await chapterRepository.save({
      ...chapter,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await renderChapters();
  };

  const moveChapter = async (chapterId: string, direction: -1 | 1) => {
    const novelId = currentNovelId();
    const chapters = [...await chapterRepository.list(novelId)];
    const index = chapters.findIndex((chapter) => chapter.id === chapterId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= chapters.length) return;
    [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
    await chapterRepository.reorder(novelId, chapters.map((chapter) => chapter.id));
    await renderChapters();
  };

  const loadChapterIntoEditor = (chapter: ManagedNovelChapter) => {
    const novel = novelSeed.find((item) => item.id === chapter.novelId);
    loadDraft({
      id: chapter.id,
      slug: chapter.slug,
      title: chapter.title,
      subtitle: novel ? `${novel.title} / 第 ${chapter.number} 章` : `第 ${chapter.number} 章`,
      type: 'FICTION',
      status: chapter.status,
      visibility: chapter.visibility,
      tags: novel ? [novel.title] : [],
      markdown: chapter.markdown,
      updatedAt: chapter.updatedAt,
      novelId: chapter.novelId,
      chapterId: chapter.id,
    });
    setToolPanelOpen(chapterPanel, false);
    textarea.focus();
  };

  const renderChapters = async () => {
    if (!chapterList) return;
    const novelId = currentNovelId();
    const chapters = [...await chapterRepository.list(novelId)];
    chapterList.replaceChildren();

    chapters.forEach((chapter, index) => {
      const item = document.createElement('li');
      const number = document.createElement('span');
      const titleInput = document.createElement('input');
      const statusSelect = document.createElement('select');
      const actions = document.createElement('div');
      const open = document.createElement('button');
      const duplicate = document.createElement('button');
      const up = document.createElement('button');
      const down = document.createElement('button');
      const remove = document.createElement('button');

      item.dataset.chapterId = chapter.id;
      item.draggable = true;
      number.className = 'writing-chapters__number';
      number.textContent = String(chapter.number).padStart(2, '0');
      number.title = '拖动调整顺序';
      titleInput.value = chapter.title;
      titleInput.ariaLabel = `第 ${chapter.number} 章标题`;
      titleInput.addEventListener('change', () => void updateChapter(chapter, {
        title: titleInput.value.trim() || '未命名章节',
      }));

      (['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as const).forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = PUBLICATION_STATUS_LABELS[value];
        option.selected = value === chapter.status;
        statusSelect.append(option);
      });
      statusSelect.ariaLabel = `第 ${chapter.number} 章状态`;
      statusSelect.addEventListener('change', () => void updateChapter(chapter, {
        status: statusSelect.value as ManagedNovelChapter['status'],
        visibility: statusSelect.value === 'PUBLISHED' ? 'PUBLIC' : 'PRIVATE',
        publishedAt: statusSelect.value === 'PUBLISHED'
          ? (chapter.publishedAt ?? new Date().toISOString())
          : null,
      }));

      open.type = 'button';
      open.textContent = '编辑';
      open.addEventListener('click', () => loadChapterIntoEditor(chapter));
      duplicate.type = 'button';
      duplicate.textContent = '复制';
      duplicate.addEventListener('click', async () => {
        await chapterRepository.save({
          ...chapter,
          id: crypto.randomUUID(),
          slug: `${chapter.slug}-copy-${Date.now()}`,
          number: chapters.length + 1,
          title: `${chapter.title}（副本）`,
          status: 'DRAFT',
          visibility: 'PRIVATE',
          publishedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await renderChapters();
      });
      up.type = 'button';
      up.textContent = '上移';
      up.disabled = index === 0;
      up.addEventListener('click', () => void moveChapter(chapter.id, -1));
      down.type = 'button';
      down.textContent = '下移';
      down.disabled = index === chapters.length - 1;
      down.addEventListener('click', () => void moveChapter(chapter.id, 1));
      remove.type = 'button';
      remove.textContent = '删除';
      remove.addEventListener('click', () => armLocalRemoval(remove, async () => {
        await chapterRepository.remove(chapter.id);
        const remaining = await chapterRepository.list(novelId);
        await chapterRepository.reorder(novelId, remaining.map((item) => item.id));
        await renderChapters();
      }));
      actions.append(open, duplicate, up, down, remove);
      item.append(number, titleInput, statusSelect, actions);

      item.addEventListener('dragstart', (event) => {
        item.dataset.dragging = 'true';
        event.dataTransfer?.setData('text/plain', chapter.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => delete item.dataset.dragging);
      item.addEventListener('dragover', (event) => {
        event.preventDefault();
        const dragged = chapterList.querySelector<HTMLElement>('[data-dragging="true"]');
        if (!dragged || dragged === item) return;
        const after = event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
        chapterList.insertBefore(dragged, after ? item.nextSibling : item);
      });
      item.addEventListener('drop', async (event) => {
        event.preventDefault();
        const ids = [...chapterList.querySelectorAll<HTMLElement>('[data-chapter-id]')]
          .map((row) => row.dataset.chapterId)
          .filter((id): id is string => Boolean(id));
        await chapterRepository.reorder(novelId, ids);
        await renderChapters();
      });

      chapterList.append(item);
    });

    if (chapterStatus) chapterStatus.textContent = `${chapters.length} 个章节 / 本地工作区`;
  };

  const paletteButtons = [...(commandPalette?.querySelectorAll<HTMLButtonElement>(
    '[data-editor-command], [data-editor-media-command]',
  ) ?? [])];

  const filterCommandPalette = () => {
    const query = commandSearch?.value.trim().toLocaleLowerCase('zh-CN') ?? '';
    paletteButtons.forEach((button) => {
      button.closest('li')?.toggleAttribute(
        'hidden',
        Boolean(query && !button.textContent?.toLocaleLowerCase('zh-CN').includes(query)),
      );
    });
  };

  const setCommandPaletteOpen = (open: boolean) => {
    if (!commandPalette) return;
    if (open && !commandPalette.open) {
      commandSearch?.setAttribute('value', '');
      if (commandSearch) commandSearch.value = '';
      filterCommandPalette();
      commandPalette.showModal();
      commandSearch?.focus();
      return;
    }
    if (!open && commandPalette.open) {
      commandPalette.close();
      textarea.focus();
    }
  };

  const movePaletteFocus = (direction: -1 | 1) => {
    const visible = paletteButtons.filter((button) => !button.closest('li')?.hidden);
    if (visible.length === 0) return;
    const index = visible.indexOf(document.activeElement as HTMLButtonElement);
    const next = index < 0 ? 0 : (index + direction + visible.length) % visible.length;
    visible[next].focus();
  };

  if (emergencyDraft && emergencyDraft.markdown !== current.markdown) {
    if (recoveryDescription) {
      const time = new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(emergencyDraft.updatedAt));
      recoveryDescription.textContent = `${emergencyDraft.title || '未命名记录'} / ${time}，尚未完成常规自动保存。`;
    }
    if (recovery) recovery.hidden = false;
  } else if (emergencyDraft) {
    window.localStorage.removeItem(EMERGENCY_DRAFT_KEY);
  }

  [title, subtitle, type, status, visibility, tags].forEach((control) => {
    control?.addEventListener('input', scheduleSave);
  });
  textarea.addEventListener('input', () => { updatePreview(); scheduleSave(); });
  textarea.addEventListener('select', updatePreview);

  root.querySelectorAll<HTMLButtonElement>('[data-editor-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.editorMode as EditorMode));
  });
  root.querySelectorAll<HTMLButtonElement>('[data-editor-command]').forEach((button) => {
    button.addEventListener('click', () => {
      runCommand(button.dataset.editorCommand as EditorCommand);
      if (commandPalette?.contains(button)) setCommandPaletteOpen(false);
    });
  });

  root.querySelector('[data-editor-command-palette-open]')?.addEventListener('click', () => {
    setCommandPaletteOpen(true);
  });
  root.querySelector('[data-editor-command-palette-close]')?.addEventListener('click', () => {
    setCommandPaletteOpen(false);
  });
  commandSearch?.addEventListener('input', filterCommandPalette);
  commandPalette?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); movePaletteFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); movePaletteFocus(-1); }
    if (event.key === 'Enter' && document.activeElement === commandSearch) {
      event.preventDefault();
      paletteButtons.find((button) => !button.closest('li')?.hidden)?.click();
    }
  });
  commandPalette?.addEventListener('close', () => textarea.focus());
  commandPalette?.querySelector('[data-editor-media-command]')?.addEventListener('click', () => {
    setCommandPaletteOpen(false);
    setMediaOpen(true);
  });

  root.querySelector('[data-editor-save]')?.addEventListener('click', () => void createRevision('手动保存'));
  root.querySelector('[data-editor-new]')?.addEventListener('click', createNewDraft);

  root.querySelector<HTMLButtonElement>('[data-editor-focus]')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const focused = !root.hasAttribute('data-focus-mode');
    root.toggleAttribute('data-focus-mode', focused);
    button.ariaPressed = String(focused);
    if (focused && mode === 'preview') setMode('write');
  });

  root.querySelector('[data-editor-revisions-open]')?.addEventListener('click', () => {
    setToolPanelOpen(revisionPanel, true);
    void renderRevisions();
  });
  root.querySelector('[data-editor-revisions-close]')?.addEventListener('click', () => {
    setToolPanelOpen(revisionPanel, false);
  });
  root.querySelector('[data-editor-revision-create]')?.addEventListener('click', () => {
    void createRevision();
  });
  root.querySelector('[data-editor-revision-compare-close]')?.addEventListener('click', () => {
    if (revisionCompare) revisionCompare.hidden = true;
  });

  root.querySelector('[data-editor-chapters-open]')?.addEventListener('click', () => {
    setToolPanelOpen(chapterPanel, true);
    void renderChapters();
  });
  root.querySelector('[data-editor-chapters-close]')?.addEventListener('click', () => {
    setToolPanelOpen(chapterPanel, false);
  });
  novelSelect?.addEventListener('change', () => void renderChapters());
  root.querySelector('[data-editor-chapter-new]')?.addEventListener('click', async () => {
    const novelId = currentNovelId();
    if (!novelId) return;
    const chapters = [...await chapterRepository.list(novelId)];
    const now = new Date().toISOString();
    const chapter: ManagedNovelChapter = {
      id: crypto.randomUUID(),
      novelId,
      slug: `chapter-${Date.now()}`,
      number: chapters.length + 1,
      label: `第 ${String(chapters.length + 1).padStart(2, '0')} 章`,
      title: '未命名章节',
      summary: '',
      markdown: '## 第一节\n\n',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      wordCount: 0,
      readingTime: 1,
    };
    await chapterRepository.save(chapter);
    await renderChapters();
    if (chapterStatus) chapterStatus.textContent = '新章节已建立；可直接载入编辑器。';
  });
  root.querySelector('[data-editor-novel-export]')?.addEventListener('click', async () => {
    const novelId = currentNovelId();
    const novel = novelSeed.find((item) => item.id === novelId);
    if (!novel) return;
    exportService.downloadNovel(novel.title, await chapterRepository.list(novelId));
    if (chapterStatus) chapterStatus.textContent = `已导出《${novel.title}》的本地章节。`;
  });

  root.querySelector('[data-editor-copy]')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(textarea.value);
  });
  root.querySelector('[data-editor-download-markdown]')?.addEventListener('click', () => {
    exportService.downloadMarkdown(draftToExportDocument(getDraftFromFields()));
  });
  root.querySelector('[data-editor-download-text]')?.addEventListener('click', () => {
    exportService.downloadPlainText(draftToExportDocument(getDraftFromFields()));
  });

  root.querySelector('[data-editor-recovery-restore]')?.addEventListener('click', () => {
    if (!emergencyDraft) return;
    loadDraft(emergencyDraft);
    scheduleSave();
    if (recovery) recovery.hidden = true;
  });
  root.querySelector('[data-editor-recovery-discard]')?.addEventListener('click', () => {
    window.localStorage.removeItem(EMERGENCY_DRAFT_KEY);
    if (recovery) recovery.hidden = true;
  });

  root.querySelector<HTMLInputElement>('[data-editor-import]')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    textarea.value = await file.text();
    if (title && (!title.value.trim() || title.value === '未命名记录')) {
      title.value = file.name.replace(/\.md$/i, '');
    }
    updatePreview();
    scheduleSave();
    input.value = '';
  });

  root.querySelector('[data-editor-media-open]')?.addEventListener('click', () => setMediaOpen(true));
  root.querySelector('[data-editor-media-close]')?.addEventListener('click', () => setMediaOpen(false));
  root.querySelector<HTMLInputElement>('[data-editor-media-input]')?.addEventListener('change', (event) => {
    const files = (event.currentTarget as HTMLInputElement).files;
    if (files) void saveMediaFiles(files);
  });
  mediaPanel?.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (mediaStatus) mediaStatus.textContent = '松开以导入图片';
  });
  mediaPanel?.addEventListener('drop', (event) => {
    event.preventDefault();
    const images = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
    if (images.length) void saveMediaFiles(images);
  });
  textarea.addEventListener('paste', (event) => {
    const images = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'));
    if (images.length) {
      event.preventDefault();
      void saveMediaFiles(images);
      setMediaOpen(true);
    }
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      setCommandPaletteOpen(true);
      return;
    }
    if (event.key === '/' && document.activeElement === textarea && !event.ctrlKey && !event.metaKey) {
      const lineStart = textarea.value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
      const beforeCaret = textarea.value.slice(lineStart, textarea.selectionStart);
      if (!beforeCaret.trim() && textarea.selectionStart === textarea.selectionEnd) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
    }
    if (event.key === 'Escape' && root.hasAttribute('data-tool-open')) {
      setToolPanelOpen(null, false);
      return;
    }
    if (event.key === 'Escape' && root.hasAttribute('data-focus-mode')) {
      root.removeAttribute('data-focus-mode');
      root.querySelector<HTMLButtonElement>('[data-editor-focus]')?.setAttribute('aria-pressed', 'false');
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const command = event.key.toLowerCase();
    if (command === 's') { event.preventDefault(); void createRevision('快捷键保存'); }
    if (document.activeElement === textarea && command === 'b') { event.preventDefault(); runCommand('bold'); }
    if (document.activeElement === textarea && command === 'i') { event.preventDefault(); runCommand('italic'); }
    if (document.activeElement === textarea && command === 'k') { event.preventDefault(); runCommand('link'); }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
  });

  /* ClientRouter 页面交换前也立即提交本地草稿，避免绕过浏览器 beforeunload。 */
  document.addEventListener('astro:before-preparation', () => {
    if (dirty) void saveDraft();
  });

  loadDraft(current);
  const locationUrl = new URL(window.location.href);
  if (locationUrl.searchParams.get('new') === '1') {
    createNewDraft();
    locationUrl.searchParams.delete('new');
    window.history.replaceState({}, '', locationUrl);
  }
  setMode('split');
  await renderMedia();
};

document.addEventListener('astro:page-load', () => void initializeWritingEditor());
void initializeWritingEditor();
