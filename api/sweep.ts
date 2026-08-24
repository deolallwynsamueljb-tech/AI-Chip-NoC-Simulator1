import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { NoCConfig } from '../shared/types/noc';
import { SweepEngine } from '../shared/engine/sweepEngine';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const config = req.body?.config as NoCConfig | undefined;
  if (!config) return res.status(400).json({ error: 'config is required' });

  const injectionRates = req.body?.injectionRates as number[] | undefined;
  const cyclesPerPoint = req.body?.cyclesPerPoint as number | undefined;
  const data = SweepEngine.runMultiModeSweep(config, injectionRates, cyclesPerPoint);
  res.status(200).json(data);
}
