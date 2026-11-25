import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrackRow } from '../../src/components/TrackRow';
import { apiClient } from '../../src/services/apiClient';
import { usePlayerStore } from '../../src/store/playerStore';
import { colors } from '../../src/theme/colors';
import { Track } from '../../src/types';

const GENRE_TILES = [
  { label: 'Lo-Fi Beats', query: 'lofi hip hop beats', color: '#3B5249' },
  { label: 'Bollywood Hits', query: 'hindi top hits official audio', color: '#7D3C98' },
  { label: 'Synthwave', query: 'synthwave retrowave mix', color: '#1F618D' },
  { label: 'Indie Chill', query: 'indie pop chill', color: '#B9770E' },
  { label: 'EDM & Bass', query: 'electronic dance music hits', color: '#922B21' },
  { label: 'Acoustic', query: 'acoustic covers chill', color: '#1E8449' },
];

interface SpotifyStub {
  spotifyId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  artworkUrl: string;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'youtube' | 'spotify'>('youtube');
  const [ytResults, setYtResults] = useState<Track[]>([]);
  const [spResults, setSpResults] = useState<SpotifyStub[]>([]);
  const [providerLabel, setProviderLabel] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const runSearch = async (searchQuery?: string) => {
    const q = (searchQuery ?? query).trim();
    if (!q) return;
    if (searchQuery) setQuery(searchQuery);
    Keyboard.dismiss();

    setLoading(true);
    setError(null);
    try {
      if (mode === 'youtube') {
        const res = await apiClient.searchYouTube(q, 20);
        setYtResults(res.tracks);
        setSpResults([]);
        setProviderLabel(
          res.provider === 'youtube-data-api' ? 'YouTube Data API v3' : 'YouTube Direct Search',
        );
      } else {
        const res = await apiClient.searchSpotify(q);
        setSpResults(res.tracks);
        setYtResults([]);
        setProviderLabel('Spotify Catalog (plays via YouTube)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySpotifyStub = async (stub: SpotifyStub) => {
    setMatchingId(stub.spotifyId);
    setError(null);
    try {
      const { track } = await apiClient.matchSpotifyTrack({
        spotifyId: stub.spotifyId,
        title: stub.title,
        artist: stub.artist,
        artworkUrl: stub.artworkUrl,
      });
      await playTrack(track);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to match Spotify track on YouTube');
    } finally {
      setMatchingId(null);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 14 }]}>
      <Text style={styles.heading}>Search</Text>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
          placeholder={
            mode === 'youtube' ? 'Songs, artists, YouTube tracks...' : 'Search Spotify catalog...'
          }
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setQuery('');
              setYtResults([]);
              setSpResults([]);
            }}
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Source Toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'youtube' && styles.modeBtnActive]}
          onPress={() => setMode('youtube')}
        >
          <Ionicons
            name="logo-youtube"
            size={15}
            color={mode === 'youtube' ? colors.background : colors.youtube}
          />
          <Text style={[styles.modeText, mode === 'youtube' && styles.modeTextActive]}>
            YouTube Music
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeBtn, mode === 'spotify' && styles.modeBtnActive]}
          onPress={() => setMode('spotify')}
        >
          <Ionicons
            name="musical-notes"
            size={15}
            color={mode === 'spotify' ? colors.background : colors.spotify}
          />
          <Text style={[styles.modeText, mode === 'spotify' && styles.modeTextActive]}>
            Spotify Catalog
          </Text>
        </TouchableOpacity>
      </View>

      {providerLabel ? <Text style={styles.providerLabel}>{providerLabel}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : ytResults.length > 0 ? (
        <FlatList
          data={ytResults}
          keyExtractor={(item) => item.youtubeId}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              isActive={currentTrack?.youtubeId === item.youtubeId}
              onPress={() => playTrack(item, ytResults)}
            />
          )}
        />
      ) : spResults.length > 0 ? (
        <FlatList
          data={spResults}
          keyExtractor={(item) => item.spotifyId}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.spRow}
              onPress={() => handlePlaySpotifyStub(item)}
              activeOpacity={0.8}
            >
              <Image source={{ uri: item.artworkUrl }} style={styles.spThumb} contentFit="cover" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.spTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.spArtist} numberOfLines={1}>{item.artist}</Text>
              </View>
              {matchingId === item.spotifyId ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="play-circle" size={28} color={colors.primary} />
              )}
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={styles.tilesWrap}>
          <Text style={styles.browseTitle}>Browse Moods & Genres</Text>
          <View style={styles.tilesGrid}>
            {GENRE_TILES.map((tile) => (
              <TouchableOpacity
                key={tile.label}
                style={[styles.tile, { backgroundColor: tile.color }]}
                onPress={() => {
                  setMode('youtube');
                  runSearch(tile.query);
                }}
              >
                <Text style={styles.tileText}>{tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
  },
  modeBtnActive: {
    backgroundColor: colors.textPrimary,
  },
  modeText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  modeTextActive: {
    color: colors.background,
  },
  providerLabel: {
    color: colors.textMuted,
    fontSize: 11.5,
    marginBottom: 6,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tilesWrap: {
    marginTop: 14,
  },
  browseTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  tile: {
    width: '48.4%',
    height: 88,
    borderRadius: 10,
    padding: 14,
    justifyContent: 'flex-end',
  },
  tileText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  spRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  spThumb: {
    width: 52,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  spTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  spArtist: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
});
