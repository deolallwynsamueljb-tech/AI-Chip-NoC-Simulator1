import { NoCConfig, STANDARD_TRAFFIC_PATTERNS, WorkloadType } from './types/noc.js';
import { VALID_FAULT_TYPES, VALID_ROUTING_MODES, VoiceAction, VoiceCommandRequest, VoiceCommandResult } from './types/voice.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// All WorkloadType values that make sense as a voice-settable "traffic
// pattern" -- the 4 standard synthetic ones the Configuration Panel
// exposes, plus the richer AI-specific ones from the Header's Workload
// selector, since a spoken command like "switch to CNN traffic" should
// work too.
const VALID_WORKLOAD_TYPES: WorkloadType[] = [
  ...STANDARD_TRAFFIC_PATTERNS.map((p) => p.id),
  'CNN_LOCAL',
  'TRANSFORMER_GLOBAL',
  'MOE_BURSTY',
  'BIT_COMPLEMENT',
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function nearestFrom(n: number, options: number[]): number {
  return options.reduce((best, opt) => (Math.abs(opt - n) < Math.abs(best - n) ? opt : best), options[0]);
}

/**
 * Validates and sanitizes the config partial an LLM proposed: every field
 * is checked against its real valid range/enum from shared/types/noc.ts
 * and either clamped to something safe or dropped entirely. This is what
 * keeps "voice control" from ever writing an out-of-range or nonsensical
 * value into the simulator, regardless of what the model returns.
 */
function sanitizeConfigPartial(raw: unknown): Partial<NoCConfig> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<NoCConfig> = {};

  if (typeof r.meshWidth === 'number') out.meshWidth = clamp(Math.round(r.meshWidth), 2, 5);
  if (typeof r.meshHeight === 'number') out.meshHeight = clamp(Math.round(r.meshHeight), 2, 5);
  if (typeof r.flitDataBits === 'number') out.flitDataBits = nearestFrom(r.flitDataBits, [16, 32, 64, 128]);
  if (typeof r.workloadType === 'string' && VALID_WORKLOAD_TYPES.includes(r.workloadType as WorkloadType)) {
    out.workloadType = r.workloadType as WorkloadType;
  }
  if (typeof r.injectionRate === 'number') out.injectionRate = Number(clamp(r.injectionRate, 0.05, 0.9).toFixed(2));
  if (typeof r.targetPacketCount === 'number') out.targetPacketCount = clamp(Math.round(r.targetPacketCount), 1000, 100000);
  if (typeof r.bufferDepthPerVC === 'number') out.bufferDepthPerVC = nearestFrom(r.bufferDepthPerVC, [2, 4, 8, 16]);
  if (typeof r.virtualChannels === 'number') out.virtualChannels = nearestFrom(r.virtualChannels, [1, 2, 4]);
  if (typeof r.simulationCycleLimit === 'number') out.simulationCycleLimit = clamp(Math.round(r.simulationCycleLimit), 1000, 100000);
  if (typeof r.faultInjectionEnabled === 'boolean') out.faultInjectionEnabled = r.faultInjectionEnabled;
  if (typeof r.faultRatePct === 'number') out.faultRatePct = nearestFrom(r.faultRatePct, [0, 5, 10, 15, 20]);
  if (typeof r.faultType === 'string' && VALID_FAULT_TYPES.includes(r.faultType as any)) {
    out.faultType = r.faultType as NoCConfig['faultType'];
  }
  if (typeof r.routingMode === 'string' && VALID_ROUTING_MODES.includes(r.routingMode as any)) {
    out.routingMode = r.routingMode as NoCConfig['routingMode'];
  }

  return out;
}

function parseVoiceAction(raw: unknown): VoiceAction {
  if (!raw || typeof raw !== 'object') return { type: 'unknown' };
  const r = raw as Record<string, unknown>;

  switch (r.type) {
    case 'updateConfig':
      return { type: 'updateConfig', partial: sanitizeConfigPartial(r.partial) };
    case 'setActiveTab': {
      const tab = r.tab;
      if (tab === 'simulator' || tab === 'compare' || tab === 'benchmarks' || tab === 'research') {
        return { type: 'setActiveTab', tab };
      }
      return { type: 'unknown' };
    }
    case 'togglePlay':
      return { type: 'togglePlay' };
    case 'play':
      return { type: 'play' };
    case 'pause':
      return { type: 'pause' };
    case 'reset':
      return { type: 'reset' };
    case 'stepCycle': {
      const cycles = typeof r.cycles === 'number' ? clamp(Math.round(r.cycles), 1, 10000) : 25;
      return { type: 'stepCycle', cycles };
    }
    case 'runComparison':
      return { type: 'runComparison' };
    case 'runFaultSweep':
      return { type: 'runFaultSweep' };
    case 'runSweep':
      return { type: 'runSweep' };
    case 'applyPreset': {
      const preset = Math.round(Number(r.preset));
      if (preset === 1 || preset === 2 || preset === 3 || preset === 4) {
        return { type: 'applyPreset', preset };
      }
      return { type: 'unknown' };
    }
    default:
      return { type: 'unknown' };
  }
}

async function transcribeAudio(audioBase64: string, mimeType: string, apiKey: string): Promise<string> {
  const buffer = Buffer.from(audioBase64, 'base64');
  const extension = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'wav';

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), `command.${extension}`);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq transcription error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

function buildInterpreterSystemPrompt(config: NoCConfig, activeTab: string): string {
  return `You control an AI-Chip Network-on-Chip simulator by voice. Convert the user's spoken command
(given as a transcript, which may contain transcription errors -- infer intent charitably) into EXACTLY
ONE JSON action object, and nothing else -- no markdown, no explanation outside the JSON.

Current UI tab: ${activeTab} (one of: simulator, compare, benchmarks, research)
Current config: ${JSON.stringify(config)}

Respond with a JSON object of the form { "action": <ACTION>, "explanation": "<one short sentence,
present tense, describing what you're about to do, e.g. 'Setting injection rate to 0.5'>" }.

<ACTION> must be exactly one of:
- {"type":"updateConfig","partial":{...only the fields the user mentioned...}}
  Valid partial fields and ranges:
    meshWidth, meshHeight: integer 2-5 (NoC size, e.g. "make it 5 by 5" -> both fields)
    flitDataBits: one of 16, 32, 64, 128 (packet size in bits)
    workloadType: one of ${VALID_WORKLOAD_TYPES.join(', ')} (traffic pattern; UNIFORM_RANDOM="uniform random", HOTSPOT_TRAFFIC="hotspot", TRANSPOSE="transpose", BIT_REVERSAL="bit reversal", CNN_LOCAL="CNN/local systolic", TRANSFORMER_GLOBAL="transformer/attention/global", MOE_BURSTY="MoE/bursty")
    injectionRate: number 0.05-0.9 (flits/cycle)
    targetPacketCount: integer 1000-100000
    bufferDepthPerVC: one of 2, 4, 8, 16
    virtualChannels: one of 1, 2, 4
    simulationCycleLimit: integer 1000-100000
    faultInjectionEnabled: boolean
    faultRatePct: one of 0, 5, 10, 15, 20
    faultType: one of ROUTER_FAULT, LINK_FAULT, RANDOM_FAULT
    routingMode: one of ${VALID_ROUTING_MODES.join(', ')} (BASELINE_XY="XY routing", ADAPTIVE_DYXY="adaptive routing", PROPOSED_RECONFIGURABLE="reconfigurable routing")
- {"type":"setActiveTab","tab":"simulator"|"compare"|"benchmarks"|"research"} -- switch tabs ("go to the compare tab", "show benchmarks")
- {"type":"togglePlay"} -- "play", "pause", "start/stop the simulation" (toggles current state)
- {"type":"play"} / {"type":"pause"} -- explicit start/stop when the user is unambiguous
- {"type":"reset"} -- "reset the simulation"
- {"type":"stepCycle","cycles":N} -- "step forward N cycles" (default 25 if unspecified)
- {"type":"runComparison"} -- "run the architecture comparison", "compare baseline and proposed"
- {"type":"runFaultSweep"} -- "run the fault rate sweep"
- {"type":"runSweep"} -- "run a full sweep" / "run the benchmark sweep" (the injection-rate sweep across all 5 algorithms)
- {"type":"applyPreset","preset":1|2|3|4} -- "apply preset 2", "load the stress test preset", "switch to fault tolerance preset" (1=Normal, 2=High Traffic, 3=Fault Tolerance, 4=Stress Test)
- {"type":"unknown"} -- the command doesn't map to any of the above, or is unintelligible

Only include fields in "partial" that the user actually specified. Never invent values they didn't say.`;
}

async function interpretCommand(
  transcript: string,
  config: NoCConfig,
  activeTab: string,
  apiKey: string
): Promise<{ action: VoiceAction; explanation: string }> {
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildInterpreterSystemPrompt(config, activeTab) },
        { role: 'user', content: transcript },
      ],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq interpretation error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? '{}';

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Some models wrap JSON in prose despite instructions -- salvage the first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  }

  return {
    action: parseVoiceAction(parsed.action),
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation.slice(0, 200) : '',
  };
}

/** Framework-agnostic core of POST /api/voice/execute, shared by the Express dev server and the Vercel function. */
export async function handleVoiceCommand(body: Partial<VoiceCommandRequest>): Promise<VoiceCommandResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { status: 503, body: { error: 'GROQ_API_KEY is not configured on the server' } };
  }

  if (!body?.audioBase64 || !body?.mimeType || !body?.config) {
    return { status: 400, body: { error: 'audioBase64, mimeType, and config are required' } };
  }

  try {
    const transcript = await transcribeAudio(body.audioBase64, body.mimeType, apiKey);
    if (!transcript) {
      return { status: 200, body: { transcript: '', action: { type: 'unknown' }, explanation: "Didn't catch anything." } };
    }

    const { action, explanation } = await interpretCommand(transcript, body.config, body.activeTab ?? 'simulator', apiKey);
    return { status: 200, body: { transcript, action, explanation } };
  } catch (err) {
    return { status: 502, body: { error: err instanceof Error ? err.message : 'Voice command failed' } };
  }
}
