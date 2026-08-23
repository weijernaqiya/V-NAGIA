import type { CatalogTrack, MusicCatalog } from '../../types/music';

export const formatTrackDuration = (duration: number | null) => {
  if (duration === null || !Number.isFinite(duration)) return '—';
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const getTrackArtist = (catalog: MusicCatalog, track: CatalogTrack) => (
  catalog.artists.find((artist) => artist.id === track.primaryArtistId)
);

export const getTrackAlbum = (catalog: MusicCatalog, track: CatalogTrack) => (
  track.albumId ? catalog.albums.find((album) => album.id === track.albumId) : undefined
);

export const getAlbumTracks = (catalog: MusicCatalog, albumId: string) => {
  const album = catalog.albums.find((item) => item.id === albumId);
  if (!album) return [];
  const order = new Map(album.trackIds.map((id, index) => [id, index]));
  return catalog.tracks
    .filter((track) => track.albumId === albumId)
    .sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
};

export const getPlaylistTracks = (catalog: MusicCatalog, trackIds: readonly string[]) => {
  const byId = new Map(catalog.tracks.map((track) => [track.id, track]));
  return trackIds.flatMap((id) => {
    const track = byId.get(id);
    return track ? [track] : [];
  });
};

export const getArtistAlbums = (catalog: MusicCatalog, artistId: string) => (
  catalog.albums.filter((album) => album.artistIds.includes(artistId))
);

export const getArtistTracks = (catalog: MusicCatalog, artistId: string) => (
  catalog.tracks.filter((track) => track.credits.some((credit) => credit.artistId === artistId))
);

export const getCatalogGenres = (catalog: MusicCatalog) => (
  [...new Set(catalog.tracks.flatMap((track) => track.genres))].sort((a, b) => a.localeCompare(b))
);

export const getCatalogYears = (catalog: MusicCatalog) => (
  [...new Set(catalog.tracks.flatMap((track) => track.year === null ? [] : [track.year]))]
    .sort((a, b) => b - a)
);
