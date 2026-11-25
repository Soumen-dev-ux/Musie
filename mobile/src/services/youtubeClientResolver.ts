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

async function getVisitorData(): Promise<string> {
  if (cachedVisitorData && cachedVisitorData.expiresAt > Date.now()) {
    return cachedVisitorData.value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
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
  }
  return '';
}

interface AdaptiveFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  contentLength?: string;
}

interface PlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  streamingData?: {
    adaptiveFormats?: AdaptiveFormat[];
    formats?: AdaptiveFormat[];
  };
}

export interface DeviceResolvedStream {
  url: string;
  mimeType: string;
  resolver: string;
  headers?: Record<string, string>;
}

async function probeUrlReadable(url: string, headers?: Record<string, string>): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(headers || {}),
        Range: 'bytes=0-511',
      },
      signal: controller.signal,
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves a direct audio stream from the user's phone (residential/5G IP)
 * when a cloud backend (like Render) is rate-limited or bot-blocked by YouTube.
 */
export async function resolveYoutubeOnDevice(videoId: string): Promise<DeviceResolvedStream> {
  if (Platform.OS === 'web') {
    throw new Error('On-device InnerTube fallback is only available on native iOS/Android.');
  }

  const { config, rules } = useAdGuardStore.getState();
  const visitorData = await getVisitorData();
  const errors: string[] = [];

  for (const profile of CLIENT_PROFILES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

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
        errors.push(`${profile.name}: HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as PlayerResponse;
      const status = data.playabilityStatus?.status;
      const adaptive = data.streamingData?.adaptiveFormats || [];
      const muxed = data.streamingData?.formats || [];

      if (status && status !== 'OK' && adaptive.length === 0 && muxed.length === 0) {
        errors.push(`${profile.name}: ${data.playabilityStatus?.reason || status}`);
        continue;
      }

      const audioCandidates = adaptive
        .filter((f) => Boolean(f.url) && (f.mimeType || '').startsWith('audio/'))
        .sort((a, b) => {
          const aMp4 = (a.mimeType || '').includes('audio/mp4') ? 1 : 0;
          const bMp4 = (b.mimeType || '').includes('audio/mp4') ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          return (b.bitrate || 0) - (a.bitrate || 0);
        });

      const muxedCandidates = muxed.filter((f) => Boolean(f.url));
      const candidates = [...audioCandidates, ...muxedCandidates];

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

      errors.push(`${profile.name}: no direct readable audio format`);
    } catch (err) {
      clearTimeout(timer);
      errors.push(`${profile.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`On-device fallback failed (${errors.join(' | ')})`);
}
