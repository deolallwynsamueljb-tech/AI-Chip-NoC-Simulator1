import fs from 'node:fs';
import path from 'node:path';
import { WorkloadType } from '../../../shared/types/noc';

/**
 * Loads the real AI-workload communication traces produced by the offline
 * research engine (research-engine/workloads/*.py -> traces/*.csv), so the
 * live simulator can replay actual recorded (src, dst, size, cycle) events
 * instead of only sampling synthetic traffic patterns. These CSVs were
 * generated at dim=4 (see research-engine/README.md), so trace replay only
 * applies on a 4x4 mesh.
 */

export interface TraceEvent {
  cycle: number;
  srcId: number;
  dstId: number;
  sizeBytes: number;
}

const TRACE_DIM = 4;

const TRACE_FILES: Partial<Record<WorkloadType, string>> = {
  RESNET18_TRACE: 'resnet18.csv',
  BERT_TRACE: 'bert.csv',
  GEMM_TRACE: 'gemm.csv',
  SPARSE_GEMM_TRACE: 'sparse_gemm.csv',
};

// Resolve relative to cwd, not import.meta.url: esbuild flattens everything
// into one server.js at the repo root, and npm scripts always run with that
// as cwd (see index.ts's distDir comment for the same reasoning).
const TRACES_DIR = path.resolve(process.cwd(), 'research-engine/traces');

function parseCsv(filePath: string): TraceEvent[] {
  const raw = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
  const header = raw[0].split(',');
  const idx = {
    cycle: header.indexOf('inject_cycle'),
    src: header.indexOf('src'),
    dst: header.indexOf('dst'),
    size: header.indexOf('size_bytes'),
  };
  return raw.slice(1).map((line) => {
    const cols = line.split(',');
    return {
      cycle: Number(cols[idx.cycle]),
      srcId: Number(cols[idx.src]),
      dstId: Number(cols[idx.dst]),
      sizeBytes: Number(cols[idx.size]),
    };
  });
}

function loadAll(): Partial<Record<WorkloadType, TraceEvent[]>> {
  const out: Partial<Record<WorkloadType, TraceEvent[]>> = {};
  for (const [workload, filename] of Object.entries(TRACE_FILES) as [WorkloadType, string][]) {
    const filePath = path.join(TRACES_DIR, filename);
    try {
      out[workload] = parseCsv(filePath).sort((a, b) => a.cycle - b.cycle);
    } catch {
      // Trace not generated yet (run research-engine/workloads/generate_all.py).
      // The workload simply has no events; trafficGenerators.ts falls back
      // to uniform-random rather than failing the whole server.
      out[workload] = [];
    }
  }
  return out;
}

export const REAL_TRACES: Partial<Record<WorkloadType, TraceEvent[]>> = loadAll();

export function traceDim(): number {
  return TRACE_DIM;
}

export function traceSpanCycles(workload: WorkloadType): number {
  const events = REAL_TRACES[workload];
  if (!events || events.length === 0) return 0;
  return events[events.length - 1].cycle + 1;
}
