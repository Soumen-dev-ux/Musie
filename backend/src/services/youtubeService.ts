import axios from 'axios';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import yts, { type YtsVideo } from 'yt-search';
import { Innertube } from 'youtubei.js';
import { env } from '../config/env.js';
import { Track } from '../types/index.js';
import { adguardService } from './adguardService.js';

const execFileAsync = promisify(execFile);

export interface CachedStream {
  url: string;
  mimeType: string;
  contentLength?: number;
  headers?: Record<string, string>;
  resolver: string;
  preferDirect: boolean;
  expiresAt: number;
}

const DEFAULT_WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IOS_CLIENT_UA =
  'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)';
const ANDROID_CLIENT_UA =
  'com.google.android.youtube/19.35.36(Linux; U; Android 13; en_US; SM-S908E Build/TP1A.220624.014) gzip';

type GetVideoInfoOptions = NonNullable<Parameters<Innertube['getBasicInfo']>[1]>;
type InnertubeClientName = NonNullable<GetVideoInfoOptions['client']>;

const INNERTUBE_CLIENTS: Array<{
  client: InnertubeClientName;
  userAgent: string;
}> = [
  { client: 'IOS', userAgent: IOS_CLIENT_UA },
  { client: 'ANDROID', userAgent: ANDROID_CLIENT_UA },
  { client: 'TV_EMBEDDED', userAgent: DEFAULT_WEB_UA },
  { client: 'TV', userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version' },
  { client: 'MWEB', userAgent: DEFAULT_WEB_UA },
  { client: 'WEB', userAgent: DEFAULT_WEB_UA },
];

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

function normalizeCookiesInput(raw: string): string {
  // Handle single-line escaped newlines if pasted into a single-line env var input
  const unescaped = raw.includes('\\n') && !raw.includes('\n') ? raw.replace(/\\n/g, '\n') : raw;
  return unescaped.trim();
}

function parseNetscapeCookiesToHeader(raw: string): string {
  const normalized = normalizeCookiesInput(raw);
  const pairs: string[] = [];
  for (const line of normalized.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const cols = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(/\s+/);
    if (cols.length >= 7) {
      pairs.push(`${cols[5]}=${cols[6]}`);
    }
  }
  if (pairs.length > 0) return pairs.join('; ');
  // If user pasted raw Cookie header directly (e.g. "SAPISID=...; SID=...")
  return normalized.includes('=') && !normalized.includes('\n') ? normalized : '';
}

class YouTubeService {
  private streamCache = new Map<string, CachedStream>();
  private inflightStreams = new Map<string, Promise<CachedStream>>();
  private searchCache = new Map<string, { tracks: Track[]; provider: 'youtube-data-api' | 'yt-search-fallback'; expiresAt: number }>();
  private homeCache: { data: HomeSection[]; expiresAt: number } | null = null;
  private innertubePromise: Promise<Innertube> | null = null;
  private resolvedCookiesFile: string | null = null;
  private resolvedCookieHeader = '';

  constructor() {
    this.initCookies();
  }

  private initCookies(): void {
    try {
      if (env.ytCookiesContent.trim()) {
        const normalized = normalizeCookiesInput(env.ytCookiesContent);
        const tmpCookiePath = path.join(os.tmpdir(), 'musie-yt-cookies.txt');
        fs.writeFileSync(tmpCookiePath, normalized + '\n', 'utf-8');
        this.resolvedCookiesFile = tmpCookiePath;
        this.resolvedCookieHeader = parseNetscapeCookiesToHeader(normalized);
        return;
      }
      if (env.ytCookiesFile && fs.existsSync(env.ytCookiesFile)) {
        this.resolvedCookiesFile = env.ytCookiesFile;
        const raw = fs.readFileSync(env.ytCookiesFile, 'utf-8');
        this.resolvedCookieHeader = parseNetscapeCookiesToHeader(raw);
      }
    } catch (err) {
      console.warn('[YouTube] Failed to initialize cookies:', err);
    }
  }

  public hasCookies(): boolean {
    return Boolean(this.resolvedCookieHeader || this.resolvedCookiesFile);
  }

  private setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
    if (map.has(key)) {
      map.delete(key);
    } else if (map.size >= maxSize) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) {
        map.delete(oldestKey);
      }
    }
    map.set(key, value);
  }

  private async getInnertube(): Promise<Innertube> {
    if (!this.innertubePromise) {
      this.innertubePromise = Innertube.create({
        retrieve_player: true,
        generate_session_locally: true,
        cookie: this.resolvedCookieHeader || undefined,
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
    const cacheKey = `${query.toLowerCase().trim()}::${limit}::${effectiveKey ? 'api' : 'fb'}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { tracks: cached.tracks, provider: cached.provider };
    }

    if (effectiveKey) {
      try {
        const tracks = await this.searchViaDataApi(query, effectiveKey, limit);
        if (tracks.length > 0) {
          this.setBoundedCache(
            this.searchCache,
            cacheKey,
            { tracks, provider: 'youtube-data-api', expiresAt: Date.now() + 1000 * 60 * 10 },
            200,
          );
          return { tracks, provider: 'youtube-data-api' };
        }
      } catch (err) {
        console.warn('[YouTube] Data API search failed, falling back to yt-search:', err);
      }
    }

    const fallbackTracks = await this.searchViaYtSearch(query, limit);
    this.setBoundedCache(
      this.searchCache,
      cacheKey,
      { tracks: fallbackTracks, provider: 'yt-search-fallback', expiresAt: Date.now() + 1000 * 60 * 10 },
      200,
    );
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

  public invalidateStreamCache(videoId: string): void {
    this.streamCache.delete(videoId);
  }

  /**
   * Verifies that a resolved audio URL actually responds with 200/206 (not 403)
   * before caching or returning it to mobile ExoPlayer/AVPlayer.
   */
  private async verifyStreamReadable(stream: CachedStream): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': stream.headers?.['User-Agent'] || DEFAULT_WEB_UA,
        Range: 'bytes=0-1023',
      };
      if (stream.headers?.Referer) {
        headers.Referer = stream.headers.Referer;
      }
      const probe = await axios.get(stream.url, {
        headers,
        responseType: 'arraybuffer',
        timeout: 4000,
        validateStatus: (s) => s >= 200 && s < 400,
      });
      if (!stream.contentLength) {
        const contentRange = probe.headers['content-range'];
        if (typeof contentRange === 'string') {
          const totalMatch = contentRange.match(/\/(\d+)$/);
          if (totalMatch) {
            stream.contentLength = Number(totalMatch[1]);
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  public async resolveAudioStream(videoId: string): Promise<CachedStream> {
    const cached = this.streamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const inflight = this.inflightStreams.get(videoId);
    if (inflight) {
      return inflight;
    }

    const promise = this.resolveAudioStreamInternal(videoId).finally(() => {
      this.inflightStreams.delete(videoId);
    });
    this.inflightStreams.set(videoId, promise);
    return promise;
  }

  private async resolveAudioStreamInternal(videoId: string): Promise<CachedStream> {
    const errors: string[] = [];

    // Tier 1: yt-dlp (when running in Docker or host with yt-dlp installed)
    try {
      const candidate = await this.resolveWithYtDlp(videoId);
      if (await this.verifyStreamReadable(candidate)) {
        return this.finalizeStream(videoId, candidate);
      }
      errors.push('yt-dlp: resolved URL returned 403/unreadable');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('ENOENT')) {
        errors.push(`yt-dlp: ${msg}`);
      }
    }

    // Tier 2: Pure JS youtubei.js across multiple client profiles
    try {
      const candidate = await this.resolveWithInnertube(videoId);
      return this.finalizeStream(videoId, candidate);
    } catch (err) {
      errors.push(`innertube: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Tier 3: Piped proxy API fallback (helps when Render datacenter IP is flagged by YouTube)
    try {
      const candidate = await this.resolveWithPiped(videoId);
      return this.finalizeStream(videoId, candidate);
    } catch (err) {
      errors.push(`piped: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Tier 4: Dynamic Invidious public instances fallback
    try {
      const candidate = await this.resolveWithInvidious(videoId);
      return this.finalizeStream(videoId, candidate);
    } catch (err) {
      errors.push(`invidious: ${err instanceof Error ? err.message : String(err)}`);
    }

    throw new Error(
      `Unable to extract playable YouTube stream (${errors.join(' | ')}). ` +
        'If hosted on Render, deploy with Docker (yt-dlp) or set YT_COOKIES_CONTENT in Render Environment.',
    );
  }

  private finalizeStream(videoId: string, resolved: CachedStream): CachedStream {
    const guardCheck = adguardService.inspectUrl(resolved.url, 'youtube-audio-stream');
    if (!guardCheck.allowed) {
      throw new Error(`Stream URL blocked by AdGuard (${guardCheck.matchedRule})`);
    }
    if (!guardCheck.hostname.endsWith('googlevideo.com')) {
      resolved.url = guardCheck.sanitizedUrl;
    }
    this.setBoundedCache(this.streamCache, videoId, resolved, 500);
    return resolved;
  }

  private async resolveWithYtDlp(videoId: string): Promise<CachedStream> {
    const target = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      '-f',
      'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio/best',
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--extractor-args',
      'youtube:player_client=web_embedded,mweb,android_vr,tv',
    ];

    if (this.resolvedCookiesFile) {
      args.push('--cookies', this.resolvedCookiesFile);
    }
    if (env.ytProxyUrl) {
      args.push('--proxy', env.ytProxyUrl);
    }
    args.push(target);

    const { stdout } = await execFileAsync(env.ytDlpPath, args, {
      timeout: 14000,
      maxBuffer: 1024 * 1024 * 4,
    });

    const parsed = JSON.parse(stdout) as {
      url?: string;
      ext?: string;
      http_headers?: Record<string, string>;
      filesize?: number;
      filesize_approx?: number;
    };

    const streamUrl = parsed.url?.trim();
    if (!streamUrl || !streamUrl.startsWith('http')) {
      throw new Error('yt-dlp returned empty stream URL');
    }

    const mimeType =
      parsed.ext === 'webm' || streamUrl.includes('mime=audio%2Fwebm')
        ? 'audio/webm'
        : parsed.ext === 'mp3'
          ? 'audio/mpeg'
          : 'audio/mp4';

    return {
      url: streamUrl,
      mimeType,
      contentLength: parsed.filesize || parsed.filesize_approx,
      headers: parsed.http_headers,
      resolver: 'yt-dlp',
      preferDirect: false,
      expiresAt: Date.now() + 1000 * 60 * 25,
    };
  }

  private async resolveWithInnertube(videoId: string): Promise<CachedStream> {
    const innertube = await this.getInnertube();
    let lastError = 'No playable audio format found';

    for (const profile of INNERTUBE_CLIENTS) {
      try {
        const info = await innertube.getBasicInfo(videoId, { client: profile.client });
        const status = info.playability_status?.status;
        if (status && status !== 'OK' && !info.streaming_data) {
          lastError = `${profile.client}: ${info.playability_status?.reason || status}`;
          continue;
        }

        const format =
          info.chooseFormat({
            type: 'audio',
            quality: 'best',
            format: 'mp4',
          }) ||
          info.chooseFormat({
            type: 'audio',
            quality: 'best',
          });

        if (!format) {
          lastError = `${profile.client}: No audio format available`;
          continue;
        }

        let decipheredUrl = '';
        try {
          decipheredUrl = await format.decipher(innertube.session.player);
        } catch {
          decipheredUrl = format.url || '';
        }
        if (!decipheredUrl && format.url) {
          decipheredUrl = format.url;
        }

        if (!decipheredUrl) {
          lastError = `${profile.client}: Failed to decipher stream URL`;
          continue;
        }

        const candidate: CachedStream = {
          url: decipheredUrl,
          mimeType: format.mime_type?.split(';')[0] || 'audio/mp4',
          contentLength: format.content_length ? Number(format.content_length) : undefined,
          headers: { 'User-Agent': profile.userAgent },
          resolver: `innertube:${profile.client}`,
          preferDirect: false,
          expiresAt: Date.now() + 1000 * 60 * 25,
        };

        if (await this.verifyStreamReadable(candidate)) {
          return candidate;
        }
        lastError = `${profile.client}: Stream URL returned 403/unreadable`;
      } catch (err) {
        lastError = `${profile.client}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    throw new Error(lastError);
  }

  private async resolveWithPiped(videoId: string): Promise<CachedStream> {
    if (env.pipedInstances.length === 0) {
      throw new Error('No Piped instances available');
    }

    const attempts = env.pipedInstances.map(async (instance) => {
      const res = await axios.get<{
        audioStreams?: Array<{
          url?: string;
          mimeType?: string;
          format?: string;
          bitrate?: number;
          contentLength?: number;
        }>;
      }>(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        timeout: 4500,
      });

      const streams = res.data?.audioStreams || [];
      // Prefer M4A / audio/mp4 for universal iOS AVPlayer + Android ExoPlayer compatibility
      const sorted = [...streams].sort((a, b) => {
        const aMp4 = (a.mimeType || '').includes('mp4') ? 1 : 0;
        const bMp4 = (b.mimeType || '').includes('mp4') ? 1 : 0;
        if (aMp4 !== bMp4) return bMp4 - aMp4;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });

      for (const stream of sorted) {
        if (!stream.url) continue;
        const candidate: CachedStream = {
          url: stream.url,
          mimeType: stream.mimeType?.split(';')[0] || 'audio/mp4',
          contentLength: stream.contentLength,
          headers: { 'User-Agent': DEFAULT_WEB_UA },
          resolver: `piped:${new URL(instance).hostname}`,
          preferDirect: true,
          expiresAt: Date.now() + 1000 * 60 * 20,
        };
        if (await this.verifyStreamReadable(candidate)) {
          return candidate;
        }
      }
      throw new Error(`${instance}: no readable audioStreams`);
    });

    try {
      return await Promise.any(attempts);
    } catch (aggErr) {
      const messages =
        aggErr instanceof AggregateError
          ? aggErr.errors.map((e) => (e instanceof Error ? e.message : String(e)))
          : [String(aggErr)];
      throw new Error(messages.join('; '));
    }
  }

  private invidiousCache: { instances: string[]; expiresAt: number } | null = null;

  private async getInvidiousInstances(): Promise<string[]> {
    if (this.invidiousCache && this.invidiousCache.expiresAt > Date.now()) {
      return this.invidiousCache.instances;
    }

    const fallback = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be'];
    try {
      const res = await axios.get<
        Array<[string, { type?: string; api?: boolean; uri?: string }]>
      >('https://api.invidious.io/instances.json?sort_by=type,api,users', {
        timeout: 5000,
      });

      const discovered = (res.data || [])
        .filter(([, meta]) => meta?.type === 'https' && meta?.api === true && meta?.uri)
        .map(([, meta]) => meta.uri!.replace(/\/+$/, ''))
        .slice(0, 6);

      const instances = discovered.length > 0 ? discovered : fallback;
      this.invidiousCache = {
        instances,
        expiresAt: Date.now() + 1000 * 60 * 30,
      };
      return instances;
    } catch {
      return fallback;
    }
  }

  private async resolveWithInvidious(videoId: string): Promise<CachedStream> {
    const instances = (await this.getInvidiousInstances()).slice(0, 4);
    if (instances.length === 0) {
      throw new Error('No Invidious instances available');
    }

    const attempts = instances.map(async (instance) => {
      const res = await axios.get<{
        adaptiveFormats?: Array<{
          url?: string;
          type?: string;
          bitrate?: string | number;
          clen?: string | number;
        }>;
      }>(`${instance}/api/v1/videos/${encodeURIComponent(videoId)}`, {
        params: { fields: 'adaptiveFormats', local: true },
        timeout: 4500,
      });

      const formats = (res.data?.adaptiveFormats || []).filter(
        (f) => Boolean(f.url) && (f.type || '').startsWith('audio/'),
      );

      const sorted = [...formats].sort((a, b) => {
        const aMp4 = (a.type || '').includes('audio/mp4') ? 1 : 0;
        const bMp4 = (b.type || '').includes('audio/mp4') ? 1 : 0;
        if (aMp4 !== bMp4) return bMp4 - aMp4;
        return Number(b.bitrate || 0) - Number(a.bitrate || 0);
      });

      for (const fmt of sorted) {
        if (!fmt.url) continue;
        const absoluteUrl = fmt.url.startsWith('http')
          ? fmt.url
          : `${instance}${fmt.url.startsWith('/') ? '' : '/'}${fmt.url}`;
        const candidate: CachedStream = {
          url: absoluteUrl,
          mimeType: fmt.type?.split(';')[0] || 'audio/mp4',
          contentLength: fmt.clen ? Number(fmt.clen) : undefined,
          headers: { 'User-Agent': DEFAULT_WEB_UA },
          resolver: `invidious:${new URL(instance).hostname}`,
          preferDirect: true,
          expiresAt: Date.now() + 1000 * 60 * 20,
        };
        if (await this.verifyStreamReadable(candidate)) {
          return candidate;
        }
      }
      throw new Error(`${instance}: no readable audio formats`);
    });

    try {
      return await Promise.any(attempts);
    } catch (aggErr) {
      const messages =
        aggErr instanceof AggregateError
          ? aggErr.errors.map((e) => (e instanceof Error ? e.message : String(e)))
          : [String(aggErr)];
      throw new Error(messages.join('; '));
    }
  }
}

export const youtubeService = new YouTubeService();
