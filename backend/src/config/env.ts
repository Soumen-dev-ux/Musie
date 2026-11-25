import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  ytDlpPath: process.env.YT_DLP_PATH || 'yt-dlp',
  ytCookiesContent: process.env.YT_COOKIES_CONTENT || '',
  ytCookiesFile: process.env.YT_COOKIES_FILE || '/etc/secrets/cookies.txt',
  ytProxyUrl: process.env.YT_PROXY_URL || '',
  pipedInstances: (
    process.env.PIPED_INSTANCES ||
    'https://pipedapi.kavin.rocks,https://pipedapi.adminforge.de,https://api.piped.private.coffee'
  )
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  adguardEnabled: process.env.ADGUARD_ENABLED !== 'false',
  sponsorBlockEnabled: process.env.SPONSORBLOCK_ENABLED !== 'false',
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), 'data'),
};
