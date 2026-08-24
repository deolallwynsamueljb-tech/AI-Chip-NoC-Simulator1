import { Router } from 'express';
import type { NoCConfig } from '../../shared/types/noc';
import { SweepEngine } from '../../shared/engine/sweepEngine';

export const router = Router();

// Real multi-mode sweep, computed on demand. No cached/precomputed curves.
router.post('/sweep', (req, res) => {
  const config = req.body?.config as NoCConfig | undefined;
  if (!config) return res.status(400).json({ error: 'config is required' });

  const injectionRates = req.body?.injectionRates as number[] | undefined;
  const cyclesPerPoint = req.body?.cyclesPerPoint as number | undefined;
  const data = SweepEngine.runMultiModeSweep(config, injectionRates, cyclesPerPoint);
  res.json(data);
});

router.post('/sweep/sensitivity', (req, res) => {
  const config = req.body?.config as NoCConfig | undefined;
  if (!config) return res.status(400).json({ error: 'config is required' });

  const data = SweepEngine.getWorkloadSensitivityMatrix(config);
  res.json({ items: data });
});
