/**
 * Default curated AdGuard-compatible blocklist rules for blocking
 * audio ads, video ads, telemetry beacons, and third-party ad networks.
 */
export const DEFAULT_ADGUARD_RULES: Array<{ pattern: string; comment: string }> = [
  // Google / YouTube Ad & Telemetry Networks
  { pattern: '||doubleclick.net^', comment: 'Google DoubleClick ad network' },
  { pattern: '||googlesyndication.com^', comment: 'Google AdSense / Syndication' },
  { pattern: '||googleadservices.com^', comment: 'Google AdServices' },
  { pattern: '||adservice.google.com^', comment: 'Google AdService' },
  { pattern: '||pagead2.googlesyndication.com^', comment: 'Google PageAd' },
  { pattern: '||ads.youtube.com^', comment: 'YouTube Ads endpoint' },
  { pattern: '||google-analytics.com^', comment: 'Google Analytics tracker' },
  { pattern: '||googletagmanager.com^', comment: 'Google Tag Manager' },

  // Spotify Ad & Telemetry Domains
  { pattern: '||ads-fa.spotify.com^', comment: 'Spotify Audio Ads' },
  { pattern: '||audio-sp-*.spotifycdn.com^', comment: 'Spotify Ad CDN' },
  { pattern: '||adeventtracker.spotify.com^', comment: 'Spotify Ad Event Tracker' },
  { pattern: '||pixel.spotify.com^', comment: 'Spotify Ad Pixel' },
  { pattern: '||spclient.wg.spotify.com/ads^', comment: 'Spotify Ad Endpoint' },
  { pattern: '||analytics.spotify.com^', comment: 'Spotify Analytics' },
  { pattern: '||log2.spotify.com^', comment: 'Spotify Telemetry Logger' },

  // Third-Party Audio & Podcast Ad Networks (Triton, AdsWizz, Megaphone, Podtrac, etc.)
  { pattern: '||adswizz.com^', comment: 'AdsWizz Audio Ad Insertion' },
  { pattern: '||tritondigital.com^', comment: 'Triton Digital Audio Ads' },
  { pattern: '||ad.doubleclick.net^', comment: 'DoubleClick Ad Insertion' },
  { pattern: '||pubads.g.doubleclick.net^', comment: 'Google Publisher Ads' },
  { pattern: '||dai.google.com^', comment: 'Google Dynamic Ad Insertion' },
  { pattern: '||s0.2mdn.net^', comment: 'DoubleClick Media' },
  { pattern: '||c.adnxs.com^', comment: 'AppNexus Ad Server' },
  { pattern: '||ib.adnxs.com^', comment: 'AppNexus Bidding' },
  { pattern: '||rubiconproject.com^', comment: 'Rubicon Ad Exchange' },
  { pattern: '||openx.net^', comment: 'OpenX Ad Exchange' },
  { pattern: '||taboola.com^', comment: 'Taboola Ad Network' },
  { pattern: '||outbrain.com^', comment: 'Outbrain Ad Network' },
  { pattern: '||amazon-adsystem.com^', comment: 'Amazon Ad System' },
  { pattern: '||criteo.com^', comment: 'Criteo Retargeting' },
  { pattern: '||scorecardresearch.com^', comment: 'Comscore Tracker' },
  { pattern: '||quantserve.com^', comment: 'Quantcast Tracker' },
  { pattern: '||segment.io^', comment: 'Segment Telemetry' },
  { pattern: '||mixpanel.com^', comment: 'Mixpanel Telemetry' },
  { pattern: '||branch.io^', comment: 'Branch Attribution Tracker' },
  { pattern: '||adjust.com^', comment: 'Adjust Attribution Tracker' },
  { pattern: '||appsflyer.com^', comment: 'AppsFlyer Tracker' },
  { pattern: '||analytics.tiktok.com^', comment: 'TikTok Analytics' },
  { pattern: '||connect.facebook.net^', comment: 'Meta Pixel' },
];

export const TRACKING_QUERY_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'si',
  'igshid',
  'mc_cid',
  'mc_eid',
  'yclid',
  'ref_src',
];
