import { NoCConfig } from '@shared/types/noc';

export interface BenchmarkPreset {
  id: number;
  name: string;
  desc: string;
  config: Partial<NoCConfig>;
}

export const PRESETS: BenchmarkPreset[] = [
  {
    id: 1,
    name: 'Preset 1 — Normal',
    desc: '4×4 · Uniform Random · 0.30 inj · No faults',
    config: {
      meshWidth: 4,
      meshHeight: 4,
      workloadType: 'UNIFORM_RANDOM',
      injectionRate: 0.3,
      faultInjectionEnabled: false,
      faultRatePct: 0,
    },
  },
  {
    id: 2,
    name: 'Preset 2 — High Traffic',
    desc: '4×4 · Uniform Random · 0.70 inj · No faults',
    config: {
      meshWidth: 4,
      meshHeight: 4,
      workloadType: 'UNIFORM_RANDOM',
      injectionRate: 0.7,
      faultInjectionEnabled: false,
      faultRatePct: 0,
    },
  },
  {
    id: 3,
    name: 'Preset 3 — Fault Tolerance',
    desc: '4×4 · Uniform Random · 0.50 inj · 10% faults',
    config: {
      meshWidth: 4,
      meshHeight: 4,
      workloadType: 'UNIFORM_RANDOM',
      injectionRate: 0.5,
      faultInjectionEnabled: true,
      faultRatePct: 10,
    },
  },
  {
    id: 4,
    name: 'Preset 4 — Stress Test',
    desc: '5×5 · Hotspot · 0.80 inj · 15% faults',
    config: {
      meshWidth: 5,
      meshHeight: 5,
      workloadType: 'HOTSPOT_TRAFFIC',
      injectionRate: 0.8,
      faultInjectionEnabled: true,
      faultRatePct: 15,
    },
  },
];
