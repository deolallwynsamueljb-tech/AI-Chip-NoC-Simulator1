import type {
  BenchmarkComparisonData,
  NoCConfig,
  SimulationMetrics,
  SimulationSnapshot,
  WorkloadSensitivityItem,
  WorkloadTelemetry,
} from '@shared/types/noc';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function createSession(config: NoCConfig) {
  return request<{ sessionId: string; snapshot: SimulationSnapshot }>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

/** Runs a real multi-mode sweep on the server. No cached or precomputed curves. */
export function runSweep(config: NoCConfig, injectionRates?: number[], cyclesPerPoint?: number) {
  return request<BenchmarkComparisonData>('/sweep', {
    method: 'POST',
    body: JSON.stringify({ config, injectionRates, cyclesPerPoint }),
  });
}

export function runSensitivitySweep(config: NoCConfig) {
  return request<{ items: WorkloadSensitivityItem[] }>('/sweep/sensitivity', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

/** Asks the AI assistant a question, grounded in the live simulation state. */
export function askAssistant(question: string, config: NoCConfig, metrics: SimulationMetrics, telemetry: WorkloadTelemetry) {
  return request<{ answer: string }>('/assistant/ask', {
    method: 'POST',
    body: JSON.stringify({ question, config, metrics, telemetry }),
  });
}
