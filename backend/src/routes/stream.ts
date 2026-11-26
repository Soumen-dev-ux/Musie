import axios from 'axios';
import { Response, Router } from 'express';
import { adguardUrlGuard } from '../middleware/adguardMiddleware.js';
import { adguardService } from '../services/adguardService.js';
import { youtubeService } from '../services/youtubeService.js';

const router = Router();

function forwardHeader(
  res: Response,
  name: string,
  value: unknown,
  fallback?: string | number,
): void {
  if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
    res.setHeader(name, value);
  } else if (fallback !== undefined) {
    res.setHeader(name, String(fallback));
  }
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Preflight endpoint called by mobile player before starting ExoPlayer/AVPlayer.
 * Returns playable stream metadata and surfaces real extraction errors immediately
 * instead of letting the mobile player hang indefinitely in a buffering state.
 */
router.get('/:videoId/resolve', async (req, res) => {
  const { videoId } = req.params;
  if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
    res.status(400).json({ error: 'Invalid YouTube video ID' });
    return;
  }

  try {
    const streamInfo = await youtubeService.resolveAudioStream(videoId);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const proxyUrl = `${baseUrl}/api/stream/${encodeURIComponent(videoId)}`;

    res.json({
      videoId,
      playableUrl: streamInfo.preferDirect ? streamInfo.url : proxyUrl,
      proxyUrl,
      directUrl: streamInfo.preferDirect ? streamInfo.url : undefined,
      mimeType: streamInfo.mimeType,
      contentLength: streamInfo.contentLength,
      resolver: streamInfo.resolver,
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to resolve YouTube audio stream',
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
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

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
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  const rangeHeader = req.header('range');
  const isHead = req.method === 'HEAD';

  const fetchUpstream = async (forceRefresh: boolean) => {
    if (forceRefresh) {
      youtubeService.invalidateStreamCache(videoId);
    }
    const streamInfo = await youtubeService.resolveAudioStream(videoId);
    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        streamInfo.headers?.['User-Agent'] ||
        streamInfo.headers?.['user-agent'] ||
        DEFAULT_USER_AGENT,
    };
    const referer = streamInfo.headers?.Referer || streamInfo.headers?.referer;
    if (referer) {
      upstreamHeaders.Referer = referer;
    }
    if (rangeHeader) {
      upstreamHeaders.Range = rangeHeader;
    }

    const upstream = await axios.request({
      method: isHead ? 'HEAD' : 'GET',
      url: streamInfo.url,
      headers: upstreamHeaders,
      responseType: isHead ? 'arraybuffer' : 'stream',
      signal: abortController.signal,
      timeout: 25000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    return { streamInfo, upstream };
  };

  try {
    let resolved;
    try {
      resolved = await fetchUpstream(false);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if ((status === 403 || status === 410) && !abortController.signal.aborted) {
        resolved = await fetchUpstream(true);
      } else {
        throw err;
      }
    }

    const { streamInfo, upstream } = resolved;

    res.status(upstream.status);
    forwardHeader(res, 'Content-Type', upstream.headers['content-type'], streamInfo.mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    forwardHeader(
      res,
      'Content-Length',
      upstream.headers['content-length'],
      rangeHeader ? undefined : streamInfo.contentLength,
    );
    forwardHeader(res, 'Content-Range', upstream.headers['content-range']);
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.flushHeaders();

    if (isHead) {
      res.end();
      return;
    }

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
    console.error(`[Stream] Failed for ${videoId}:`, error instanceof Error ? error.message : error);
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to stream YouTube audio',
    });
  }
});

export default router;
