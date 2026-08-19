import React, { useState } from 'react';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import type { NoCConfig, SimulationMetrics, WorkloadTelemetry } from '@shared/types/noc';
import { askAssistant } from '../api/client';

interface AssistantPanelProps {
  config: NoCConfig;
  metrics: SimulationMetrics;
  telemetry: WorkloadTelemetry;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const AssistantPanel: React.FC<AssistantPanelProps> = ({ config, metrics, telemetry }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setIsLoading(true);
    setError(null);

    try {
      const { answer } = await askAssistant(trimmed, config, metrics, telemetry);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach the assistant');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-black font-semibold text-sm shadow-lg transition-colors"
      >
        <Bot className="w-4 h-4" />
        Ask the assistant
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-80 sm:w-96 max-h-[70vh] flex flex-col bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-2xl overflow-hidden text-[var(--text-primary)]">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          Simulation assistant
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {messages.length === 0 && (
          <p className="text-xs text-slate-500">
            Ask about the current run — e.g. "why did the controller switch to congestion-aware routing?" or "is the
            network saturated right now?". Answers are grounded in the live config, metrics, and telemetry.
          </p>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`rounded-md px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user' ? 'bg-emerald-500/10 border border-emerald-500/25 ml-6' : 'bg-[var(--bg-inset)] border border-[var(--border-subtle)] mr-6'
            }`}
          >
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Thinking…
          </div>
        )}
        {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{error}</div>}
      </div>

      <div className="flex items-center gap-2 p-2.5 border-t border-[var(--border-subtle)]">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="Ask about the simulation…"
          className="flex-1 bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
        />
        <button
          onClick={handleAsk}
          disabled={isLoading || !question.trim()}
          className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-black"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
