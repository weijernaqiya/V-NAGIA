import { playMusicCollection } from './music-player-api';

interface LocalPlaylist {
  id: string;
  title: string;
  description: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'asymptote.music.local-playlists.v1';
const initializedManagers = new WeakSet<Element>();

const readPlaylists = (): LocalPlaylist[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocalPlaylist => (
      typeof item?.id === 'string'
      && typeof item?.title === 'string'
      && Array.isArray(item?.trackIds)
    )).map((item) => ({
      ...item,
      description: typeof item.description === 'string' ? item.description : '',
      trackIds: item.trackIds.filter((id): id is string => typeof id === 'string'),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
    }));
  } catch {
    return [];
  }
};

const createId = () => {
  if (typeof crypto.randomUUID === 'function') return `local-${crypto.randomUUID()}`;
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const initializeLocalPlaylists = () => {
  const root = document.querySelector<HTMLElement>('[data-music-local-playlists]');
  if (!root || initializedManagers.has(root)) return;
  initializedManagers.add(root);

  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  const createForm = root.querySelector<HTMLFormElement>('[data-local-playlist-create]');
  const index = root.querySelector<HTMLOListElement>('[data-local-playlist-list]');
  const indexEmpty = root.querySelector<HTMLElement>('[data-local-playlist-index-empty]');
  const empty = root.querySelector<HTMLElement>('[data-local-playlist-empty]');
  const editor = root.querySelector<HTMLFormElement>('[data-local-playlist-editor]');
  const status = root.querySelector<HTMLElement>('[data-local-playlist-status]');
  const titleInput = editor?.elements.namedItem('title') as HTMLInputElement | null;
  const descriptionInput = editor?.elements.namedItem('description') as HTMLTextAreaElement | null;
  const trackInputs = [...(editor?.querySelectorAll<HTMLInputElement>('input[name="track"]') ?? [])];
  const deleteButton = editor?.querySelector<HTMLButtonElement>('[data-local-playlist-delete]');

  let playlists = readPlaylists();
  let selectedId = playlists[0]?.id ?? null;
  let deleteArmed = false;
  let deleteTimer = 0;
  let statusTimer = 0;

  const selectedPlaylist = () => playlists.find((playlist) => playlist.id === selectedId) ?? null;

  const announce = (message: string) => {
    if (!status) return;
    window.clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = window.setTimeout(() => { status.textContent = ''; }, 4200);
  };

  const persist = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  };

  const resetDelete = () => {
    window.clearTimeout(deleteTimer);
    deleteArmed = false;
    if (deleteButton) deleteButton.textContent = '删除';
  };

  const updateOrderMarkers = () => {
    const playlist = selectedPlaylist();
    trackInputs.forEach((input) => {
      const order = playlist?.trackIds.indexOf(input.value) ?? -1;
      const marker = input.closest('label')?.querySelector<HTMLElement>('[data-local-playlist-order]');
      if (marker) marker.textContent = order >= 0 ? String(order + 1).padStart(2, '0') : '—';
    });
  };

  const renderEditor = () => {
    const playlist = selectedPlaylist();
    if (empty) empty.hidden = Boolean(playlist);
    if (!editor) return;
    editor.hidden = !playlist;
    if (!playlist) return;

    if (titleInput) titleInput.value = playlist.title;
    if (descriptionInput) descriptionInput.value = playlist.description;
    trackInputs.forEach((input) => { input.checked = playlist.trackIds.includes(input.value); });
    updateOrderMarkers();
    resetDelete();
  };

  const renderIndex = () => {
    if (!index) return;
    index.replaceChildren();
    playlists.forEach((playlist, order) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const number = document.createElement('span');
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      const count = document.createElement('small');
      button.type = 'button';
      button.dataset.localPlaylistSelect = playlist.id;
      button.ariaPressed = String(playlist.id === selectedId);
      number.textContent = String(order + 1).padStart(2, '0');
      title.textContent = playlist.title;
      count.textContent = `${playlist.trackIds.length} 首曲目`;
      copy.append(title, count);
      button.append(number, copy);
      item.append(button);
      index.append(item);
    });
    if (indexEmpty) indexEmpty.hidden = playlists.length > 0;
  };

  const render = () => {
    renderIndex();
    renderEditor();
  };

  createForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = createForm.elements.namedItem('title') as HTMLInputElement | null;
    const title = input?.value.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const playlist: LocalPlaylist = {
      id: createId(), title, description: '', trackIds: [], createdAt: now, updatedAt: now,
    };
    playlists.push(playlist);
    selectedId = playlist.id;
    persist();
    createForm.reset();
    render();
    titleInput?.focus();
    announce('本地歌单已建立。');
  }, { signal });

  index?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-local-playlist-select]');
    if (!button?.dataset.localPlaylistSelect) return;
    selectedId = button.dataset.localPlaylistSelect;
    render();
  }, { signal });

  editor?.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.name !== 'track') return;
    const playlist = selectedPlaylist();
    if (!playlist) return;
    if (event.target.checked && !playlist.trackIds.includes(event.target.value)) {
      playlist.trackIds.push(event.target.value);
    } else if (!event.target.checked) {
      playlist.trackIds = playlist.trackIds.filter((id) => id !== event.target.value);
    }
    updateOrderMarkers();
  }, { signal });

  editor?.addEventListener('submit', (event) => {
    event.preventDefault();
    const playlist = selectedPlaylist();
    const title = titleInput?.value.trim();
    if (!playlist || !title) return;
    playlist.title = title;
    playlist.description = descriptionInput?.value.trim() ?? '';
    playlist.updatedAt = new Date().toISOString();
    persist();
    renderIndex();
    announce('歌单更改已保存在当前浏览器。');
  }, { signal });

  editor?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    const playlist = selectedPlaylist();
    if (!button || !playlist) return;

    if (button.matches('[data-local-playlist-play]')) {
      if (playlist.trackIds.length === 0) {
        announce('先为这条路径选择曲目。');
        return;
      }
      playMusicCollection(playlist.trackIds, 'playlist');
      announce(`开始播放《${playlist.title}》。`);
      return;
    }

    if (button.matches('[data-local-playlist-export]')) {
      const blob = new Blob([JSON.stringify(playlist, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `${playlist.title.replace(/[\\/:*?"<>|]/g, '-')}－ASYMPTOTE.json`;
      anchor.click();
      URL.revokeObjectURL(href);
      announce('歌单档案已导出。');
      return;
    }

    if (button.matches('[data-local-playlist-delete]')) {
      if (!deleteArmed) {
        deleteArmed = true;
        button.textContent = '再次确认';
        announce('再次点击以删除这份本地歌单。');
        deleteTimer = window.setTimeout(resetDelete, 3500);
        return;
      }
      playlists = playlists.filter((item) => item.id !== playlist.id);
      selectedId = playlists[0]?.id ?? null;
      persist();
      render();
      announce('本地歌单已删除。');
    }
  }, { signal });

  document.addEventListener('astro:before-swap', () => lifecycle.abort(), { once: true, signal });
  render();
};

document.addEventListener('astro:page-load', initializeLocalPlaylists);
initializeLocalPlaylists();
