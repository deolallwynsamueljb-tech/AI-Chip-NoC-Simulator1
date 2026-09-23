import type { TraceEvent } from '@shared/engine/realTraces';
import { traceDim } from '@shared/engine/realTraces';

export interface TraceParseResult {
  events: TraceEvent[];
  sourceNodeCount: number;
  spanCycles: number;
}

export class TraceParseError extends Error {}

const CSV_COLUMN_ALIASES: Record<keyof TraceEvent, string[]> = {
  cycle: ['cycle', 'inject_cycle'],
  srcId: ['srcid', 'src', 'src_id'],
  dstId: ['dstid', 'dst', 'dst_id'],
  sizeBytes: ['sizebytes', 'size_bytes', 'size'],
};

function parseCsv(text: string): TraceEvent[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new TraceParseError('CSV file has no data rows.');

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const colIndex: Partial<Record<keyof TraceEvent, number>> = {};
  (Object.keys(CSV_COLUMN_ALIASES) as (keyof TraceEvent)[]).forEach((field) => {
    const idx = header.findIndex((h) => CSV_COLUMN_ALIASES[field].includes(h));
    if (idx !== -1) colIndex[field] = idx;
  });

  if (colIndex.cycle === undefined || colIndex.srcId === undefined || colIndex.dstId === undefined) {
    throw new TraceParseError(
      `CSV header must include cycle/inject_cycle, src/srcId, and dst/dstId columns. Found: ${header.join(', ')}`
    );
  }

  return lines.slice(1).map((line, i) => {
    const cols = line.split(',');
    const cycle = Number(cols[colIndex.cycle!]);
    const srcId = Number(cols[colIndex.srcId!]);
    const dstId = Number(cols[colIndex.dstId!]);
    const sizeBytes = colIndex.sizeBytes !== undefined ? Number(cols[colIndex.sizeBytes]) : 64;
    if ([cycle, srcId, dstId, sizeBytes].some((v) => Number.isNaN(v))) {
      throw new TraceParseError(`Row ${i + 2}: non-numeric field in "${line}".`);
    }
    return { cycle, srcId, dstId, sizeBytes };
  });
}

function parseJson(text: string): TraceEvent[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new TraceParseError(`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(raw)) {
    throw new TraceParseError('JSON trace must be an array of {cycle, srcId, dstId, sizeBytes} objects.');
  }
  return raw.map((ev, i) => {
    if (
      typeof ev !== 'object' ||
      ev === null ||
      typeof (ev as any).cycle !== 'number' ||
      typeof (ev as any).srcId !== 'number' ||
      typeof (ev as any).dstId !== 'number'
    ) {
      throw new TraceParseError(`Entry ${i}: expected {cycle, srcId, dstId, sizeBytes?}, got ${JSON.stringify(ev)}`);
    }
    return {
      cycle: (ev as any).cycle,
      srcId: (ev as any).srcId,
      dstId: (ev as any).dstId,
      sizeBytes: typeof (ev as any).sizeBytes === 'number' ? (ev as any).sizeBytes : 64,
    };
  });
}

/**
 * Parses an uploaded trace file (CSV, matching either the simplified
 * cycle/srcId/dstId/sizeBytes columns or research-engine's
 * inject_cycle/src/dst/size_bytes columns; or JSON, matching the bundled
 * trace format) into TraceEvent[], validated and sorted by cycle.
 *
 * Trace replay assumes a 4x4 mesh (the same constraint the built-in traces
 * have, see shared/types/noc.ts TRACE_WORKLOAD_TYPES) -- node ids outside
 * 0..15 are rejected here rather than silently misrouted.
 */
export function parseTraceFile(filename: string, text: string): TraceParseResult {
  const isJson = filename.toLowerCase().endsWith('.json') || text.trim().startsWith('[');
  const events = isJson ? parseJson(text) : parseCsv(text);

  if (events.length === 0) {
    throw new TraceParseError('File parsed successfully but contains zero events.');
  }

  const dim = traceDim();
  const maxNodeId = dim * dim - 1;
  const nodes = new Set<number>();
  events.forEach((ev, i) => {
    if (ev.srcId < 0 || ev.srcId > maxNodeId || ev.dstId < 0 || ev.dstId > maxNodeId) {
      throw new TraceParseError(
        `Event ${i}: srcId/dstId must be within 0..${maxNodeId} for the required ${dim}x${dim} mesh (got srcId=${ev.srcId}, dstId=${ev.dstId}).`
      );
    }
    nodes.add(ev.srcId);
  });

  const sorted = [...events].sort((a, b) => a.cycle - b.cycle);

  return {
    events: sorted,
    sourceNodeCount: nodes.size,
    spanCycles: sorted[sorted.length - 1].cycle + 1,
  };
}
