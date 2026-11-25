import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import {
  AdGuardConfig,
  AdGuardRule,
  AdGuardStats,
  Playlist,
  Track,
} from '../types/index.js';
import { DEFAULT_ADGUARD_RULES } from '../data/defaultBlocklist.js';

export interface DatabaseState {
  likedTracks: Track[];
  playlists: Playlist[];
  recentlyPlayed: Track[];
  adguardConfig: AdGuardConfig;
  adguardRules: AdGuardRule[];
  adguardStats: AdGuardStats;
}

const DB_FILE = path.join(env.dataDir, 'db.json');

function createInitialState(): DatabaseState {
  const now = new Date().toISOString();
  return {
    likedTracks: [],
    playlists: [
      {
        id: 'pl-favorites',
        name: 'My Mix',
        description: 'Your personal YouTube & Spotify imported tracks',
        tracks: [],
        source: 'local',
        createdAt: now,
        updatedAt: now,
      },
    ],
    recentlyPlayed: [],
    adguardConfig: {
      enabled: env.adguardEnabled,
      blockAdDomains: true,
      sponsorBlockEnabled: env.sponsorBlockEnabled,
      stripTrackingParams: true,
      blockThirdPartyAudioAds: true,
    },
    adguardRules: DEFAULT_ADGUARD_RULES.map((rule, idx) => ({
      id: `default-${idx + 1}`,
      pattern: rule.pattern,
      type: 'block',
      comment: rule.comment,
      enabled: true,
      createdAt: now,
    })),
    adguardStats: {
      totalInspected: 0,
      totalBlocked: 0,
      sponsorSegmentsSkipped: 0,
      trackingParamsStripped: 0,
      recentBlocked: [],
    },
  };
}

class StorageService {
  private state: DatabaseState;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDir();
    this.state = this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(env.dataDir)) {
      fs.mkdirSync(env.dataDir, { recursive: true });
    }
  }

  private load(): DatabaseState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<DatabaseState>;
        const initial = createInitialState();
        return {
          ...initial,
          ...parsed,
          adguardConfig: {
            ...initial.adguardConfig,
            ...(parsed.adguardConfig || {}),
          },
          adguardStats: {
            ...initial.adguardStats,
            ...(parsed.adguardStats || {}),
          },
        };
      }
    } catch (error) {
      console.warn('[Storage] Failed to load db.json, initializing fresh state:', error);
    }
    const fresh = createInitialState();
    this.writeSync(fresh);
    return fresh;
  }

  private writeSync(data: DatabaseState): void {
    this.ensureDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  public scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      try {
        this.writeSync(this.state);
      } catch (err) {
        console.error('[Storage] Failed to save db.json:', err);
      }
    }, 250);
  }

  public getState(): DatabaseState {
    return this.state;
  }
}

export const storageService = new StorageService();
