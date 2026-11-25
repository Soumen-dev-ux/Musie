import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdGuardCard } from '../../src/components/AdGuardCard';
import { ApiKeysCard } from '../../src/components/ApiKeysCard';
import { colors } from '../../src/theme/colors';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 14 }]}>
      <Text style={styles.heading}>Settings</Text>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ApiKeysCard />
        <AdGuardCard />

        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="musical-notes-outline" size={18} color={colors.primary} />
            <Text style={styles.infoTitle}>Background Playback & Lock Screen</Text>
          </View>
          <Text style={styles.infoText}>
            Musie uses Expo SDK 58 (`expo-audio`) with `enableBackgroundPlayback` and MediaSession lock-screen controls. To test lock-screen and background playback on a real phone, run a native development build (`npx expo run:android` or `npx expo run:ios`) rather than Expo Go.
          </Text>
        </View>
      </ScrollView>
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
    marginBottom: 14,
  },
  scroll: {
    paddingBottom: 110,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  infoTitle: {
    color: colors.textPrimary,
    fontSize: 14.5,
    fontWeight: '700',
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
  },
});
