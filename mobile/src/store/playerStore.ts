import { create } from 'zustand';
import { apiClient } from '../services/apiClient';
import { audioEngine } from '../services/audioEngine';
import { RepeatMode, SponsorSegment, Track } from '../types';
import { useAdGuardStore } from './adguardStore';
import { useLibraryStore } from './libraryStore';

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  positionSec: number;
  durationSec: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  sponsorSegments: SponsorSegment[];
  lastSponsorSkip: string | null;
  error: string | null;

  initEngine: () => void;
  playTrack: (track: Track, queueContext?: Track[]) => Promise<void>;
  playQueueAt: (index: number) => Promise<void>;
  togglePlayPause: () => void;
  next: (autoTriggered?: boolean) => Promise<void>;
  previous: () => Promise<void>;
  seekTo: (seconds: number) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

let engineInitialized = false;
let handlingFinish = false;
let bufferingWatchdog: ReturnType<typeof setTimeout> | null = null;

function clearWatchdog(): void {
  if (bufferingWatchdog) {
    clearTimeout(bufferingWatchdog);
    bufferingWatchdog = null;
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  isBuffering: false,
  positionSec: 0,
  durationSec: 0,
  shuffle: false,
  repeatMode: 'off',
  sponsorSegments: [],
  lastSponsorSkip: null,
  error: null,

  initEngine: () => {
    if (engineInitialized) return;
    engineInitialized = true;

    audioEngine.setCallbacks(
      (status) => {
        const trackDuration = get().currentTrack?.duration || 0;
        if (status.error) {
          clearWatchdog();
          set({
            isPlaying: false,
            isBuffering: false,
            error: status.error,
          });
          return;
        }

        if (status.isPlaying || status.isLoaded) {
          clearWatchdog();
        }

        set({
          isPlaying: status.isPlaying,
          isBuffering: status.isBuffering,
          positionSec: status.positionSec,
          durationSec: status.durationSec > 0 ? status.durationSec : trackDuration,
          error: status.isPlaying || status.isLoaded ? null : get().error,
        });

        if (status.didJustFinish && !handlingFinish) {
          handlingFinish = true;
          get()
            .next(true)
            .finally(() => {
              setTimeout(() => {
                handlingFinish = false;
              }, 400);
            });
        }
      },
      (segment) => {
        const skippedSecs = Math.round(segment.segment[1] - segment.segment[0]);
        set({
          lastSponsorSkip: `AdGuard skipped ${segment.category} (${skippedSecs}s)`,
        });
        apiClient
          .recordSponsorSkip(1)
          .then(({ stats }) => {
            useAdGuardStore.setState({ stats });
          })
          .catch(() => {});
        setTimeout(() => {
          set({ lastSponsorSkip: null });
        }, 4000);
      },
    );
  },

  playTrack: async (track, queueContext) => {
    get().initEngine();

    let nextQueue = get().queue;
    let nextIndex = get().currentIndex;

    if (queueContext && queueContext.length > 0) {
      nextQueue = queueContext;
      nextIndex = queueContext.findIndex((t) => t.youtubeId === track.youtubeId);
      if (nextIndex === -1) {
        nextQueue = [track, ...queueContext];
        nextIndex = 0;
      }
    } else {
      const existingIdx = nextQueue.findIndex((t) => t.youtubeId === track.youtubeId);
      if (existingIdx !== -1) {
        nextIndex = existingIdx;
      } else {
        nextQueue = [...nextQueue, track];
        nextIndex = nextQueue.length - 1;
      }
    }

    set({
      currentTrack: track,
      queue: nextQueue,
      currentIndex: nextIndex,
      positionSec: 0,
      durationSec: track.duration || 0,
      isBuffering: true,
      sponsorSegments: [],
      error: null,
    });

    clearWatchdog();
    bufferingWatchdog = setTimeout(() => {
      const state = get();
      if (state.currentTrack?.youtubeId === track.youtubeId && state.isBuffering && !state.isPlaying) {
        set({
          isBuffering: false,
          error: 'Stream timed out while buffering. Check Backend Stream Test in Settings.',
        });
      }
    }, 30000);

    try {
      await audioEngine.loadAndPlay(track);
      useLibraryStore.getState().recordRecent(track);

      // Load SponsorBlock segments in background
      const adguard = useAdGuardStore.getState().config;
      if (adguard.enabled && adguard.sponsorBlockEnabled) {
        apiClient
          .getSponsorSegments(track.youtubeId)
          .then(({ segments }) => {
            if (get().currentTrack?.youtubeId === track.youtubeId) {
              audioEngine.setSponsorSegments(segments);
              set({ sponsorSegments: segments });
            }
          })
          .catch(() => {});
      }

      // If user played a single track with no upcoming tracks, auto-fill radio queue
      if (nextQueue.length === 1) {
        apiClient
          .getRelatedTracks(track.youtubeId)
          .then(({ tracks }) => {
            if (get().queue.length === 1 && tracks.length > 0) {
              set({ queue: [track, ...tracks] });
            }
          })
          .catch(() => {});
      }
    } catch (error) {
      clearWatchdog();
      set({
        isBuffering: false,
        isPlaying: false,
        error: error instanceof Error ? error.message : 'Playback failed',
      });
    }
  },

  playQueueAt: async (index) => {
    const queue = get().queue;
    if (index < 0 || index >= queue.length) return;
    await get().playTrack(queue[index], queue);
  },

  togglePlayPause: () => {
    const { isPlaying, currentTrack, queue, error } = get();
    if (!currentTrack) return;
    if (isPlaying) {
      audioEngine.pause();
      set({ isPlaying: false });
    } else if (error || !audioEngine.canResume()) {
      void get().playTrack(currentTrack, queue);
    } else {
      audioEngine.play();
      set({ isPlaying: true, error: null });
    }
  },

  next: async (autoTriggered = false) => {
    const { queue, currentIndex, shuffle, repeatMode, currentTrack } = get();
    if (queue.length === 0) return;

    if (autoTriggered && repeatMode === 'one' && currentTrack) {
      audioEngine.seekTo(0);
      audioEngine.play();
      return;
    }

    let nextIdx = currentIndex + 1;
    if (shuffle && queue.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * queue.length);
      } while (nextIdx === currentIndex);
    } else if (nextIdx >= queue.length) {
      if (repeatMode === 'all' || !autoTriggered) {
        nextIdx = 0;
      } else {
        audioEngine.pause();
        set({ isPlaying: false });
        return;
      }
    }

    await get().playTrack(queue[nextIdx], queue);
  },

  previous: async () => {
    const { queue, currentIndex, positionSec } = get();
    if (positionSec > 3) {
      audioEngine.seekTo(0);
      set({ positionSec: 0 });
      return;
    }
    if (queue.length === 0) return;
    const prevIdx = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
    await get().playTrack(queue[prevIdx], queue);
  },

  seekTo: (seconds) => {
    audioEngine.seekTo(seconds);
    set({ positionSec: seconds });
  },

  addToQueue: (track) => {
    const queue = get().queue;
    if (queue.some((t) => t.youtubeId === track.youtubeId)) return;
    set({ queue: [...queue, track] });
  },

  playNext: (track) => {
    const { queue, currentIndex } = get();
    const filtered = queue.filter((t) => t.youtubeId !== track.youtubeId);
    const insertAt = Math.min(Math.max(0, currentIndex + 1), filtered.length);
    const updated = [...filtered.slice(0, insertAt), track, ...filtered.slice(insertAt)];
    set({ queue: updated });
  },

  removeFromQueue: (index) => {
    const { queue, currentIndex } = get();
    if (index === currentIndex) return;
    const updated = queue.filter((_, idx) => idx !== index);
    const adjustedIndex = index < currentIndex ? currentIndex - 1 : currentIndex;
    set({ queue: updated, currentIndex: adjustedIndex });
  },

  clearQueue: () => {
    const { currentTrack } = get();
    if (!currentTrack) {
      set({ queue: [], currentIndex: -1 });
    } else {
      set({ queue: [currentTrack], currentIndex: 0 });
    }
  },

  toggleShuffle: () => set({ shuffle: !get().shuffle }),

  cycleRepeat: () => {
    const mode = get().repeatMode;
    const next: RepeatMode = mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
    set({ repeatMode: next });
  },
}));
