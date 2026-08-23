export type AudioFormat = 'FLAC' | 'MP3' | 'AAC' | 'M4A' | 'WAV' | 'OGG' | 'OPUS';
export type MusicVisibility = 'public' | 'private' | 'unlisted';
export type MusicAvailability = 'playable' | 'metadata-only';
export type MusicCreditRole =
  | 'primary'
  | 'featured'
  | 'composer'
  | 'lyricist'
  | 'arranger'
  | 'producer'
  | 'performer'
  | 'conductor'
  | 'orchestra';

export interface MusicCredit {
  artistId: string;
  role: MusicCreditRole;
  label?: string;
}

export interface AudioSource {
  src: string;
  format: AudioFormat;
  mimeType: string;
  lossless: boolean;
  codec?: string;
  bitDepth?: number;
  sampleRate?: number;
  bitrate?: number;
  visibility: MusicVisibility;
}

export interface LyricsDocument {
  format: 'plain' | 'lrc';
  source: 'manual';
  original: string;
  translation?: string;
}

export interface CatalogTrack {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  sortTitle?: string;
  primaryArtistId: string;
  credits: readonly MusicCredit[];
  albumId: string | null;
  discNumber: number;
  trackNumber: number | null;
  duration: number | null;
  year: number | null;
  genres: readonly string[];
  audio: AudioSource | null;
  artwork: string | null;
  lyrics: LyricsDocument | null;
  favorite: boolean;
  rating: number | null;
  playCount: number;
  addedAt: string;
  note?: string;
  availability: MusicAvailability;
  loop?: boolean;
}

export interface MusicAlbum {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  artistIds: readonly string[];
  year: number | null;
  releaseDate?: string;
  albumType: 'album' | 'single' | 'ep' | 'soundtrack' | 'site-theme' | 'archive';
  genres: readonly string[];
  artwork: string | null;
  accent: string;
  trackIds: readonly string[];
  edition?: string;
  label?: string;
  catalogNumber?: string;
  note?: string;
  visibility: MusicVisibility;
}

export interface MusicArtist {
  id: string;
  slug: string;
  name: string;
  sortName?: string;
  country?: string | null;
  years?: string | null;
  genres: readonly string[];
  portrait: string | null;
  note?: string;
}

export interface MusicPlaylist {
  id: string;
  slug: string;
  title: string;
  description: string;
  artwork: string | null;
  trackIds: readonly string[];
  updatedAt: string;
  visibility: MusicVisibility;
}

export type CdCollectionStatus = 'owned' | 'wishlist' | 'ordered' | 'archived' | 'lost';
export type CdRipStatus = 'not-ripped' | 'ripped' | 'verified' | 'error';

export interface CdArchiveEntry {
  id: string;
  slug: string;
  albumId: string;
  edition?: string;
  catalogNumber?: string;
  barcode?: string;
  country?: string;
  releaseDate?: string;
  label?: string;
  format: 'CD' | 'SACD' | 'VINYL' | 'DIGITAL';
  discCount: number;
  condition?: string;
  purchaseDate?: string;
  purchasePrice?: string;
  seller?: string;
  notes?: string;
  artwork: string | null;
  status: CdCollectionStatus;
  ripStatus: CdRipStatus;
  ripDate?: string;
}

export interface ListeningHistoryEntry {
  id: string;
  trackId: string;
  playedAt: string;
  source: 'album' | 'playlist' | 'search' | 'manual' | 'title';
  completed: boolean;
}

export interface MusicCatalog {
  artists: readonly MusicArtist[];
  albums: readonly MusicAlbum[];
  tracks: readonly CatalogTrack[];
  playlists: readonly MusicPlaylist[];
  cds: readonly CdArchiveEntry[];
}
