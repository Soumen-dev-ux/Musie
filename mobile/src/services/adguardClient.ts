import { AdGuardConfig, AdGuardRule } from '../types';

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'si',
  'igshid',
];

const BUILTIN_BLOCKED_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'ads.youtube.com',
  'ads-fa.spotify.com',
  'adeventtracker.spotify.com',
  'pixel.spotify.com',
  'adswizz.com',
  'tritondigital.com',
  'scorecardresearch.com',
  'analytics.tiktok.com',
];

function matchPattern(pattern: string, hostname: string, fullUrl: string): boolean {
  const p = pattern.trim();
  if (!p || p.startsWith('!') || p.startsWith('#')) return false;
  if (p.startsWith('||')) {
    const clean = p.slice(2).replace(/\^$/, '').toLowerCase();
    const [domainPart] = clean.split('/');
    if (domainPart.includes('*')) {
      const regexStr =
        '^([a-z0-9-]+\\.)*' + domainPart.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      return new RegExp(regexStr, 'i').test(hostname);
    }
    return hostname === domainPart || hostname.endsWith(`.${domainPart}`);
  }
  const lower = p.toLowerCase();
  return hostname === lower || hostname.endsWith(`.${lower}`) || fullUrl.toLowerCase().includes(lower);
}

/**
 * Client-side AdGuard pre-filter for artwork, external links, and third-party audio sources.
 */
export function filterExternalUrl(
  rawUrl: string,
  config: AdGuardConfig,
  rules: AdGuardRule[] = [],
): { allowed: boolean; url: string; matchedRule?: string } {
  if (!rawUrl || !config.enabled) {
    return { allowed: true, url: rawUrl };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: true, url: rawUrl };
  }

  if (config.stripTrackingParams) {
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }
  }

  const sanitized = parsed.toString();
  const host = parsed.hostname.toLowerCase();

  if (config.blockAdDomains) {
    const active = rules.filter((r) => r.enabled);
    const allowedByRule = active.some(
      (r) => r.type === 'allow' && matchPattern(r.pattern, host, sanitized),
    );
    if (!allowedByRule) {
      const ruleHit = active.find(
        (r) => r.type === 'block' && matchPattern(r.pattern, host, sanitized),
      );
      if (ruleHit) {
        return { allowed: false, url: sanitized, matchedRule: ruleHit.pattern };
      }
      const builtinHit = BUILTIN_BLOCKED_HOSTS.find(
        (blocked) => host === blocked || host.endsWith(`.${blocked}`),
      );
      if (builtinHit) {
        return { allowed: false, url: sanitized, matchedRule: `||${builtinHit}^` };
      }
    }
  }

  return { allowed: true, url: sanitized };
}
