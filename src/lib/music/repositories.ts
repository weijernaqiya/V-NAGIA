import { MUSIC_CATALOG } from '../../data/music';
import type {
  CatalogTrack,
  CdArchiveEntry,
  MusicAlbum,
  MusicArtist,
  MusicCatalog,
  MusicPlaylist,
} from '../../types/music';

export interface MusicRepository {
  getCatalog(): MusicCatalog;
  getTrackBySlug(slug: string): CatalogTrack | undefined;
  getAlbumBySlug(slug: string): MusicAlbum | undefined;
  getArtistBySlug(slug: string): MusicArtist | undefined;
  getPlaylistBySlug(slug: string): MusicPlaylist | undefined;
  getCdBySlug(slug: string): CdArchiveEntry | undefined;
}

/*
 * 第一阶段使用只读静态仓库，数据可随 Astro 构建直接发布。
 * 页面只能依赖这个接口；未来切换服务器数据库或本地扫描器时，
 * 用 ServerMusicRepository 替换实现即可，不需要重写页面组件。
 */
export const staticMusicRepository: MusicRepository = {
  getCatalog: () => MUSIC_CATALOG,
  getTrackBySlug: (slug) => MUSIC_CATALOG.tracks.find((track) => track.slug === slug),
  getAlbumBySlug: (slug) => MUSIC_CATALOG.albums.find((album) => album.slug === slug),
  getArtistBySlug: (slug) => MUSIC_CATALOG.artists.find((artist) => artist.slug === slug),
  getPlaylistBySlug: (slug) => MUSIC_CATALOG.playlists.find((playlist) => playlist.slug === slug),
  getCdBySlug: (slug) => MUSIC_CATALOG.cds.find((cd) => cd.slug === slug),
};
