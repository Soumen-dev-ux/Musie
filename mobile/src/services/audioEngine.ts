import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { AudioPlayer, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';
import { useAdGuardStore } from '../store/adguardStore';
import { SponsorSegment, Track } from '../types';
import { ApiError, apiClient } from './apiClient';
import {
  DeviceResolvedStream,
  invalidateDeviceStreamCache,
  resolveYoutubeOnDevice,
  resolveYoutubeOnDeviceCandidates,
} from './youtubeClientResolver';

// Expo Go on Android does not bundle the app's AudioControlsService manifest entry.
// Use isRunningInExpoGo() because Constants.appOwnership can be null in modern Expo Go.
const isExpoGoAndroid =
  Platform.OS === 'android' &&
  (isRunningInExpoGo() || Constants.appOwnership === 'expo' || Boolean(Constants.expoGoConfig));

const STREAM_CACHE_TTL_MS = 1000 * 60 * 15;

type StatusCallback = (status: {
  isPlaying: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  positionSec: number;
  durationSec: number;
  didJustFinish: boolean;
  error: string | null;
}) => void;

type StageCallback = (stage: string | null) => void;
type SponsorSkipCallback = (segment: SponsorSegment) => void;

interface PlaybackCandidate {
  url: string;
  headers?: Record<string, string>;
  label: string;
  kind: 'backend' | 'device';
}

class AudioEngine {
  private player: AudioPlayer | null = null;
  private subscription: { remove: () => void } | null = null;
  private stallFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private audioModeReady = false;
  private hasError = false;
  private lastLoaded = false;
  private shouldAutoPlay = false;
  private userPaused = false;
  private loadToken = 0;
  private activeTrack: Track | null = null;
  private fallbackCandidates: PlaybackCandidate[] = [];
  private pendingBackendPromise: Promise<PlaybackCandidate | null> | null = null;
  private currentCandidateLabel = '';
  private currentCandidateUrl = '';
  private failedUrls = new Set<string>();
  private failedAttempts: string[] = [];
  private deviceFallbackLoaded = false;
  private inFlightRetry: { token: number; promise: Promise<boolean> } | null = null;
  private sponsorSegments: SponsorSegment[] = [];
  private skippedSegmentIds = new Set<string>();
  private sponsorBlockEnabled = true;
  private resolvedCache = new Map<string, { candidates: PlaybackCandidate[]; expiresAt: number }>();

  private onStatusCb: StatusCallback | null = null;
  private onSponsorSkipCb: SponsorSkipCallback | null = null;
  private onStageCb: StageCallback | null = null;

  private getCachedCandidates(videoId: string): PlaybackCandidate[] | null {
    const entry = this.resolvedCache.get(videoId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now() || entry.candidates.length === 0) {
      this.resolvedCache.delete(videoId);
      return null;
    }
    return [...entry.candidates];
  }

  private cacheCandidate(videoId: string, candidate: PlaybackCandidate): void {
    const existing = this.resolvedCache.get(videoId);
    const list = existing && existing.expiresAt > Date.now() ? [...existing.candidates] : [];
    if (!list.some((c) => c.url === candidate.url)) {
      list.push(candidate);
    }
    if (this.resolvedCache.size >= 80 && !this.resolvedCache.has(videoId)) {
      const oldest = this.resolvedCache.keys().next().value;
      if (oldest !== undefined) this.resolvedCache.delete(oldest);
    }
    this.resolvedCache.set(videoId, {
      candidates: list,
      expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
    });
  }

  private invalidateCachedCandidate(videoId: string, url: string): void {
    invalidateDeviceStreamCache(videoId, url);
    const existing = this.resolvedCache.get(videoId);
    if (!existing) return;
    const remaining = existing.candidates.filter((c) => c.url !== url);
    if (remaining.length === 0) {
      this.resolvedCache.delete(videoId);
    } else {
      this.resolvedCache.set(videoId, { ...existing, candidates: remaining });
    }
  }

  public async ensureAudioMode(): Promise<void> {
    if (this.audioModeReady) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      this.audioModeReady = true;
    } catch (error) {
      console.warn('[AudioEngine] Failed to set audio mode:', error);
    }
  }

  public setCallbacks(
    onStatus: StatusCallback,
    onSponsorSkip: SponsorSkipCallback,
    onStage?: StageCallback,
  ): void {
    this.onStatusCb = onStatus;
    this.onSponsorSkipCb = onSponsorSkip;
    this.onStageCb = onStage ?? null;
  }

  private clearStallTimer(): void {
    if (this.stallFallbackTimer) {
      clearTimeout(this.stallFallbackTimer);
      this.stallFallbackTimer = null;
    }
  }

  public setSponsorBlockEnabled(enabled: boolean): void {
    this.sponsorBlockEnabled = enabled;
  }

  public setSponsorSegments(segments: SponsorSegment[]): void {
    this.sponsorSegments = segments;
    this.skippedSegmentIds.clear();
  }

  public canResume(): boolean {
    if (!this.player || this.hasError) return false;
    return Boolean(
      this.lastLoaded || this.player.isLoaded || this.player.playing || this.player.isBuffering,
    );
  }

  public async loadAndPlay(track: Track): Promise<void> {
    const token = ++this.loadToken;

    if (!this.audioModeReady) {
      await this.ensureAudioMode();
    }

    this.sponsorSegments = [];
    this.skippedSegmentIds.clear();
    this.hasError = false;
    this.lastLoaded = false;
    this.shouldAutoPlay = true;
    this.userPaused = false;
    this.activeTrack = track;
    this.fallbackCandidates = [];
    this.pendingBackendPromise = null;
    this.currentCandidateLabel = '';
    this.currentCandidateUrl = '';
    this.failedUrls.clear();
    this.failedAttempts = [];
    this.deviceFallbackLoaded = Platform.OS === 'web';
    this.inFlightRetry = null;

    // Dispose any existing player before resolving the next stream so stale audio stops immediately
    this.clearStallTimer();
    this.dispose();

    const cached = this.getCachedCandidates(track.youtubeId);
    if (cached && cached.length > 0) {
      const [first, ...rest] = cached;
      this.fallbackCandidates = rest;
      this.playCandidate(track, first, token);
      return;
    }

    this.onStageCb?.('Resolving audio stream...');

    const resolveBackend = async (): Promise<PlaybackCandidate> => {
      try {
        const resolved = await apiClient.resolveStream(track.youtubeId, 15000);
        return {
          url: resolved.directUrl || apiClient.getStreamUrl(track.youtubeId),
          label: resolved.resolver || 'backend',
          kind: 'backend',
        };
      } catch (backendErr) {
        if (backendErr instanceof ApiError && backendErr.status === 404) {
          const probe = await apiClient.probeDirectStream(track.youtubeId);
          if (probe.ok) {
            return {
              url: apiClient.getStreamUrl(track.youtubeId),
              label: 'backend:proxy',
              kind: 'backend',
            };
          }
          throw new Error(`backend: ${probe.detail || `HTTP ${probe.status}`}`);
        }
        throw new Error(
          `backend: ${backendErr instanceof Error ? backendErr.message : String(backendErr)}`,
        );
      }
    };

    if (Platform.OS === 'web') {
      const initialCandidate = await resolveBackend();
      if (token !== this.loadToken) return;
      this.cacheCandidate(track.youtubeId, initialCandidate);
      this.playCandidate(track, initialCandidate, token);
      return;
    }

    // Start backend resolution immediately, and give it a brief head-start (1200ms)
    // before racing on-device InnerTube resolution. If backend fails sooner, on-device starts at once.
    const resolveDevice = async (): Promise<PlaybackCandidate> => {
      const item = await resolveYoutubeOnDevice(track.youtubeId);
      return {
        url: item.url,
        headers: item.headers,
        label: item.resolver,
        kind: 'device',
      };
    };

    const backendPromise = resolveBackend();
    this.pendingBackendPromise = backendPromise.catch((err) => {
      this.failedAttempts.push(err instanceof Error ? err.message : String(err));
      return null;
    });

    const initialCandidate = await new Promise<PlaybackCandidate>((resolve, reject) => {
      let settled = false;
      let deviceStarted = false;
      let failures = 0;
      const errors: string[] = [];
      let headStartTimer: ReturnType<typeof setTimeout> | null = null;

      const clearHeadStart = () => {
        if (headStartTimer) {
          clearTimeout(headStartTimer);
          headStartTimer = null;
        }
      };

      const handleSuccess = (candidate: PlaybackCandidate) => {
        clearHeadStart();
        if (token !== this.loadToken) return;
        if (this.failedUrls.has(candidate.url)) return;
        this.cacheCandidate(track.youtubeId, candidate);
        if (!settled) {
          settled = true;
          resolve(candidate);
        } else if (!this.fallbackCandidates.some((c) => c.url === candidate.url)) {
          this.fallbackCandidates.push(candidate);
        }
      };

      const handleError = (err: unknown, totalExpected: () => number) => {
        errors.push(err instanceof Error ? err.message : String(err));
        failures += 1;
        if (!settled && failures >= totalExpected()) {
          clearHeadStart();
          reject(new Error(errors.join(' | ') || 'No playable audio source found'));
        }
      };

      const startDevice = () => {
        clearHeadStart();
        if (deviceStarted || settled || token !== this.loadToken) return;
        deviceStarted = true;
        resolveDevice().then(
          handleSuccess,
          (err) => handleError(err, () => 2),
        );
      };

      headStartTimer = setTimeout(startDevice, 1200);

      backendPromise.then(
        handleSuccess,
        (err) => {
          startDevice();
          handleError(err, () => (deviceStarted ? 2 : 1));
        },
      );
    });

    if (token !== this.loadToken) return;
    this.playCandidate(track, initialCandidate, token);
  }

  private async loadDeviceCandidates(videoId: string, token: number): Promise<void> {
    if (this.deviceFallbackLoaded || Platform.OS === 'web') return;
    this.deviceFallbackLoaded = true;
    try {
      const devices: DeviceResolvedStream[] = await resolveYoutubeOnDeviceCandidates(videoId, 4);
      if (token !== this.loadToken) return;
      for (const item of devices) {
        if (
          !this.failedUrls.has(item.url) &&
          !this.fallbackCandidates.some((c) => c.url === item.url)
        ) {
          this.fallbackCandidates.push({
            url: item.url,
            headers: item.headers,
            label: item.resolver,
            kind: 'device',
          });
        }
      }
    } catch (err) {
      this.failedAttempts.push(err instanceof Error ? err.message : String(err));
    }
  }

  private playCandidate(track: Track, candidate: PlaybackCandidate, token: number): void {
    this.clearStallTimer();
    this.hasError = false;
    this.lastLoaded = false;
    this.shouldAutoPlay = true;
    this.currentCandidateLabel = candidate.label;
    this.currentCandidateUrl = candidate.url;

    this.startPlayer(track, candidate.url, candidate.headers, token);

    // If the stream stalls in ExoPlayer buffering for 6.5s, automatically advance to the next fallback
    if (Platform.OS !== 'web') {
      this.stallFallbackTimer = setTimeout(() => {
        if (
          token !== this.loadToken ||
          this.userPaused ||
          this.lastLoaded ||
          this.player?.playing
        ) {
          return;
        }
        void this.tryNextFallback(track, token, `${candidate.label}: buffering stalled`);
      }, 6500);
    }
  }

  private async tryNextFallback(track: Track, token: number, reason: string): Promise<boolean> {
    if (token !== this.loadToken || this.userPaused) return false;
    if (this.inFlightRetry && this.inFlightRetry.token === token) {
      return this.inFlightRetry.promise;
    }

    const retryPromise = (async (): Promise<boolean> => {
      this.failedAttempts.push(reason);
      if (this.currentCandidateUrl) {
        this.failedUrls.add(this.currentCandidateUrl);
        this.invalidateCachedCandidate(track.youtubeId, this.currentCandidateUrl);
      }

      // If backend preflight is still in flight, wait for it before giving up
      if (this.fallbackCandidates.length === 0 && this.pendingBackendPromise) {
        const backendCandidate = await this.pendingBackendPromise;
        this.pendingBackendPromise = null;
        if (token !== this.loadToken || this.userPaused) return false;
        if (
          backendCandidate &&
          !this.failedUrls.has(backendCandidate.url) &&
          !this.fallbackCandidates.some((c) => c.url === backendCandidate.url)
        ) {
          this.fallbackCandidates.push(backendCandidate);
        }
      }

      if (this.fallbackCandidates.length === 0 && !this.deviceFallbackLoaded) {
        this.onStageCb?.('Switching to direct phone stream...');
        await this.loadDeviceCandidates(track.youtubeId, token);
        if (token !== this.loadToken || this.userPaused) return false;
      }

      const nextCandidate = this.fallbackCandidates.shift();
      if (!nextCandidate) {
        return false;
      }

      this.onStageCb?.(`Retrying via ${nextCandidate.label}...`);
      this.dispose();
      this.playCandidate(track, nextCandidate, token);
      return true;
    })().finally(() => {
      if (this.inFlightRetry?.promise === retryPromise) {
        this.inFlightRetry = null;
      }
    });

    this.inFlightRetry = { token, promise: retryPromise };
    return retryPromise;
  }

  private startPlayer(
    track: Track,
    streamUrl: string,
    streamHeaders: Record<string, string> | undefined,
    token: number,
  ): void {
    this.onStageCb?.('Buffering audio...');
    this.player = createAudioPlayer(
      {
        uri: streamUrl,
        headers: streamHeaders,
        name: track.title,
      },
      { updateInterval: 400 },
    );
    this.attachListener(this.player);
    this.player.play();

    // Activate lock-screen & notification media controls once audio session starts
    // (Skip on Android Expo Go, where AudioControlsService is not declared in the host manifest)
    if (!isExpoGoAndroid) {
      setTimeout(() => {
        if (!this.player || token !== this.loadToken) return;
        try {
          this.player.setActiveForLockScreen(
            true,
            {
              title: track.title,
              artist: track.artist,
              albumTitle: track.album || 'Musie',
              artworkUrl: track.artworkUrl || undefined,
            },
            {
              showSeekForward: true,
              showSeekBackward: true,
            },
          );
        } catch (err) {
          console.warn('[AudioEngine] Lock screen metadata error:', err);
        }
      }, 350);
    }
  }

  private attachListener(player: AudioPlayer): void {
    this.subscription?.remove();
    this.subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (player !== this.player) return;
      const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
      const duration = Number.isFinite(status.duration) ? status.duration : 0;
      const error = status.error ? String(status.error) : null;

      if (error) {
        this.clearStallTimer();
        const activeTrack = this.activeTrack;
        const activeToken = this.loadToken;
        const failedLabel = this.currentCandidateLabel || 'stream';
        if (activeTrack && !this.userPaused) {
          void this.tryNextFallback(activeTrack, activeToken, `${failedLabel}: ${error}`).then(
            (switched) => {
              if (switched || activeToken !== this.loadToken) return;
              this.hasError = true;
              this.lastLoaded = false;
              this.shouldAutoPlay = false;
              this.onStageCb?.(null);
              this.onStatusCb?.({
                isPlaying: false,
                isBuffering: false,
                isLoaded: false,
                positionSec: currentTime,
                durationSec: duration,
                didJustFinish: false,
                error: this.failedAttempts.join(' | ') || error,
              });
            },
          );
          return;
        }
        this.hasError = true;
        this.lastLoaded = false;
        this.shouldAutoPlay = false;
        this.onStageCb?.(null);
      } else {
        if (status.isLoaded || status.playing) {
          this.clearStallTimer();
          this.hasError = false;
          this.onStageCb?.(null);
        }
        this.lastLoaded = Boolean(status.isLoaded);

        // Guard against Android ExoPlayer settling in loaded-but-paused state on initial stream load
        if (
          status.isLoaded &&
          !status.playing &&
          this.shouldAutoPlay &&
          !this.userPaused &&
          !status.didJustFinish &&
          currentTime < 0.5
        ) {
          this.shouldAutoPlay = false;
          try {
            player.play();
          } catch {
            // ignore
          }
        } else if (status.playing) {
          this.shouldAutoPlay = false;
        }
      }

      // Auto-skip sponsor/ad segments via AdGuard SponsorBlock
      const adguardCfg = useAdGuardStore.getState().config;
      if (
        !error &&
        this.sponsorBlockEnabled &&
        adguardCfg.enabled &&
        adguardCfg.sponsorBlockEnabled &&
        this.sponsorSegments.length > 0 &&
        status.playing
      ) {
        for (const seg of this.sponsorSegments) {
          const [start, end] = seg.segment;
          if (
            !this.skippedSegmentIds.has(seg.UUID) &&
            currentTime >= start &&
            currentTime < end - 0.5
          ) {
            this.skippedSegmentIds.add(seg.UUID);
            player.seekTo(end);
            this.onSponsorSkipCb?.(seg);
            break;
          }
        }
      }

      this.onStatusCb?.({
        isPlaying: error ? false : Boolean(status.playing),
        isBuffering: error ? false : Boolean(status.isBuffering),
        isLoaded: error ? false : Boolean(status.isLoaded),
        positionSec: currentTime,
        durationSec: duration,
        didJustFinish: error ? false : Boolean(status.didJustFinish),
        error,
      });
    });
  }

  public play(): void {
    this.userPaused = false;
    this.player?.play();
  }

  public pause(): void {
    this.userPaused = true;
    this.shouldAutoPlay = false;
    this.player?.pause();
  }

  public seekTo(seconds: number): void {
    if (!this.player) return;
    this.player.seekTo(Math.max(0, seconds));
  }

  public stop(): void {
    this.userPaused = true;
    this.shouldAutoPlay = false;
    if (!this.player) return;
    this.player.pause();
    try {
      this.player.setActiveForLockScreen(false);
    } catch {
      // ignore
    }
  }

  public updateMetadata(track: Track): void {
    if (!this.player || isExpoGoAndroid) return;
    try {
      this.player.updateLockScreenMetadata({
        title: track.title,
        artist: track.artist,
        albumTitle: track.album || 'Musie',
        artworkUrl: track.artworkUrl || undefined,
      });
    } catch {
      // ignore
    }
  }

  public dispose(): void {
    this.clearStallTimer();
    this.subscription?.remove();
    this.subscription = null;
    if (this.player) {
      try {
        this.player.setActiveForLockScreen(false);
      } catch {
        // ignore
      }
      this.player.remove();
      this.player = null;
    }
  }
}

export const audioEngine = new AudioEngine();
