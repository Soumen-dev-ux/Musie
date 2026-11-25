import { AudioPlayer, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { SponsorSegment, Track } from '../types';
import { apiClient } from './apiClient';

type StatusCallback = (status: {
  isPlaying: boolean;
  isBuffering: boolean;
  positionSec: number;
  durationSec: number;
  didJustFinish: boolean;
}) => void;

type SponsorSkipCallback = (segment: SponsorSegment) => void;

class AudioEngine {
  private player: AudioPlayer | null = null;
  private subscription: { remove: () => void } | null = null;
  private audioModeReady = false;
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

  public async loadAndPlay(track: Track): Promise<void> {
    await this.ensureAudioMode();
    this.sponsorSegments = [];
    this.skippedSegmentIds.clear();

    const streamUrl = apiClient.getStreamUrl(track.youtubeId);

    if (!this.player) {
      this.player = createAudioPlayer({ uri: streamUrl }, { updateInterval: 500 });
      this.attachListener(this.player);
    } else {
      this.player.replace({ uri: streamUrl });
    }

    this.player.play();

    // Activate lock-screen & notification media controls once audio session starts
    setTimeout(() => {
      if (!this.player) return;
      try {
        this.player.setActiveForLockScreen(
          true,
          {
            title: track.title,
            artist: track.artist,
            albumTitle: track.album || 'Musie',
            artworkUrl: track.artworkUrl,
          },
          {
            showSeekForward: true,
            showSeekBackward: true,
          },
        );
      } catch (err) {
        console.warn('[AudioEngine] Lock screen metadata error:', err);
      }
    }, 300);
  }

  private attachListener(player: AudioPlayer): void {
    this.subscription?.remove();
    this.subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
      const duration = Number.isFinite(status.duration) ? status.duration : 0;

      // Auto-skip sponsor/ad segments via AdGuard SponsorBlock
      if (this.sponsorBlockEnabled && this.sponsorSegments.length > 0 && status.playing) {
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
        isPlaying: Boolean(status.playing),
        isBuffering: Boolean(status.isBuffering),
        positionSec: currentTime,
        durationSec: duration,
        didJustFinish: Boolean(status.didJustFinish),
      });
    });
  }

  public play(): void {
    this.player?.play();
  }

  public pause(): void {
    this.player?.pause();
  }

  public seekTo(seconds: number): void {
    if (!this.player) return;
    this.player.seekTo(Math.max(0, seconds));
  }

  public stop(): void {
    if (!this.player) return;
    this.player.pause();
    try {
      this.player.setActiveForLockScreen(false);
    } catch {
      // ignore
    }
  }

  public updateMetadata(track: Track): void {
    if (!this.player) return;
    try {
      this.player.updateLockScreenMetadata({
        title: track.title,
        artist: track.artist,
        albumTitle: track.album || 'Musie',
        artworkUrl: track.artworkUrl,
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
