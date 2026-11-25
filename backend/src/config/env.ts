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
  adguardEnabled: process.env.ADGUARD_ENABLED !== 'false',
  sponsorBlockEnabled: process.env.SPONSORBLOCK_ENABLED !== 'false',
  dataDir: path.resolve(process.cwd(), 'data'),
};
