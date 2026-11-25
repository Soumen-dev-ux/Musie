import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { colors } from '../theme/colors';

export function MiniPlayer() {
  const router = useRouter();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const error = usePlayerStore((s) => s.error);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const durationSec = usePlayerStore((s) => s.durationSec);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const next = usePlayerStore((s) => s.next);
  const isLiked = useLibraryStore((s) =>
    currentTrack ? s.isLiked(currentTrack.youtubeId) : false,
  );
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  if (!currentTrack) return null;

  const progress = durationSec > 0 ? Math.min(1, Math.max(0, positionSec / durationSec)) : 0;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.92}
      onPress={() => router.push('/player')}
    >
      <View style={styles.content}>
        <Image source={{ uri: currentTrack.artworkUrl }} style={styles.artwork} contentFit="cover" />
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={[styles.artist, error ? styles.errorText : null]} numberOfLines={1}>
            {error ? `Tap play to retry · ${error}` : currentTrack.artist}
          </Text>
        </View>

        <TouchableOpacity
          onPress={(e) => {
            e?.stopPropagation?.();
            toggleLike(currentTrack);
          }}
          hitSlop={8}
          style={styles.btn}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={20}
            color={isLiked ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={(e) => {
            e?.stopPropagation?.();
            togglePlayPause();
          }}
          hitSlop={8}
          style={styles.btn}
        >
          {isBuffering && !error ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Ionicons
              name={error ? 'refresh' : isPlaying ? 'pause' : 'play'}
              size={24}
              color={error ? colors.danger : colors.textPrimary}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={(e) => {
            e?.stopPropagation?.();
            next(false);
          }}
          hitSlop={8}
          style={styles.btn}
        >
          <Ionicons name="play-skip-forward" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 8,
    marginBottom: 6,
    backgroundColor: '#222629',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#303438',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  artwork: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  meta: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  artist: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  errorText: {
    color: colors.danger,
  },
  btn: {
    padding: 6,
    marginLeft: 2,
  },
  progressTrack: {
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
});
