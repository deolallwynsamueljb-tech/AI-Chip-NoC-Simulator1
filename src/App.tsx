import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NoCConfig, RoutingMode, WorkloadType, SimulationMetrics, WorkloadTelemetry, BenchmarkComparisonData, RouterNode, Link } from './types/noc';
import { NoCSimulator } from './engine/nocEngine';
import { SweepEngine } from './engine/sweepEngine';
import { getInitialBenchmarkData, getInitialWorkloadSensitivity } from './engine/sweepDefaults';
import { Header } from './components/Header';
import { ArchitectureDiagram } from './components/ArchitectureDiagram';
import { MeshGrid } from './components/MeshGrid';
import { WorkloadControllerPanel } from './components/WorkloadControllerPanel';
import { MetricsDashboard } from './components/MetricsDashboard';
import { BenchmarkCharts } from './components/BenchmarkCharts';
import { ComparisonTable } from './components/ComparisonTable';
import { RouterInspectorModal } from './components/RouterInspectorModal';
import { CodeExportModal } from './components/CodeExportModal';
import { ResearchOverview } from './components/ResearchOverview';

const DEFAULT_CONFIG: NoCConfig = {
  meshWidth: 4,
  meshHeight: 4,
  virtualChannels: 2,
  bufferDepthPerVC: 4,
  flitDataBits: 64,
  clockFrequencyGHz: 1.0,
  techNodeNm: 7,
  epochCycles: 25,
  routingMode: 'PROPOSED_RECONFIGURABLE',
  workloadType: 'CNN_LOCAL',
  injectionRate: 0.25,
  packetLengthFlits: 4,
  powerGatingThreshold: 8,
};

export default function App() {
  const [config, setConfig] = useState<NoCConfig>(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(5); // steps per frame
  const [activeTab, setActiveTab] = useState<'simulator' | 'benchmarks' | 'matrix' | 'research'>('simulator');
  const [selectedRouterId, setSelectedRouterId] = useState<number | null>(null);
  const [isCodeExportOpen, setIsCodeExportOpen] = useState<boolean>(false);

  // Simulator Instance
  const simRef = useRef<NoCSimulator>(new NoCSimulator(DEFAULT_CONFIG));

  // Reactive UI states
  const [metrics, setMetrics] = useState<SimulationMetrics>(() => simRef.current.getMetrics());
  const [telemetry, setTelemetry] = useState<WorkloadTelemetry>(() => simRef.current.getTelemetry());
  const [routers, setRouters] = useState<Map<number, RouterNode>>(() => new Map(simRef.current.getRouters()));
  const [links, setLinks] = useState<Link[]>(() => [...simRef.current.getLinks()]);

  // Benchmark sweep cache
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkComparisonData>(() =>
    getInitialBenchmarkData(DEFAULT_CONFIG)
  );
  const [workloadSensitivity, setWorkloadSensitivity] = useState(() =>
    getInitialWorkloadSensitivity(DEFAULT_CONFIG)
  );

  // Refresh reactive state from simulator
  const syncSimulatorState = useCallback(() => {
    const sim = simRef.current;
    setMetrics(sim.getMetrics());
    setTelemetry(sim.getTelemetry());
    setRouters(new Map(sim.getRouters()));
    setLinks([...sim.getLinks()]);
  }, []);

  // Step simulation by N cycles
  const handleStepCycle = useCallback((cycles: number) => {
    simRef.current.stepCycles(cycles);
    syncSimulatorState();
  }, [syncSimulatorState]);

  // Reset simulation
  const handleReset = useCallback(() => {
    simRef.current.reset(config);
    syncSimulatorState();
  }, [config, syncSimulatorState]);

  // Update Config
  const handleUpdateConfig = useCallback((partial: Partial<NoCConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      simRef.current.updateConfig(next);
      syncSimulatorState();
      return next;
    });
  }, [syncSimulatorState]);

  // Run full sweep
  const handleRunSweep = useCallback(() => {
    const res = SweepEngine.runMultiModeSweep(config);
    const sens = SweepEngine.getWorkloadSensitivityMatrix(config);
    setBenchmarkData(res);
    setWorkloadSensitivity(sens);
    setActiveTab('benchmarks');
  }, [config]);

  // Animation Frame Loop
  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (isRunning) {
        const delta = currentTime - lastTime;
        if (delta >= 30) {
          simRef.current.stepCycles(simSpeed);
          syncSimulatorState();
          lastTime = currentTime;
        }
      }
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [isRunning, simSpeed, syncSimulatorState]);

  const selectedRouter = selectedRouterId !== null ? routers.get(selectedRouterId) || null : null;

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#c9d1d9] flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Header */}
      <Header
        config={config}
        isRunning={isRunning}
        simSpeed={simSpeed}
        currentCycle={metrics.currentCycle}
        activeTab={activeTab}
        onTogglePlay={() => setIsRunning(!isRunning)}
        onStepCycle={handleStepCycle}
        onReset={handleReset}
        onChangeSpeed={setSimSpeed}
        onUpdateConfig={handleUpdateConfig}
        onSetActiveTab={setActiveTab}
        onOpenCodeExport={() => setIsCodeExportOpen(true)}
        onRunSweep={handleRunSweep}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-5 space-y-4">
        {/* Stage 1: Closed Loop Architecture Diagram */}
        <ArchitectureDiagram
          telemetry={telemetry}
          activeMode={config.routingMode}
          workload={config.workloadType}
          avgLatency={metrics.averagePacketLatency}
          throughput={metrics.throughputFlitsPerNodeCycle}
          energyPJ={metrics.totalEnergyPJ}
        />

        {/* Tab 1: Live Simulator View */}
        {activeTab === 'simulator' && (
          <div className="space-y-4">
            {/* Live Mesh Grid + Workload Controller Dual-Pane */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left Column: 2D Mesh NoC Fabric Canvas */}
              <div className="lg:col-span-7 h-full">
                <MeshGrid
                  routers={routers}
                  links={links}
                  config={config}
                  selectedRouterId={selectedRouterId}
                  onSelectRouter={setSelectedRouterId}
                />
              </div>

              {/* Right Column: Workload Analyzer & Controller Telemetry */}
              <div className="lg:col-span-5 h-full">
                <WorkloadControllerPanel
                  telemetry={telemetry}
                  config={config}
                  routers={routers}
                />
              </div>
            </div>

            {/* Bottom: Real-Time Performance & Energy Dashboard */}
            <MetricsDashboard metrics={metrics} config={config} />
          </div>
        )}

        {/* Tab 2: Sweep Evaluation & Graphs */}
        {activeTab === 'benchmarks' && (
          <div className="space-y-4">
            <BenchmarkCharts
              benchmarkData={benchmarkData}
              config={config}
              onRunNewSweep={handleRunSweep}
              workloadSensitivity={workloadSensitivity}
            />
            <ComparisonTable benchmarkData={benchmarkData} config={config} />
          </div>
        )}

        {/* Tab 3: Baseline Matrix View */}
        {activeTab === 'matrix' && (
          <div className="space-y-4">
            <ComparisonTable benchmarkData={benchmarkData} config={config} />
            <BenchmarkCharts
              benchmarkData={benchmarkData}
              config={config}
              onRunNewSweep={handleRunSweep}
              workloadSensitivity={workloadSensitivity}
            />
          </div>
        )}

        {/* Tab 4: Research Novelty & Thesis */}
        {activeTab === 'research' && (
          <ResearchOverview />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#0d1117] py-3 text-center text-[10px] font-mono text-slate-500">
        AI Workload-Aware Self-Reconfigurable Mesh Network-on-Chip (NoC) Architecture Platform &bull; Baseline-1 XY Evaluation &bull; Cycle-Accurate Simulator
      </footer>

      {/* Router Inspector Modal */}
      {selectedRouter && (
        <RouterInspectorModal
          router={selectedRouter}
          config={config}
          onClose={() => setSelectedRouterId(null)}
        />
      )}

      {/* Python / Verilog Code Export Modal */}
      <CodeExportModal
        config={config}
        isOpen={isCodeExportOpen}
        onClose={() => setIsCodeExportOpen(false)}
      />
    </div>
  );
}
