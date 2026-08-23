interface MusicImportDraft {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  format: string;
  title: string;
  artist: string;
  album: string;
  discNumber: number;
  trackNumber: number | null;
  year: number | null;
  genres: string[];
  visibility: 'public' | 'private' | 'unlisted';
  note: string;
  lyrics: { fileName: string; format: 'plain' | 'lrc'; content: string } | null;
  addedAt: string;
}

const DRAFTS_STORAGE_KEY = 'asymptote.music.import-drafts.v1';
const initializedAuthorPages = new WeakSet<Element>();

const readDrafts = (): MusicImportDraft[] => {
  try {
    const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeDrafts = (drafts: readonly MusicImportDraft[]) => {
  window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
};

const detectFormat = (file: File) => {
  const extension = file.name.split('.').pop()?.toUpperCase() ?? '';
  const supported = ['FLAC', 'MP3', 'AAC', 'M4A', 'WAV', 'OGG', 'OPUS'];
  return supported.includes(extension) ? extension : 'UNKNOWN';
};

/*
 * 文件名只用于生成可编辑初稿："05. Artist - Title.flac" 会被拆成艺人和标题。
 * 这不是音频 Tag 解析，页面会明确保留原文件名，避免把猜测伪装成真实 metadata。
 */
const inferFromFileName = (fileName: string) => {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/^\s*\d+[.\s_-]+/, '').trim();
  const [artist, ...titleParts] = base.split(/\s+-\s+/);
  return titleParts.length > 0
    ? { artist: artist.trim(), title: titleParts.join(' - ').trim() }
    : { artist: '', title: base };
};

const initializeMusicAuthor = () => {
  const root = document.querySelector<HTMLElement>('[data-music-author]');
  if (!root || initializedAuthorPages.has(root)) return;
  initializedAuthorPages.add(root);

  const fileInput = root.querySelector<HTMLInputElement>('[data-music-import-files]');
  const list = root.querySelector<HTMLOListElement>('[data-music-draft-list]');
  const empty = root.querySelector<HTMLElement>('[data-music-draft-empty]');
  const count = root.querySelector<HTMLElement>('[data-music-draft-count]');
  const status = root.querySelector<HTMLElement>('[data-music-author-status]');
  const form = root.querySelector<HTMLFormElement>('[data-music-metadata-form]');
  const fields = root.querySelector<HTMLFieldSetElement>('[data-music-metadata-fields]');
  const heading = root.querySelector<HTMLElement>('[data-music-editor-heading]');
  const saveButton = root.querySelector<HTMLButtonElement>('[data-music-metadata-save]');
  const removeButton = root.querySelector<HTMLButtonElement>('[data-music-draft-remove]');
  const exportButton = root.querySelector<HTMLButtonElement>('[data-music-drafts-export]');
  const clearButton = root.querySelector<HTMLButtonElement>('[data-music-drafts-clear]');
  const lyricsInput = root.querySelector<HTMLInputElement>('[data-music-lyrics-file]');
  const lyricsState = root.querySelector<HTMLElement>('[data-music-lyrics-state]');
  let drafts = readDrafts();
  let activeId: string | null = drafts[0]?.id ?? null;
  let clearArmed = false;
  let clearTimer: number | undefined;

  const setStatus = (message: string) => {
    if (status) status.textContent = message;
  };

  const getField = (name: string) => form?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;

  const renderEditor = () => {
    const active = drafts.find((draft) => draft.id === activeId) ?? null;
    if (fields) fields.disabled = !active;
    if (saveButton) saveButton.disabled = !active;
    if (removeButton) removeButton.disabled = !active;
    if (heading) heading.textContent = active ? active.fileName : '选择一条草稿';
    if (!active) {
      form?.reset();
      if (lyricsState) lyricsState.textContent = '尚未附加歌词';
      return;
    }

    const values: Record<string, string> = {
      id: active.id,
      title: active.title,
      artist: active.artist,
      album: active.album,
      discNumber: String(active.discNumber),
      trackNumber: active.trackNumber === null ? '' : String(active.trackNumber),
      year: active.year === null ? '' : String(active.year),
      genres: active.genres.join(' / '),
      visibility: active.visibility,
      note: active.note,
    };
    Object.entries(values).forEach(([name, value]) => {
      const field = getField(name);
      if (field) field.value = value;
    });
    if (lyricsState) lyricsState.textContent = active.lyrics
      ? `${active.lyrics.fileName} · ${active.lyrics.format.toUpperCase()}`
      : '尚未附加歌词';
  };

  const renderList = () => {
    if (!list) return;
    list.replaceChildren();
    drafts.forEach((draft, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const number = document.createElement('span');
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      const meta = document.createElement('small');
      button.type = 'button';
      button.dataset.musicDraftId = draft.id;
      button.ariaPressed = String(draft.id === activeId);
      number.textContent = String(index + 1).padStart(2, '0');
      title.textContent = draft.title || draft.fileName;
      meta.textContent = `${draft.artist || '未知艺人'} · ${draft.format} · ${(draft.fileSize / 1024 / 1024).toFixed(1)} MB`;
      copy.append(title, meta);
      button.append(number, copy);
      item.append(button);
      list.append(item);
    });
    if (empty) empty.hidden = drafts.length > 0;
    if (count) count.textContent = String(drafts.length);
    if (exportButton) exportButton.disabled = drafts.length === 0;
    if (clearButton) clearButton.disabled = drafts.length === 0;
    renderEditor();
  };

  fileInput?.addEventListener('change', () => {
    const files = [...(fileInput.files ?? [])];
    if (files.length === 0) return;
    const now = new Date().toISOString();
    const nextDrafts = files.map((file, index): MusicImportDraft => {
      const inferred = inferFromFileName(file.name);
      const trackMatch = file.name.match(/^\s*(\d+)/);
      return {
        id: `${Date.now()}-${index}-${file.name}`,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        format: detectFormat(file),
        title: inferred.title,
        artist: inferred.artist,
        album: '',
        discNumber: 1,
        trackNumber: trackMatch ? Number(trackMatch[1]) : null,
        year: null,
        genres: [],
        visibility: 'private',
        note: '',
        lyrics: null,
        addedAt: now,
      };
    });
    drafts = [...drafts, ...nextDrafts];
    activeId = nextDrafts[0]?.id ?? activeId;
    try {
      writeDrafts(drafts);
      setStatus(`已建立 ${nextDrafts.length} 条元数据草稿；音频原文件未被保存或上传。`);
    } catch {
      setStatus('浏览器存储不可用，草稿只在当前页面暂存。');
    }
    fileInput.value = '';
    renderList();
  });

  list?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-music-draft-id]');
    if (!button?.dataset.musicDraftId) return;
    activeId = button.dataset.musicDraftId;
    renderList();
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const active = drafts.find((draft) => draft.id === activeId);
    if (!active) return;
    const numberOrNull = (name: string) => {
      const value = getField(name)?.value.trim() ?? '';
      return value ? Number(value) : null;
    };
    active.title = getField('title')?.value.trim() || active.title;
    active.artist = getField('artist')?.value.trim() || active.artist;
    active.album = getField('album')?.value.trim() ?? '';
    active.discNumber = numberOrNull('discNumber') ?? 1;
    active.trackNumber = numberOrNull('trackNumber');
    active.year = numberOrNull('year');
    active.genres = (getField('genres')?.value ?? '').split('/').map((value) => value.trim()).filter(Boolean);
    active.visibility = (getField('visibility')?.value ?? 'private') as MusicImportDraft['visibility'];
    active.note = getField('note')?.value.trim() ?? '';
    writeDrafts(drafts);
    setStatus(`已保存 ${active.title} 的元数据草稿。`);
    renderList();
  });

  lyricsInput?.addEventListener('change', async () => {
    const active = drafts.find((draft) => draft.id === activeId);
    const file = lyricsInput.files?.[0];
    if (!active || !file) return;
    active.lyrics = {
      fileName: file.name,
      format: file.name.toLowerCase().endsWith('.lrc') ? 'lrc' : 'plain',
      content: await file.text(),
    };
    writeDrafts(drafts);
    renderEditor();
    setStatus(`已附加歌词文件 ${file.name}。`);
    lyricsInput.value = '';
  });

  removeButton?.addEventListener('click', () => {
    if (!activeId) return;
    drafts = drafts.filter((draft) => draft.id !== activeId);
    activeId = drafts[0]?.id ?? null;
    writeDrafts(drafts);
    setStatus('已移除元数据草稿；原始音频文件未受影响。');
    renderList();
  });

  exportButton?.addEventListener('click', () => {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), drafts }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `asymptote-music-import-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('导入清单已导出。');
  });

  clearButton?.addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      clearButton.textContent = '再次确认清空';
      clearTimer = window.setTimeout(() => {
        clearArmed = false;
        clearButton.textContent = '清空本地草稿';
      }, 4000);
      return;
    }
    if (clearTimer !== undefined) window.clearTimeout(clearTimer);
    clearArmed = false;
    drafts = [];
    activeId = null;
    window.localStorage.removeItem(DRAFTS_STORAGE_KEY);
    clearButton.textContent = '清空本地草稿';
    setStatus('本地元数据草稿已清空；原始音频文件未受影响。');
    renderList();
  });

  renderList();
};

document.addEventListener('astro:page-load', initializeMusicAuthor);
initializeMusicAuthor();
