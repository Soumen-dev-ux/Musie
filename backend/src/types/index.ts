export interface Track {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // seconds
  artworkUrl: string;
  source: 'youtube' | 'spotify-matched';
  spotifyId?: string;
  streamUrl?: string;
  addedAt?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  tracks: Track[];
  source?: 'local' | 'spotify-import';
  createdAt: string;
  updatedAt: string;
}

export interface SponsorSegment {
  segment: [number, number]; // [startSec, endSec]
  category: string;
  actionType: string;
  UUID: string;
}

export interface AdGuardRule {
  id: string;
  pattern: string;
  type: 'block' | 'allow';
  comment?: string;
  enabled: boolean;
  createdAt: string;
}

export interface BlockedEvent {
  id: string;
  url: string;
  hostname: string;
  matchedRule: string;
  source: string;
  timestamp: string;
}

export interface AdGuardConfig {
  enabled: boolean;
  blockAdDomains: boolean;
  sponsorBlockEnabled: boolean;
  stripTrackingParams: boolean;
  blockThirdPartyAudioAds: boolean;
}

export interface AdGuardStats {
  totalInspected: number;
  totalBlocked: number;
  sponsorSegmentsSkipped: number;
  trackingParamsStripped: number;
  recentBlocked: BlockedEvent[];
}

export interface ApiCredentials {
  youtubeApiKey?: string;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
}
