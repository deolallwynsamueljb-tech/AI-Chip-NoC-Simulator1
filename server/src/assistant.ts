import { Router } from 'express';
import type { NoCConfig, SimulationMetrics, WorkloadTelemetry } from '../../shared/types/noc';

export const assistantRouter = Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

interface AssistantRequestBody {
  question: string;
  config: NoCConfig;
  metrics: SimulationMetrics;
  telemetry: WorkloadTelemetry;
}

function buildSystemPrompt(config: NoCConfig, metrics: SimulationMetrics, telemetry: WorkloadTelemetry): string {
  return `You are an assistant embedded in a Network-on-Chip (NoC) simulator for AI accelerator research.
Explain results plainly and concretely. Ground every answer only in the live simulation state given below -
never invent numbers that aren't in this context or in the user's question.

Current config: ${JSON.stringify(config)}
Current metrics: ${JSON.stringify(metrics)}
Current controller telemetry: ${JSON.stringify(telemetry)}`;
}

assistantRouter.post('/ask', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GROQ_API_KEY is not configured on the server' });
  }

  const body = req.body as Partial<AssistantRequestBody>;
  if (!body?.question || !body?.config || !body?.metrics || !body?.telemetry) {
    return res.status(400).json({ error: 'question, config, metrics, and telemetry are required' });
  }

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(body.config, body.metrics, body.telemetry) },
          { role: 'user', content: body.question },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return res.status(502).json({ error: `Groq API error (${groqRes.status}): ${errText.slice(0, 300)}` });
    }

    const data = (await groqRes.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = data.choices?.[0]?.message?.content ?? '';
    res.json({ answer });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to reach Groq API' });
  }
});
