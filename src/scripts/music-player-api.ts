export interface TitleSequenceRequest {
  sequenceStart: number;
}

export interface PlayTrackRequest {
  trackId: string;
}

export const MUSIC_PLAYER_EVENTS = Object.freeze({
  titleSequence: 'asymptote:music-title-sequence',
  playTrack: 'asymptote:music-play-track',
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
export const playMusicTrack = (trackId: string) => {
  window.dispatchEvent(new CustomEvent<PlayTrackRequest>(MUSIC_PLAYER_EVENTS.playTrack, {
    detail: { trackId },
  }));
};
