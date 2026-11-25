import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import yts, { type YtsVideo } from 'yt-search';
import { Innertube } from 'youtubei.js';
import { env } from '../config/env.js';
import { Track } from '../types/index.js';
import { adguardService } from './adguardService.js';

const execFileAsync = promisify(execFile);

interface CachedStream {
  url: string;
  mimeType: string;
  contentLength?: number;
  expiresAt: number;
}

interface HomeSection {
  id: string;
  title: string;
  subtitle: string;
  tracks: Track[];
}

function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function cleanVideoTitle(title: string): string {
  return title
    .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
    .replace(/\[Official\s*(Music\s*)?Video\]/gi, '')
    .replace(/\(Official\s*Audio\)/gi, '')
    .replace(/\[Official\s*Audio\]/gi, '')
    .replace(/\(Lyrics?\)/gi, '')
    .replace(/\[Lyrics?\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanArtistName(channelTitle: string): string {
  return channelTitle.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim() || 'Unknown Artist';
}

class YouTubeService {
  private streamCache = new Map<string, CachedStream>();
  private homeCache: { data: HomeSection[]; expiresAt: number } | null = null;
  private innertubePromise: Promise<Innertube> | null = null;

  private async getInnertube(): Promise<Innertube> {
    if (!this.innertubePromise) {
      this.innertubePromise = Innertube.create({
        retrieve_player: true,
      }).catch((err) => {
        this.innertubePromise = null;
        throw err;
      });
    }
    return this.innertubePromise;
  }

  public async testApiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
    const key = apiKey.trim();
    if (!key) {
      return { valid: false, message: 'API key is empty' };
    }
    try {
      await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'snippet',
          chart: 'mostPopular',
          videoCategoryId: '10',
          maxResults: 1,
          key,
        },
        timeout: 6000,
      });
      return { valid: true, message: 'YouTube Data API v3 key is valid' };
    } catch (error: unknown) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.message
        : 'Failed to validate YouTube API key';
      return { valid: false, message: msg };
    }
  }

  public async searchTracks(
    query: string,
    youtubeApiKey?: string,
    limit = 20,
  ): Promise<{ tracks: Track[]; provider: 'youtube-data-api' | 'yt-search-fallback' }> {
    const effectiveKey = (youtubeApiKey || env.youtubeApiKey || '').trim();

    if (effectiveKey) {
      try {
        const tracks = await this.searchViaDataApi(query, effectiveKey, limit);
        if (tracks.length > 0) {
          return { tracks, provider: 'youtube-data-api' };
        }
      } catch (err) {
        console.warn('[YouTube] Data API search failed, falling back to yt-search:', err);
      }
    }

    const fallbackTracks = await this.searchViaYtSearch(query, limit);
    return { tracks: fallbackTracks, provider: 'yt-search-fallback' };
  }

  private async searchViaDataApi(query: string, apiKey: string, limit: number): Promise<Track[]> {
    const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: `${query} audio`,
        type: 'video',
        videoCategoryId: '10',
        maxResults: Math.min(limit, 25),
        key: apiKey,
      },
      timeout: 8000,
    });

    const items = searchRes.data?.items || [];
    const videoIds = items
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter(Boolean) as string[];

    if (videoIds.length === 0) return [];

    const detailsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'contentDetails,snippet',
        id: videoIds.join(','),
        key: apiKey,
      },
      timeout: 8000,
    });

    const detailItems = detailsRes.data?.items || [];
    return detailItems.map(
      (item: {
        id: string;
        snippet: {
          title: string;
          channelTitle: string;
          thumbnails?: {
            maxres?: { url: string };
            high?: { url: string };
            medium?: { url: string };
          };
        };
        contentDetails?: { duration?: string };
      }) => {
        const thumb =
          item.snippet.thumbnails?.maxres?.url ||
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;

        const inspectedThumb = adguardService.inspectUrl(thumb, 'youtube-thumb');

        return {
          id: `yt-${item.id}`,
          youtubeId: item.id,
          title: cleanVideoTitle(item.snippet.title),
          artist: cleanArtistName(item.snippet.channelTitle),
          album: 'YouTube Music',
          duration: parseIsoDuration(item.contentDetails?.duration || 'PT0S'),
          artworkUrl: inspectedThumb.allowed ? inspectedThumb.sanitizedUrl : thumb,
          source: 'youtube' as const,
        };
      },
    );
  }

  private async searchViaYtSearch(query: string, limit: number): Promise<Track[]> {
    const result = await yts(query);
    const videos = (result.videos || []).slice(0, limit);

    return videos.map((v: YtsVideo) => {
      const thumb = v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      const inspectedThumb = adguardService.inspectUrl(thumb, 'youtube-thumb');
      return {
        id: `yt-${v.videoId}`,
        youtubeId: v.videoId,
        title: cleanVideoTitle(v.title),
        artist: cleanArtistName(v.author?.name || 'YouTube'),
        album: 'YouTube Music',
        duration: v.seconds || 0,
        artworkUrl: inspectedThumb.allowed ? inspectedThumb.sanitizedUrl : thumb,
        source: 'youtube' as const,
      };
    });
  }

  public async getRelatedTracks(videoId: string, youtubeApiKey?: string): Promise<Track[]> {
    try {
      const innertube = await this.getInnertube();
      const info = await innertube.getInfo(videoId);
      const watchNext = info.watch_next_feed || [];
      const tracks: Track[] = [];

      for (const item of watchNext) {
        if (tracks.length >= 12) break;
        const anyItem = item as {
          id?: string;
          title?: { text?: string };
          author?: { name?: string };
          duration?: { seconds?: number };
          thumbnails?: Array<{ url: string }>;
        };
        if (anyItem.id && anyItem.title?.text) {
          tracks.push({
            id: `yt-${anyItem.id}`,
            youtubeId: anyItem.id,
            title: cleanVideoTitle(anyItem.title.text),
            artist: cleanArtistName(anyItem.author?.name || 'YouTube'),
            album: 'Up Next',
            duration: anyItem.duration?.seconds || 0,
            artworkUrl:
              anyItem.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${anyItem.id}/hqdefault.jpg`,
            source: 'youtube',
          });
        }
      }
      if (tracks.length > 0) return tracks;
    } catch {
      // Fallback to search query
    }
    const { tracks } = await this.searchTracks('top music mix', youtubeApiKey, 10);
    return tracks.filter((t) => t.youtubeId !== videoId);
  }

  public async getHomeFeed(youtubeApiKey?: string): Promise<HomeSection[]> {
    if (this.homeCache && this.homeCache.expiresAt > Date.now()) {
      return this.homeCache.data;
    }

    const categories = [
      { id: 'trending', title: 'Trending Now', subtitle: 'Fresh audio from YouTube', query: 'official audio top hits 2026' },
      { id: 'lofi', title: 'Focus & Lo-Fi', subtitle: 'Chill beats for coding and study', query: 'lofi hip hop chill beats' },
      { id: 'energy', title: 'Workout & Energy', subtitle: 'High-tempo electronic & pop', query: 'electronic workout mix official audio' },
      { id: 'late-night', title: 'Late Night Vibes', subtitle: 'R&B and synthwave', query: 'late night rnb synthwave mix' },
    ];

    const sections = await Promise.all(
      categories.map(async (cat) => {
        try {
          const { tracks } = await this.searchTracks(cat.query, youtubeApiKey, 8);
          return {
            id: cat.id,
            title: cat.title,
            subtitle: cat.subtitle,
            tracks,
          };
        } catch {
          return {
            id: cat.id,
            title: cat.title,
            subtitle: cat.subtitle,
            tracks: [],
          };
        }
      }),
    );

    this.homeCache = {
      data: sections,
      expiresAt: Date.now() + 1000 * 60 * 10,
    };
    return sections;
  }

  public async resolveAudioStream(videoId: string): Promise<CachedStream> {
    const cached = this.streamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    let resolved: CachedStream | null = null;

    // Tier 1: Try yt-dlp if available on the host machine
    try {
      resolved = await this.resolveWithYtDlp(videoId);
    } catch {
      // Silently fall back to Innertube pure JS
    }

    // Tier 2: Pure JS youtubei.js (Innertube)
    if (!resolved) {
      resolved = await this.resolveWithInnertube(videoId);
    }

    const guardCheck = adguardService.inspectUrl(resolved.url, 'youtube-audio-stream');
    if (!guardCheck.allowed) {
      throw new Error(`Stream URL blocked by AdGuard (${guardCheck.matchedRule})`);
    }
    resolved.url = guardCheck.sanitizedUrl;

    this.streamCache.set(videoId, resolved);
    return resolved;
  }

  private async resolveWithYtDlp(videoId: string): Promise<CachedStream> {
    const target = `https://www.youtube.com/watch?v=${videoId}`;
    const { stdout } = await execFileAsync(
      env.ytDlpPath,
      ['-f', 'bestaudio[ext=m4a]/bestaudio', '-g', '--no-playlist', '--no-warnings', target],
      { timeout: 15000 },
    );
    const streamUrl = stdout.trim().split('\n')[0]?.trim();
    if (!streamUrl || !streamUrl.startsWith('http')) {
      throw new Error('yt-dlp returned empty URL');
    }
    return {
      url: streamUrl,
      mimeType: streamUrl.includes('mime=audio%2Fwebm') ? 'audio/webm' : 'audio/mp4',
      expiresAt: Date.now() + 1000 * 60 * 25,
    };
  }

  private async resolveWithInnertube(videoId: string): Promise<CachedStream> {
    const innertube = await this.getInnertube();
    const info = await innertube.getBasicInfo(videoId);
    const format = info.chooseFormat({
      type: 'audio',
      quality: 'best',
      format: 'mp4',
    });

    const fallbackFormat =
      format ||
      info.chooseFormat({
        type: 'audio',
        quality: 'best',
      });

    if (!fallbackFormat) {
      throw new Error('No playable audio format found for this YouTube video');
    }

    const decipheredUrl = await fallbackFormat.decipher(innertube.session.player);
    if (!decipheredUrl) {
      throw new Error('Failed to decipher YouTube audio stream URL');
    }

    return {
      url: decipheredUrl,
      mimeType: fallbackFormat.mime_type?.split(';')[0] || 'audio/mp4',
      contentLength: fallbackFormat.content_length ? Number(fallbackFormat.content_length) : undefined,
      expiresAt: Date.now() + 1000 * 60 * 25,
    };
  }
}

export const youtubeService = new YouTubeService();
