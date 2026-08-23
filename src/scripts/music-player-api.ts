export interface TitleSequenceRequest {
  sequenceStart: number;
}

export interface PlayTrackRequest {
  trackId: string;
  queue?: string[];
  source?: MusicQueueSource;
}

export type MusicQueueSource = 'album' | 'playlist' | 'search' | 'manual' | 'title';
export type MusicRepeatMode = 'off' | 'all' | 'one';

export interface PlayCollectionRequest {
  trackIds: string[];
  startTrackId?: string;
  source: MusicQueueSource;
}

export interface QueueTrackRequest {
  trackId: string;
}

export interface MusicPlayerSnapshot {
  trackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  volume: number;
  queue: string[];
  queueSource: MusicQueueSource;
  shuffle: boolean;
  repeat: MusicRepeatMode;
  status: string;
}

export const MUSIC_PLAYER_EVENTS = Object.freeze({
  titleSequence: 'asymptote:music-title-sequence',
  playTrack: 'asymptote:music-play-track',
  playCollection: 'asymptote:music-play-collection',
  addToQueue: 'asymptote:music-add-to-queue',
  playNext: 'asymptote:music-play-next',
  stateChange: 'asymptote:music-state-change',
  stateRequest: 'asymptote:music-state-request',
});

/*
 * TITLE SCREEN 只通知播放器“标题时间轴已经开始”。
 * 播放器会预载默认曲目并按同一时间显示，但不会绕过浏览器规则自动发声。
 */
export const prepareTitleTrack = (sequenceStart: number) => {
  window.dispatchEvent(new CustomEvent<TitleSequenceRequest>(MUSIC_PLAYER_EVENTS.titleSequence, {
    detail: { sequenceStart },
  }));
};

/* 未来 Music 页面在用户点击歌曲时调用这一函数，不要自行 new Audio()。 */
export const playMusicTrack = (
  trackId: string,
  options: Omit<PlayTrackRequest, 'trackId'> = {},
) => {
  window.dispatchEvent(new CustomEvent<PlayTrackRequest>(MUSIC_PLAYER_EVENTS.playTrack, {
    detail: { trackId, ...options },
  }));
};

export const playMusicCollection = (
  trackIds: string[],
  source: MusicQueueSource,
  startTrackId?: string,
) => {
  window.dispatchEvent(new CustomEvent<PlayCollectionRequest>(MUSIC_PLAYER_EVENTS.playCollection, {
    detail: { trackIds, startTrackId, source },
  }));
};

export const addMusicToQueue = (trackId: string) => {
  window.dispatchEvent(new CustomEvent<QueueTrackRequest>(MUSIC_PLAYER_EVENTS.addToQueue, {
    detail: { trackId },
  }));
};

export const playMusicNext = (trackId: string) => {
  window.dispatchEvent(new CustomEvent<QueueTrackRequest>(MUSIC_PLAYER_EVENTS.playNext, {
    detail: { trackId },
  }));
};
