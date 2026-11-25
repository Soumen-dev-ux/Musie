import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrackRow } from '../../src/components/TrackRow';
import { useLibraryStore } from '../../src/store/libraryStore';
import { usePlayerStore } from '../../src/store/playerStore';
import { colors } from '../../src/theme/colors';

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const playlists = useLibraryStore((s) => s.playlists);
  const removeTrackFromPlaylist = useLibraryStore((s) => s.removeTrackFromPlaylist);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const isLikedCollection = id === 'liked';
  const playlist = playlists.find((p) => p.id === id);

  const title = isLikedCollection ? 'Liked Songs' : playlist?.name || 'Playlist';
  const description = isLikedCollection
    ? 'Your favorite tracks saved across YouTube & Spotify'
    : playlist?.description || '';
  const tracks = isLikedCollection ? likedTracks : playlist?.tracks || [];
  const coverUrl = isLikedCollection
    ? likedTracks[0]?.artworkUrl
    : playlist?.coverUrl || playlist?.tracks[0]?.artworkUrl;

  const handlePlayAll = (shuffled = false) => {
    if (tracks.length === 0) return;
    const queue = shuffled
      ? [...tracks].sort(() => Math.random() - 0.5)
      : tracks;
    playTrack(queue[0], queue);
  };

  const handleDeletePlaylist = () => {
    if (!playlist) return;
    Alert.alert('Delete Playlist?', `Delete "${playlist.name}" permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePlaylist(playlist.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <LinearGradient colors={['#272047', colors.background, colors.background]} style={{ flex: 1 }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        {!isLikedCollection && playlist && (
          <TouchableOpacity onPress={handleDeletePlaylist} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.youtubeId}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={isLikedCollection ? ['#450AF5', '#8E8EE5'] : ['#2A2A2A', '#181818']}
                style={[styles.cover, styles.coverFallback]}
              >
                <Ionicons
                  name={isLikedCollection ? 'heart' : 'musical-notes'}
                  size={64}
                  color="#FFFFFF"
                />
              </LinearGradient>
            )}

            <Text style={styles.title}>{title}</Text>
            {description ? <Text style={styles.desc}>{description}</Text> : null}
            <Text style={styles.count}>{tracks.length} songs</Text>

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.shuffleBtn}
                onPress={() => handlePlayAll(true)}
                disabled={tracks.length === 0}
              >
                <Ionicons name="shuffle" size={18} color={colors.textPrimary} />
                <Text style={styles.shuffleText}>Shuffle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playBtn}
                onPress={() => handlePlayAll(false)}
                disabled={tracks.length === 0}
              >
                <Ionicons name="play" size={22} color={colors.background} />
                <Text style={styles.playText}>Play</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            isActive={currentTrack?.youtubeId === item.youtubeId}
            onPress={() => playTrack(item, tracks)}
            onRemoveFromPlaylist={
              !isLikedCollection && playlist
                ? () => removeTrackFromPlaylist(playlist.id, item.youtubeId)
                : undefined
            }
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No tracks here yet. Search for songs and tap the menu icon to add them!
          </Text>
        }
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  cover: {
    width: 190,
    height: 190,
    borderRadius: 10,
    marginTop: 6,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  desc: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  count: {
    color: colors.textMuted,
    fontSize: 12.5,
    marginTop: 6,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 24,
  },
  shuffleText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 24,
  },
  playText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 14,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginTop: 32,
    lineHeight: 20,
  },
});
