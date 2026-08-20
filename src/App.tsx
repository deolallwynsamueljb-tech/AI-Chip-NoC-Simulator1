import React, { useCallback, useEffect, useState } from 'react';
import {
  NoCConfig,
  BenchmarkComparisonData,
  WorkloadSensitivityItem,
} from '@shared/types/noc';
import { createSession, runSensitivitySweep, runSweep } from './api/client';
import { useSimulationSocket } from './api/useSimulationSocket';
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
import { AssistantPanel } from './components/AssistantPanel';

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
  hysteresisWindows: 2,
  dwellCycles: 300,
};

type Tab = 'simulator' | 'benchmarks' | 'matrix' | 'research';

export default function App() {
  const [config, setConfig] = useState<NoCConfig>(DEFAULT_CONFIG);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('simulator');
  const [selectedRouterId, setSelectedRouterId] = useState<number | null>(null);
  const [isCodeExportOpen, setIsCodeExportOpen] = useState<boolean>(false);

  // Benchmark data is only ever real: null until a sweep actually runs on the server.
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkComparisonData | null>(null);
  const [workloadSensitivity, setWorkloadSensitivity] = useState<WorkloadSensitivityItem[] | null>(null);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);

  const {
    connected,
    isRunning,
    speed,
    metrics,
    telemetry,
    routers,
    links,
    play,
    pause,
    step,
    reset,
    setSpeed,
    updateConfig: sendConfigUpdate,
  } = useSimulationSocket(sessionId);

  // Bootstrap: create a real server-side simulation session once on mount.
  useEffect(() => {
    let cancelled = false;
    createSession(DEFAULT_CONFIG)
      .then(({ sessionId: id }) => {
        if (!cancelled) setSessionId(id);
      })
      .catch((err) => {
        if (!cancelled) setBootError(err instanceof Error ? err.message : 'Failed to start simulation session');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStepCycle = useCallback((cycles: number) => step(cycles), [step]);
  const handleReset = useCallback(() => reset(), [reset]);
  const handleTogglePlay = useCallback(() => (isRunning ? pause() : play()), [isRunning, pause, play]);

  const handleUpdateConfig = useCallback(
    (partial: Partial<NoCConfig>) => {
      setConfig((prev) => ({ ...prev, ...partial }));
      sendConfigUpdate(partial);
    },
    [sendConfigUpdate]
  );

  const handleRunSweep = useCallback(() => {
    setIsSweeping(true);
    setSweepError(null);
    setActiveTab('benchmarks');

    Promise.all([runSweep(config), runSensitivitySweep(config)])
      .then(([sweepData, sensitivity]) => {
        setBenchmarkData(sweepData);
        setWorkloadSensitivity(sensitivity.items);
      })
      .catch((err) => {
        setSweepError(err instanceof Error ? err.message : 'Sweep failed');
      })
      .finally(() => setIsSweeping(false));
  }, [config]);

  const selectedRouter = selectedRouterId !== null ? routers.get(selectedRouterId) || null : null;

  if (bootError) {
    return (
      <div className="min-h-screen bg-[#0a0c10] text-[#c9d1d9] flex items-center justify-center p-6 font-mono text-sm">
        <div className="max-w-md text-center space-y-2">
          <p className="text-red-400 font-bold">Could not reach the simulation server</p>
          <p className="text-slate-400">{bootError}</p>
        </div>
      </div>
    );
  }

  if (!sessionId || !metrics || !telemetry) {
    return (
      <div className="min-h-screen bg-[#0a0c10] text-[#c9d1d9] flex items-center justify-center p-6 font-mono text-sm">
        Starting simulation session…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#c9d1d9] flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Header */}
      <Header
        config={config}
        isRunning={isRunning}
        simSpeed={speed}
        currentCycle={metrics.currentCycle}
        activeTab={activeTab}
        connected={connected}
        onTogglePlay={handleTogglePlay}
        onStepCycle={handleStepCycle}
        onReset={handleReset}
        onChangeSpeed={setSpeed}
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
                <WorkloadControllerPanel telemetry={telemetry} config={config} routers={routers} />
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
              isSweeping={isSweeping}
              sweepError={sweepError}
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
              isSweeping={isSweeping}
              sweepError={sweepError}
            />
          </div>
        )}

        {/* Tab 4: Research Novelty & Thesis */}
        {activeTab === 'research' && <ResearchOverview />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#0d1117] py-3 text-center text-[10px] font-mono text-slate-500">
        AI Workload-Aware Self-Reconfigurable Mesh Network-on-Chip (NoC) Architecture Platform &bull; Baseline-1 XY
        Evaluation &bull; Server-Computed Cycle-Accurate Simulator
      </footer>

      {/* Router Inspector Modal */}
      {selectedRouter && (
        <RouterInspectorModal router={selectedRouter} config={config} onClose={() => setSelectedRouterId(null)} />
      )}

      {/* Python / Verilog Code Export Modal */}
      <CodeExportModal config={config} isOpen={isCodeExportOpen} onClose={() => setIsCodeExportOpen(false)} />

      {/* AI Assistant (Groq-backed, grounded in live simulation state) */}
      <AssistantPanel config={config} metrics={metrics} telemetry={telemetry} />
    </div>
  );
}
