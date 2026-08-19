import { NoCConfig, WorkloadType } from '../types/noc';

export interface TrafficTarget {
  dstX: number;
  dstY: number;
  priority: number;
  burstGroup?: number;
}

export class TrafficGenerator {
  private config: NoCConfig;
  private burstCounter: number = 0;
  private burstActive: boolean = false;
  private moeCurrentExpertX: number = 0;
  private moeCurrentExpertY: number = 0;

  constructor(config: NoCConfig) {
    this.config = config;
    this.moeCurrentExpertX = Math.floor(config.meshWidth / 2);
    this.moeCurrentExpertY = Math.floor(config.meshHeight / 2);
  }

  public updateConfig(config: NoCConfig) {
    this.config = config;
  }

  /**
   * Determine if node (srcX, srcY) should inject a packet this cycle
   */
  public shouldInject(srcX: number, srcY: number, cycle: number): boolean {
    const { workloadType, injectionRate, meshWidth, meshHeight } = this.config;

    if (workloadType === 'MOE_BURSTY') {
      // Periodic burst of active expert gating
      const burstPeriod = 40;
      const burstWindow = 12;
      const isBurstTime = (cycle % burstPeriod) < burstWindow;
      const rate = isBurstTime ? Math.min(0.95, injectionRate * 3.5) : injectionRate * 0.2;
      return Math.random() < rate;
    }

    if (workloadType === 'HOTSPOT_TRAFFIC') {
      // Hotspot nodes have slightly higher baseline injection
      const isCenter = 
        Math.abs(srcX - (meshWidth - 1) / 2) <= 0.5 &&
        Math.abs(srcY - (meshHeight - 1) / 2) <= 0.5;
      const rate = isCenter ? injectionRate * 1.3 : injectionRate;
      return Math.random() < rate;
    }

    // Standard Bernoulli random injection process
    return Math.random() < injectionRate;
  }

  /**
   * Compute destination node (dstX, dstY) for a packet injected at (srcX, srcY)
   */
  public getDestination(srcX: number, srcY: number, cycle: number): TrafficTarget {
    const { workloadType, meshWidth, meshHeight } = this.config;

    switch (workloadType) {
      case 'CNN_LOCAL': {
        // High spatial locality (75% within 1 or 2 hops: nearest neighbor / systolic array)
        if (Math.random() < 0.75) {
          const deltaX = [-1, 0, 1, 0, -1, 1, -1, 1][Math.floor(Math.random() * 8)];
          const deltaY = [0, -1, 0, 1, -1, -1, 1, 1][Math.floor(Math.random() * 8)];
          let dstX = Math.min(meshWidth - 1, Math.max(0, srcX + deltaX));
          let dstY = Math.min(meshHeight - 1, Math.max(0, srcY + deltaY));
          if (dstX === srcX && dstY === srcY) {
            // Pick a non-identical neighbor
            dstX = srcX + (srcX < meshWidth - 1 ? 1 : -1);
          }
          return { dstX, dstY, priority: 1 };
        } else {
          // 25% boundary pooling or parameter update
          return this.getUniformRandomDestination(srcX, srcY);
        }
      }

      case 'TRANSFORMER_GLOBAL': {
        // High global traffic (All-to-all attention head QKV & KV cache broadcast)
        // 80% long-distance or cross-bisection traffic
        if (Math.random() < 0.80) {
          let dstX = (srcX + Math.floor(meshWidth / 2) + Math.floor(Math.random() * (meshWidth - 1))) % meshWidth;
          let dstY = (srcY + Math.floor(meshHeight / 2) + Math.floor(Math.random() * (meshHeight - 1))) % meshHeight;
          if (dstX === srcX && dstY === srcY) {
            dstX = (srcX + 1) % meshWidth;
          }
          return { dstX, dstY, priority: 2 };
        }
        return this.getUniformRandomDestination(srcX, srcY);
      }

      case 'MOE_BURSTY': {
        // Sparse expert routing: multiple nodes send to dynamic chosen expert clusters
        if (cycle % 30 === 0) {
          this.moeCurrentExpertX = Math.floor(Math.random() * meshWidth);
          this.moeCurrentExpertY = Math.floor(Math.random() * meshHeight);
        }
        if (Math.random() < 0.65) {
          // Send to current expert
          if (srcX !== this.moeCurrentExpertX || srcY !== this.moeCurrentExpertY) {
            return { dstX: this.moeCurrentExpertX, dstY: this.moeCurrentExpertY, priority: 3 };
          }
        }
        return this.getUniformRandomDestination(srcX, srcY);
      }

      case 'BIT_COMPLEMENT': {
        const dstX = meshWidth - 1 - srcX;
        const dstY = meshHeight - 1 - srcY;
        if (dstX === srcX && dstY === srcY) {
          return { dstX: (srcX + 1) % meshWidth, dstY: (srcY + 1) % meshHeight, priority: 1 };
        }
        return { dstX, dstY, priority: 1 };
      }

      case 'HOTSPOT_TRAFFIC': {
        // 40% traffic goes to center hotspot node
        if (Math.random() < 0.40) {
          const centerX = Math.floor(meshWidth / 2);
          const centerY = Math.floor(meshHeight / 2);
          if (srcX !== centerX || srcY !== centerY) {
            return { dstX: centerX, dstY: centerY, priority: 2 };
          }
        }
        return this.getUniformRandomDestination(srcX, srcY);
      }

      case 'UNIFORM_RANDOM':
      default:
        return this.getUniformRandomDestination(srcX, srcY);
    }
  }

  private getUniformRandomDestination(srcX: number, srcY: number): TrafficTarget {
    const { meshWidth, meshHeight } = this.config;
    const totalNodes = meshWidth * meshHeight;
    let dstId = Math.floor(Math.random() * totalNodes);
    let dstX = dstId % meshWidth;
    let dstY = Math.floor(dstId / meshWidth);

    if (dstX === srcX && dstY === srcY) {
      dstId = (dstId + 1) % totalNodes;
      dstX = dstId % meshWidth;
      dstY = Math.floor(dstId / meshWidth);
    }

    return { dstX, dstY, priority: 1 };
  }
}
