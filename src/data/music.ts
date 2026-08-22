export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  src: string | null;
  artwork: string | null;
  album: string | null;
  loop?: boolean;
}

/*
 * 全站曲目只在这里登记。
 * 未来新增音乐时，把文件放入 public/audio 后再增加一条数据即可，
 * Music 页面和全局播放器不需要各自创建新的 Audio 元素。
 */
export const MUSIC_TRACKS = Object.freeze([
  {
    id: 'title-theme',
    title: 'ASYMPTOTE',
    artist: 'V. NAGIA',
    src: '/audio/title-theme.mp3',
    artwork: null,
    album: null,
    loop: true,
  },
] satisfies readonly MusicTrack[]);

export const DEFAULT_MUSIC_TRACK_ID = 'title-theme';
