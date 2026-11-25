import axios from 'axios';
import { TRACKING_QUERY_PARAMS } from '../data/defaultBlocklist.js';
import {
  AdGuardConfig,
  AdGuardRule,
  AdGuardStats,
  BlockedEvent,
  SponsorSegment,
} from '../types/index.js';
import { storageService } from './storageService.js';

export interface UrlInspectionResult {
  allowed: boolean;
  sanitizedUrl: string;
  originalUrl: string;
  hostname: string;
  matchedRule?: string;
  strippedParams: string[];
}

class AdGuardService {
  private sponsorCache = new Map<string, { expiresAt: number; segments: SponsorSegment[] }>();

  public getConfig(): AdGuardConfig {
    return storageService.getState().adguardConfig;
  }

  public updateConfig(patch: Partial<AdGuardConfig>): AdGuardConfig {
    const state = storageService.getState();
    state.adguardConfig = { ...state.adguardConfig, ...patch };
    storageService.scheduleSave();
    return state.adguardConfig;
  }

  public getRules(): AdGuardRule[] {
    return storageService.getState().adguardRules;
  }

  public addRule(pattern: string, type: 'block' | 'allow' = 'block', comment?: string): AdGuardRule {
    const trimmed = pattern.trim();
    if (!trimmed) {
      throw new Error('Rule pattern cannot be empty');
    }
    const state = storageService.getState();
    const newRule: AdGuardRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      pattern: trimmed,
      type,
      comment,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    state.adguardRules.unshift(newRule);
    storageService.scheduleSave();
    return newRule;
  }

  public toggleRule(id: string, enabled: boolean): AdGuardRule | null {
    const state = storageService.getState();
    const rule = state.adguardRules.find((r) => r.id === id);
    if (!rule) return null;
    rule.enabled = enabled;
    storageService.scheduleSave();
    return rule;
  }

  public deleteRule(id: string): boolean {
    const state = storageService.getState();
    const before = state.adguardRules.length;
    state.adguardRules = state.adguardRules.filter((r) => r.id !== id);
    if (state.adguardRules.length !== before) {
      storageService.scheduleSave();
      return true;
    }
    return false;
  }

  public getStats(): AdGuardStats {
    return storageService.getState().adguardStats;
  }

  public resetStats(): AdGuardStats {
    const state = storageService.getState();
    state.adguardStats = {
      totalInspected: 0,
      totalBlocked: 0,
      sponsorSegmentsSkipped: 0,
      trackingParamsStripped: 0,
      recentBlocked: [],
    };
    storageService.scheduleSave();
    return state.adguardStats;
  }

  public recordSponsorSkip(count = 1): AdGuardStats {
    const state = storageService.getState();
    state.adguardStats.sponsorSegmentsSkipped += count;
    storageService.scheduleSave();
    return state.adguardStats;
  }

  /**
   * Matches an AdGuard rule pattern against a URL / hostname.
   * Supports:
   * - `||domain.com^` (domain and subdomains, optional path)
   * - `0.0.0.0 domain.com` or `127.0.0.1 domain.com`
   * - `/regex/`
   * - plain domain or substring
   */
  private matchesPattern(pattern: string, hostname: string, fullUrl: string): boolean {
    const p = pattern.trim();
    if (!p || p.startsWith('!') || p.startsWith('#')) return false;

    // Regex rule: /pattern/flags
    if (p.startsWith('/') && p.lastIndexOf('/') > 0) {
      const lastSlash = p.lastIndexOf('/');
      const body = p.slice(1, lastSlash);
      const flags = p.slice(lastSlash + 1) || 'i';
      try {
        const re = new RegExp(body, flags);
        return re.test(fullUrl);
      } catch {
        return false;
      }
    }

    // Hosts file format: 0.0.0.0 example.com
    const hostsMatch = p.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(.+)$/);
    if (hostsMatch) {
      const domain = hostsMatch[1].trim().toLowerCase();
      return hostname === domain || hostname.endsWith(`.${domain}`);
    }

    // AdGuard ||domain.com^ format (also supports wildcards like ||audio-sp-*.spotifycdn.com^)
    if (p.startsWith('||')) {
      const clean = p.slice(2).replace(/\^$/, '').toLowerCase();
      const [domainPart, ...pathParts] = clean.split('/');
      const pathPart = pathParts.join('/');

      let domainMatched = false;
      if (domainPart.includes('*')) {
        const regexStr = '^([a-z0-9-]+\\.)*' + domainPart.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
        domainMatched = new RegExp(regexStr, 'i').test(hostname);
      } else {
        domainMatched = hostname === domainPart || hostname.endsWith(`.${domainPart}`);
      }

      if (!domainMatched) return false;
      if (!pathPart) return true;
      return fullUrl.toLowerCase().includes(`/${pathPart}`);
    }

    // Plain domain or substring
    const lower = p.toLowerCase();
    return hostname === lower || hostname.endsWith(`.${lower}`) || fullUrl.toLowerCase().includes(lower);
  }

  public inspectUrl(rawUrl: string, source = 'unknown'): UrlInspectionResult {
    const state = storageService.getState();
    const config = state.adguardConfig;
    const strippedParams: string[] = [];

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return {
        allowed: true,
        sanitizedUrl: rawUrl,
        originalUrl: rawUrl,
        hostname: '',
        strippedParams,
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (!config.enabled) {
      return {
        allowed: true,
        sanitizedUrl: rawUrl,
        originalUrl: rawUrl,
        hostname,
        strippedParams,
      };
    }

    state.adguardStats.totalInspected += 1;

    // 1. Strip tracking query parameters if enabled
    if (config.stripTrackingParams) {
      for (const param of TRACKING_QUERY_PARAMS) {
        if (parsed.searchParams.has(param)) {
          parsed.searchParams.delete(param);
          strippedParams.push(param);
        }
      }
      if (strippedParams.length > 0) {
        state.adguardStats.trackingParamsStripped += strippedParams.length;
      }
    }

    const sanitizedUrl = parsed.toString();

    // 2. Check domain & URL rules (allow rules take precedence)
    if (config.blockAdDomains) {
      const activeRules = state.adguardRules.filter((r) => r.enabled);
      const allowHit = activeRules.find(
        (r) => r.type === 'allow' && this.matchesPattern(r.pattern, hostname, sanitizedUrl),
      );

      if (!allowHit) {
        const blockHit = activeRules.find(
          (r) => r.type === 'block' && this.matchesPattern(r.pattern, hostname, sanitizedUrl),
        );

        if (blockHit) {
          state.adguardStats.totalBlocked += 1;
          const event: BlockedEvent = {
            id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url: sanitizedUrl.slice(0, 220),
            hostname,
            matchedRule: blockHit.pattern,
            source,
            timestamp: new Date().toISOString(),
          };
          state.adguardStats.recentBlocked = [
            event,
            ...state.adguardStats.recentBlocked.slice(0, 49),
          ];
          storageService.scheduleSave();

          return {
            allowed: false,
            sanitizedUrl,
            originalUrl: rawUrl,
            hostname,
            matchedRule: blockHit.pattern,
            strippedParams,
          };
        }
      }
    }

    // 3. Heuristic third-party audio ad segment check (VAST/VMAP/DAI/ad-insertion URLs)
    if (config.blockThirdPartyAudioAds) {
      const adPathRegex = /(\/vast\/|\/vmap\/|\/ad-break|\/preroll|\/midroll|\/dai\/|ad_type=|adformat=)/i;
      if (adPathRegex.test(sanitizedUrl)) {
        state.adguardStats.totalBlocked += 1;
        const event: BlockedEvent = {
          id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url: sanitizedUrl.slice(0, 220),
          hostname,
          matchedRule: 'heuristic:third-party-audio-ad',
          source,
          timestamp: new Date().toISOString(),
        };
        state.adguardStats.recentBlocked = [
          event,
          ...state.adguardStats.recentBlocked.slice(0, 49),
        ];
        storageService.scheduleSave();

        return {
          allowed: false,
          sanitizedUrl,
          originalUrl: rawUrl,
          hostname,
          matchedRule: 'heuristic:third-party-audio-ad',
          strippedParams,
        };
      }
    }

    storageService.scheduleSave();
    return {
      allowed: true,
      sanitizedUrl,
      originalUrl: rawUrl,
      hostname,
      strippedParams,
    };
  }

  /**
   * Fetch SponsorBlock segments for a YouTube video ID so the player can
   * automatically skip sponsor reads, intros, outros, and non-music sections.
   */
  public async getSponsorSegments(videoId: string): Promise<SponsorSegment[]> {
    const config = this.getConfig();
    if (!config.enabled || !config.sponsorBlockEnabled) {
      return [];
    }

    const cached = this.sponsorCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.segments;
    }

    try {
      const categories = JSON.stringify([
        'sponsor',
        'selfpromo',
        'interaction',
        'music_offtopic',
      ]);
      const response = await axios.get<SponsorSegment[]>(
        'https://sponsor.ajay.app/api/skipSegments',
        {
          params: { videoID: videoId, categories },
          timeout: 3500,
        },
      );

      const segments = Array.isArray(response.data) ? response.data : [];
      this.sponsorCache.set(videoId, {
        segments,
        expiresAt: Date.now() + 1000 * 60 * 30,
      });
      return segments;
    } catch {
      // SponsorBlock returns 404 when no segments exist for a video
      this.sponsorCache.set(videoId, {
        segments: [],
        expiresAt: Date.now() + 1000 * 60 * 15,
      });
      return [];
    }
  }
}

export const adguardService = new AdGuardService();
