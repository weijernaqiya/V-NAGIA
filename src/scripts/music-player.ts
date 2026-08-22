import { MUSIC_PLAYER_CONFIG } from '../config/musicPlayer';
import { TITLE_TIMELINE } from '../config/titleTimeline';
import { DEFAULT_MUSIC_TRACK_ID, type MusicTrack } from '../data/music';
import {
  MUSIC_PLAYER_EVENTS,
  type PlayTrackRequest,
  type TitleSequenceRequest,
} from './music-player-api';

interface ResolvedMusicTrack extends MusicTrack {
  available: boolean;
}

type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'unavailable';

interface PlayerState {
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  queue: number[];
  expanded: boolean;
  queueOpen: boolean;
  visible: boolean;
  loading: boolean;
  status: PlayerStatus;
  error: string | null;
}

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

/*
 * 模块脚本在 ClientRouter 会话中只执行一次，因此这个媒体元素天然跨路由存活。
 * src 仍由曲目数据动态设置，不在组件里重复硬编码音乐地址。
 */
const GLOBAL_AUDIO = new Audio();
GLOBAL_AUDIO.preload = 'metadata';

/*
 * 全站只实例化这一套播放器状态和一个 HTMLAudioElement。
 * UI、TITLE SCREEN、未来 Music 页面都通过同一个控制器操作同一首媒体。
 */
class AsymptoteMusicPlayer extends HTMLElement {
  private tracks: ResolvedMusicTrack[] = [];
  private audio: HTMLAudioElement | null = null;
  private state: PlayerState = {
    currentTrackIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: MUSIC_PLAYER_CONFIG.defaultVolume,
    muted: true,
    queue: [],
    expanded: false,
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

  connectedCallback() {
    if (this.initialized && !this.events.signal.aborted) return;

    if (this.events.signal.aborted) this.events = new AbortController();

    this.setAttribute('data-enhanced', '');
    if (!this.initialized) {
      this.audio = GLOBAL_AUDIO;
      this.tracks = this.readTracks();
      this.state.queue = this.tracks.map((_, index) => index);
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
     * ClientRouter 会在一次 DOM swap 中短暂搬移 transition:persist 元素。
     * 延迟到微任务再判断，避免把正常的持久化搬移误判为播放器销毁。
     */
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.events.abort();
      if (!this.audio?.isConnected) this.cancelFade();
      if (this.revealTimer !== undefined) window.clearTimeout(this.revealTimer);
      if (this.focusTimer !== undefined) window.clearTimeout(this.focusTimer);
    });
  }

  private readTracks() {
    const node = this.querySelector<HTMLScriptElement>('[data-player-tracks]');
    if (!node?.textContent) return [];

    try {
      return JSON.parse(node.textContent) as ResolvedMusicTrack[];
    } catch (error) {
      console.error('[ASYMPTOTE Player] 无法读取曲目数据。', error);
      return [];
    }
  }

  /*
   * 如果播放器外壳在未来某个路由中重新建立，则从模块级媒体引擎恢复 UI，
   * 避免重设 currentTime、volume 或 muted。
   */
  private hydrateStateFromAudio() {
    if (!this.audio) return;

    const persistedTrackId = this.audio.dataset.trackId;
    const persistedTrackIndex = persistedTrackId
      ? this.tracks.findIndex((track) => track.id === persistedTrackId)
      : -1;
    this.state.currentTrackIndex = persistedTrackIndex >= 0
      ? persistedTrackIndex
      : Math.max(0, this.tracks.findIndex((track) => track.id === DEFAULT_MUSIC_TRACK_ID));

    if (!persistedTrackId) {
      this.audio.volume = this.state.volume;
      this.audio.muted = this.state.muted;
      return;
    }

    const persistedVolume = Number(this.audio.dataset.playerVolume);
    this.state.volume = Number.isFinite(persistedVolume)
      ? Math.min(1, Math.max(0, persistedVolume))
      : this.audio.volume;
    this.state.muted = this.audio.muted;
    this.state.currentTime = this.audio.currentTime;
    this.state.duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    this.state.visible = this.audio.dataset.playerVisible === 'true';

    const persistedStatus = this.audio.dataset.playerStatus as PlayerStatus | undefined;
    this.state.status = persistedStatus
      ?? (this.audio.paused ? 'paused' : 'playing');
    this.state.loading = this.state.status === 'loading';
    this.state.isPlaying = !this.audio.paused;
    this.state.error = this.state.status === 'unavailable' ? 'TRACK UNAVAILABLE' : null;
  }

  private bindControls() {
    const signal = this.events.signal;

    /*
     * Astro 的页面过渡会保留播放器外壳，开发环境的热更新则可能替换内部按钮。
     * 开合事件因此绑定在稳定的播放器根节点上，避免关闭按钮换成新节点后失去响应。
     */
    this.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const trigger = event.target.closest<HTMLElement>(
        '[data-player-collapsed], [data-player-close]',
      );
      if (!trigger || !this.contains(trigger)) return;

      if (trigger.matches('[data-player-close]')) {
        this.setExpanded(false);
        return;
      }

      this.setExpanded(true);
    }, { signal });
    this.querySelector<HTMLButtonElement>('[data-player-playback]')?.addEventListener(
      'click',
      () => void this.togglePlayback(),
      { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-previous]')?.addEventListener(
      'click',
      () => void this.changeTrack(-1),
      { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-next]')?.addEventListener(
      'click',
      () => void this.changeTrack(1),
      { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-mute]')?.addEventListener(
      'click',
      () => this.toggleMute(),
      { signal },
    );
    this.querySelector<HTMLButtonElement>('[data-player-queue-toggle]')?.addEventListener(
      'click',
      () => this.setQueueOpen(!this.state.queueOpen),
      { signal },
    );

    const progress = this.querySelector<HTMLInputElement>('[data-player-progress]');
    progress?.addEventListener('input', () => this.seekFromControl(progress), { signal });
    progress?.addEventListener('change', () => {
      this.seeking = false;
      this.renderProgress();
    }, { signal });

    const volume = this.querySelector<HTMLInputElement>('[data-player-volume]');
    volume?.addEventListener('input', () => this.setVolume(Number(volume.value) / 100), {
      signal,
    });

    this.querySelectorAll<HTMLButtonElement>('[data-player-queue-track]').forEach((button) => {
      button.addEventListener('click', () => {
        const trackId = button.dataset.playerQueueTrack;
        if (trackId) void this.playTrack(trackId, true);
      }, { signal });
    });

    window.addEventListener(MUSIC_PLAYER_EVENTS.titleSequence, (event) => {
      const request = (event as CustomEvent<TitleSequenceRequest>).detail;
      this.handleTitleSequence(request);
    }, { signal });

    window.addEventListener(MUSIC_PLAYER_EVENTS.playTrack, (event) => {
      const request = (event as CustomEvent<PlayTrackRequest>).detail;
      if (request?.trackId) void this.playTrack(request.trackId, true);
    }, { signal });

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
    }, { signal });

    audio.addEventListener('ended', () => {
      const track = this.currentTrack;
      if (!track?.loop) void this.changeTrack(1);
    }, { signal });

    audio.addEventListener('error', () => {
      this.markUnavailable('TRACK UNAVAILABLE', audio.error);
    }, { signal });
  }

  /*
   * 首页现在会自动开始 Logo 时间轴，但浏览器仍禁止无交互有声播放。
   * 因此这里只预载曲目并让播放器按时间轴出现；真正的 play() 保留给用户点击。
   * 如果播放器已经在其他页面播放，则保留现有进度和静音选择，不强制暂停或重置。
   */
  private handleTitleSequence(request: TitleSequenceRequest) {
    if (!request) return;

    this.scheduleReveal(request.sequenceStart);
    const hasExistingSession = Boolean(this.audio?.dataset.trackId);
    const loaded = this.loadTrack(DEFAULT_MUSIC_TRACK_ID, true);

    if (!hasExistingSession && this.audio) {
      this.state.muted = false;
      this.audio.muted = false;
    }

    if (!loaded) {
      this.render();
      return;
    }

    this.state.isPlaying = Boolean(this.audio && !this.audio.paused);
    this.state.status = this.state.isPlaying ? 'playing' : 'paused';
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
    const index = this.tracks.findIndex((track) => track.id === trackId);
    if (index < 0) {
      this.markUnavailable('TRACK UNAVAILABLE', `Unknown track: ${trackId}`);
      return false;
    }

    const track = this.tracks[index];
    const isCurrent = this.audio.dataset.trackId === track.id;
    this.state.currentTrackIndex = index;
    this.state.error = null;

    if (preserveCurrent && isCurrent && this.audio.getAttribute('src')) {
      this.audio.loop = Boolean(track.loop);
      this.updateMediaMetadata();
      return true;
    }

    this.cancelFade();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.dataset.trackId = track.id;
    this.audio.loop = Boolean(track.loop);
    this.state.currentTime = 0;
    this.state.duration = 0;
    this.state.isPlaying = false;

    if (!track.available || !track.src) {
      this.audio.load();
      this.markUnavailable('TRACK UNAVAILABLE', `Missing local file: ${track.src ?? '(none)'}`);
      return false;
    }

    this.audio.src = track.src;
    this.audio.preload = 'metadata';
    this.state.loading = true;
    this.state.status = 'loading';
    this.audio.load();
    this.updateMediaMetadata();
    this.render();
    return true;
  }

  private async playTrack(trackId: string, fade: boolean) {
    const requestedIndex = this.tracks.findIndex((track) => track.id === trackId);
    if (requestedIndex < 0) {
      this.markUnavailable('TRACK UNAVAILABLE', `Unknown track: ${trackId}`);
      return;
    }

    if (requestedIndex === this.state.currentTrackIndex
      && this.audio?.dataset.trackId === trackId) {
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

    if (!this.loadTrack(trackId, false) || !this.audio) return;
    this.audio.volume = fade ? 0 : this.state.volume;
    this.audio.muted = this.state.muted;

    try {
      await this.audio.play();
      if (fade) {
        void this.fadeAudioTo(this.state.volume, MUSIC_PLAYER_CONFIG.switchFadeInDuration);
      }
      this.setQueueOpen(false);
    } catch (error) {
      this.markUnavailable('TRACK UNAVAILABLE', error);
    }
  }

  private async togglePlayback() {
    if (!this.audio || !this.currentTrack?.available) return;

    if (!this.audio.getAttribute('src') && !this.loadTrack(this.currentTrack.id, false)) return;
    if (this.audio.paused) {
      await this.resumePlayback();
      return;
    }

    await this.pausePlayback();
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
      this.markUnavailable('TRACK UNAVAILABLE', error);
    }
  }

  private async changeTrack(direction: -1 | 1) {
    const playable = this.state.queue.filter((index) => this.tracks[index]?.available);
    if (playable.length < 2) return;

    const currentQueueIndex = playable.indexOf(this.state.currentTrackIndex);
    const base = currentQueueIndex >= 0 ? currentQueueIndex : 0;
    const next = (base + direction + playable.length) % playable.length;
    await this.playTrack(this.tracks[playable[next]].id, true);
  }

  private toggleMute() {
    if (!this.audio) return;
    this.state.muted = !this.state.muted;
    this.audio.muted = this.state.muted;
    this.render();
  }

  private setVolume(value: number) {
    this.state.volume = Math.min(1, Math.max(0, value));
    if (!this.audio) return;

    this.cancelFade();
    this.audio.volume = this.state.volume;
    if (this.state.volume > 0) {
      this.state.muted = false;
      this.audio.muted = false;
    }
    this.render();
  }

  private seekFromControl(control: HTMLInputElement) {
    if (!this.audio || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
    this.seeking = true;
    const ratio = Number(control.value) / MUSIC_PLAYER_CONFIG.progressSteps;
    this.audio.currentTime = this.audio.duration * ratio;
    this.state.currentTime = this.audio.currentTime;
    this.renderProgress();
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
    if (!expanded) this.state.queueOpen = false;
    this.render();

    if (expanded) {
      this.focusTimer = window.setTimeout(() => {
        this.focusTimer = undefined;
        if (!this.state.expanded) return;
        const playback = this.querySelector<HTMLButtonElement>('[data-player-playback]');
        const focusTarget = playback && !playback.disabled
          ? playback
          : this.querySelector<HTMLButtonElement>('[data-player-close]');
        focusTarget?.focus({ preventScroll: true });
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : MUSIC_PLAYER_CONFIG.expandDuration);
    } else {
      this.querySelector<HTMLButtonElement>('[data-player-collapsed]')?.focus({
        preventScroll: true,
      });
    }
  }

  private setQueueOpen(open: boolean) {
    this.state.queueOpen = open;
    this.render();
  }

  private handleKeyboard(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.state.expanded) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setExpanded(false);
      return;
    }

    if (isEditableTarget(event.target)) return;

    if (event.key === ' ' && this.state.visible) {
      event.preventDefault();
      void this.togglePlayback();
      return;
    }

    if (event.key.toLowerCase() === 'm' && this.state.visible) {
      event.preventDefault();
      this.toggleMute();
      return;
    }

  }

  private get currentTrack() {
    return this.tracks[this.state.currentTrackIndex] ?? null;
  }

  private get statusLabel() {
    if (this.state.error) return this.state.error;
    if (this.state.loading) return 'LOADING';
    if (this.state.status === 'playing') return this.state.muted ? 'MUTED' : 'PLAYING';
    if (this.state.status === 'paused') return 'PAUSED';
    return 'READY';
  }

  private render() {
    const track = this.currentTrack;
    const playableCount = this.tracks.filter((item) => item.available).length;
    const expandedPanel = this.querySelector<HTMLElement>('[data-player-expanded]');
    const queuePanel = this.querySelector<HTMLElement>('[data-player-queue]');
    const collapsedButton = this.querySelector<HTMLButtonElement>('[data-player-collapsed]');
    const playbackButton = this.querySelector<HTMLButtonElement>('[data-player-playback]');
    const previousButton = this.querySelector<HTMLButtonElement>('[data-player-previous]');
    const nextButton = this.querySelector<HTMLButtonElement>('[data-player-next]');
    const muteButton = this.querySelector<HTMLButtonElement>('[data-player-mute]');
    const queueButton = this.querySelector<HTMLButtonElement>('[data-player-queue-toggle]');
    const volume = this.querySelector<HTMLInputElement>('[data-player-volume]');

    this.dataset.visible = String(this.state.visible);
    this.dataset.expanded = String(this.state.expanded);
    this.dataset.queueOpen = String(this.state.queueOpen);
    this.dataset.playerState = this.state.status;
    this.dataset.muted = String(this.state.muted);

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
      collapsedButton.ariaLabel = this.state.expanded
        ? '音乐播放器已展开'
        : `展开音乐播放器，当前曲目 ${track?.title ?? '不可用'}`;
    }

    this.setText('[data-player-title]', track?.title ?? 'NO TRACK');
    this.setText('[data-player-artist]', track?.artist ?? '—');
    this.setText('[data-player-collapsed-title]', track?.title ?? 'NO TRACK');
    this.setText('[data-player-collapsed-state]', this.statusLabel);
    this.setText('[data-player-status]', this.statusLabel);

    const artwork = this.querySelector<HTMLImageElement>('[data-player-artwork]');
    if (artwork) {
      if (track?.artwork) {
        artwork.src = track.artwork;
        artwork.alt = `${track.title} 封面`;
        artwork.hidden = false;
      } else {
        artwork.removeAttribute('src');
        artwork.alt = '';
        artwork.hidden = true;
      }
    }

    const unavailable = !track?.available || this.state.status === 'unavailable';
    if (playbackButton) {
      playbackButton.disabled = unavailable || this.state.loading;
      playbackButton.ariaLabel = this.state.isPlaying ? '暂停' : '播放';
    }
    this.setText('[data-player-playback-icon]', this.state.loading
      ? '·'
      : this.state.isPlaying ? 'Ⅱ' : '▶');

    if (previousButton) previousButton.disabled = playableCount < 2;
    if (nextButton) nextButton.disabled = playableCount < 2;

    if (muteButton) {
      muteButton.ariaPressed = String(this.state.muted);
      muteButton.ariaLabel = this.state.muted ? '取消静音' : '静音';
    }

    if (queueButton) {
      queueButton.ariaExpanded = String(this.state.queueOpen);
      queueButton.ariaLabel = this.state.queueOpen ? '关闭播放队列' : '打开播放队列';
    }

    if (volume) {
      volume.value = String(Math.round(this.state.volume * 100));
      volume.style.setProperty('--player-progress', `${this.state.volume * 100}%`);
    }

    this.querySelectorAll<HTMLButtonElement>('[data-player-queue-track]').forEach((button) => {
      const active = button.dataset.playerQueueTrack === track?.id;
      button.setAttribute('aria-current', active ? 'true' : 'false');
    });

    this.renderProgress();
  }

  private renderProgress() {
    const progress = this.querySelector<HTMLInputElement>('[data-player-progress]');
    const duration = this.audio && Number.isFinite(this.audio.duration)
      ? this.audio.duration
      : this.state.duration;
    const currentTime = this.audio?.currentTime ?? this.state.currentTime;

    if (progress) {
      progress.disabled = !this.currentTrack?.available || duration <= 0;
      if (!this.seeking) {
        progress.value = String(duration > 0
          ? Math.round((currentTime / duration) * MUSIC_PLAYER_CONFIG.progressSteps)
          : 0);
      }
      progress.style.setProperty(
        '--player-progress',
        `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%`,
      );
      progress.setAttribute('aria-valuetext', `${formatTime(currentTime)} / ${formatTime(duration)}`);
    }

    this.setText('[data-player-current-time]', formatTime(currentTime));
    this.setText('[data-player-duration]', formatTime(duration));
  }

  private setText(selector: string, value: string) {
    const element = this.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  /* Media Session 只增强系统媒体面板；不支持时播放器全部基础能力仍可用。 */
  private configureMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const safeHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // 部分浏览器只实现 Media Session 的子集。
      }
    };

    safeHandler('play', () => void this.resumePlayback());
    safeHandler('pause', () => void this.pausePlayback());
    safeHandler('previoustrack', () => void this.changeTrack(-1));
    safeHandler('nexttrack', () => void this.changeTrack(1));
    safeHandler('seekto', (details) => {
      if (!this.audio || details.seekTime === undefined) return;
      this.audio.currentTime = Math.min(this.audio.duration || 0, Math.max(0, details.seekTime));
    });
    safeHandler('seekbackward', (details) => {
      if (this.audio) this.audio.currentTime = Math.max(0, this.audio.currentTime - (details.seekOffset ?? 10));
    });
    safeHandler('seekforward', (details) => {
      if (this.audio) this.audio.currentTime = Math.min(this.audio.duration || 0, this.audio.currentTime + (details.seekOffset ?? 10));
    });
    this.updateMediaMetadata();
  }

  private updateMediaMetadata() {
    if (!('mediaSession' in navigator) || !this.currentTrack) return;
    const track = this.currentTrack;
    const artwork = track.artwork ? [{ src: track.artwork }] : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      artwork,
    });
  }

  private updateMediaPlaybackState() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = this.state.isPlaying ? 'playing' : 'paused';
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
        position: Math.min(this.audio.duration, Math.max(0, this.audio.currentTime)),
      });
    } catch {
      // 元数据尚未稳定时忽略本次系统进度同步。
    }
  }
}

if (!customElements.get('asymptote-music-player')) {
  customElements.define('asymptote-music-player', AsymptoteMusicPlayer);
}
