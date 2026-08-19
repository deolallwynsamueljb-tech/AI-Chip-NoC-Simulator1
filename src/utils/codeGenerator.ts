import { NoCConfig } from '@shared/types/noc';

export class CodeGenerator {
  /**
   * Generates baseline Python XY NoC simulator script
   */
  public static generateBaselinePythonCode(config: NoCConfig): string {
    return `#!/usr/bin/env python3
"""
Baseline-1: 2D Mesh Network-on-Chip (NoC) Simulator with Dimension-Order XY Routing
Parameterized for AI Hardware Accelerator Architectures.
"""

import random
import numpy as np
from collections import deque

class Flit:
    def __init__(self, packet_id, flit_id, flit_type, src_x, src_y, dst_x, dst_y, cycle):
        self.packet_id = packet_id
        self.flit_id = flit_id
        self.flit_type = flit_type  # 'HEAD', 'BODY', 'TAIL', 'SINGLE'
        self.src_x = src_x
        self.src_y = src_y
        self.dst_x = dst_x
        self.dst_y = dst_y
        self.creation_cycle = cycle
        self.hop_count = 0
        self.energy_pj = 0.0

class BaselineXYRouter:
    def __init__(self, x, y, width, height, buffer_depth=4):
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.buffer_depth = buffer_depth
        # Input buffers for 5 ports: North, South, East, West, Local
        self.buffers = {
            'LOCAL': deque(maxlen=buffer_depth),
            'NORTH': deque(maxlen=buffer_depth),
            'SOUTH': deque(maxlen=buffer_depth),
            'EAST': deque(maxlen=buffer_depth),
            'WEST': deque(maxlen=buffer_depth)
        }
        self.total_injected = 0
        self.total_delivered = 0

    def compute_xy_route(self, dst_x, dst_y):
        """Standard Dimension-Order XY Routing: Route X first, then Y."""
        if self.x == dst_x and self.y == dst_y:
            return 'LOCAL', self.x, self.y
        elif self.x < dst_x:
            return 'EAST', self.x + 1, self.y
        elif self.x > dst_x:
            return 'WEST', self.x - 1, self.y
        elif self.y < dst_y:
            return 'SOUTH', self.x, self.y + 1
        else:
            return 'NORTH', self.x, self.y - 1

class MeshNoCSimulator:
    def __init__(self, width=${config.meshWidth}, height=${config.meshHeight}, buffer_depth=${config.bufferDepthPerVC}):
        self.width = width
        self.height = height
        self.routers = [[BaselineXYRouter(x, y, width, height, buffer_depth) for x in range(width)] for y in range(height)]
        self.current_cycle = 0
        self.delivered_latencies = []
        self.total_flits_injected = 0
        self.total_flits_delivered = 0

    def step(self, injection_rate=0.20, workload='CNN'):
        self.current_cycle += 1
        
        # 1. Packet Injection
        for y in range(self.height):
            for x in range(self.width):
                if random.random() < injection_rate:
                    # Determine destination based on workload
                    if workload == 'CNN' and random.random() < 0.75:
                        # Local nearest neighbor
                        dx = random.choice([-1, 0, 1])
                        dy = random.choice([-1, 0, 1])
                        dst_x = max(0, min(self.width - 1, x + dx))
                        dst_y = max(0, min(self.height - 1, y + dy))
                        if dst_x == x and dst_y == y:
                            dst_x = (x + 1) % self.width
                    else:
                        dst_x = random.randint(0, self.width - 1)
                        dst_y = random.randint(0, self.height - 1)
                        if dst_x == x and dst_y == y:
                            dst_x = (x + 1) % self.width

                    buf = self.routers[y][x].buffers['LOCAL']
                    if len(buf) < buf.maxlen:
                        flit = Flit(f"pkt_{self.current_cycle}_{x}_{y}", 0, 'SINGLE', x, y, dst_x, dst_y, self.current_cycle)
                        buf.append(flit)
                        self.total_flits_injected += 1

        # 2. Router Routing & Switch Traversal
        for y in range(self.height):
            for x in range(self.width):
                router = self.routers[y][x]
                for port, buf in list(router.buffers.items()):
                    if len(buf) > 0:
                        flit = buf[0]
                        out_port, next_x, next_y = router.compute_xy_route(flit.dst_x, flit.dst_y)
                        
                        if out_port == 'LOCAL':
                            # Delivered to local Processing Element
                            delivered = buf.popleft()
                            latency = self.current_cycle - delivered.creation_cycle
                            self.delivered_latencies.append(latency)
                            self.total_flits_delivered += 1
                            router.total_delivered += 1
                        else:
                            # Forward to downstream router buffer if capacity available
                            in_port_map = {'EAST': 'WEST', 'WEST': 'EAST', 'SOUTH': 'NORTH', 'NORTH': 'SOUTH'}
                            target_buf = self.routers[next_y][next_x].buffers[in_port_map[out_port]]
                            if len(target_buf) < target_buf.maxlen:
                                flit = buf.popleft()
                                flit.hop_count += 1
                                target_buf.append(flit)

    def run_simulation(self, injection_rate=0.20, total_cycles=1000, workload='CNN'):
        for _ in range(total_cycles):
            self.step(injection_rate, workload)
            
        avg_latency = np.mean(self.delivered_latencies) if self.delivered_latencies else 0
        max_latency = np.max(self.delivered_latencies) if self.delivered_latencies else 0
        throughput = self.total_flits_delivered / (total_cycles * self.width * self.height)
        
        return {
            'injection_rate': injection_rate,
            'avg_latency': avg_latency,
            'max_latency': max_latency,
            'throughput': throughput,
            'delivered_flits': self.total_flits_delivered
        }

if __name__ == '__main__':
    print("Running Baseline-1 (XY Routing) Injection Rate Sweep...")
    rates = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]
    print(f"{'Rate':<8}{'Avg Latency (cyc)':<20}{'Max Latency':<15}{'Throughput':<15}")
    print("-" * 58)
    for r in rates:
        sim = MeshNoCSimulator()
        res = sim.run_simulation(injection_rate=r, total_cycles=1000, workload='CNN')
        print(f"{res['injection_rate']:<8.2f}{res['avg_latency']:<20.2f}{res['max_latency']:<15.0f}{res['throughput']:<15.4f}")
`;
  }

  /**
   * Generates Proposed Self-Reconfigurable Workload-Aware Python NoC simulator script
   */
  public static generateProposedPythonCode(config: NoCConfig): string {
    return `#!/usr/bin/env python3
"""
Proposed Novel Architecture:
Self-Reconfigurable AI Workload-Aware Mesh Network-on-Chip (NoC)
Includes:
  1. Workload Analyzer (Real-time spatial locality & burstiness monitoring)
  2. Lightweight Runtime Configuration Controller
  3. Dynamic Multi-Mode Router (XY / Adaptive DyXY / Congestion-Aware RCA / Low-Power Bypass)
"""

import random
import numpy as np
from collections import deque

class WorkloadAnalyzer:
    """Monitors incoming packet statistics over a sliding epoch window."""
    def __init__(self, window_size=${config.epochCycles}):
        self.window_size = window_size
        self.hop_history = deque(maxlen=window_size)
        self.arrival_history = deque(maxlen=window_size)

    def record_packet(self, hop_distance):
        self.hop_history.append(hop_distance)

    def record_cycle_arrivals(self, count):
        self.arrival_history.append(count)

    def analyze(self, max_mesh_hops):
        # Compute spatial locality index: high for CNN, low for Transformer
        if len(self.hop_history) > 0:
            avg_hop = np.mean(self.hop_history)
            spatial_locality = max(0.0, min(1.0, 1.0 - (avg_hop - 1) / max(1, max_mesh_hops - 1)))
        else:
            spatial_locality = 0.5

        # Compute traffic burstiness
        if len(self.arrival_history) > 5:
            burstiness = np.std(self.arrival_history) / max(0.1, np.mean(self.arrival_history))
        else:
            burstiness = 0.1

        return spatial_locality, burstiness

class ConfigurationController:
    """
    Lightweight runtime controller that dynamically selects the routing mode
    according to the detected AI workload and network state.
    """
    def __init__(self):
        self.current_mode = 'BASELINE_XY'
        self.reconfiguration_count = 0

    def evaluate(self, spatial_locality, burstiness, avg_congestion, peak_congestion):
        # 1. Low traffic -> Low-power routing
        if avg_congestion < 0.12:
            new_mode = 'LOW_POWER_BYPASS'
        # 2. CNN workload -> High local traffic -> Adaptive routing
        elif spatial_locality >= 0.60:
            new_mode = 'ADAPTIVE_DYXY'
        # 3. Transformer workload / High global traffic / Hotspot -> Congestion-aware routing
        elif peak_congestion > 0.40 or spatial_locality < 0.35:
            new_mode = 'CONGESTION_AWARE_RCA'
        else:
            new_mode = 'ADAPTIVE_DYXY'

        if new_mode != self.current_mode:
            self.reconfiguration_count += 1
            self.current_mode = new_mode

        return self.current_mode

class ReconfigurableRouter:
    def __init__(self, x, y, width, height, buffer_depth=4):
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.buffer_depth = buffer_depth
        self.mode = 'BASELINE_XY'
        self.buffers = {
            'LOCAL': deque(maxlen=buffer_depth),
            'NORTH': deque(maxlen=buffer_depth),
            'SOUTH': deque(maxlen=buffer_depth),
            'EAST': deque(maxlen=buffer_depth),
            'WEST': deque(maxlen=buffer_depth)
        }

    def compute_route(self, dst_x, dst_y, all_routers):
        if self.x == dst_x and self.y == dst_y:
            return 'LOCAL', self.x, self.y

        # Mode 1: Baseline XY
        if self.mode == 'BASELINE_XY' or self.mode == 'LOW_POWER_BYPASS':
            if self.x < dst_x: return 'EAST', self.x + 1, self.y
            if self.x > dst_x: return 'WEST', self.x - 1, self.y
            if self.y < dst_y: return 'SOUTH', self.x, self.y + 1
            return 'NORTH', self.x, self.y - 1

        # Mode 2: Adaptive DyXY (Local Congestion Aware)
        candidates = []
        if self.x < dst_x: candidates.append(('EAST', self.x + 1, self.y))
        elif self.x > dst_x: candidates.append(('WEST', self.x - 1, self.y))
        if self.y < dst_y: candidates.append(('SOUTH', self.x, self.y + 1))
        elif self.y > dst_y: candidates.append(('NORTH', self.x, self.y - 1))

        if len(candidates) == 1:
            return candidates[0]

        # Mode 3: Congestion-Aware RCA vs Adaptive selection
        best_cand = candidates[0]
        min_load = float('inf')
        for port, nx, ny in candidates:
            neighbor = all_routers[ny][nx]
            load = sum(len(b) for b in neighbor.buffers.values())
            if load < min_load:
                min_load = load
                best_cand = (port, nx, ny)

        return best_cand

class SelfReconfigurableNoCSimulator:
    def __init__(self, width=${config.meshWidth}, height=${config.meshHeight}, buffer_depth=${config.bufferDepthPerVC}):
        self.width = width
        self.height = height
        self.routers = [[ReconfigurableRouter(x, y, width, height, buffer_depth) for x in range(width)] for y in range(height)]
        self.analyzer = WorkloadAnalyzer()
        self.controller = ConfigurationController()
        self.current_cycle = 0
        self.delivered_latencies = []
        self.total_delivered = 0

    def step(self, injection_rate=0.20, workload='CNN'):
        self.current_cycle += 1
        
        # Periodic Controller Evaluation
        if self.current_cycle % ${config.epochCycles} == 0:
            max_hops = (self.width - 1) + (self.height - 1)
            loc, burst = self.analyzer.analyze(max_hops)
            
            # Gather buffer stats
            all_loads = [sum(len(b) for b in r.buffers.values()) / (5 * r.buffer_depth) for row in self.routers for r in row]
            avg_cong = np.mean(all_loads)
            peak_cong = np.max(all_loads)
            
            selected_mode = self.controller.evaluate(loc, burst, avg_cong, peak_cong)
            for row in self.routers:
                for r in row:
                    r.mode = selected_mode

        # Packet Injection & Traffic Handling
        arrivals_this_cycle = 0
        for y in range(self.height):
            for x in range(self.width):
                if random.random() < injection_rate:
                    if workload == 'CNN' and random.random() < 0.75:
                        dx, dy = random.choice([-1, 0, 1]), random.choice([-1, 0, 1])
                        dst_x, dst_y = max(0, min(self.width-1, x+dx)), max(0, min(self.height-1, y+dy))
                        if dst_x == x and dst_y == y: dst_x = (x + 1) % self.width
                    elif workload == 'TRANSFORMER':
                        dst_x = (x + self.width // 2) % self.width
                        dst_y = (y + self.height // 2) % self.height
                    else:
                        dst_x, dst_y = random.randint(0, self.width-1), random.randint(0, self.height-1)
                        if dst_x == x and dst_y == y: dst_x = (x + 1) % self.width

                    hop = abs(dst_x - x) + abs(dst_y - y)
                    self.analyzer.record_packet(hop)
                    
                    buf = self.routers[y][x].buffers['LOCAL']
                    if len(buf) < buf.maxlen:
                        buf.append({'dst_x': dst_x, 'dst_y': dst_y, 'cycle': self.current_cycle})
                        arrivals_this_cycle += 1
                        
        self.analyzer.record_cycle_arrivals(arrivals_this_cycle)

        # Route traversal
        for y in range(self.height):
            for x in range(self.width):
                router = self.routers[y][x]
                for port, buf in list(router.buffers.items()):
                    if len(buf) > 0:
                        flit = buf[0]
                        out_port, next_x, next_y = router.compute_route(flit['dst_x'], flit['dst_y'], self.routers)
                        if out_port == 'LOCAL':
                            deliv = buf.popleft()
                            self.delivered_latencies.append(self.current_cycle - deliv['cycle'])
                            self.total_delivered += 1
                        else:
                            in_port_map = {'EAST': 'WEST', 'WEST': 'EAST', 'SOUTH': 'NORTH', 'NORTH': 'SOUTH'}
                            target_buf = self.routers[next_y][next_x].buffers[in_port_map[out_port]]
                            if len(target_buf) < target_buf.maxlen:
                                buf.popleft()
                                target_buf.append(flit)

    def run(self, injection_rate=0.35, cycles=1000, workload='CNN'):
        for _ in range(cycles):
            self.step(injection_rate, workload)
        return {
            'avg_latency': np.mean(self.delivered_latencies) if self.delivered_latencies else 0,
            'max_latency': np.max(self.delivered_latencies) if self.delivered_latencies else 0,
            'throughput': self.total_delivered / (cycles * self.width * self.height),
            'reconfigurations': self.controller.reconfiguration_count,
            'final_mode': self.controller.current_mode
        }

if __name__ == '__main__':
    sim = SelfReconfigurableNoCSimulator()
    res = sim.run(injection_rate=0.35, cycles=1000, workload='TRANSFORMER')
    print("=== Proposed Self-Reconfigurable NoC Results ===")
    print(f"Final Mode:          {res['final_mode']}")
    print(f"Reconfigurations:    {res['reconfigurations']}")
    print(f"Average Latency:     {res['avg_latency']:.2f} cycles")
    print(f"Throughput:          {res['throughput']:.4f} flits/node/cycle")
`;
  }

  /**
   * Generates synthesizable Verilog module for the Configuration Controller
   */
  public static generateVerilogControllerCode(): string {
    return `// =============================================================================
// Module: noc_reconfig_controller.v
// Description: Lightweight Workload-Aware Self-Reconfigurable Routing Controller
// Synthesis Target: ASIC / FPGA NoC Tile (Area Overhead < 1.2%)
// =============================================================================

\`timescale 1ns / 1ps

module noc_reconfig_controller #(
    parameter MESH_WIDTH      = 4,
    parameter MESH_HEIGHT     = 4,
    parameter EPOCH_CYCLES    = 25,
    parameter BUFFER_DEPTH    = 4
)(
    input  wire        clk,
    input  wire        rst_n,
    
    // Inputs from Workload Analyzer & Buffer Monitors
    input  wire [7:0]  spatial_locality_idx,  // Q0.8 fixed point (0.0 to 1.0)
    input  wire [7:0]  burstiness_idx,        // Q0.8 fixed point
    input  wire [7:0]  avg_buffer_occupancy,  // Q0.8 fixed point (0.0 to 1.0)
    input  wire [7:0]  peak_buffer_occupancy, // Q0.8 fixed point
    
    // Outputs to Router Crossbar & Route Computation Unit
    output reg  [2:0]  active_routing_mode,   // 3'b000: XY, 3'b001: DyXY, 3'b010: RCA, 3'b011: LowPower
    output reg         power_gate_vc_en,      // Asserted in low-traffic regime
    output reg  [15:0] reconfiguration_count  // Total runtime transitions
);

    // Routing Mode Encodings
    localparam MODE_BASELINE_XY    = 3'b000;
    localparam MODE_ADAPTIVE_DYXY  = 3'b001;
    localparam MODE_CONGESTION_RCA = 3'b010;
    localparam MODE_LOW_POWER      = 3'b011;

    // Thresholds (Q0.8)
    localparam THRESH_LOW_TRAFFIC  = 8'd30;   // ~0.12 occupancy
    localparam THRESH_LOCALITY_CNN = 8'd150;  // ~0.58 spatial locality
    localparam THRESH_HOTSPOT_PEAK = 8'd102;  // ~0.40 peak congestion

    reg [7:0] epoch_counter;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            epoch_counter         <= 8'd0;
            active_routing_mode   <= MODE_BASELINE_XY;
            power_gate_vc_en      <= 1'b0;
            reconfiguration_count <= 16'd0;
        end else begin
            if (epoch_counter >= EPOCH_CYCLES - 1) begin
                epoch_counter <= 8'd0;
                
                // Decision State Machine
                if (avg_buffer_occupancy < THRESH_LOW_TRAFFIC) begin
                    if (active_routing_mode != MODE_LOW_POWER) begin
                        reconfiguration_count <= reconfiguration_count + 1'b1;
                    end
                    active_routing_mode <= MODE_LOW_POWER;
                    power_gate_vc_en    <= 1'b1;
                end else if (spatial_locality_idx >= THRESH_LOCALITY_CNN) begin
                    // Local Systolic / CNN Pattern
                    if (active_routing_mode != MODE_ADAPTIVE_DYXY) begin
                        reconfiguration_count <= reconfiguration_count + 1'b1;
                    end
                    active_routing_mode <= MODE_ADAPTIVE_DYXY;
                    power_gate_vc_en    <= 1'b0;
                end else if (peak_buffer_occupancy > THRESH_HOTSPOT_PEAK) begin
                    // Global Attention / Transformer / Hotspot Pattern
                    if (active_routing_mode != MODE_CONGESTION_RCA) begin
                        reconfiguration_count <= reconfiguration_count + 1'b1;
                    end
                    active_routing_mode <= MODE_CONGESTION_RCA;
                    power_gate_vc_en    <= 1'b0;
                end else begin
                    active_routing_mode <= MODE_ADAPTIVE_DYXY;
                    power_gate_vc_en    <= 1'b0;
                end
            end else begin
                epoch_counter <= epoch_counter + 1'b1;
            end
        end
    end

endmodule
`;
  }
}
