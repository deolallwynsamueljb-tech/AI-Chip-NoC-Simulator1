import { WorkloadType } from '../types/noc';
import resnet18Trace from './traces/resnet18.json';
import bertTrace from './traces/bert.json';
import gemmTrace from './traces/gemm.json';
import sparseGemmTrace from './traces/sparse_gemm.json';

/**
 * Real AI-workload communication traces produced by the offline research
 * engine (research-engine/workloads/*.py -> traces/*.csv, pre-converted to
 * JSON here), so the live simulator can replay actual recorded
 * (src, dst, size, cycle) events instead of only sampling synthetic traffic
 * patterns. These were generated at dim=4 (see research-engine/README.md),
 * so trace replay only applies on a 4x4 mesh. Plain JSON imports (rather
 * than fs reads or Vite-only `?raw` imports) so this module works unchanged
 * in the browser bundle, the tsx dev server, and Vercel serverless
 * functions.
 */

export interface TraceEvent {
  cycle: number;
  srcId: number;
  dstId: number;
  sizeBytes: number;
}

const TRACE_DIM = 4;

export const REAL_TRACES: Partial<Record<WorkloadType, TraceEvent[]>> = {
  RESNET18_TRACE: resnet18Trace as TraceEvent[],
  BERT_TRACE: bertTrace as TraceEvent[],
  GEMM_TRACE: gemmTrace as TraceEvent[],
  SPARSE_GEMM_TRACE: sparseGemmTrace as TraceEvent[],
};

export function traceDim(): number {
  return TRACE_DIM;
}

export function traceSpanCycles(workload: WorkloadType): number {
  const events = REAL_TRACES[workload];
  if (!events || events.length === 0) return 0;
  return events[events.length - 1].cycle + 1;
}
