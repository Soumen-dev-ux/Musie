import { Request, Router } from 'express';
import { spotifyService } from '../services/spotifyService.js';
import { storageService } from '../services/storageService.js';
import { youtubeService } from '../services/youtubeService.js';
import { ApiCredentials, Playlist } from '../types/index.js';

const router = Router();

function getCreds(req: Request): ApiCredentials {
  return {
    youtubeApiKey: req.header('x-youtube-api-key') || req.body?.youtubeApiKey,
    spotifyClientId: req.header('x-spotify-client-id') || req.body?.spotifyClientId,
    spotifyClientSecret: req.header('x-spotify-client-secret') || req.body?.spotifyClientSecret,
  };
}

router.post('/test-keys', async (req, res) => {
  const result = await spotifyService.testCredentials(getCreds(req));
  res.status(result.valid ? 200 : 400).json(result);
});

router.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  try {
    const items = await spotifyService.searchTracks(q, getCreds(req));
    res.json({ tracks: items });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Spotify search failed',
    });
  }
});

router.post('/match-track', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : '';
  const artist = typeof req.body?.artist === 'string' ? req.body.artist : '';
  if (!title) {
    res.status(400).json({ error: 'Track title is required' });
    return;
  }

  try {
    const creds = getCreds(req);
    const { tracks } = await youtubeService.searchTracks(
      `${title} ${artist} official audio`,
      creds.youtubeApiKey,
      1,
    );
    if (!tracks[0]) {
      res.status(404).json({ error: 'No matching YouTube audio found' });
      return;
    }
    res.json({
      track: {
        ...tracks[0],
        title,
        artist: artist || tracks[0].artist,
        artworkUrl: req.body?.artworkUrl || tracks[0].artworkUrl,
        source: 'spotify-matched',
        spotifyId: req.body?.spotifyId,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Track matching failed',
    });
  }
});

router.post('/import-playlist', async (req, res) => {
  const playlistInput = typeof req.body?.playlistUrl === 'string' ? req.body.playlistUrl.trim() : '';
  if (!playlistInput) {
    res.status(400).json({ error: 'playlistUrl or Spotify playlist ID is required' });
    return;
  }

  try {
    const imported = await spotifyService.importPlaylistToYouTube(playlistInput, getCreds(req));
    const now = new Date().toISOString();
    const newPlaylist: Playlist = {
      id: `pl-${Date.now()}`,
      name: imported.name,
      description: imported.description,
      coverUrl: imported.coverUrl,
      tracks: imported.tracks,
      source: 'spotify-import',
      createdAt: now,
      updatedAt: now,
    };

    const state = storageService.getState();
    state.playlists.unshift(newPlaylist);
    storageService.scheduleSave();

    res.json({ playlist: newPlaylist });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to import Spotify playlist',
    });
  }
});

export default router;
