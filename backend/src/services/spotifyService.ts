import axios from 'axios';
import { env } from '../config/env.js';
import { ApiCredentials, Track } from '../types/index.js';
import { youtubeService } from './youtubeService.js';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

function extractSpotifyId(input: string, kind: 'playlist' | 'album' | 'track'): string {
  const trimmed = input.trim();
  const urlRegex = new RegExp(`spotify\\.com\\/${kind}\\/([a-zA-Z0-9]+)`);
  const urlMatch = trimmed.match(urlRegex);
  if (urlMatch) return urlMatch[1];

  const uriRegex = new RegExp(`spotify:${kind}:([a-zA-Z0-9]+)`);
  const uriMatch = trimmed.match(uriRegex);
  if (uriMatch) return uriMatch[1];

  return trimmed.split('?')[0];
}

class SpotifyService {
  private tokenCache = new Map<string, CachedToken>();

  private resolveCreds(creds?: ApiCredentials): { clientId: string; clientSecret: string } {
    const clientId = (creds?.spotifyClientId || env.spotifyClientId || '').trim();
    const clientSecret = (creds?.spotifyClientSecret || env.spotifyClientSecret || '').trim();
    return { clientId, clientSecret };
  }

  private async getAccessToken(creds?: ApiCredentials): Promise<string> {
    const { clientId, clientSecret } = this.resolveCreds(creds);
    if (!clientId || !clientSecret) {
      throw new Error('Spotify Client ID and Client Secret are required. Add them in App Settings.');
    }

    const cacheKey = `${clientId}:${clientSecret.slice(0, 6)}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 15000) {
      return cached.accessToken;
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await axios.post<{ access_token: string; expires_in: number }>(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 8000,
      },
    );

    const token = response.data.access_token;
    const expiresAt = Date.now() + response.data.expires_in * 1000;
    this.tokenCache.set(cacheKey, { accessToken: token, expiresAt });
    return token;
  }

  public async testCredentials(creds?: ApiCredentials): Promise<{ valid: boolean; message: string }> {
    try {
      await this.getAccessToken(creds);
      return { valid: true, message: 'Spotify API credentials verified' };
    } catch (error: unknown) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.error_description || error.message
        : error instanceof Error
          ? error.message
          : 'Invalid Spotify credentials';
      return { valid: false, message: msg };
    }
  }

  public async searchTracks(query: string, creds?: ApiCredentials, limit = 15) {
    const token = await this.getAccessToken(creds);
    const res = await axios.get('https://api.spotify.com/v1/search', {
      params: { q: query, type: 'track', limit },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });

    const items = res.data?.tracks?.items || [];
    return items.map(
      (item: {
        id: string;
        name: string;
        duration_ms: number;
        artists: Array<{ name: string }>;
        album: { name: string; images: Array<{ url: string }> };
      }) => ({
        spotifyId: item.id,
        title: item.name,
        artist: item.artists.map((a) => a.name).join(', '),
        album: item.album?.name || 'Spotify',
        duration: Math.round((item.duration_ms || 0) / 1000),
        artworkUrl: item.album?.images?.[0]?.url || '',
      }),
    );
  }

  /**
   * Fetches a Spotify playlist's metadata and resolves each track against YouTube
   * so it can be streamed seamlessly inside Musie.
   */
  public async importPlaylistToYouTube(
    playlistInput: string,
    creds?: ApiCredentials,
    maxTracks = 25,
  ): Promise<{ name: string; description: string; coverUrl: string; tracks: Track[] }> {
    const token = await this.getAccessToken(creds);
    const playlistId = extractSpotifyId(playlistInput, 'playlist');

    const res = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    const data = res.data;
    const rawItems = (data.tracks?.items || []).slice(0, maxTracks);

    const matchedTracks: Track[] = [];
    for (const entry of rawItems) {
      const spTrack = entry?.track;
      if (!spTrack || !spTrack.name) continue;
      const artistNames = (spTrack.artists || []).map((a: { name: string }) => a.name).join(', ');
      const searchQuery = `${spTrack.name} ${artistNames} official audio`;

      try {
        const { tracks } = await youtubeService.searchTracks(searchQuery, creds?.youtubeApiKey, 1);
        const best = tracks[0];
        if (best) {
          matchedTracks.push({
            ...best,
            id: `sp-${spTrack.id}`,
            title: spTrack.name,
            artist: artistNames || best.artist,
            album: spTrack.album?.name || best.album,
            artworkUrl: spTrack.album?.images?.[0]?.url || best.artworkUrl,
            duration: spTrack.duration_ms ? Math.round(spTrack.duration_ms / 1000) : best.duration,
            source: 'spotify-matched',
            spotifyId: spTrack.id,
          });
        }
      } catch {
        // Skip tracks that fail to match
      }
    }

    return {
      name: data.name || 'Imported Spotify Playlist',
      description: data.description || 'Imported from Spotify & matched to YouTube audio',
      coverUrl: data.images?.[0]?.url || matchedTracks[0]?.artworkUrl || '',
      tracks: matchedTracks,
    };
  }
}

export const spotifyService = new SpotifyService();
