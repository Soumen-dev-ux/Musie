import { Platform } from 'react-native';
import { useAdGuardStore } from '../store/adguardStore';
import { filterExternalUrl } from './adguardClient';

interface InnerTubeClientProfile {
  name: string;
  endpoint: string;
  clientId: string;
  clientVersion: string;
  userAgent: string;
  extraHeaders?: Record<string, string>;
  client: Record<string, string | number>;
  thirdParty?: { embedUrl: string };
}

const CLIENT_PROFILES: InnerTubeClientProfile[] = [
  {
    name: 'IOS',
    endpoint: 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false',
    clientId: '5',
    clientVersion: '20.11.6',
    userAgent: 'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
    client: {
      clientName: 'iOS',
      clientVersion: '20.11.6',
      deviceMake: 'Apple',
      deviceModel: 'iPhone10,4',
      osName: 'iOS',
      osVersion: '16.7.7.20H330',
      platform: 'MOBILE',
      hl: 'en',
      gl: 'US',
    },
  },
  {
    name: 'ANDROID',
    endpoint: 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false',
    clientId: '3',
    clientVersion: '19.35.36',
    userAgent:
      'com.google.android.youtube/19.35.36(Linux; U; Android 13; en_US; SM-S908E Build/TP1A.220624.014) gzip',
    extraHeaders: {
      'X-GOOG-API-FORMAT-VERSION': '2',
    },
    client: {
      clientName: 'ANDROID',
      clientVersion: '19.35.36',
      deviceMake: 'Samsung',
      deviceModel: 'SM-S908E',
      osName: 'Android',
      osVersion: '13',
      androidSdkVersion: 33,
      platform: 'MOBILE',
      clientFormFactor: 'SMALL_FORM_FACTOR',
      hl: 'en',
      gl: 'US',
    },
  },
  {
    name: 'TV_EMBEDDED',
    endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    clientId: '85',
    clientVersion: '2.0',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraHeaders: {
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
    },
    client: {
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      clientScreen: 'EMBED',
      hl: 'en',
      gl: 'US',
    },
    thirdParty: {
      embedUrl: 'https://www.youtube.com/',
    },
  },
  {
    name: 'WEB_EMBEDDED',
    endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    clientId: '56',
    clientVersion: '1.20250219.01.00',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraHeaders: {
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
    },
    client: {
      clientName: 'WEB_EMBEDDED_PLAYER',
      clientVersion: '1.20250219.01.00',
      clientScreen: 'EMBED',
      hl: 'en',
      gl: 'US',
    },
    thirdParty: {
      embedUrl: 'https://www.google.com/',
    },
  },
  {
    name: 'ANDROID_VR',
    endpoint: 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false',
    clientId: '28',
    clientVersion: '1.60.19',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    client: {
      clientName: 'ANDROID_VR',
      clientVersion: '1.60.19',
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      osName: 'Android',
      osVersion: '12L',
      androidSdkVersion: 32,
      platform: 'MOBILE',
      hl: 'en',
      gl: 'US',
    },
  },
];

let cachedVisitorData: { value: string; expiresAt: number } | null = null;
let inflightVisitorData: Promise<string> | null = null;

function fetchVisitorData(): Promise<string> {
  if (cachedVisitorData && cachedVisitorData.expiresAt > Date.now()) {
    return Promise.resolve(cachedVisitorData.value);
  }
  if (inflightVisitorData) {
    return inflightVisitorData;
  }

  inflightVisitorData = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch('https://www.youtube.com/sw.js_data', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });
      const text = await res.text();
      const cleaned = text.replace(/^\)\]\}'\s*/, '');
      const match = cleaned.match(/"(Cg[a-zA-Z0-9_%-]{10,})"/);
      if (match?.[1]) {
        cachedVisitorData = {
          value: match[1],
          expiresAt: Date.now() + 1000 * 60 * 30,
        };
        return match[1];
      }
    } catch {
      // ignore and proceed without visitorData
    } finally {
      clearTimeout(timer);
      inflightVisitorData = null;
    }
    return '';
  })();

  return inflightVisitorData;
}

async function getVisitorDataFast(): Promise<string> {
  if (cachedVisitorData && cachedVisitorData.expiresAt > Date.now()) {
    return cachedVisitorData.value;
  }
  return Promise.race([
    fetchVisitorData(),
    new Promise<string>((resolve) => setTimeout(() => resolve(''), 900)),
  ]);
}

interface AdaptiveFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  contentLength?: string;
  type?: string;
  audioTrack?: {
    audioIsDefault?: boolean;
    id?: string;
  };
}

interface PlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  streamingData?: {
    adaptiveFormats?: AdaptiveFormat[];
    formats?: AdaptiveFormat[];
    hlsManifestUrl?: string;
  };
}

export interface DeviceResolvedStream {
  url: string;
  mimeType: string;
  resolver: string;
  headers?: Record<string, string>;
}

async function probeUrlReadable(url: string, headers?: Record<string, string>): Promise<boolean> {
  const fetchChunk = async (
    rangeHeader?: string,
  ): Promise<{ ok: boolean; status: number; contentType: string; bytes: number }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const reqHeaders: Record<string, string> = { ...(headers || {}) };
      if (rangeHeader) {
        reqHeaders.Range = rangeHeader;
      }
      const res = await fetch(url, {
        method: 'GET',
        headers: reqHeaders,
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok && res.status !== 206) {
        return { ok: false, status: res.status, contentType, bytes: 0 };
      }
      if (contentType.includes('text/html')) {
        return { ok: false, status: res.status, contentType, bytes: 0 };
      }
      const buf = await res.arrayBuffer();
      return { ok: buf.byteLength > 0, status: res.status, contentType, bytes: buf.byteLength };
    } catch {
      return { ok: false, status: 0, contentType: '', bytes: 0 };
    } finally {
      clearTimeout(timer);
    }
  };

  // For HLS playlists, verify the manifest itself loads
  if (url.includes('.m3u8') || url.includes('hls_playlist')) {
    const res = await fetchChunk();
    return res.ok;
  }

  // Probe both initial 1KB and a second 1KB chunk in parallel so URLs that 403 after byte 0 are rejected in 1 RTT
  const [first, second] = await Promise.all([
    fetchChunk('bytes=0-1023'),
    fetchChunk('bytes=65536-66559'),
  ]);
  if (!first.ok) return false;
  if (first.bytes < 1024) return true;
  return second.ok || second.status === 416;
}

function isPlayableAudioFormat(f: AdaptiveFormat): boolean {
  if (!f.url || !(f.mimeType || '').startsWith('audio/')) return false;
  if (f.type === 'FORMAT_STREAM_TYPE_OTF' || f.url.includes('otf=1') || f.url.includes('source=yt_otf')) {
    return false;
  }
  if (f.audioTrack && f.audioTrack.audioIsDefault === false) {
    return false;
  }
  return true;
}

function scoreAudioCandidate(f: AdaptiveFormat): number {
  const mime = f.mimeType || '';
  const isMp4Aac = mime.includes('audio/mp4') && (mime.includes('mp4a') || !mime.includes('ec-3'));
  const isWebm = mime.includes('audio/webm');
  const bitrate = f.bitrate || 0;
  // Prefer standard ~128kbps AAC (e.g. itag 140) for fast ExoPlayer/AVPlayer startup
  const idealBitrateScore = bitrate > 0 ? Math.max(0, 200000 - Math.abs(bitrate - 130000)) : 0;
  return (isMp4Aac ? 1_000_000 : isWebm ? 400_000 : 100_000) + idealBitrateScore;
}

const DEVICE_CACHE_TTL_MS = 1000 * 60 * 15;
const deviceStreamCache = new Map<string, { streams: DeviceResolvedStream[]; expiresAt: number }>();
const inflightAllResolves = new Map<string, Promise<{ collected: DeviceResolvedStream[]; errors: string[] }>>();

export function invalidateDeviceStreamCache(videoId: string, failedUrl?: string): void {
  if (!failedUrl) {
    deviceStreamCache.delete(videoId);
    return;
  }
  const entry = deviceStreamCache.get(videoId);
  if (!entry) return;
  const remaining = entry.streams.filter((s) => s.url !== failedUrl);
  if (remaining.length === 0) {
    deviceStreamCache.delete(videoId);
  } else {
    deviceStreamCache.set(videoId, { ...entry, streams: remaining });
  }
}

function getProfilesForPlatform(): InnerTubeClientProfile[] {
  if (Platform.OS === 'android') {
    // Android ExoPlayer frequently rejects PO-token-gated iOS streams with "Source error".
    // Prefer Android/VR/Embedded profiles on Android.
    return [
      ...CLIENT_PROFILES.filter((p) => p.name === 'ANDROID_VR'),
      ...CLIENT_PROFILES.filter((p) => p.name !== 'ANDROID_VR' && p.name !== 'IOS'),
    ];
  }
  return CLIENT_PROFILES;
}

function cacheDeviceStreams(videoId: string, streams: DeviceResolvedStream[]): void {
  if (streams.length === 0) return;
  if (deviceStreamCache.has(videoId)) {
    deviceStreamCache.delete(videoId);
  } else if (deviceStreamCache.size >= 100) {
    const oldest = deviceStreamCache.keys().next().value;
    if (oldest !== undefined) deviceStreamCache.delete(oldest);
  }
  deviceStreamCache.set(videoId, {
    streams,
    expiresAt: Date.now() + DEVICE_CACHE_TTL_MS,
  });
}

function firstResolved<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) {
      reject(new Error('No candidates to resolve'));
      return;
    }
    const errors: unknown[] = new Array(promises.length);
    let failures = 0;
    let settled = false;

    promises.forEach((p, idx) => {
      p.then(
        (value) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        },
        (err) => {
          errors[idx] = err;
          failures += 1;
          if (!settled && failures === promises.length) {
            const msg = errors
              .map((e) => (e instanceof Error ? e.message : String(e)))
              .join(' | ');
            reject(new Error(msg));
          }
        },
      );
    });
  });
}

async function resolveProfileStream(
  videoId: string,
  profile: InnerTubeClientProfile,
  visitorData: string,
  config: ReturnType<typeof useAdGuardStore.getState>['config'],
  rules: ReturnType<typeof useAdGuardStore.getState>['rules'],
): Promise<DeviceResolvedStream> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);

  try {
    const headers: Record<string, string> = {
      Accept: '*/*',
      'Content-Type': 'application/json',
      'User-Agent': profile.userAgent,
      'X-Youtube-Client-Name': profile.clientId,
      'X-Youtube-Client-Version': profile.clientVersion,
      ...(profile.extraHeaders || {}),
    };
    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = visitorData;
    }

    const clientContext: Record<string, string | number> = {
      ...profile.client,
      ...(visitorData ? { visitorData } : {}),
    };

    const res = await fetch(profile.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        context: {
          client: clientContext,
          ...(profile.thirdParty ? { thirdParty: profile.thirdParty } : {}),
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`${profile.name}: HTTP ${res.status}`);
    }

    const data = (await res.json()) as PlayerResponse;
    const status = data.playabilityStatus?.status;
    const adaptive = data.streamingData?.adaptiveFormats || [];
    const muxed = data.streamingData?.formats || [];
    const hlsUrl = data.streamingData?.hlsManifestUrl;

    if (status && status !== 'OK' && adaptive.length === 0 && muxed.length === 0 && !hlsUrl) {
      throw new Error(`${profile.name}: ${data.playabilityStatus?.reason || status}`);
    }

    const audioCandidates = adaptive
      .filter(isPlayableAudioFormat)
      .sort((a, b) => scoreAudioCandidate(b) - scoreAudioCandidate(a));

    const muxedCandidates = muxed.filter(
      (f) => Boolean(f.url) && f.type !== 'FORMAT_STREAM_TYPE_OTF' && !f.url?.includes('otf=1'),
    );
    const candidates = [...audioCandidates, ...muxedCandidates].slice(0, 2);

    for (const candidate of candidates) {
      if (!candidate.url) continue;
      const guard = filterExternalUrl(candidate.url, config, rules);
      if (!guard.allowed) continue;

      const reqHeaders = { 'User-Agent': profile.userAgent };
      if (await probeUrlReadable(candidate.url, reqHeaders)) {
        return {
          url: candidate.url,
          mimeType: candidate.mimeType?.split(';')[0] || 'audio/mp4',
          resolver: `device:${profile.name}`,
          headers: reqHeaders,
        };
      }
    }

    if (hlsUrl) {
      const guard = filterExternalUrl(hlsUrl, config, rules);
      const reqHeaders = { 'User-Agent': profile.userAgent };
      if (guard.allowed && (await probeUrlReadable(hlsUrl, reqHeaders))) {
        return {
          url: hlsUrl,
          mimeType: 'application/x-mpegURL',
          resolver: `device:${profile.name}-hls`,
          headers: reqHeaders,
        };
      }
    }

    throw new Error(`${profile.name}: no readable audio stream`);
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.message.startsWith(`${profile.name}:`)) {
      throw err;
    }
    throw new Error(`${profile.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Resolves candidate direct audio streams from the user's phone (residential/5G IP)
 * concurrently across InnerTube client profiles so playback starts on the first hit.
 */
export async function resolveYoutubeOnDeviceCandidates(
  videoId: string,
  maxCandidates = 4,
): Promise<DeviceResolvedStream[]> {
  if (Platform.OS === 'web') {
    throw new Error('On-device InnerTube fallback is only available on native iOS/Android.');
  }

  const cached = deviceStreamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now() && cached.streams.length > 0) {
    return cached.streams.slice(0, maxCandidates);
  }

  const existingInflight = inflightAllResolves.get(videoId);
  if (existingInflight) {
    const { collected, errors } = await existingInflight;
    if (collected.length > 0) {
      return collected.slice(0, maxCandidates);
    }
    throw new Error(`On-device fallback failed (${errors.join(' | ')})`);
  }

  const { config, rules } = useAdGuardStore.getState();
  const visitorData = await getVisitorDataFast();
  const profiles = getProfilesForPlatform();

  const profilePromises = profiles.map((profile) =>
    resolveProfileStream(videoId, profile, visitorData, config, rules),
  );

  // Collect all resolved streams in the background to populate cache for instant fallbacks
  const allCollectedPromise = Promise.allSettled(profilePromises)
    .then((results) => {
      const collected: DeviceResolvedStream[] = [];
      const errors: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          collected.push(r.value);
        } else {
          errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
      }
      if (collected.length > 0) {
        cacheDeviceStreams(videoId, collected);
      }
      return { collected, errors };
    })
    .finally(() => {
      inflightAllResolves.delete(videoId);
    });

  inflightAllResolves.set(videoId, allCollectedPromise);

  if (maxCandidates <= 1) {
    const first = await firstResolved(profilePromises);
    void allCollectedPromise;
    return [first];
  }

  const { collected, errors } = await allCollectedPromise;
  if (collected.length > 0) {
    return collected.slice(0, maxCandidates);
  }

  throw new Error(`On-device fallback failed (${errors.join(' | ')})`);
}

export async function resolveYoutubeOnDevice(videoId: string): Promise<DeviceResolvedStream> {
  const candidates = await resolveYoutubeOnDeviceCandidates(videoId, 1);
  return candidates[0];
}
