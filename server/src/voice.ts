import { Router } from 'express';
import { handleVoiceCommand } from '../../shared/voiceCommandService';

export const voiceRouter = Router();

voiceRouter.post('/execute', async (req, res) => {
  const { status, body } = await handleVoiceCommand(req.body ?? {});
  res.status(status).json(body);
});
