import type { VercelRequest, VercelResponse } from '@vercel/node';
import { answerAssistantQuestion } from '../../shared/assistantService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { status, body } = await answerAssistantQuestion(req.body ?? {});
  res.status(status).json(body);
}
