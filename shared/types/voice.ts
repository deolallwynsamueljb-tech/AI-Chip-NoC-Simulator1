import { FaultType, NoCConfig, RoutingMode, WorkloadType } from './noc.js';

/**
 * Structured action a voice command resolves to. The LLM interpreting the
 * transcript is asked to emit exactly one of these shapes as JSON; the
 * server validates it against this union before returning it, so the
 * client only ever executes a known, narrow action -- never arbitrary code
 * or an unvalidated free-form instruction.
 */
export type VoiceAction =
  | { type: 'updateConfig'; partial: Partial<NoCConfig> }
  | { type: 'setActiveTab'; tab: 'simulator' | 'compare' | 'benchmarks' | 'research' }
  | { type: 'togglePlay' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'reset' }
  | { type: 'stepCycle'; cycles: number }
  | { type: 'runComparison' }
  | { type: 'runFaultSweep' }
  | { type: 'runSweep' }
  | { type: 'applyPreset'; preset: 1 | 2 | 3 | 4 }
  | { type: 'unknown' };

export interface VoiceCommandRequest {
  audioBase64: string;
  mimeType: string;
  activeTab: string;
  config: NoCConfig;
}

export interface VoiceCommandSuccess {
  transcript: string;
  action: VoiceAction;
  explanation: string;
}

export type VoiceCommandResult = { status: number; body: VoiceCommandSuccess | { error: string } };

export const VALID_ROUTING_MODES: RoutingMode[] = [
  'BASELINE_XY',
  'ADAPTIVE_DYXY',
  'CONGESTION_AWARE_RCA',
  'LOW_POWER_BYPASS',
  'PROPOSED_RECONFIGURABLE',
  'TASK_BASED_TBP',
];

export const VALID_FAULT_TYPES: FaultType[] = ['ROUTER_FAULT', 'LINK_FAULT', 'RANDOM_FAULT'];
