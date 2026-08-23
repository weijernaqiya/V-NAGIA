import { MUSIC_PLAYER_CONFIG } from '../config/musicPlayer';
import { TITLE_TIMELINE } from '../config/titleTimeline';
import { DEFAULT_MUSIC_TRACK_ID, type MusicPlayerTrack } from '../data/music';
import {
  MUSIC_PLAYER_EVENTS,
  type MusicPlayerSnapshot,
  type MusicQueueSource,
  type MusicRepeatMode,
  type PlayCollectionRequest,
  type PlayTrackRequest,
  type QueueTrackRequest,
  type TitleSequenceRequest,
} from './music-player-api';

interface ResolvedMusicTrack extends MusicPlayerTrack {
  available: boolean;
  supported: boolean;
}

type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'unavailable';

interface PlayerState {
  currentTrackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  queue: string[];
  playOrder: string[];
  queueSource: MusicQueueSource;
  shuffle: boolean;
  repeat: MusicRepeatMode;
  expanded: boolean;
  full: boolean;
  queueOpen: boolean;
  visible: boolean;
  loading: boolean;
  status: PlayerStatus;
  error: string | null;
}

interface PersistedPlayerState {
  version: 2;
  trackId: string | null;
  currentTime: number;
  volume: number;
  muted: boolean;
  queue: string[];
  playOrder: string[];
  queueSource: MusicQueueSource;
  shuffle: boolean;
  repeat: MusicRepeatMode;
}

interface StoredHistoryEntry {
  id: string;
  trackId: string;
  playedAt: string;
  source: MusicQueueSource;
  completed: boolean;
}

const PLAYER_STORAGE_KEY = 'asymptote.music.player.v2';
const HISTORY_STORAGE_KEY = 'asymptote.music.history.v1';
const MAX_HISTORY_ENTRIES = 200;
const SOURCE_LABELS: Record<MusicQueueSource, string> = {
  album: '专辑',
  playlist: '歌单',
  search: '搜索',
  manual: '手动',
  title: '标题画面',
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"]'));
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const shuffleIds = (ids: readonly string[], currentTrackId: string | null) => {
  const remaining = ids.filter((id) => id !== currentTrackId);
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [remaining[index], remaining[swapIndex]] = [remaining[swapIndex], remaining[index]];
  }
  return currentTrackId && ids.includes(currentTrackId)
    ? [currentTrackId, ...remaining]
    : remaining;
};

/*
 * 模块级 Audio 是全站唯一的音频引擎。Astro ClientRouter 交换页面时，
 * Web Component 的界面可以被搬移，但这个媒体对象、缓冲和播放位置不会重建。
 */
const GLOBAL_AUDIO = new Audio();
GLOBAL_AUDIO.preload = 'metadata';

class AsymptoteMusicPlayer extends HTMLElement {
  private tracks: ResolvedMusicTrack[] = [];
  private audio: HTMLAudioElement | null = null;
  private state: PlayerState = {
    currentTrackId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: MUSIC_PLAYER_CONFIG.defaultVolume,
    muted: false,
    queue: [],
    playOrder: [],
    queueSource: 'manual',
    shuffle: false,
    repeat: 'off',
    expanded: false,
    full: false,
    queueOpen: false,
    visible: false,
    loading: false,
    status: 'idle',
    error: null,
  };
  private seeking = false;
  private fadeFrame: number | undefined;
  private fadeResolve: ((completed: boolean) => void) | null = null;
  private revealTimer: number | undefined;
  private focusTimer: number | undefined;
  private switchRequest = 0;
  private initialized = false;
  private events = new AbortController();
  private pendingSeek: number | null = null;
  private lastPersistAt = 0;
  private historyToken: string | null = null;
  private requestedHistorySource: MusicQueueSource = 'manual';

  connectedCallback() {
    if (this.initialized && !this.events.signal.aborted) return;
    if (this.events.signal.aborted) this.events = new AbortController();

    this.setAttribute('data-enhanced', '');
    if (!this.initialized) {
      this.audio = GLOBAL_AUDIO;
      this.tracks = this.readTracks();
      this.state.visible = this.dataset.visible === 'true';
      this.restorePlayerState();
      this.hydrateStateFromAudio();
    }

    this.bindControls();
    this.bindAudioEvents();
    this.configureMediaSession();
    this.initialized = true;
    this.render();
  }

  disconnectedCallback() {
    /*
     * ClientRouter 在 DOM swap 中会短暂移走持久化节点。
     * 微任务后仍未连接才释放界面监听；模块级 Audio 不会被销毁。
     */
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.events.abort();
      this.cancelFade();
      if (this.revealTimer !== undefined) window.clearTimeout(this.revealTimer);
      if (this.focusTimer !== undefined) window.clearTimeout(this.focusTimer);
    });
  }

  private readTracks() {
    const node = this.querySelector<HTMLScriptElement>('[data-player-tracks]');
    if (!node?.textContent) return [];

    try {
      const parsed = JSON.parse(node.textContent) as Array<MusicPlayerTrack & { available: boolean }>;
      return parsed.map((track) => {
        const mimeType = track.format ? this.getMimeType(track.format) : '';
        const supported = Boolean(track.src)
          && (!mimeType || Boolean(GLOBAL_AUDIO.canPlayType(mimeType)));
        return { ...track, supported, available: track.available && supported };
      });
    } catch (error) {
      console.error('[ASYMPTOTE Player] 无法读取曲目数据。', error);
      return [];
    }
  }

  private getMimeType(format: string) {
    const mimeTypes: Record<string, string> = {
      FLAC: 'audio/flac',
      MP3: 'audio/mpeg',
      AAC: 'audio/aac',
      M4A: 'audio/mp4',
      WAV: 'audio/wav',
      OGG: 'audio/ogg',
      OPUS: 'audio/ogg; codecs=opus',
    };
    return mimeTypes[format.toUpperCase()] ?? '';
  }

  /*
   * 刷新恢复只还原曲目、队列、进度、音量与播放模式，不主动调用 play()。
   * 浏览器要求有声播放必须来自用户手势，因此恢复后保持暂停并等待用户继续。
   */
  private restorePlayerState() {
    const playableIds = this.tracks.filter((track) => track.available).map((track) => track.id);
    const fallbackTrackId = playableIds.includes(DEFAULT_MUSIC_TRACK_ID)
      ? DEFAULT_MUSIC_TRACK_ID
      : playableIds[0] ?? null;

    try {
      const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY);
      const stored = raw ? JSON.parse(raw) as Partial<PersistedPlayerState> : null;
      if (!stored || stored.version !== 2) throw new Error('No compatible player state');

      const validQueue = Array.isArray(stored.queue)
        ? stored.queue.filter((id): id is string => typeof id === 'string' && this.hasTrack(id))
        : [];
      const queue = validQueue.length > 0 ? [...new Set(validQueue)] : playableIds;
      const trackId = typeof stored.trackId === 'string' && this.hasTrack(stored.trackId)
        ? stored.trackId
        : fallbackTrackId;
      if (trackId && !queue.includes(trackId)) queue.unshift(trackId);

      this.state.currentTrackId = trackId;
      this.state.currentTime = Number.isFinite(stored.currentTime) ? Math.max(0, Number(stored.currentTime)) : 0;
      this.pendingSeek = this.state.currentTime;
      this.state.volume = Number.isFinite(stored.volume)
        ? clamp(Number(stored.volume), 0, 1)
        : MUSIC_PLAYER_CONFIG.defaultVolume;
      this.state.muted = stored.muted === true;
      this.state.queue = queue;
      this.state.queueSource = this.isQueueSource(stored.queueSource) ? stored.queueSource : 'manual';
      this.state.shuffle = stored.shuffle === true;
      this.state.repeat = this.isRepeatMode(stored.repeat) ? stored.repeat : 'off';

      const storedOrder = Array.isArray(stored.playOrder)
        ? stored.playOrder.filter((id): id is string => typeof id === 'string' && queue.includes(id))
        : [];
      this.state.playOrder = this.state.shuffle && storedOrder.length === queue.length
        ? storedOrder
        : this.createPlayOrder();
    } catch {
      this.state.currentTrackId = fallbackTrackId;
      this.state.queue = playableIds;
      this.state.playOrder = playableIds;
    }
  }

  private hydrateStateFromAudio() {
    if (!this.audio) return;
    const activeTrackId = this.audio.dataset.trackId;

    if (activeTrackId && this.hasTrack(activeTrackId)) {
      this.state.currentTrackId = activeTrackId;
      this.state.currentTime = this.audio.currentTime;
      this.state.duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
      this.state.volume = Number(this.audio.dataset.playerVolume) || this.audio.volume;
      this.state.muted = this.audio.muted;
      this.state.visible = this.state.visible || this.audio.dataset.playerVisible === 'true';
      this.state.status = this.audio.paused ? 'paused' : 'playing';
      this.state.isPlaying = !this.audio.paused;
      return;
    }

    this.audio.volume = this.state.volume;
    this.audio.muted = this.state.muted;
    if (this.state.currentTrackId) this.loadTrack(this.state.currentTrackId, false);
  }

  private bindControls() {
    const signal = this.events.signal;

    this.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>('button');
      if (!target || !this.contains(target)) return;

      if (target.matches('[data-player-close]')) {
        this.setExpanded(false);
        return;
      }
      if (target.matches('[data-player-collapsed]')) {
        this.setExpanded(true);
        return;
      }
      if (target.matches('[data-player-full-toggle]')) {
        this.setFull(!this.state.full);
        return;
      }
      if (target.matches('[data-player-queue-clear]')) {
        this.clearQueue();
        return;
      }
      if (target.matches('[data-player-retry]')) {
        if (this.state.currentTrackId) void this.playTrack(this.state.currentTrackId, false);
        return;
      }
      if (target.matches('[data-player-skip]')) {
        void this.changeTrack(1, false);
        return;
      }

      const queueTrack = target.dataset.playerQueueTrack;
      if (queueTrack) {
        void this.playTrack(queueTrack, true);
        return;
      }
      const removeId = target.dataset.playerQueueRemove;
      if (removeId) {
        this.removeFromQueue(removeId);
        return;
      }
      const upId = target.dataset.playerQueueUp;
      if (upId) {
        this.moveQueueTrack(upId, -1);
        return;
      }
      const downId = target.dataset.playerQueueDown;
      if (downId) this.moveQueueTrack(downId, 1);
    }, { signal });

    this.querySelector<HTMLButtonElement>('[data-player-playback]')?.addEventListener(
      'click', () => void this.togglePlayback(), { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-previous]')?.addEventListener(
      'click', () => void this.changeTrack(-1, false), { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-next]')?.addEventListener(
      'click', () => void this.changeTrack(1, false), { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-shuffle]')?.addEventListener(
      'click', () => this.toggleShuffle(), { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-repeat]')?.addEventListener(
      'click', () => this.cycleRepeat(), { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-mute]')?.addEventListener(
      'click', () => this.toggleMute(), { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-queue-toggle]')?.addEventListener(
      'click', () => this.setQueueOpen(!this.state.queueOpen), { signal },
    );

    const progress = this.querySelector<HTMLInputElement>('[data-player-progress]');
    progress?.addEventListener('input', () => this.seekFromControl(progress), { signal });
    progress?.addEventListener('change', () => {
      this.seeking = false;
      this.renderProgress();
      this.persistState(true);
    }, { signal });

    const volume = this.querySelector<HTMLInputElement>('[data-player-volume]');
    volume?.addEventListener('input', () => this.setVolume(Number(volume.value) / 100), { signal });

    window.addEventListener(MUSIC_PLAYER_EVENTS.titleSequence, (event) => {
      this.handleTitleSequence((event as CustomEvent<TitleSequenceRequest>).detail);
    }, { signal });
    window.addEventListener(MUSIC_PLAYER_EVENTS.playTrack, (event) => {
      const request = (event as CustomEvent<PlayTrackRequest>).detail;
      if (!request?.trackId) return;
      if (request.queue?.length) this.setQueue(request.queue, request.source ?? 'manual');
      this.requestedHistorySource = request.source ?? this.state.queueSource;
      void this.playTrack(request.trackId, true);
    }, { signal });
    window.addEventListener(MUSIC_PLAYER_EVENTS.playCollection, (event) => {
      this.playCollection((event as CustomEvent<PlayCollectionRequest>).detail);
    }, { signal });
    window.addEventListener(MUSIC_PLAYER_EVENTS.addToQueue, (event) => {
      const request = (event as CustomEvent<QueueTrackRequest>).detail;
      if (request?.trackId) this.addToQueue(request.trackId, false);
    }, { signal });
    window.addEventListener(MUSIC_PLAYER_EVENTS.playNext, (event) => {
      const request = (event as CustomEvent<QueueTrackRequest>).detail;
      if (request?.trackId) this.addToQueue(request.trackId, true);
    }, { signal });
    window.addEventListener(MUSIC_PLAYER_EVENTS.stateRequest, () => this.dispatchSnapshot(), { signal });
    window.addEventListener('keydown', (event) => this.handleKeyboard(event), {
      signal,
      capture: true,
    });
  }

  private bindAudioEvents() {
    if (!this.audio) return;
    const signal = this.events.signal;
    const audio = this.audio;

    audio.addEventListener('loadedmetadata', () => {
      this.state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (this.pendingSeek !== null && this.state.duration > 0) {
        audio.currentTime = Math.min(this.pendingSeek, Math.max(0, this.state.duration - 0.25));
        this.state.currentTime = audio.currentTime;
        this.pendingSeek = null;
      }
      this.state.loading = false;
      this.state.status = audio.paused ? 'paused' : 'playing';
      this.render();
    }, { signal });

    audio.addEventListener('durationchange', () => {
      this.state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      this.renderProgress();
    }, { signal });

    audio.addEventListener('timeupdate', () => {
      if (!this.seeking) this.state.currentTime = audio.currentTime;
      this.renderProgress();
      this.updateMediaPosition();
      this.persistState();
    }, { signal });

    audio.addEventListener('waiting', () => {
      this.state.loading = true;
      this.state.status = 'loading';
      this.render();
    }, { signal });

    audio.addEventListener('playing', () => {
      this.state.isPlaying = true;
      this.state.loading = false;
      this.state.status = 'playing';
      this.recordHistory();
      this.render();
      this.updateMediaPlaybackState();
    }, { signal });

    audio.addEventListener('pause', () => {
      if (this.state.status === 'unavailable') return;
      this.state.isPlaying = false;
      this.state.loading = false;
      this.state.status = 'paused';
      this.render();
      this.updateMediaPlaybackState();
      this.persistState(true);
    }, { signal });

    audio.addEventListener('ended', () => {
      this.markHistoryCompleted();
      void this.changeTrack(1, true);
    }, { signal });

    audio.addEventListener('error', () => {
      this.markUnavailable('播放失败', audio.error);
    }, { signal });
  }

  private handleTitleSequence(request: TitleSequenceRequest) {
    if (!request) return;
    this.scheduleReveal(request.sequenceStart);

    /* 返回首页时不得用标题曲覆盖正在播放的队列。 */
    if (!this.audio?.dataset.trackId && this.state.currentTrackId === null) {
      this.state.currentTrackId = DEFAULT_MUSIC_TRACK_ID;
    }
    if (!this.audio?.dataset.trackId && this.state.currentTrackId) {
      this.loadTrack(this.state.currentTrackId, false);
    }
    this.render();
  }

  private scheduleReveal(sequenceStart: number) {
    if (this.state.visible) return;
    if (this.revealTimer !== undefined) window.clearTimeout(this.revealTimer);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealAt = reducedMotion ? TITLE_TIMELINE.reducedReveal : TITLE_TIMELINE.screenComplete;
    const remaining = Math.max(0, revealAt - (performance.now() - sequenceStart));

    this.revealTimer = window.setTimeout(() => {
      this.revealTimer = undefined;
      this.state.visible = true;
      this.render();
    }, remaining);
  }

  private loadTrack(trackId: string, preserveCurrent: boolean) {
    if (!this.audio) return false;
    const track = this.getTrack(trackId);
    if (!track) {
      this.markUnavailable('曲目不存在', `Unknown track: ${trackId}`);
      return false;
    }

    const isCurrent = this.audio.dataset.trackId === track.id;
    this.state.currentTrackId = track.id;
    this.state.error = null;

    if (preserveCurrent && isCurrent && this.audio.getAttribute('src')) {
      this.updateMediaMetadata();
      return true;
    }

    this.cancelFade();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.dataset.trackId = track.id;
    this.audio.loop = false;
    this.state.currentTime = 0;
    this.state.duration = 0;
    this.state.isPlaying = false;
    this.historyToken = null;

    if (!track.available || !track.src) {
      this.audio.load();
      this.markUnavailable(track.supported ? '音频文件不可用' : '浏览器不支持此格式', track.src);
      return false;
    }

    this.audio.src = track.src;
    this.audio.preload = 'metadata';
    this.state.loading = true;
    this.state.status = 'loading';
    this.audio.load();
    this.updateMediaMetadata();
    this.render();
    this.persistState(true);
    return true;
  }

  private async playTrack(trackId: string, fade: boolean) {
    const track = this.getTrack(trackId);
    if (!track) {
      this.markUnavailable('曲目不存在', trackId);
      return;
    }

    this.state.visible = true;
    if (!this.state.queue.includes(trackId)) this.addToQueue(trackId, false);

    if (trackId === this.state.currentTrackId && this.audio?.dataset.trackId === trackId) {
      if (!this.audio.getAttribute('src') && !this.loadTrack(trackId, false)) return;
      if (this.audio.paused) await this.resumePlayback();
      this.setQueueOpen(false);
      return;
    }

    const requestId = ++this.switchRequest;
    if (fade && this.audio && !this.audio.paused) {
      await this.fadeAudioTo(0, MUSIC_PLAYER_CONFIG.switchFadeOutDuration);
      if (requestId !== this.switchRequest) return;
    }

    this.pendingSeek = null;
    if (!this.loadTrack(trackId, false) || !this.audio) return;
    this.audio.volume = fade ? 0 : this.state.volume;
    this.audio.muted = this.state.muted;

    try {
      await this.audio.play();
      if (fade) void this.fadeAudioTo(this.state.volume, MUSIC_PLAYER_CONFIG.switchFadeInDuration);
      this.setQueueOpen(false);
    } catch (error) {
      this.markUnavailable('无法开始播放', error);
    }
  }

  private playCollection(request: PlayCollectionRequest) {
    if (!request?.trackIds?.length) return;
    this.setQueue(request.trackIds, request.source);
    const startTrackId = request.startTrackId && this.state.queue.includes(request.startTrackId)
      ? request.startTrackId
      : this.state.queue.find((id) => this.getTrack(id)?.available);
    if (!startTrackId) {
      this.markUnavailable('此集合没有可播放音频', request.trackIds);
      return;
    }
    this.requestedHistorySource = request.source;
    void this.playTrack(startTrackId, true);
  }

  private async togglePlayback() {
    if (!this.audio || !this.currentTrack?.available) return;
    if (!this.audio.getAttribute('src') && !this.loadTrack(this.currentTrack.id, false)) return;
    if (this.audio.paused) await this.resumePlayback();
    else await this.pausePlayback();
  }

  private async pausePlayback() {
    if (!this.audio || this.audio.paused) return;
    const completed = await this.fadeAudioTo(0, MUSIC_PLAYER_CONFIG.pauseFadeDuration);
    if (!completed) return;
    this.audio.pause();
    this.audio.volume = this.state.volume;
  }

  private async resumePlayback() {
    if (!this.audio || !this.currentTrack?.available) return;
    if (!this.audio.getAttribute('src') && !this.loadTrack(this.currentTrack.id, false)) return;
    this.cancelFade();
    this.audio.volume = 0;
    try {
      await this.audio.play();
      void this.fadeAudioTo(this.state.volume, MUSIC_PLAYER_CONFIG.resumeFadeDuration);
    } catch (error) {
      this.markUnavailable('无法继续播放', error);
    }
  }

  private async changeTrack(direction: -1 | 1, fromEnded: boolean) {
    if (!this.audio) return;
    if (!fromEnded && direction === -1 && this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    if (fromEnded && this.state.repeat === 'one' && this.currentTrack?.available) {
      this.audio.currentTime = 0;
      await this.resumePlayback();
      return;
    }

    const playable = this.state.playOrder.filter((id) => this.getTrack(id)?.available);
    if (playable.length === 0) return;
    const currentIndex = playable.indexOf(this.state.currentTrackId ?? '');
    const base = currentIndex >= 0 ? currentIndex : 0;
    let nextIndex = base + direction;

    if (nextIndex < 0 || nextIndex >= playable.length) {
      if (!fromEnded || this.state.repeat === 'all') {
        nextIndex = direction > 0 ? 0 : playable.length - 1;
      } else {
        this.state.isPlaying = false;
        this.state.status = 'paused';
        this.render();
        this.persistState(true);
        return;
      }
    }

    this.requestedHistorySource = this.state.queueSource;
    await this.playTrack(playable[nextIndex], true);
  }

  private setQueue(trackIds: readonly string[], source: MusicQueueSource) {
    const queue = [...new Set(trackIds.filter((id) => this.hasTrack(id)))];
    if (queue.length === 0) return;
    this.state.queue = queue;
    this.state.queueSource = source;
    this.state.playOrder = this.createPlayOrder();
    this.persistState(true);
    this.renderQueue();
  }

  private addToQueue(trackId: string, next: boolean) {
    if (!this.hasTrack(trackId)) return;
    const queue = this.state.queue.filter((id) => id !== trackId);
    if (next && this.state.currentTrackId) {
      const currentIndex = Math.max(0, queue.indexOf(this.state.currentTrackId));
      queue.splice(currentIndex + 1, 0, trackId);
    } else {
      queue.push(trackId);
    }
    this.state.queue = queue;
    this.state.queueSource = 'manual';
    this.state.playOrder = this.createPlayOrder();
    this.render();
    this.persistState(true);
  }

  private removeFromQueue(trackId: string) {
    if (trackId === this.state.currentTrackId || this.state.queue.length <= 1) return;
    this.state.queue = this.state.queue.filter((id) => id !== trackId);
    this.state.playOrder = this.state.playOrder.filter((id) => id !== trackId);
    this.render();
    this.persistState(true);
  }

  private clearQueue() {
    if (!this.state.currentTrackId) return;
    this.state.queue = [this.state.currentTrackId];
    this.state.playOrder = [...this.state.queue];
    this.state.shuffle = false;
    this.state.queueSource = 'manual';
    this.render();
    this.persistState(true);
  }

  private moveQueueTrack(trackId: string, direction: -1 | 1) {
    const index = this.state.queue.indexOf(trackId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.state.queue.length) return;
    const queue = [...this.state.queue];
    [queue[index], queue[target]] = [queue[target], queue[index]];
    this.state.queue = queue;
    this.state.playOrder = this.createPlayOrder();
    this.render();
    this.persistState(true);
  }

  private createPlayOrder() {
    return this.state.shuffle
      ? shuffleIds(this.state.queue, this.state.currentTrackId)
      : [...this.state.queue];
  }

  private toggleShuffle() {
    this.state.shuffle = !this.state.shuffle;
    this.state.playOrder = this.createPlayOrder();
    this.render();
    this.persistState(true);
  }

  private cycleRepeat() {
    const next: Record<MusicRepeatMode, MusicRepeatMode> = { off: 'all', all: 'one', one: 'off' };
    this.state.repeat = next[this.state.repeat];
    this.render();
    this.persistState(true);
  }

  private toggleMute() {
    if (!this.audio) return;
    this.state.muted = !this.state.muted;
    this.audio.muted = this.state.muted;
    this.render();
    this.persistState(true);
  }

  private setVolume(value: number) {
    this.state.volume = clamp(value, 0, 1);
    if (!this.audio) return;
    this.cancelFade();
    this.audio.volume = this.state.volume;
    if (this.state.volume > 0) {
      this.state.muted = false;
      this.audio.muted = false;
    }
    this.render();
    this.persistState(true);
  }

  private seekFromControl(control: HTMLInputElement) {
    if (!this.audio || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
    this.seeking = true;
    const ratio = Number(control.value) / MUSIC_PLAYER_CONFIG.progressSteps;
    this.audio.currentTime = this.audio.duration * ratio;
    this.state.currentTime = this.audio.currentTime;
    this.renderProgress();
  }

  private seekBy(seconds: number) {
    if (!this.audio || !Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = clamp(this.audio.currentTime + seconds, 0, this.audio.duration);
  }

  private fadeAudioTo(target: number, duration: number, delay = 0) {
    if (!this.audio) return Promise.resolve(false);
    this.cancelFade();
    const audio = this.audio;
    const from = audio.volume;
    const startedAt = performance.now() + delay;

    return new Promise<boolean>((resolve) => {
      this.fadeResolve = resolve;
      const update = (now: number) => {
        if (now < startedAt) {
          this.fadeFrame = requestAnimationFrame(update);
          return;
        }
        const progress = Math.min(1, (now - startedAt) / Math.max(1, duration));
        const eased = progress * progress * (3 - 2 * progress);
        audio.volume = from + (target - from) * eased;
        if (progress < 1) {
          this.fadeFrame = requestAnimationFrame(update);
          return;
        }
        this.fadeFrame = undefined;
        this.fadeResolve = null;
        resolve(true);
      };
      this.fadeFrame = requestAnimationFrame(update);
    });
  }

  private cancelFade() {
    if (this.fadeFrame !== undefined) cancelAnimationFrame(this.fadeFrame);
    this.fadeFrame = undefined;
    this.fadeResolve?.(false);
    this.fadeResolve = null;
  }

  private markUnavailable(message: string, detail: unknown) {
    this.cancelFade();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
    this.state.isPlaying = false;
    this.state.loading = false;
    this.state.status = 'unavailable';
    this.state.error = message;
    console.warn('[ASYMPTOTE Player]', detail);
    this.render();
    this.updateMediaPlaybackState();
  }

  private setExpanded(expanded: boolean) {
    if (this.focusTimer !== undefined) window.clearTimeout(this.focusTimer);
    this.focusTimer = undefined;
    this.state.expanded = expanded;
    if (!expanded) {
      this.state.full = false;
      this.state.queueOpen = false;
    }
    this.render();

    if (expanded) {
      this.focusTimer = window.setTimeout(() => {
        this.focusTimer = undefined;
        if (!this.state.expanded) return;
        const playback = this.querySelector<HTMLButtonElement>('[data-player-playback]');
        const close = this.querySelector<HTMLButtonElement>('[data-player-close]');
        (playback && !playback.disabled ? playback : close)?.focus({ preventScroll: true });
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : MUSIC_PLAYER_CONFIG.expandDuration);
    } else {
      this.querySelector<HTMLButtonElement>('[data-player-collapsed]')?.focus({ preventScroll: true });
    }
  }

  private setFull(full: boolean) {
    this.state.full = full;
    this.state.expanded = true;
    if (full) this.state.queueOpen = false;
    this.render();
  }

  private setQueueOpen(open: boolean) {
    this.state.queueOpen = open;
    this.render();
  }

  private handleKeyboard(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.state.expanded) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.state.full) this.setFull(false);
      else this.setExpanded(false);
      return;
    }
    if (isEditableTarget(event.target) || !this.state.visible) return;

    if (event.key === ' ') {
      event.preventDefault();
      void this.togglePlayback();
    } else if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      this.toggleMute();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.seekBy(-5);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.seekBy(5);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.setVolume(this.state.volume + 0.05);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.setVolume(this.state.volume - 0.05);
    }
  }

  private persistState(force = false) {
    const now = performance.now();
    if (!force && now - this.lastPersistAt < 1500) return;
    this.lastPersistAt = now;
    const payload: PersistedPlayerState = {
      version: 2,
      trackId: this.state.currentTrackId,
      currentTime: this.audio?.currentTime ?? this.state.currentTime,
      volume: this.state.volume,
      muted: this.state.muted,
      queue: this.state.queue,
      playOrder: this.state.playOrder,
      queueSource: this.state.queueSource,
      shuffle: this.state.shuffle,
      repeat: this.state.repeat,
    };
    try {
      window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 隐私模式或存储额度不足时，播放器仍可在当前页面会话中工作。
    }
  }

  private recordHistory() {
    if (!this.state.currentTrackId) return;
    const token = `${this.state.currentTrackId}:${this.audio?.dataset.trackId ?? ''}:${this.switchRequest}`;
    if (token === this.historyToken) return;
    this.historyToken = token;
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      const history = raw ? JSON.parse(raw) as StoredHistoryEntry[] : [];
      history.unshift({
        id: `${Date.now()}-${this.state.currentTrackId}`,
        trackId: this.state.currentTrackId,
        playedAt: new Date().toISOString(),
        source: this.requestedHistorySource,
        completed: false,
      });
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ENTRIES)));
      window.dispatchEvent(new CustomEvent('asymptote:music-history-change'));
    } catch {
      // 历史记录是增强能力，存储不可用时不得影响播放。
    }
  }

  private markHistoryCompleted() {
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      const history = raw ? JSON.parse(raw) as StoredHistoryEntry[] : [];
      const entry = history.find((item) => item.trackId === this.state.currentTrackId && !item.completed);
      if (entry) entry.completed = true;
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // 同上，记录失败不影响下一首播放。
    }
  }

  private get currentTrack() {
    return this.state.currentTrackId ? this.getTrack(this.state.currentTrackId) : null;
  }

  private get statusLabel() {
    if (this.state.error) return this.state.error;
    if (this.state.loading) return '缓冲中';
    if (this.state.status === 'playing') return this.state.muted ? '已静音播放' : '播放中';
    if (this.state.status === 'paused') return '已暂停';
    return '就绪';
  }

  private render() {
    const track = this.currentTrack;
    const playableCount = this.state.playOrder.filter((id) => this.getTrack(id)?.available).length;
    const expandedPanel = this.querySelector<HTMLElement>('[data-player-expanded]');
    const queuePanel = this.querySelector<HTMLElement>('[data-player-queue]');
    const collapsedButton = this.querySelector<HTMLButtonElement>('[data-player-collapsed]');
    const playbackButton = this.querySelector<HTMLButtonElement>('[data-player-playback]');
    const previousButton = this.querySelector<HTMLButtonElement>('[data-player-previous]');
    const nextButton = this.querySelector<HTMLButtonElement>('[data-player-next]');
    const muteButton = this.querySelector<HTMLButtonElement>('[data-player-mute]');
    const shuffleButton = this.querySelector<HTMLButtonElement>('[data-player-shuffle]');
    const repeatButton = this.querySelector<HTMLButtonElement>('[data-player-repeat]');
    const queueButton = this.querySelector<HTMLButtonElement>('[data-player-queue-toggle]');
    const fullButton = this.querySelector<HTMLButtonElement>('[data-player-full-toggle]');
    const volume = this.querySelector<HTMLInputElement>('[data-player-volume]');
    const errorActions = this.querySelector<HTMLElement>('[data-player-error-actions]');

    this.dataset.visible = String(this.state.visible);
    this.dataset.expanded = String(this.state.expanded);
    this.dataset.full = String(this.state.full);
    this.dataset.queueOpen = String(this.state.queueOpen);
    this.dataset.playerState = this.state.status;
    this.dataset.muted = String(this.state.muted);
    this.dataset.shuffle = String(this.state.shuffle);
    this.dataset.repeat = this.state.repeat;
    this.dataset.hasLyrics = String(Boolean(track?.lyrics));

    if (this.audio) {
      this.audio.dataset.playerVisible = String(this.state.visible);
      this.audio.dataset.playerStatus = this.state.status;
      this.audio.dataset.playerVolume = String(this.state.volume);
    }

    expandedPanel?.setAttribute('aria-hidden', String(!this.state.expanded));
    if (this.state.expanded) expandedPanel?.removeAttribute('inert');
    else expandedPanel?.setAttribute('inert', '');
    if (this.state.queueOpen) queuePanel?.removeAttribute('inert');
    else queuePanel?.setAttribute('inert', '');

    if (collapsedButton) {
      collapsedButton.ariaExpanded = String(this.state.expanded);
      collapsedButton.ariaLabel = `展开音乐播放器，当前曲目 ${track?.title ?? '不可用'}`;
    }

    this.setText('[data-player-title]', track?.title ?? '无可用曲目');
    this.setText('[data-player-artist]', track?.artist ?? '—');
    this.setText('[data-player-collapsed-title]', track?.title ?? '无可用曲目');
    this.setText('[data-player-collapsed-state]', this.statusLabel);
    this.setText('[data-player-status]', this.statusLabel);
    this.setText('[data-player-full-title]', track?.title ?? '无可用曲目');
    this.setText('[data-player-full-artist]', track?.artist ?? '—');
    this.setText('[data-player-full-album]', track?.album ?? '单曲');
    this.setText('[data-player-full-format]', track?.format ?? 'NO AUDIO');
    this.setText('[data-player-full-lyrics]', track?.lyrics
      ? track.lyrics.replace(/\[[^\]]+\]/g, '').trim()
      : '此曲目没有附带歌词。');

    this.renderArtwork('[data-player-artwork]', '[data-player-artwork-fallback]', track);
    this.renderArtwork('[data-player-full-artwork-image]', '[data-player-full-artwork-fallback]', track);

    const unavailable = !track?.available || this.state.status === 'unavailable';
    if (playbackButton) {
      playbackButton.disabled = unavailable || this.state.loading;
      playbackButton.ariaLabel = this.state.isPlaying ? '暂停' : '播放';
    }
    this.setText('[data-player-playback-icon]', this.state.loading ? '·' : this.state.isPlaying ? 'Ⅱ' : '▶');
    if (previousButton) previousButton.disabled = playableCount === 0;
    if (nextButton) nextButton.disabled = playableCount === 0;

    if (muteButton) {
      muteButton.ariaPressed = String(this.state.muted);
      muteButton.ariaLabel = this.state.muted ? '取消静音' : '静音';
    }
    if (shuffleButton) {
      shuffleButton.ariaPressed = String(this.state.shuffle);
      shuffleButton.ariaLabel = this.state.shuffle ? '关闭随机播放' : '开启随机播放';
    }
    if (repeatButton) {
      repeatButton.dataset.repeatMode = this.state.repeat;
      repeatButton.ariaLabel = `循环模式：${this.state.repeat === 'off' ? '关闭' : this.state.repeat === 'all' ? '全部' : '单曲'}`;
    }
    this.setText('[data-player-repeat-label]', this.state.repeat === 'off' ? '循环' : this.state.repeat === 'all' ? '循环全部' : '单曲循环');
    if (queueButton) {
      queueButton.ariaExpanded = String(this.state.queueOpen);
      queueButton.ariaLabel = this.state.queueOpen ? '关闭播放队列' : '打开播放队列';
    }
    if (fullButton) {
      fullButton.ariaPressed = String(this.state.full);
      fullButton.ariaLabel = this.state.full ? '退出全屏播放器' : '打开全屏播放器';
    }
    this.setText('[data-player-full-label]', this.state.full ? '退出全屏' : '全屏');
    if (volume) {
      volume.value = String(Math.round(this.state.volume * 100));
      volume.style.setProperty('--player-progress', `${this.state.volume * 100}%`);
    }
    if (errorActions) errorActions.hidden = this.state.status !== 'unavailable';

    this.renderQueue();
    this.renderProgress();
    this.dispatchSnapshot();
  }

  private renderArtwork(imageSelector: string, fallbackSelector: string, track: ResolvedMusicTrack | null) {
    const image = this.querySelector<HTMLImageElement>(imageSelector);
    const fallback = this.querySelector<HTMLElement>(fallbackSelector);
    if (!image || !fallback) return;
    if (track?.artwork) {
      image.src = track.artwork;
      image.alt = `${track.title} 封面`;
      image.hidden = false;
      fallback.hidden = true;
    } else {
      image.removeAttribute('src');
      image.alt = '';
      image.hidden = true;
      fallback.hidden = false;
    }
  }

  private renderQueue() {
    const indexById = new Map(this.state.queue.map((id, index) => [id, index]));
    this.setText('[data-player-queue-source]', SOURCE_LABELS[this.state.queueSource]);
    this.querySelectorAll<HTMLElement>('[data-player-queue-item]').forEach((item) => {
      const id = item.dataset.playerQueueItem;
      const index = id ? indexById.get(id) : undefined;
      item.hidden = index === undefined;
      item.style.order = String(index ?? 9999);
      const active = id === this.state.currentTrackId;
      item.dataset.active = String(active);
      item.querySelector<HTMLButtonElement>('[data-player-queue-track]')
        ?.setAttribute('aria-current', active ? 'true' : 'false');
      const up = item.querySelector<HTMLButtonElement>('[data-player-queue-up]');
      const down = item.querySelector<HTMLButtonElement>('[data-player-queue-down]');
      const remove = item.querySelector<HTMLButtonElement>('[data-player-queue-remove]');
      if (up) up.disabled = index === undefined || index <= 0;
      if (down) down.disabled = index === undefined || index >= this.state.queue.length - 1;
      if (remove) remove.disabled = active || this.state.queue.length <= 1;
    });
  }

  private renderProgress() {
    const progress = this.querySelector<HTMLInputElement>('[data-player-progress]');
    const duration = this.audio && Number.isFinite(this.audio.duration) ? this.audio.duration : this.state.duration;
    const currentTime = this.audio?.currentTime ?? this.state.currentTime;
    if (progress) {
      progress.disabled = !this.currentTrack?.available || duration <= 0;
      if (!this.seeking) {
        progress.value = String(duration > 0
          ? Math.round((currentTime / duration) * MUSIC_PLAYER_CONFIG.progressSteps)
          : 0);
      }
      progress.style.setProperty('--player-progress', `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%`);
      progress.setAttribute('aria-valuetext', `${formatTime(currentTime)} / ${formatTime(duration)}`);
    }
    this.setText('[data-player-current-time]', formatTime(currentTime));
    this.setText('[data-player-duration]', formatTime(duration));
  }

  private dispatchSnapshot() {
    const snapshot: MusicPlayerSnapshot = {
      trackId: this.state.currentTrackId,
      isPlaying: this.state.isPlaying,
      currentTime: this.state.currentTime,
      duration: this.state.duration,
      muted: this.state.muted,
      volume: this.state.volume,
      queue: [...this.state.queue],
      queueSource: this.state.queueSource,
      shuffle: this.state.shuffle,
      repeat: this.state.repeat,
      status: this.state.status,
    };
    window.dispatchEvent(new CustomEvent(MUSIC_PLAYER_EVENTS.stateChange, { detail: snapshot }));
  }

  private setText(selector: string, value: string) {
    this.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  private hasTrack(trackId: string) {
    return this.tracks.some((track) => track.id === trackId);
  }

  private getTrack(trackId: string) {
    return this.tracks.find((track) => track.id === trackId) ?? null;
  }

  private isQueueSource(value: unknown): value is MusicQueueSource {
    return value === 'album' || value === 'playlist' || value === 'search' || value === 'manual' || value === 'title';
  }

  private isRepeatMode(value: unknown): value is MusicRepeatMode {
    return value === 'off' || value === 'all' || value === 'one';
  }

  /* Media Session 只增强系统媒体面板；浏览器不支持时，站内播放器仍完整可用。 */
  private configureMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const safeHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // 部分移动浏览器只实现 Media Session 的一部分动作。
      }
    };
    safeHandler('play', () => void this.resumePlayback());
    safeHandler('pause', () => void this.pausePlayback());
    safeHandler('previoustrack', () => void this.changeTrack(-1, false));
    safeHandler('nexttrack', () => void this.changeTrack(1, false));
    safeHandler('seekto', (details) => {
      if (!this.audio || details.seekTime === undefined) return;
      this.audio.currentTime = clamp(details.seekTime, 0, this.audio.duration || 0);
    });
    safeHandler('seekbackward', (details) => this.seekBy(-(details.seekOffset ?? 10)));
    safeHandler('seekforward', (details) => this.seekBy(details.seekOffset ?? 10));
    this.updateMediaMetadata();
  }

  private updateMediaMetadata() {
    if (!('mediaSession' in navigator) || !this.currentTrack) return;
    const track = this.currentTrack;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      artwork: track.artwork ? [{ src: track.artwork }] : [],
    });
  }

  private updateMediaPlaybackState() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = this.state.isPlaying ? 'playing' : 'paused';
    }
  }

  private updateMediaPosition() {
    if (!('mediaSession' in navigator)
      || !this.audio
      || !Number.isFinite(this.audio.duration)
      || this.audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: this.audio.duration,
        playbackRate: this.audio.playbackRate,
        position: clamp(this.audio.currentTime, 0, this.audio.duration),
      });
    } catch {
      // 元数据尚未稳定时忽略本次系统进度同步。
    }
  }
}

if (!customElements.get('asymptote-music-player')) {
  customElements.define('asymptote-music-player', AsymptoteMusicPlayer);
}
