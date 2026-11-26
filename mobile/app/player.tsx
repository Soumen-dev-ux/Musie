import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QueueSheet } from '../src/components/QueueSheet';
import { formatDuration } from '../src/components/TrackRow';
import { useAdGuardStore } from '../src/store/adguardStore';
import { useLibraryStore } from '../src/store/libraryStore';
import { usePlayerStore } from '../src/store/playerStore';
import { colors } from '../src/theme/colors';

const { width } = Dimensions.get('window');
const ARTWORK_SIZE = Math.min(width - 56, 350);

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const durationSec = usePlayerStore((s) => s.durationSec);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const lastSponsorSkip = usePlayerStore((s) => s.lastSponsorSkip);
  const bufferingStatus = usePlayerStore((s) => s.bufferingStatus);
  const error = usePlayerStore((s) => s.error);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);

  const isLiked = useLibraryStore((s) =>
    currentTrack ? s.isLiked(currentTrack.youtubeId) : false,
  );
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const adguardConfig = useAdGuardStore((s) => s.config);

  const [queueOpen, setQueueOpen] = useState(false);
  const [barWidth, setBarWidth] = useState(width - 56);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const barWidthRef = useRef(barWidth);
  barWidthRef.current = barWidth;
  const durationRef = useRef(durationSec);
  durationRef.current = durationSec;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const frac = Math.min(1, Math.max(0, evt.nativeEvent.locationX / Math.max(1, barWidthRef.current)));
        setScrubFraction(frac);
      },
      onPanResponderMove: (evt) => {
        const frac = Math.min(1, Math.max(0, evt.nativeEvent.locationX / Math.max(1, barWidthRef.current)));
        setScrubFraction(frac);
      },
      onPanResponderRelease: (evt) => {
        const frac = Math.min(1, Math.max(0, evt.nativeEvent.locationX / Math.max(1, barWidthRef.current)));
        setScrubFraction(null);
        if (durationRef.current > 0) {
          seekTo(frac * durationRef.current);
        }
      },
    }),
  ).current;

  if (!currentTrack) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backFallback}>
          <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.emptyText}>No track selected</Text>
      </View>
    );
  }

  const liveFraction =
    scrubFraction !== null
      ? scrubFraction
      : durationSec > 0
        ? Math.min(1, Math.max(0, positionSec / durationSec))
        : 0;
  const displayedSec = scrubFraction !== null ? scrubFraction * durationSec : positionSec;

  return (
    <LinearGradient
      colors={['#2B3E33', '#161A18', colors.background]}
      style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 18 }]}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <Text style={styles.playingFromLabel}>PLAYING FROM YOUTUBE</Text>
          <Text style={styles.albumLabel} numberOfLines={1}>
            {currentTrack.album || 'Musie Stream'}
          </Text>
        </View>

        <TouchableOpacity onPress={() => setQueueOpen(true)} hitSlop={10}>
          <Ionicons name="list" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Album Artwork */}
      <View style={styles.artWrap}>
        <Image source={{ uri: currentTrack.artworkUrl }} style={styles.artwork} contentFit="cover" />
      </View>

      {/* SponsorBlock / Error / Buffering Toast */}
      {lastSponsorSkip ? (
        <View style={styles.toast}>
          <Ionicons name="shield-checkmark" size={14} color={colors.shieldActive} />
          <Text style={styles.toastText}>{lastSponsorSkip}</Text>
        </View>
      ) : error ? (
        <View style={[styles.toast, { backgroundColor: 'rgba(226,33,52,0.22)' }]}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text style={styles.toastText}>{error}</Text>
        </View>
      ) : isBuffering && bufferingStatus ? (
        <View style={[styles.toast, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.toastText}>{bufferingStatus}</Text>
        </View>
      ) : null}

      {/* Title & Like */}
      <View style={styles.metaRow}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {currentTrack.artist}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            toggleLike(currentTrack);
          }}
          hitSlop={10}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={28}
            color={isLiked ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Seek Scrubber */}
      <View
        style={styles.scrubberTouchArea}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={styles.scrubberTrack}>
          <View style={[styles.scrubberFill, { width: `${liveFraction * 100}%` }]} />
          <View style={[styles.scrubberThumb, { left: `${liveFraction * 100}%` }]} />
        </View>
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatDuration(displayedSec)}</Text>
        <Text style={styles.timeText}>{formatDuration(durationSec)}</Text>
      </View>

      {/* Transport Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            toggleShuffle();
          }}
          hitSlop={10}
        >
          <Ionicons
            name="shuffle"
            size={24}
            color={shuffle ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            previous();
          }}
          hitSlop={10}
        >
          <Ionicons name="play-skip-back" size={34} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playCircle}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            togglePlayPause();
          }}
        >
          {isBuffering && !error ? (
            <ActivityIndicator size="large" color={colors.background} />
          ) : (
            <Ionicons
              name={error ? 'refresh' : isPlaying ? 'pause' : 'play'}
              size={34}
              color={colors.background}
              style={!isPlaying && !error ? { marginLeft: 3 } : undefined}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            next(false);
          }}
          hitSlop={10}
        >
          <Ionicons name="play-skip-forward" size={34} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            cycleRepeat();
          }}
          hitSlop={10}
          style={{ alignItems: 'center' }}
        >
          <Ionicons
            name="repeat"
            size={24}
            color={repeatMode !== 'off' ? colors.primary : colors.textSecondary}
          />
          {repeatMode === 'one' && <Text style={styles.repeatOneBadge}>1</Text>}
        </TouchableOpacity>
      </View>

      {/* Footer Shield & Queue Bar */}
      <View style={styles.footerRow}>
        <View style={styles.shieldChip}>
          <Ionicons
            name="shield-checkmark"
            size={14}
            color={adguardConfig.enabled ? colors.shieldActive : colors.textMuted}
          />
          <Text style={styles.shieldChipText}>
            {adguardConfig.enabled ? 'AdGuard Shield Active' : 'AdGuard Paused'}
          </Text>
        </View>

        <TouchableOpacity style={styles.queueBtn} onPress={() => setQueueOpen(true)}>
          <Ionicons name="albums-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.queueBtnText}>Queue</Text>
        </TouchableOpacity>
      </View>

      <QueueSheet visible={queueOpen} onClose={() => setQueueOpen(false)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 26,
    justifyContent: 'space-between',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backFallback: {
    position: 'absolute',
    top: 52,
    left: 22,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playingFromLabel: {
    color: colors.textSecondary,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
  },
  albumLabel: {
    color: colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 2,
    maxWidth: 200,
  },
  artWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: 'rgba(46, 229, 157, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 6,
  },
  toastText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 21,
    fontWeight: '800',
  },
  artist: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 4,
  },
  scrubberTouchArea: {
    paddingVertical: 14,
    marginTop: 6,
  },
  scrubberTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 2,
    position: 'relative',
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: colors.textPrimary,
    borderRadius: 2,
  },
  scrubberThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.textPrimary,
    marginLeft: -6,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  playCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatOneBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  shieldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shieldChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  queueBtnText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
});
