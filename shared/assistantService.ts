import type { NoCConfig, SimulationMetrics, WorkloadTelemetry } from './types/noc';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface AssistantRequestBody {
  question: string;
  config: NoCConfig;
  metrics: SimulationMetrics;
  telemetry: WorkloadTelemetry;
}

export type AssistantResult = { status: number; body: { answer: string } | { error: string } };

function buildSystemPrompt(config: NoCConfig, metrics: SimulationMetrics, telemetry: WorkloadTelemetry): string {
  return `You are an assistant embedded in a Network-on-Chip (NoC) simulator for AI accelerator research.
Explain results plainly and concretely. Ground every answer only in the live simulation state given below -
never invent numbers that aren't in this context or in the user's question.

Current config: ${JSON.stringify(config)}
Current metrics: ${JSON.stringify(metrics)}
Current controller telemetry: ${JSON.stringify(telemetry)}`;
}

/** Framework-agnostic core of POST /api/assistant/ask, shared by the Express dev server and the Vercel function. */
export async function answerAssistantQuestion(body: Partial<AssistantRequestBody>): Promise<AssistantResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { status: 503, body: { error: 'GROQ_API_KEY is not configured on the server' } };
  }

  if (!body?.question || !body?.config || !body?.metrics || !body?.telemetry) {
    return { status: 400, body: { error: 'question, config, metrics, and telemetry are required' } };
  }

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
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
      return { status: 502, body: { error: `Groq API error (${groqRes.status}): ${errText.slice(0, 300)}` } };
    }

    const data = (await groqRes.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = data.choices?.[0]?.message?.content ?? '';
    return { status: 200, body: { answer } };
  } catch (err) {
    return { status: 502, body: { error: err instanceof Error ? err.message : 'Failed to reach Groq API' } };
  }
}
