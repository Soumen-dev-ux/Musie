import Constants from 'expo-constants';
import { AudioPlayer, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';
import { SponsorSegment, Track } from '../types';
import { ApiError, apiClient } from './apiClient';
import { resolveYoutubeOnDevice } from './youtubeClientResolver';

// Expo Go on Android does not bundle the app's AudioControlsService manifest entry
const isExpoGoAndroid = Platform.OS === 'android' && Constants.appOwnership === 'expo';

type StatusCallback = (status: {
  isPlaying: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  positionSec: number;
  durationSec: number;
  didJustFinish: boolean;
  error: string | null;
}) => void;

type SponsorSkipCallback = (segment: SponsorSegment) => void;

class AudioEngine {
  private player: AudioPlayer | null = null;
  private subscription: { remove: () => void } | null = null;
  private audioModeReady = false;
  private hasError = false;
  private lastLoaded = false;
  private shouldAutoPlay = false;
  private userPaused = false;
  private loadToken = 0;
  private sponsorSegments: SponsorSegment[] = [];
  private skippedSegmentIds = new Set<string>();
  private sponsorBlockEnabled = true;

  private onStatusCb: StatusCallback | null = null;
  private onSponsorSkipCb: SponsorSkipCallback | null = null;

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

  public setCallbacks(onStatus: StatusCallback, onSponsorSkip: SponsorSkipCallback): void {
    this.onStatusCb = onStatus;
    this.onSponsorSkipCb = onSponsorSkip;
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

    // Dispose any existing player before resolving the next stream so stale audio stops immediately
    this.dispose();

    // Preflight resolve on backend; if Render hits a YouTube datacenter bot-block (502)
    // or is unreachable, fall back to resolving directly from the phone's IP.
    let streamUrl = apiClient.getStreamUrl(track.youtubeId);
    let streamHeaders: Record<string, string> | undefined;

    try {
      const resolved = await apiClient.resolveStream(track.youtubeId);
      if (token !== this.loadToken) return;
      streamUrl = resolved.directUrl || apiClient.getStreamUrl(track.youtubeId);
    } catch (backendErr) {
      if (token !== this.loadToken) return;

      if (backendErr instanceof ApiError && backendErr.status === 404) {
        const probe = await apiClient.probeDirectStream(track.youtubeId);
        if (token !== this.loadToken) return;
        if (probe.ok) {
          streamUrl = apiClient.getStreamUrl(track.youtubeId);
        } else {
          const deviceResolved = await resolveYoutubeOnDevice(track.youtubeId);
          if (token !== this.loadToken) return;
          streamUrl = deviceResolved.url;
          streamHeaders = deviceResolved.headers;
        }
      } else {
        try {
          const deviceResolved = await resolveYoutubeOnDevice(track.youtubeId);
          if (token !== this.loadToken) return;
          streamUrl = deviceResolved.url;
          streamHeaders = deviceResolved.headers;
        } catch (deviceErr) {
          const backendMsg =
            backendErr instanceof Error ? backendErr.message : String(backendErr);
          const deviceMsg =
            deviceErr instanceof Error ? deviceErr.message : String(deviceErr);
          throw new Error(`${backendMsg}\n${deviceMsg}`);
        }
      }
    }

    // Abort if user already tapped another song while resolving
    if (token !== this.loadToken) return;

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
      const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
      const duration = Number.isFinite(status.duration) ? status.duration : 0;
      const error = status.error ? String(status.error) : null;

      if (error) {
        this.hasError = true;
        this.lastLoaded = false;
        this.shouldAutoPlay = false;
      } else {
        if (status.isLoaded || status.playing) {
          this.hasError = false;
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
      if (!error && this.sponsorBlockEnabled && this.sponsorSegments.length > 0 && status.playing) {
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
