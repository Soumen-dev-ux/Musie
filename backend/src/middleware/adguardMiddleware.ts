import { NextFunction, Request, Response } from 'express';
import { adguardService } from '../services/adguardService.js';

/**
 * Inspects query URLs (e.g., ?url=...) on proxy/external-source endpoints
 * and blocks known ad/tracker domains via AdGuard rules.
 */
export function adguardUrlGuard(req: Request, res: Response, next: NextFunction): void {
  const targetUrl =
    (typeof req.query.url === 'string' && req.query.url) ||
    (typeof req.body?.url === 'string' && req.body.url);

  if (!targetUrl) {
    next();
    return;
  }

  const inspection = adguardService.inspectUrl(targetUrl, `http:${req.path}`);
  if (!inspection.allowed) {
    res.status(403).json({
      error: 'Blocked by Musie AdGuard',
      blocked: true,
      hostname: inspection.hostname,
      matchedRule: inspection.matchedRule,
    });
    return;
  }

  if (typeof req.query.url === 'string') {
    req.query.url = inspection.sanitizedUrl;
  }
  if (req.body && typeof req.body.url === 'string') {
    req.body.url = inspection.sanitizedUrl;
  }

  next();
}
