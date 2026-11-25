import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { audioEngine } from '../src/services/audioEngine';
import { useAdGuardStore } from '../src/store/adguardStore';
import { useLibraryStore } from '../src/store/libraryStore';
import { usePlayerStore } from '../src/store/playerStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { colors } from '../src/theme/colors';

export default function RootLayout() {
  const initSettings = useSettingsStore((s) => s.init);
  const initAdGuard = useAdGuardStore((s) => s.init);
  const initLibrary = useLibraryStore((s) => s.init);
  const initEngine = usePlayerStore((s) => s.initEngine);

  useEffect(() => {
    const bootstrap = async () => {
      await initSettings();
      await audioEngine.ensureAudioMode();
      initEngine();
      initAdGuard();
      initLibrary();
    };
    bootstrap();
  }, [initSettings, initAdGuard, initLibrary, initEngine]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="player"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="playlist/[id]"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
