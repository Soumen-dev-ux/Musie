import axios from 'axios';
import { Response, Router } from 'express';
import { adguardUrlGuard } from '../middleware/adguardMiddleware.js';
import { adguardService } from '../services/adguardService.js';
import { youtubeService } from '../services/youtubeService.js';

const router = Router();

function forwardHeader(res: Response, name: string, value: unknown, fallback?: string): void {
  if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
    res.setHeader(name, value);
  } else if (fallback) {
    res.setHeader(name, fallback);
  }
}

/**
 * Streams YouTube audio with HTTP Range support so seeking works smoothly
 * in expo-audio on iOS and Android background players.
 */
router.get('/:videoId', async (req, res) => {
  const { videoId } = req.params;
  if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
    res.status(400).json({ error: 'Invalid YouTube video ID' });
    return;
  }

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    const streamInfo = await youtubeService.resolveAudioStream(videoId);
    const rangeHeader = req.header('range');

    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
    if (rangeHeader) {
      upstreamHeaders.Range = rangeHeader;
    }

    const upstream = await axios.get(streamInfo.url, {
      headers: upstreamHeaders,
      responseType: 'stream',
      signal: abortController.signal,
      timeout: 20000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    res.status(upstream.status);
    forwardHeader(res, 'Content-Type', upstream.headers['content-type'], streamInfo.mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    forwardHeader(res, 'Content-Length', upstream.headers['content-length']);
    forwardHeader(res, 'Content-Range', upstream.headers['content-range']);
    res.setHeader('Cache-Control', 'public, max-age=1800');

    upstream.data.on('error', () => {
      if (!res.headersSent) {
        res.status(502).end();
      } else {
        res.end();
      }
    });

    upstream.data.pipe(res);
  } catch (error) {
    if (abortController.signal.aborted) return;
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to stream YouTube audio',
    });
  }
});

router.get('/:videoId/segments', async (req, res) => {
  const { videoId } = req.params;
  const segments = await adguardService.getSponsorSegments(videoId);
  res.json({ videoId, segments });
});

/**
 * AdGuard-filtered proxy for third-party audio / radio / artwork URLs.
 */
router.get('/proxy/external', adguardUrlGuard, async (req, res) => {
  const targetUrl = typeof req.query.url === 'string' ? req.query.url : '';
  if (!targetUrl) {
    res.status(400).json({ error: 'Missing url query parameter' });
    return;
  }

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    const upstream = await axios.get(targetUrl, {
      responseType: 'stream',
      headers: req.header('range') ? { Range: req.header('range')! } : undefined,
      signal: abortController.signal,
      timeout: 15000,
    });

    res.status(upstream.status);
    forwardHeader(res, 'Content-Type', upstream.headers['content-type']);
    forwardHeader(res, 'Content-Length', upstream.headers['content-length']);
    forwardHeader(res, 'Content-Range', upstream.headers['content-range']);
    res.setHeader('Accept-Ranges', 'bytes');
    upstream.data.pipe(res);
  } catch (error) {
    if (abortController.signal.aborted) return;
    res.status(502).json({
      error: error instanceof Error ? error.message : 'External proxy request failed',
    });
  }
});

export default router;
