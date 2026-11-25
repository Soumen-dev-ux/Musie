import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiKeysConfig } from '../types';

const STORAGE_KEY = 'musie_api_keys_v1';

export const DEFAULT_BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

export const EMPTY_KEYS: ApiKeysConfig = {
  backendUrl: DEFAULT_BACKEND_URL,
  youtubeApiKey: '',
  spotifyClientId: '',
  spotifyClientSecret: '',
};

export async function loadSecureKeys(): Promise<ApiKeysConfig> {
  try {
    const raw =
      Platform.OS === 'web'
        ? await AsyncStorage.getItem(STORAGE_KEY)
        : await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return { ...EMPTY_KEYS };
    const parsed = JSON.parse(raw) as Partial<ApiKeysConfig>;
    return {
      backendUrl: parsed.backendUrl?.trim() || DEFAULT_BACKEND_URL,
      youtubeApiKey: parsed.youtubeApiKey || '',
      spotifyClientId: parsed.spotifyClientId || '',
      spotifyClientSecret: parsed.spotifyClientSecret || '',
    };
  } catch {
    return { ...EMPTY_KEYS };
  }
}

export async function saveSecureKeys(keys: ApiKeysConfig): Promise<void> {
  const payload = JSON.stringify({
    backendUrl: keys.backendUrl.trim().replace(/\/+$/, '') || DEFAULT_BACKEND_URL,
    youtubeApiKey: keys.youtubeApiKey.trim(),
    spotifyClientId: keys.spotifyClientId.trim(),
    spotifyClientSecret: keys.spotifyClientSecret.trim(),
  });

  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(STORAGE_KEY, payload);
  } else {
    await SecureStore.setItemAsync(STORAGE_KEY, payload);
  }
}

export async function clearSecureKeys(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } else {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  }
}

export function buildShareableConfig(keys: ApiKeysConfig, includeSecrets: boolean): string {
  const payload = {
    app: 'Musie',
    version: 1,
    backendUrl: keys.backendUrl,
    youtubeApiKey: includeSecrets ? keys.youtubeApiKey : '',
    spotifyClientId: includeSecrets ? keys.spotifyClientId : '',
    spotifyClientSecret: includeSecrets ? keys.spotifyClientSecret : '',
    note: includeSecrets
      ? 'Contains personal API keys. Share only with your own devices or trusted people.'
      : 'Secret keys redacted. Fill them in after importing.',
  };
  return JSON.stringify(payload, null, 2);
}

export function parseSharedConfig(raw: string): Partial<ApiKeysConfig> {
  const parsed = JSON.parse(raw) as Partial<ApiKeysConfig> & { app?: string };
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid config format');
  }
  return {
    backendUrl: typeof parsed.backendUrl === 'string' ? parsed.backendUrl.trim() : undefined,
    youtubeApiKey: typeof parsed.youtubeApiKey === 'string' ? parsed.youtubeApiKey.trim() : undefined,
    spotifyClientId:
      typeof parsed.spotifyClientId === 'string' ? parsed.spotifyClientId.trim() : undefined,
    spotifyClientSecret:
      typeof parsed.spotifyClientSecret === 'string'
        ? parsed.spotifyClientSecret.trim()
        : undefined,
  };
}
