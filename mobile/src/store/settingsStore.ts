import { create } from 'zustand';
import {
  buildShareableConfig,
  clearSecureKeys,
  EMPTY_KEYS,
  loadSecureKeys,
  parseSharedConfig,
  saveSecureKeys,
} from '../services/secureKeys';
import { ApiKeysConfig } from '../types';

interface SettingsState {
  keys: ApiKeysConfig;
  loaded: boolean;
  init: () => Promise<void>;
  saveKeys: (next: Partial<ApiKeysConfig>) => Promise<void>;
  resetKeys: () => Promise<void>;
  exportConfig: (includeSecrets: boolean) => string;
  importConfig: (rawJson: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  keys: { ...EMPTY_KEYS },
  loaded: false,

  init: async () => {
    const keys = await loadSecureKeys();
    set({ keys, loaded: true });
  },

  saveKeys: async (next) => {
    const merged: ApiKeysConfig = {
      ...get().keys,
      ...next,
    };
    await saveSecureKeys(merged);
    set({ keys: merged });
  },

  resetKeys: async () => {
    await clearSecureKeys();
    set({ keys: { ...EMPTY_KEYS } });
  },

  exportConfig: (includeSecrets) => {
    return buildShareableConfig(get().keys, includeSecrets);
  },

  importConfig: async (rawJson) => {
    const patch = parseSharedConfig(rawJson);
    await get().saveKeys(patch);
  },
}));
