import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileCode,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { NoCConfig } from '@shared/types/noc';
import { CodeGenerator } from '../utils/codeGenerator';

interface CodeExportModalProps {
  config: NoCConfig;
  isOpen: boolean;
  onClose: () => void;
}

export const CodeExportModal: React.FC<CodeExportModalProps> = ({
  config,
  isOpen,
  onClose,
}) => {
  const [selectedFile, setSelectedFile] = useState<'BASELINE_PY' | 'PROPOSED_PY' | 'VERILOG_V'>(
    'PROPOSED_PY'
  );
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const baselinePy = CodeGenerator.generateBaselinePythonCode(config);
  const proposedPy = CodeGenerator.generateProposedPythonCode(config);
  const verilogCode = CodeGenerator.generateVerilogControllerCode();

  const getActiveCode = () => {
    switch (selectedFile) {
      case 'BASELINE_PY':
        return baselinePy;
      case 'PROPOSED_PY':
        return proposedPy;
      case 'VERILOG_V':
        return verilogCode;
    }
  };

  const getFileName = () => {
    switch (selectedFile) {
      case 'BASELINE_PY':
        return 'baseline_xy_simulator.py';
      case 'PROPOSED_PY':
        return 'proposed_self_reconfigurable_noc.py';
      case 'VERILOG_V':
        return 'noc_reconfig_controller.v';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([getActiveCode()], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = getFileName();
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-canvas)]/80 backdrop-blur-sm">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded max-w-4xl w-full p-4 shadow-2xl space-y-3 max-h-[90vh] flex flex-col text-[var(--text-primary)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-500/80 flex items-center justify-center text-emerald-400">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold font-mono text-white uppercase">
                Export Python &amp; Verilog RTL Artifacts
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                Standalone executable code files for evaluation in Python / GEM5 / BookSim / Verilog
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded bg-[var(--bg-inset)] text-slate-400 hover:text-white hover:bg-[#21262d] border border-[var(--border-subtle)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab selector & actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex bg-[var(--bg-inset)] p-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-mono">
            <button
              onClick={() => setSelectedFile('PROPOSED_PY')}
              className={`px-2.5 py-1 rounded font-semibold flex items-center gap-1.5 transition-colors ${
                selectedFile === 'PROPOSED_PY'
                  ? 'bg-emerald-500 text-black font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              proposed_self_reconfigurable_noc.py
            </button>
            <button
              onClick={() => setSelectedFile('BASELINE_PY')}
              className={`px-2.5 py-1 rounded font-semibold flex items-center gap-1.5 transition-colors ${
                selectedFile === 'BASELINE_PY'
                  ? 'bg-emerald-500 text-black font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode className="w-3 h-3" />
              baseline_xy_simulator.py
            </button>
            <button
              onClick={() => setSelectedFile('VERILOG_V')}
              className={`px-2.5 py-1 rounded font-semibold flex items-center gap-1.5 transition-colors ${
                selectedFile === 'VERILOG_V'
                  ? 'bg-emerald-500 text-black font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3 h-3" />
              noc_reconfig_controller.v (RTL)
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-[var(--bg-inset)] hover:bg-[#21262d] text-slate-200 text-[10px] font-mono border border-[var(--border-subtle)] flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-black text-[10px] font-mono font-bold shadow-sm flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              Download {getFileName()}
            </button>
          </div>
        </div>

        {/* Code Viewer */}
        <div className="flex-1 overflow-auto bg-[var(--bg-deep)] p-3 rounded border border-[var(--border-subtle)] text-[10px] font-mono text-slate-300 leading-relaxed max-h-[460px]">
          <pre className="whitespace-pre">{getActiveCode()}</pre>
        </div>
      </div>
    </div>
  );
};
