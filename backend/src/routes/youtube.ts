import { Request, Router } from 'express';
import { youtubeService } from '../services/youtubeService.js';

const router = Router();

function getYoutubeKey(req: Request): string | undefined {
  const headerKey = req.header('x-youtube-api-key');
  return headerKey ? headerKey.trim() : undefined;
}

router.get('/home', async (req, res) => {
  try {
    const sections = await youtubeService.getHomeFeed(getYoutubeKey(req));
    res.json({ sections });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load home feed',
    });
  }
});

router.get('/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limit = Number(req.query.limit || 20);
  if (!query) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  try {
    const result = await youtubeService.searchTracks(query, getYoutubeKey(req), limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'YouTube search failed',
    });
  }
});

router.get('/related/:videoId', async (req, res) => {
  try {
    const tracks = await youtubeService.getRelatedTracks(req.params.videoId, getYoutubeKey(req));
    res.json({ tracks });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load related tracks',
    });
  }
});

router.post('/test-key', async (req, res) => {
  const apiKey =
    (typeof req.body?.youtubeApiKey === 'string' && req.body.youtubeApiKey) ||
    getYoutubeKey(req) ||
    '';
  const result = await youtubeService.testApiKey(apiKey);
  res.status(result.valid ? 200 : 400).json(result);
});

export default router;
