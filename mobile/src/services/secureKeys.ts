import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiKeysConfig } from '../types';

const STORAGE_KEY = 'musie_api_keys_v1';

export const DEFAULT_BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://musie.onrender.com';

export function normalizeBackendUrl(raw?: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
  if (!cleaned) return DEFAULT_BACKEND_URL;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  const isLocalHost = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(cleaned);
  return `${isLocalHost ? 'http' : 'https'}://${cleaned}`;
}

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
      backendUrl: normalizeBackendUrl(parsed.backendUrl),
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
    backendUrl: normalizeBackendUrl(keys.backendUrl),
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
