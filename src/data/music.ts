import type {
  CatalogTrack,
  CdArchiveEntry,
  MusicAlbum,
  MusicArtist,
  MusicCatalog,
  MusicPlaylist,
} from '../types/music';

export interface MusicPlayerTrack {
  id: string;
  title: string;
  artist: string;
  src: string | null;
  artwork: string | null;
  album: string | null;
  format: string | null;
  duration: number | null;
  lyrics: string | null;
  lyricsFormat: 'plain' | 'lrc' | null;
  loop?: boolean;
}

/*
 * 当前放入 public/audio 的两份音频只用于本地界面与播放器测试，
 * 且不会提交到公开仓库。开发服务器可以读取它们；生产构建只发布
 * 元数据并禁用播放按钮，避免线上出现无授权音频或指向不存在文件的链接。
 */
const LOCAL_AUDIO_ENABLED = import.meta.env.DEV;

export const MUSIC_ARTISTS = Object.freeze([
  {
    id: 'masashi-hamauzu',
    slug: 'masashi-hamauzu',
    name: 'Masashi Hamauzu',
    country: '日本',
    years: null,
    genres: ['Soundtrack', 'Game Music'],
    portrait: null,
    note: '根据标题音频内嵌标签建立的艺人条目。',
  },
  {
    id: 'radiohead',
    slug: 'radiohead',
    name: 'Radiohead',
    country: '英国',
    years: '1985 —',
    genres: ['Alternative Rock', 'Art Rock'],
    portrait: null,
    note: '当前私人曲库只登记已放入站点目录的本地音频。',
  },
] satisfies readonly MusicArtist[]);

export const MUSIC_TRACKS_CATALOG = Object.freeze([
  {
    id: 'title-theme',
    slug: 'final-fantasy-xiii-the-promise',
    title: 'Final Fantasy XIII ~The Promise~',
    subtitle: 'Title Theme',
    primaryArtistId: 'masashi-hamauzu',
    credits: [{ artistId: 'masashi-hamauzu', role: 'primary' }],
    albumId: 'final-fantasy-xiii',
    discNumber: 1,
    trackNumber: 2,
    duration: 92.76,
    year: 2010,
    genres: ['Soundtrack', 'Game Music'],
    audio: LOCAL_AUDIO_ENABLED ? {
      src: '/audio/title-theme.flac',
      format: 'FLAC',
      mimeType: 'audio/flac',
      lossless: true,
      codec: 'FLAC',
      bitDepth: 16,
      sampleRate: 44100,
      visibility: 'public',
    } : null,
    artwork: null,
    lyrics: null,
    favorite: true,
    rating: null,
    playCount: 0,
    addedAt: '2026-08-22',
    note: '标题画面与全站播放器共用的主题音轨；资料来自文件内嵌标签。',
    availability: LOCAL_AUDIO_ENABLED ? 'playable' : 'metadata-only',
    loop: false,
  },
  {
    id: 'let-down',
    slug: 'let-down',
    title: 'Let Down',
    primaryArtistId: 'radiohead',
    credits: [{ artistId: 'radiohead', role: 'primary' }],
    albumId: 'ok-computer-private-archive',
    discNumber: 1,
    trackNumber: 5,
    duration: 299.266667,
    year: 1997,
    genres: ['Alternative Rock', 'Art Rock'],
    audio: LOCAL_AUDIO_ENABLED ? {
      src: '/audio/tracks/05. Radiohead - Let Down.flac',
      format: 'FLAC',
      mimeType: 'audio/flac',
      lossless: true,
      codec: 'FLAC',
      bitDepth: 16,
      sampleRate: 44100,
      visibility: 'private',
    } : null,
    artwork: null,
    lyrics: null,
    favorite: false,
    rating: null,
    playCount: 0,
    addedAt: '2026-08-22',
    note: '由站点所有者放入本地音频目录的私人收藏。',
    availability: LOCAL_AUDIO_ENABLED ? 'playable' : 'metadata-only',
    loop: false,
  },
] satisfies readonly CatalogTrack[]);

export const MUSIC_ALBUMS = Object.freeze([
  {
    id: 'final-fantasy-xiii',
    slug: 'final-fantasy-xiii',
    title: 'Final Fantasy XIII',
    subtitle: 'Title Theme Archive Entry',
    artistIds: ['masashi-hamauzu'],
    year: 2010,
    albumType: 'soundtrack',
    genres: ['Soundtrack', 'Game Music'],
    artwork: null,
    accent: '#8da9b6',
    trackIds: ['title-theme'],
    edition: '本地音频条目',
    note: '当前只登记标题画面实际使用的一首本地音频，没有补造专辑其余曲目。',
    visibility: 'public',
  },
  {
    id: 'ok-computer-private-archive',
    slug: 'ok-computer-private-archive',
    title: 'OK Computer',
    subtitle: 'Private Archive Entry',
    artistIds: ['radiohead'],
    year: 1997,
    albumType: 'archive',
    genres: ['Alternative Rock', 'Art Rock'],
    artwork: null,
    accent: '#87949b',
    trackIds: ['let-down'],
    edition: '私人曲库条目',
    label: 'Parlophone',
    note: '当前只登记站点目录中确实存在的一首音频；没有虚构其余曲目。',
    visibility: 'private',
  },
] satisfies readonly MusicAlbum[]);

export const MUSIC_PLAYLISTS = Object.freeze([
  {
    id: 'running-memory',
    slug: 'running-memory',
    title: '正在运行的记忆',
    description: '连接标题主题与私人收藏的第一条播放路径。',
    artwork: null,
    trackIds: ['title-theme', 'let-down'],
    updatedAt: '2026-08-22',
    visibility: 'private',
  },
] satisfies readonly MusicPlaylist[]);

/*
 * 当前没有用户提供的实体唱片资料，因此 CD 档案保持真实空库。
 * 数据模型已经稳定，未来只需增加条目，不需要改写 CD 页面组件。
 */
export const MUSIC_CDS = Object.freeze([] satisfies readonly CdArchiveEntry[]);

export const MUSIC_CATALOG = Object.freeze({
  artists: MUSIC_ARTISTS,
  albums: MUSIC_ALBUMS,
  tracks: MUSIC_TRACKS_CATALOG,
  playlists: MUSIC_PLAYLISTS,
  cds: MUSIC_CDS,
} satisfies MusicCatalog);

const artistById = new Map(MUSIC_ARTISTS.map((artist) => [artist.id, artist]));
const albumById = new Map(MUSIC_ALBUMS.map((album) => [album.id, album]));

/*
 * 全局播放器消费的是领域数据的轻量投影。
 * 播放器与资料库共享同一曲目 ID，但无需知道 CD、歌词或完整 Credits。
 */
export const MUSIC_TRACKS = Object.freeze(MUSIC_TRACKS_CATALOG.map((track) => {
  const artist = artistById.get(track.primaryArtistId);
  const album = track.albumId ? albumById.get(track.albumId) : null;
  return {
    id: track.id,
    title: track.title,
    artist: artist?.name ?? '未知艺术家',
    src: track.audio?.src ?? null,
    artwork: track.artwork ?? album?.artwork ?? null,
    album: album?.title ?? null,
    format: track.audio?.format ?? null,
    duration: track.duration,
    lyrics: track.lyrics?.original ?? null,
    lyricsFormat: track.lyrics?.format ?? null,
    loop: track.loop,
  } satisfies MusicPlayerTrack;
}));

export const DEFAULT_MUSIC_TRACK_ID = 'title-theme';
