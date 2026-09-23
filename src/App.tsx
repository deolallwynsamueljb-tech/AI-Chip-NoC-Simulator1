import React, { useCallback, useState } from 'react';
import {
  NoCConfig,
  BenchmarkComparisonData,
  WorkloadSensitivityItem,
} from '@shared/types/noc';
import { SweepEngine } from '@shared/engine/sweepEngine';
import type { TraceEvent } from '@shared/engine/realTraces';
import { runSensitivitySweep, runSweep } from './api/client';
import { parseTraceFile } from './utils/traceParser';
import { useLocalSimulation } from './sim/useLocalSimulation';
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

type Tab = 'simulator' | 'benchmarks' | 'research';

export default function App() {
  const [config, setConfig] = useState<NoCConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<Tab>('simulator');
  const [selectedRouterId, setSelectedRouterId] = useState<number | null>(null);
  const [isCodeExportOpen, setIsCodeExportOpen] = useState<boolean>(false);

  // Benchmark data is only ever real: null until a sweep actually runs on the server.
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkComparisonData | null>(null);
  const [workloadSensitivity, setWorkloadSensitivity] = useState<WorkloadSensitivityItem[] | null>(null);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);

  // CUSTOM_TRACE: a user-uploaded trace file, kept in browser memory only
  // (never sent to the server) -- events feed the live sim directly, and
  // the Benchmarks-tab sweep for it runs client-side too, since a server
  // function has no way to see a file that was never uploaded to it.
  const [customTraceEvents, setCustomTraceEventsState] = useState<TraceEvent[] | null>(null);
  const [customTraceStatus, setCustomTraceStatus] = useState<{ text: string; isError: boolean } | null>(null);

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
    setCustomTrace,
  } = useLocalSimulation(DEFAULT_CONFIG);

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

  const handleUploadTrace = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const result = parseTraceFile(file.name, text);
        setCustomTraceEventsState(result.events);
        setCustomTraceStatus({
          text: `Loaded ${result.events.length} events from ${file.name} — ${result.sourceNodeCount} source nodes, span ${result.spanCycles} cycles.`,
          isError: false,
        });
        setCustomTrace(result.events);
        handleUpdateConfig({ workloadType: 'CUSTOM_TRACE' });
        setBenchmarkData(null); // stale sweep would otherwise still show the previous trace/workload's numbers
      } catch (err) {
        setCustomTraceEventsState(null);
        setCustomTraceStatus({
          text: err instanceof Error ? err.message : 'Could not read file.',
          isError: true,
        });
      }
    },
    [setCustomTrace, handleUpdateConfig]
  );

  const handleRunSweep = useCallback(() => {
    setIsSweeping(true);
    setSweepError(null);
    setActiveTab('benchmarks');

    if (config.workloadType === 'CUSTOM_TRACE') {
      if (!customTraceEvents) {
        setSweepError('Upload a trace file first (Workload selector → CUSTOM_TRACE).');
        setIsSweeping(false);
        return;
      }
      // Runs entirely in-browser: the uploaded trace only exists in this
      // tab's memory, so the server has nothing to sweep against.
      Promise.resolve()
        .then(() => SweepEngine.runMultiModeSweep(config, undefined, undefined, customTraceEvents))
        .then((sweepData) => {
          setBenchmarkData(sweepData);
          setWorkloadSensitivity(null); // the sensitivity matrix compares 5 fixed synthetic workloads, not the uploaded trace
        })
        .catch((err) => {
          setSweepError(err instanceof Error ? err.message : 'Sweep failed');
        })
        .finally(() => setIsSweeping(false));
      return;
    }

    Promise.all([runSweep(config), runSensitivitySweep(config)])
      .then(([sweepData, sensitivity]) => {
        setBenchmarkData(sweepData);
        setWorkloadSensitivity(sensitivity.items);
      })
      .catch((err) => {
        setSweepError(err instanceof Error ? err.message : 'Sweep failed');
      })
      .finally(() => setIsSweeping(false));
  }, [config, customTraceEvents]);

  const selectedRouter = selectedRouterId !== null ? routers.get(selectedRouterId) || null : null;

  if (!metrics || !telemetry) {
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
        onUploadTrace={handleUploadTrace}
        customTraceStatus={customTraceStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-5 space-y-4">
        {/* Stage 1: Closed Loop Architecture Diagram */}
        <ArchitectureDiagram
          telemetry={telemetry}
          activeMode={config.routingMode}
          workload={config.workloadType}
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

        {/* Tab 2: Sweep Evaluation, Graphs & Baseline Matrix */}
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

        {/* Tab 3: Research Novelty & Thesis */}
        {activeTab === 'research' && <ResearchOverview />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#0d1117] py-3 text-center text-[10px] font-mono text-slate-500">
        AI Workload-Aware Self-Reconfigurable Mesh Network-on-Chip (NoC) Architecture Platform &bull; Baseline-1 XY
        Evaluation &bull; Cycle-Accurate In-Browser Simulator
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
