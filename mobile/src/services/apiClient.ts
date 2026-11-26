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
  return keys.backendUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

export class ApiError extends Error {
  status: number;
  path: string;
  constructor(message: string, status: number, path: string) {
    super(message);
    this.status = status;
    this.path = path;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 30000,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.error ||
        data?.message ||
        `Request failed (${res.status}) on ${path}`;
      throw new ApiError(msg, res.status, path);
    }
    return data as T;
  } catch (err) {
    if (
      controller.signal.aborted ||
      (err instanceof Error && (err.name === 'AbortError' || /canceled|aborted/i.test(err.message)))
    ) {
      throw new Error('Request timed out. If Render was asleep, wait a few seconds and retry.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface ResolvedStreamInfo {
  videoId: string;
  playableUrl: string;
  proxyUrl: string;
  directUrl?: string;
  mimeType: string;
  contentLength?: number;
  resolver: string;
}

export const apiClient = {
  getStreamUrl(youtubeId: string): string {
    return `${getBaseUrl()}/api/stream/${encodeURIComponent(youtubeId)}`;
  },

  resolveStream(youtubeId: string): Promise<ResolvedStreamInfo> {
    return request(`/api/stream/${encodeURIComponent(youtubeId)}/resolve`, {}, 14000);
  },

  async probeDirectStream(youtubeId: string): Promise<{ ok: boolean; status: number; detail?: string }> {
    const url = this.getStreamUrl(youtubeId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-1023' },
        signal: controller.signal,
      });
      if (res.ok || res.status === 206) {
        return { ok: true, status: res.status };
      }
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        status: res.status,
        detail: data?.error || data?.message || `HTTP ${res.status}`,
      };
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof Error && (err.name === 'AbortError' || /canceled|aborted/i.test(err.message)))
      ) {
        return {
          ok: false,
          status: 408,
          detail: 'Backend stream probe timed out.',
        };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  health(): Promise<{ ok: boolean; service: string; version?: string }> {
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
