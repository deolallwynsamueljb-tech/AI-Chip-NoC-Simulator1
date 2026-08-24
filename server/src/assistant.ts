import { Router } from 'express';
import { answerAssistantQuestion } from '../../shared/assistantService';

export const assistantRouter = Router();

assistantRouter.post('/ask', async (req, res) => {
  const { status, body } = await answerAssistantQuestion(req.body ?? {});
  res.status(status).json(body);
});
