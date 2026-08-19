import { Router } from 'express';
import type { NoCConfig } from '../../shared/types/noc';
import { SweepEngine } from './engine/sweepEngine';
import { buildSnapshot } from './serialize';
import {
  createSession,
  deleteSession,
  resetSession,
  snapshotFor,
  stepSession,
  updateSessionConfig,
} from './sessionManager';

export const router = Router();

router.post('/sessions', (req, res) => {
  const config = req.body?.config as NoCConfig | undefined;
  if (!config) return res.status(400).json({ error: 'config is required' });

  const session = createSession(config);
  res.status(201).json({ sessionId: session.id, snapshot: buildSnapshot(session.sim) });
});

router.get('/sessions/:id', (req, res) => {
  const snapshot = snapshotFor(req.params.id);
  if (!snapshot) return res.status(404).json({ error: 'session not found' });
  res.json({ snapshot });
});

router.patch('/sessions/:id/config', (req, res) => {
  const snapshot = updateSessionConfig(req.params.id, (req.body ?? {}) as Partial<NoCConfig>);
  if (!snapshot) return res.status(404).json({ error: 'session not found' });
  res.json({ snapshot });
});

router.post('/sessions/:id/reset', (req, res) => {
  const snapshot = resetSession(req.params.id);
  if (!snapshot) return res.status(404).json({ error: 'session not found' });
  res.json({ snapshot });
});

router.post('/sessions/:id/step', (req, res) => {
  const cycles = Number(req.body?.cycles);
  const snapshot = stepSession(req.params.id, Number.isFinite(cycles) && cycles > 0 ? cycles : 1);
  if (!snapshot) return res.status(404).json({ error: 'session not found' });
  res.json({ snapshot });
});

router.delete('/sessions/:id', (req, res) => {
  deleteSession(req.params.id);
  res.status(204).end();
});

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
