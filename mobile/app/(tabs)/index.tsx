import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistCard } from '../../src/components/PlaylistCard';
import { apiClient } from '../../src/services/apiClient';
import { useAdGuardStore } from '../../src/store/adguardStore';
import { useLibraryStore } from '../../src/store/libraryStore';
import { usePlayerStore } from '../../src/store/playerStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { colors } from '../../src/theme/colors';
import { HomeSection } from '../../src/types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const adguardConfig = useAdGuardStore((s) => s.config);
  const adguardStats = useAdGuardStore((s) => s.stats);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const backendUrl = useSettingsStore((s) => s.keys.backendUrl);

  const loadFeed = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiClient.getHomeFeed();
      setSections(res.sections || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect to Musie backend. Configure Server URL in Settings.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    loadFeed();
  }, [settingsLoaded, backendUrl, loadFeed]);

  return (
    <LinearGradient colors={['#1F3528', colors.background, colors.background]} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadFeed(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* Top Bar */}
        <View style={styles.headerRow}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <TouchableOpacity
            style={styles.shieldPill}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Ionicons
              name="shield-checkmark"
              size={14}
              color={adguardConfig.enabled ? colors.shieldActive : colors.textMuted}
            />
            <Text style={styles.shieldPillText}>
              {adguardConfig.enabled
                ? `AdGuard · ${adguardStats.totalBlocked + adguardStats.sponsorSegmentsSkipped}`
                : 'Shield Off'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recently Played Quick Grid (Spotify-style 2-column pills) */}
        {recentlyPlayed.length > 0 && (
          <View style={styles.quickGrid}>
            {recentlyPlayed.slice(0, 6).map((track) => (
              <TouchableOpacity
                key={track.youtubeId}
                style={styles.quickCard}
                onPress={() => playTrack(track, recentlyPlayed)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: track.artworkUrl }} style={styles.quickThumb} contentFit="cover" />
                <Text style={styles.quickTitle} numberOfLines={2}>
                  {track.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading && sections.length === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading your YouTube music mixes...</Text>
          </View>
        ) : error && sections.length === 0 ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.warning} />
            <Text style={styles.errorTitle}>Backend Not Connected</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => router.push('/(tabs)/settings')}
            >
              <Text style={styles.settingsBtnText}>Open Settings & API Vault</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                {section.tracks.map((track) => (
                  <PlaylistCard
                    key={track.youtubeId}
                    title={track.title}
                    subtitle={track.artist}
                    imageUrl={track.artworkUrl}
                    onPress={() => playTrack(track, section.tracks)}
                  />
                ))}
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 96,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  greeting: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  shieldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  shieldPillText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 22,
  },
  quickCard: {
    width: '48.8%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    overflow: 'hidden',
    height: 54,
  },
  quickThumb: {
    width: 54,
    height: 54,
  },
  quickTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  section: {
    marginBottom: 26,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 12.5,
    marginTop: 2,
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 13.5,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  settingsBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 14,
  },
  settingsBtnText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 13.5,
  },
});
