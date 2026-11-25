import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibraryStore } from '../../src/store/libraryStore';
import { colors } from '../../src/theme/colors';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const playlists = useLibraryStore((s) => s.playlists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const importSpotifyPlaylist = useLibraryStore((s) => s.importSpotifyPlaylist);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const handleCreatePlaylist = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await createPlaylist(trimmed);
      setNewName('');
      setCreateOpen(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create playlist');
    }
  };

  const handleImportSpotify = async () => {
    const trimmed = spotifyUrl.trim();
    if (!trimmed) return;
    setImporting(true);
    try {
      const playlist = await importSpotifyPlaylist(trimmed);
      setSpotifyUrl('');
      Alert.alert('Imported!', `"${playlist.name}" (${playlist.tracks.length} tracks) added.`);
    } catch (err) {
      Alert.alert(
        'Spotify Import Failed',
        err instanceof Error
          ? err.message
          : 'Make sure Spotify Client ID & Secret are set in Settings.',
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 14 }]}>
      <View style={styles.header}>
        <Text style={styles.heading}>Your Library</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreateOpen(true)}>
          <Ionicons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Liked Songs */}
        <TouchableOpacity
          style={styles.playlistRow}
          onPress={() => router.push('/playlist/liked')}
        >
          <LinearGradient colors={['#450AF5', '#8E8EE5']} style={styles.likedIcon}>
            <Ionicons name="heart" size={24} color="#FFFFFF" />
          </LinearGradient>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.plTitle}>Liked Songs</Text>
            <Text style={styles.plSub}>{likedTracks.length} songs</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Import Spotify Playlist Box */}
        <View style={styles.importCard}>
          <View style={styles.importHeader}>
            <Ionicons name="logo-tableau" size={18} color={colors.spotify} />
            <Text style={styles.importTitle}>Import Spotify Playlist → Play via YouTube</Text>
          </View>
          <View style={styles.importRow}>
            <TextInput
              style={styles.importInput}
              value={spotifyUrl}
              onChangeText={setSpotifyUrl}
              placeholder="Paste Spotify playlist URL or ID..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.importBtn}
              onPress={handleImportSpotify}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.importBtnText}>Import</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* User Playlists */}
        <Text style={styles.sectionLabel}>Playlists</Text>
        {playlists.map((pl) => (
          <TouchableOpacity
            key={pl.id}
            style={styles.playlistRow}
            onPress={() => router.push(`/playlist/${pl.id}`)}
          >
            {pl.coverUrl || pl.tracks[0]?.artworkUrl ? (
              <Image
                source={{ uri: pl.coverUrl || pl.tracks[0]?.artworkUrl }}
                style={styles.plCover}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.plCover, styles.plPlaceholder]}>
                <Ionicons name="musical-notes" size={24} color={colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.plTitle} numberOfLines={1}>{pl.name}</Text>
              <Text style={styles.plSub}>
                {pl.source === 'spotify-import' ? 'Spotify Import · ' : ''}
                {pl.tracks.length} tracks
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Create Playlist Modal */}
      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Playlist</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="My Late Night Mix"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCreateOpen(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreatePlaylist} style={styles.createBtn}>
                <Text style={styles.createText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  addBtn: {
    padding: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
  },
  importCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  importHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  importTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  importRow: {
    flexDirection: 'row',
    gap: 8,
  },
  importInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  importBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  importBtnText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 13,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },
  likedIcon: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plCover: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
  },
  plPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  plTitle: {
    color: colors.textPrimary,
    fontSize: 15.5,
    fontWeight: '700',
  },
  plSub: {
    color: colors.textSecondary,
    fontSize: 12.5,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  createBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  createText: {
    color: colors.background,
    fontWeight: '700',
  },
});
