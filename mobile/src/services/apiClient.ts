import {
  AdGuardConfig,
  AdGuardRule,
  AdGuardStats,
  HomeSection,
  Playlist,
  SponsorSegment,
  Track,
} from '../types';
import { useSettingsStore } from '../store/settingsStore';

function getHeaders(): Record<string, string> {
  const { keys } = useSettingsStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (keys.youtubeApiKey) headers['x-youtube-api-key'] = keys.youtubeApiKey;
  if (keys.spotifyClientId) headers['x-spotify-client-id'] = keys.spotifyClientId;
  if (keys.spotifyClientSecret) headers['x-spotify-client-secret'] = keys.spotifyClientSecret;
  return headers;
}

function getBaseUrl(): string {
  const { keys } = useSettingsStore.getState();
  return keys.backendUrl.replace(/\/+$/, '');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export const apiClient = {
  getStreamUrl(youtubeId: string): string {
    return `${getBaseUrl()}/api/stream/${encodeURIComponent(youtubeId)}`;
  },

  health(): Promise<{ ok: boolean; service: string }> {
    return request('/health');
  },

  getHomeFeed(): Promise<{ sections: HomeSection[] }> {
    return request('/api/youtube/home');
  },

  searchYouTube(
    query: string,
    limit = 20,
  ): Promise<{ tracks: Track[]; provider: string }> {
    return request(`/api/youtube/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  },

  getRelatedTracks(videoId: string): Promise<{ tracks: Track[] }> {
    return request(`/api/youtube/related/${encodeURIComponent(videoId)}`);
  },

  testYouTubeKey(youtubeApiKey: string): Promise<{ valid: boolean; message: string }> {
    return request('/api/youtube/test-key', {
      method: 'POST',
      body: JSON.stringify({ youtubeApiKey }),
    });
  },

  testSpotifyKeys(
    spotifyClientId: string,
    spotifyClientSecret: string,
  ): Promise<{ valid: boolean; message: string }> {
    return request('/api/spotify/test-keys', {
      method: 'POST',
      body: JSON.stringify({ spotifyClientId, spotifyClientSecret }),
    });
  },

  searchSpotify(query: string): Promise<{
    tracks: Array<{
      spotifyId: string;
      title: string;
      artist: string;
      album: string;
      duration: number;
      artworkUrl: string;
    }>;
  }> {
    return request(`/api/spotify/search?q=${encodeURIComponent(query)}`);
  },

  matchSpotifyTrack(payload: {
    spotifyId?: string;
    title: string;
    artist: string;
    artworkUrl?: string;
  }): Promise<{ track: Track }> {
    return request('/api/spotify/match-track', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  importSpotifyPlaylist(playlistUrl: string): Promise<{ playlist: Playlist }> {
    return request('/api/spotify/import-playlist', {
      method: 'POST',
      body: JSON.stringify({ playlistUrl }),
    });
  },

  getSponsorSegments(videoId: string): Promise<{ videoId: string; segments: SponsorSegment[] }> {
    return request(`/api/stream/${encodeURIComponent(videoId)}/segments`);
  },

  getLibrary(): Promise<{
    likedTracks: Track[];
    playlists: Playlist[];
    recentlyPlayed: Track[];
  }> {
    return request('/api/library');
  },

  toggleLike(track: Track): Promise<{ liked: boolean; likedTracks: Track[] }> {
    return request('/api/library/like', {
      method: 'POST',
      body: JSON.stringify({ track }),
    });
  },

  recordRecent(track: Track): Promise<{ recentlyPlayed: Track[] }> {
    return request('/api/library/recent', {
      method: 'POST',
      body: JSON.stringify({ track }),
    });
  },

  createPlaylist(name: string, description = ''): Promise<{ playlist: Playlist }> {
    return request('/api/library/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  },

  addTrackToPlaylist(playlistId: string, track: Track): Promise<{ playlist: Playlist }> {
    return request(`/api/library/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ track }),
    });
  },

  removeTrackFromPlaylist(playlistId: string, youtubeId: string): Promise<{ playlist: Playlist }> {
    return request(
      `/api/library/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(youtubeId)}`,
      { method: 'DELETE' },
    );
  },

  deletePlaylist(playlistId: string): Promise<{ deleted: boolean }> {
    return request(`/api/library/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'DELETE',
    });
  },

  getAdGuardStatus(): Promise<{
    config: AdGuardConfig;
    stats: AdGuardStats;
    ruleCount: number;
  }> {
    return request('/api/adguard/status');
  },

  updateAdGuardConfig(patch: Partial<AdGuardConfig>): Promise<{ config: AdGuardConfig }> {
    return request('/api/adguard/config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  getAdGuardRules(): Promise<{ rules: AdGuardRule[] }> {
    return request('/api/adguard/rules');
  },

  addAdGuardRule(
    pattern: string,
    type: 'block' | 'allow' = 'block',
    comment?: string,
  ): Promise<{ rule: AdGuardRule }> {
    return request('/api/adguard/rules', {
      method: 'POST',
      body: JSON.stringify({ pattern, type, comment }),
    });
  },

  toggleAdGuardRule(id: string, enabled: boolean): Promise<{ rule: AdGuardRule }> {
    return request(`/api/adguard/rules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  deleteAdGuardRule(id: string): Promise<{ deleted: boolean }> {
    return request(`/api/adguard/rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  recordSponsorSkip(count = 1): Promise<{ stats: AdGuardStats }> {
    return request('/api/adguard/stats/sponsor-skip', {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
  },

  resetAdGuardStats(): Promise<{ stats: AdGuardStats }> {
    return request('/api/adguard/stats/reset', { method: 'POST' });
  },
};
