import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { apiClient } from '../services/apiClient';
import { audioEngine } from '../services/audioEngine';
import { AdGuardConfig, AdGuardRule, AdGuardStats } from '../types';

const ADGUARD_CACHE_KEY = 'musie_adguard_cache_v1';

interface AdGuardState {
  config: AdGuardConfig;
  rules: AdGuardRule[];
  stats: AdGuardStats;
  loading: boolean;
  syncError: string | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  updateConfig: (patch: Partial<AdGuardConfig>) => Promise<void>;
  addRule: (pattern: string, type?: 'block' | 'allow', comment?: string) => Promise<void>;
  toggleRule: (id: string, enabled: boolean) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  resetStats: () => Promise<void>;
}

const DEFAULT_CONFIG: AdGuardConfig = {
  enabled: true,
  blockAdDomains: true,
  sponsorBlockEnabled: true,
  stripTrackingParams: true,
  blockThirdPartyAudioAds: true,
};

const DEFAULT_STATS: AdGuardStats = {
  totalInspected: 0,
  totalBlocked: 0,
  sponsorSegmentsSkipped: 0,
  trackingParamsStripped: 0,
  recentBlocked: [],
};

export const useAdGuardStore = create<AdGuardState>((set, get) => ({
  config: DEFAULT_CONFIG,
  rules: [],
  stats: DEFAULT_STATS,
  loading: false,
  syncError: null,

  init: async () => {
    try {
      const cached = await AsyncStorage.getItem(ADGUARD_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          config?: AdGuardConfig;
          rules?: AdGuardRule[];
          stats?: AdGuardStats;
        };
        if (parsed.config) {
          audioEngine.setSponsorBlockEnabled(
            parsed.config.enabled && parsed.config.sponsorBlockEnabled,
          );
          set({ config: parsed.config });
        }
        if (parsed.rules) set({ rules: parsed.rules });
        if (parsed.stats) set({ stats: parsed.stats });
      }
    } catch {
      // ignore cache errors
    }
    await get().refresh();
  },

  refresh: async () => {
    set({ loading: true, syncError: null });
    try {
      const [statusRes, rulesRes] = await Promise.all([
        apiClient.getAdGuardStatus(),
        apiClient.getAdGuardRules(),
      ]);
      audioEngine.setSponsorBlockEnabled(
        statusRes.config.enabled && statusRes.config.sponsorBlockEnabled,
      );
      set({
        config: statusRes.config,
        stats: statusRes.stats,
        rules: rulesRes.rules,
        loading: false,
      });
      await AsyncStorage.setItem(
        ADGUARD_CACHE_KEY,
        JSON.stringify({
          config: statusRes.config,
          stats: statusRes.stats,
          rules: rulesRes.rules,
        }),
      );
    } catch (error) {
      set({
        loading: false,
        syncError: error instanceof Error ? error.message : 'Backend unreachable',
      });
    }
  },

  updateConfig: async (patch) => {
    const optimistic = { ...get().config, ...patch };
    audioEngine.setSponsorBlockEnabled(optimistic.enabled && optimistic.sponsorBlockEnabled);
    set({ config: optimistic });
    try {
      const { config } = await apiClient.updateAdGuardConfig(patch);
      set({ config });
    } catch {
      // Keep local config even if offline
    }
  },

  addRule: async (pattern, type = 'block', comment) => {
    const { rule } = await apiClient.addAdGuardRule(pattern, type, comment);
    set({ rules: [rule, ...get().rules] });
  },

  toggleRule: async (id, enabled) => {
    set({
      rules: get().rules.map((r) => (r.id === id ? { ...r, enabled } : r)),
    });
    try {
      await apiClient.toggleAdGuardRule(id, enabled);
    } catch {
      // ignore
    }
  },

  deleteRule: async (id) => {
    set({ rules: get().rules.filter((r) => r.id !== id) });
    try {
      await apiClient.deleteAdGuardRule(id);
    } catch {
      // ignore
    }
  },

  resetStats: async () => {
    const { stats } = await apiClient.resetAdGuardStats();
    set({ stats });
  },
}));
