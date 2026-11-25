import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { colors } from '../theme/colors';
import { Track } from '../types';

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface TrackRowProps {
  track: Track;
  onPress: () => void;
  isActive?: boolean;
  onRemoveFromPlaylist?: () => void;
}

export function TrackRow({ track, onPress, isActive, onRemoveFromPlaylist }: TrackRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isLiked = useLibraryStore((s) => s.isLiked(track.youtubeId));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const playlists = useLibraryStore((s) => s.playlists);
  const addTrackToPlaylist = useLibraryStore((s) => s.addTrackToPlaylist);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playNext = usePlayerStore((s) => s.playNext);

  return (
    <>
      <TouchableOpacity
        style={[styles.row, isActive && styles.rowActive]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <Image source={{ uri: track.artworkUrl }} style={styles.artwork} contentFit="cover" />
        <View style={styles.meta}>
          <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
            {track.title}
          </Text>
          <View style={styles.subRow}>
            <View
              style={[
                styles.badge,
                track.source === 'spotify-matched' ? styles.badgeSpotify : styles.badgeYoutube,
              ]}
            >
              <Text style={styles.badgeText}>
                {track.source === 'spotify-matched' ? 'SP→YT' : 'YT'}
              </Text>
            </View>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist} · {formatDuration(track.duration)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => toggleLike(track)}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={20}
            color={isLiked ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Image source={{ uri: track.artworkUrl }} style={styles.sheetThumb} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} numberOfLines={1}>{track.title}</Text>
                <Text style={styles.sheetArtist} numberOfLines={1}>{track.artist}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                playNext(track);
                setMenuOpen(false);
              }}
            >
              <Ionicons name="play-skip-forward-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuText}>Play Next</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                addToQueue(track);
                setMenuOpen(false);
              }}
            >
              <Ionicons name="list-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuText}>Add to Queue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                toggleLike(track);
                setMenuOpen(false);
              }}
            >
              <Ionicons
                name={isLiked ? 'heart-dislike-outline' : 'heart-outline'}
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuText}>
                {isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              </Text>
            </TouchableOpacity>

            {playlists.length > 0 && (
              <View style={styles.playlistSection}>
                <Text style={styles.playlistSectionLabel}>Add to Playlist</Text>
                {playlists.slice(0, 5).map((pl) => (
                  <TouchableOpacity
                    key={pl.id}
                    style={styles.menuItem}
                    onPress={() => {
                      addTrackToPlaylist(pl.id, track);
                      setMenuOpen(false);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.textSecondary} />
                    <Text style={styles.menuText} numberOfLines={1}>{pl.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {onRemoveFromPlaylist && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onRemoveFromPlaylist();
                  setMenuOpen(false);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={[styles.menuText, { color: colors.danger }]}>Remove from Playlist</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  rowActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
  },
  artwork: {
    width: 52,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  meta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  titleActive: {
    color: colors.primary,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeYoutube: {
    backgroundColor: 'rgba(255, 0, 51, 0.22)',
  },
  badgeSpotify: {
    backgroundColor: 'rgba(29, 185, 84, 0.22)',
  },
  badgeText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  artist: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  iconBtn: {
    padding: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  sheetThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  sheetArtist: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
  },
  menuText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  playlistSection: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  playlistSectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
});
