import {
  MUSIC_PLAYER_EVENTS,
  addMusicToQueue,
  playMusicCollection,
  playMusicNext,
  playMusicTrack,
  type MusicPlayerSnapshot,
  type MusicQueueSource,
} from './music-player-api';

interface ClientTrack {
  id: string;
  slug: string;
  title: string;
  artist: string;
  album: string;
  albumSlug: string | null;
  format: string | null;
  favorite: boolean;
}

interface StoredHistoryEntry {
  id: string;
  trackId: string;
  playedAt: string;
  source: MusicQueueSource;
  completed: boolean;
}

const FAVORITES_STORAGE_KEY = 'asymptote.music.favorites.v1';
const HISTORY_STORAGE_KEY = 'asymptote.music.history.v1';
const LIBRARY_VIEW_STORAGE_KEY = 'asymptote.music.library-view.v1';
const initializedMusicSites = new WeakSet<Element>();
const SOURCE_LABELS: Record<MusicQueueSource, string> = {
  album: '专辑',
  playlist: '歌单',
  search: '搜索',
  manual: '手动',
  title: '标题画面',
};

const readCatalog = (root: Element): ClientTrack[] => {
  const node = root.querySelector<HTMLScriptElement>('[data-music-client-catalog]');
  if (!node?.textContent) return [];
  try {
    const parsed = JSON.parse(node.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readStringArray = (key: string, fallback: string[]) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : fallback;
  } catch {
    return fallback;
  }
};

const readHistory = (): StoredHistoryEntry[] => {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseQueue = (value: string | undefined) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const initializeMusicSite = () => {
  const root = document.querySelector<HTMLElement>('[data-music-site]');
  if (!root || initializedMusicSites.has(root)) return;
  initializedMusicSites.add(root);

  const catalog = readCatalog(root);
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  const defaultFavorites = catalog.filter((track) => track.favorite).map((track) => track.id);
  const favoriteIds = new Set(readStringArray(FAVORITES_STORAGE_KEY, defaultFavorites));
  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

  const applyLibraryView = (requested?: string) => {
    const library = root.querySelector<HTMLElement>('[data-music-library]');
    if (!library) return;
    let stored = requested;
    if (!stored) {
      try { stored = window.localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY) ?? 'archive'; }
      catch { stored = 'archive'; }
    }
    const view = stored === 'compact' ? 'compact' : 'archive';
    library.dataset.libraryView = view;
    root.querySelectorAll<HTMLButtonElement>('[data-music-library-view]').forEach((button) => {
      button.ariaPressed = String(button.dataset.musicLibraryView === view);
    });
    if (requested) window.localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, view);
  };

  const updatePlaybackButtons = (snapshot: MusicPlayerSnapshot) => {
    root.querySelectorAll<HTMLButtonElement>('[data-music-play-track]').forEach((button) => {
      const active = button.dataset.musicPlayTrack === snapshot.trackId;
      button.dataset.active = String(active);
      button.ariaPressed = String(active && snapshot.isPlaying);
      if (active) button.ariaLabel = snapshot.isPlaying ? '当前曲目正在播放' : '继续播放当前曲目';
    });
  };

  const updateFavoriteInterface = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-music-favorite]').forEach((button) => {
      const id = button.dataset.musicFavorite;
      const active = Boolean(id && favoriteIds.has(id));
      button.ariaPressed = String(active);
      button.dataset.active = String(active);
      const mark = button.querySelector<HTMLElement>('span');
      if (mark) mark.textContent = active ? '◆' : '◇';
    });
    root.querySelectorAll<HTMLElement>('[data-track-id]').forEach((item) => {
      item.dataset.favorite = String(favoriteIds.has(item.dataset.trackId ?? ''));
    });

    const favoritesPage = root.querySelector<HTMLElement>('[data-music-favorites-page]');
    if (favoritesPage) {
      let visible = 0;
      favoritesPage.querySelectorAll<HTMLElement>('[data-track-id]').forEach((item) => {
        const favorite = favoriteIds.has(item.dataset.trackId ?? '');
        item.hidden = !favorite;
        if (favorite) visible += 1;
      });
      const empty = favoritesPage.querySelector<HTMLElement>('.music-empty-state');
      if (empty) empty.hidden = visible > 0;
      const listEmpty = favoritesPage.querySelector<HTMLElement>('[data-music-filter-empty]');
      if (listEmpty) listEmpty.hidden = true;
    }
  };

  const applyLibraryFilter = () => {
    const form = root.querySelector<HTMLFormElement>('[data-music-filter-form]');
    if (!form) return;
    const query = form.querySelector<HTMLInputElement>('[data-music-filter-search]')?.value.trim().toLocaleLowerCase() ?? '';
    const genre = form.querySelector<HTMLSelectElement>('[data-music-filter-genre]')?.value ?? '';
    const format = form.querySelector<HTMLSelectElement>('[data-music-filter-format]')?.value ?? '';
    const favoritesOnly = form.querySelector<HTMLInputElement>('[data-music-filter-favorite]')?.checked ?? false;
    const sort = form.querySelector<HTMLSelectElement>('[data-music-filter-sort]')?.value ?? 'added-desc';
    const items = [...root.querySelectorAll<HTMLElement>('.music-track-list [data-music-catalog-item]')];

    items.forEach((item) => {
      const matches = (!query || (item.dataset.search ?? '').includes(query))
        && (!genre || (item.dataset.genre ?? '').split('|').includes(genre))
        && (!format || item.dataset.format === format)
        && (!favoritesOnly || favoriteIds.has(item.dataset.trackId ?? ''));
      item.hidden = !matches;
    });

    const visibleItems = items.filter((item) => !item.hidden);
    const compare = (a: HTMLElement, b: HTMLElement) => {
      if (sort === 'title-asc') return collator.compare(a.dataset.title ?? '', b.dataset.title ?? '');
      if (sort === 'artist-asc') return collator.compare(a.dataset.artist ?? '', b.dataset.artist ?? '');
      if (sort === 'year-desc') return Number(b.dataset.year ?? 0) - Number(a.dataset.year ?? 0);
      return (b.dataset.added ?? '').localeCompare(a.dataset.added ?? '');
    };
    visibleItems.sort(compare).forEach((item) => item.parentElement?.append(item));
    const counter = form.querySelector<HTMLElement>('[data-music-filter-count]');
    if (counter) counter.textContent = String(visibleItems.length);
    const empty = root.querySelector<HTMLElement>('[data-music-filter-empty]');
    if (empty) empty.hidden = visibleItems.length > 0;
  };

  const renderHistory = () => {
    const history = readHistory();
    root.querySelectorAll<HTMLOListElement>('[data-music-history-list]').forEach((list) => {
      const limit = Number(list.dataset.limit) || history.length;
      list.replaceChildren();
      history.slice(0, limit).forEach((entry, index) => {
        const track = catalog.find((item) => item.id === entry.trackId);
        if (!track) return;
        const item = document.createElement('li');
        const number = document.createElement('span');
        const copy = document.createElement('div');
        const link = document.createElement('a');
        const artist = document.createElement('small');
        const meta = document.createElement('p');
        const time = document.createElement('time');
        const play = document.createElement('button');
        number.textContent = String(index + 1).padStart(2, '0');
        link.href = `/music/track/${track.slug}`;
        link.textContent = track.title;
        artist.textContent = `${track.artist} · ${track.album}`;
        copy.append(link, artist);
        meta.textContent = SOURCE_LABELS[entry.source] ?? '手动';
        time.dateTime = entry.playedAt;
        time.textContent = new Intl.DateTimeFormat('zh-CN', {
          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date(entry.playedAt));
        play.type = 'button';
        play.dataset.musicPlayTrack = track.id;
        play.textContent = '播放';
        item.append(number, copy, meta, time, play);
        list.append(item);
      });
      const container = list.closest<HTMLElement>('.music-home-history, .music-history-page');
      const empty = container?.querySelector<HTMLElement>('.music-empty-state');
      if (empty) empty.hidden = list.children.length > 0;
    });
    const count = root.querySelector<HTMLElement>('[data-music-history-count]');
    if (count) count.textContent = String(history.length);
  };

  const applyGlobalSearch = () => {
    const page = root.querySelector<HTMLElement>('[data-music-search-page]');
    const input = page?.querySelector<HTMLInputElement>('[data-music-global-search]');
    if (!page || !input) return;
    const query = input.value.trim().toLocaleLowerCase();
    let total = 0;
    page.querySelectorAll<HTMLElement>('[data-music-search-group]').forEach((group) => {
      let groupCount = 0;
      group.querySelectorAll<HTMLElement>('[data-music-catalog-item]').forEach((item) => {
        const visible = query.length > 0 && (item.dataset.search ?? '').includes(query);
        item.hidden = !visible;
        if (visible) groupCount += 1;
      });
      group.hidden = query.length === 0 || groupCount === 0;
      total += groupCount;
    });
    const status = page.querySelector<HTMLElement>('[data-music-search-status]');
    if (status) status.textContent = query.length === 0
      ? '输入关键词开始搜索'
      : total > 0 ? `找到 ${total} 条相关资料` : '没有找到相关资料';
  };

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;

    const playId = button.dataset.musicPlayTrack;
    if (playId) {
      const list = button.closest<HTMLElement>('[data-music-track-list]');
      const queue = parseQueue(list?.dataset.queue);
      const source = (button.dataset.queueSource ?? list?.dataset.queueSource ?? 'manual') as MusicQueueSource;
      playMusicTrack(playId, { queue: queue.length > 0 ? queue : undefined, source });
      return;
    }
    if (button.dataset.musicLibraryView) {
      applyLibraryView(button.dataset.musicLibraryView);
      return;
    }
    if (button.dataset.musicPlayCollection) {
      const ids = parseQueue(button.dataset.musicPlayCollection);
      const source = (button.dataset.queueSource ?? 'manual') as MusicQueueSource;
      playMusicCollection(ids, source);
      return;
    }
    if (button.dataset.musicAddQueue) {
      addMusicToQueue(button.dataset.musicAddQueue);
      return;
    }
    if (button.dataset.musicPlayNext) {
      playMusicNext(button.dataset.musicPlayNext);
      return;
    }
    if (button.dataset.musicFavorite) {
      const id = button.dataset.musicFavorite;
      if (favoriteIds.has(id)) favoriteIds.delete(id);
      else favoriteIds.add(id);
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteIds]));
      updateFavoriteInterface();
      applyLibraryFilter();
      return;
    }
    if (button.matches('[data-music-history-clear]')) {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
      renderHistory();
    }
  }, { signal });

  const filterForm = root.querySelector<HTMLFormElement>('[data-music-filter-form]');
  filterForm?.addEventListener('input', applyLibraryFilter, { signal });
  filterForm?.addEventListener('change', (event) => {
    /*
     * 搜索框失焦也会触发 change。如果此时重新 append 曲目行，节点会在
     * pointerdown 与 click 之间被搬移，导致用户紧接着按收藏时点击丢失。
     * 搜索已经由 input 实时处理，因此这里只响应下拉框与复选框。
     */
    if (event.target instanceof HTMLInputElement && event.target.type === 'search') return;
    applyLibraryFilter();
  }, { signal });
  root.querySelector<HTMLInputElement>('[data-music-global-search]')?.addEventListener('input', applyGlobalSearch, { signal });
  window.addEventListener(MUSIC_PLAYER_EVENTS.stateChange, (event) => {
    updatePlaybackButtons((event as CustomEvent<MusicPlayerSnapshot>).detail);
  }, { signal });
  window.addEventListener('asymptote:music-history-change', renderHistory, { signal });
  document.addEventListener('astro:before-swap', () => lifecycle.abort(), { once: true, signal });

  updateFavoriteInterface();
  applyLibraryView();
  applyLibraryFilter();
  applyGlobalSearch();
  renderHistory();
  window.dispatchEvent(new CustomEvent(MUSIC_PLAYER_EVENTS.stateRequest));
};

document.addEventListener('astro:page-load', initializeMusicSite);
initializeMusicSite();
