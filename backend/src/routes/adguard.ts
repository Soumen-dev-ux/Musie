import { Router } from 'express';
import { adguardService } from '../services/adguardService.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({
    config: adguardService.getConfig(),
    stats: adguardService.getStats(),
    ruleCount: adguardService.getRules().length,
  });
});

router.patch('/config', (req, res) => {
  const updated = adguardService.updateConfig(req.body || {});
  res.json({ config: updated });
});

router.get('/rules', (_req, res) => {
  res.json({ rules: adguardService.getRules() });
});

router.post('/rules', (req, res) => {
  const pattern = typeof req.body?.pattern === 'string' ? req.body.pattern : '';
  const type = req.body?.type === 'allow' ? 'allow' : 'block';
  const comment = typeof req.body?.comment === 'string' ? req.body.comment : undefined;

  try {
    const rule = adguardService.addRule(pattern, type, comment);
    res.status(201).json({ rule });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid rule',
    });
  }
});

router.patch('/rules/:id', (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const updated = adguardService.toggleRule(req.params.id, enabled);
  if (!updated) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json({ rule: updated });
});

router.delete('/rules/:id', (req, res) => {
  const deleted = adguardService.deleteRule(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json({ deleted: true });
});

router.post('/inspect', (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  const source = typeof req.body?.source === 'string' ? req.body.source : 'mobile-client';
  if (!url) {
    res.status(400).json({ error: 'url is required' });
    return;
  }
  const result = adguardService.inspectUrl(url, source);
  res.json(result);
});

router.post('/stats/sponsor-skip', (req, res) => {
  const count = Number(req.body?.count || 1);
  const stats = adguardService.recordSponsorSkip(Number.isFinite(count) ? count : 1);
  res.json({ stats });
});

router.post('/stats/reset', (_req, res) => {
  const stats = adguardService.resetStats();
  res.json({ stats });
});

export default router;
