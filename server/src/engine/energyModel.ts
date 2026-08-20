import { NoCConfig } from '../../../shared/types/noc';

/**
 * Architecture-level NoC energy/power model, parameterized by technology
 * node (7nm, 14nm, 28nm). These per-event coefficients are ILLUSTRATIVE: in
 * the right relative proportion described by published NoC power studies
 * such as Orion 3.0 and DSENT (buffer/crossbar/link scale relative to each
 * other, and coarsely with technology node), but NOT literally produced by
 * running those tools or any synthesis flow against this design, and NOT
 * measured silicon power. Do not present them as more precise than that --
 * same honesty policy as research-engine/noc/energy.py.
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
