import { NoCConfig } from '../types/noc';

/**
 * Standard Network-on-Chip Energy & Power Model (Derived from Orion 3.0 & DSENT)
 * Values parameterized by technology node (7nm, 14nm, 28nm)
 */

interface EnergyParameters {
  bufferWritePJPerFlit: number;
  bufferReadPJPerFlit: number;
  crossbarSwitchPJPerFlit: number;
  linkTraversalPJPerFlit: number;
  staticLeakagePJPerCyclePerRouter: number;
  powerGatedLeakageReduction: number; // 0.85 = 85% leakage reduction when power gated
  controllerDecisionPJ: number; // Proposed controller logic energy (~0.04 pJ)
}

export function getEnergyParameters(config: NoCConfig): EnergyParameters {
  const { techNodeNm, flitDataBits } = config;
  const bitScale = flitDataBits / 64;

  if (techNodeNm <= 7) {
    return {
      bufferWritePJPerFlit: 0.18 * bitScale,
      bufferReadPJPerFlit: 0.14 * bitScale,
      crossbarSwitchPJPerFlit: 0.22 * bitScale,
      linkTraversalPJPerFlit: 0.35 * bitScale,
      staticLeakagePJPerCyclePerRouter: 0.08 * bitScale,
      powerGatedLeakageReduction: 0.88,
      controllerDecisionPJ: 0.035,
    };
  } else if (techNodeNm <= 14) {
    return {
      bufferWritePJPerFlit: 0.35 * bitScale,
      bufferReadPJPerFlit: 0.28 * bitScale,
      crossbarSwitchPJPerFlit: 0.45 * bitScale,
      linkTraversalPJPerFlit: 0.70 * bitScale,
      staticLeakagePJPerCyclePerRouter: 0.18 * bitScale,
      powerGatedLeakageReduction: 0.82,
      controllerDecisionPJ: 0.065,
    };
  } else {
    // 28nm standard
    return {
      bufferWritePJPerFlit: 0.85 * bitScale,
      bufferReadPJPerFlit: 0.65 * bitScale,
      crossbarSwitchPJPerFlit: 1.10 * bitScale,
      linkTraversalPJPerFlit: 1.65 * bitScale,
      staticLeakagePJPerCyclePerRouter: 0.45 * bitScale,
      powerGatedLeakageReduction: 0.78,
      controllerDecisionPJ: 0.12,
    };
  }
}
