import { Platform } from 'react-native';
import { useAdGuardStore } from '../store/adguardStore';
import { filterExternalUrl } from './adguardClient';

interface InnerTubeClientProfile {
  name: string;
  userAgent: string;
  client: Record<string, string | number>;
}

const CLIENT_PROFILES: InnerTubeClientProfile[] = [
  {
    name: 'ANDROID_VR',
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
      hl: 'en',
      gl: 'US',
    },
  },
  {
    name: 'IOS',
    userAgent:
      'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)',
    client: {
      clientName: 'IOS',
      clientVersion: '19.45.4',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.1.0.22B83',
      hl: 'en',
      gl: 'US',
    },
  },
  {
    name: 'ANDROID',
    userAgent:
      'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip',
    client: {
      clientName: 'ANDROID',
      clientVersion: '19.44.38',
      osName: 'Android',
      osVersion: '14',
      androidSdkVersion: 34,
      hl: 'en',
      gl: 'US',
    },
  },
];

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
  const errors: string[] = [];

  for (const profile of CLIENT_PROFILES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': profile.userAgent,
          Origin: 'https://www.youtube.com',
        },
        body: JSON.stringify({
          context: {
            client: profile.client,
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
