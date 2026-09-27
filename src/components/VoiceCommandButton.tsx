import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mic, Square } from 'lucide-react';
import type { NoCConfig, RoutingMode, WorkloadType } from '@shared/types/noc';
import type { VoiceAction } from '@shared/types/voice';
import { executeVoiceCommand } from '../api/client';
import { PRESETS } from '../presets';

type Tab = 'simulator' | 'compare' | 'benchmarks' | 'research';

interface VoiceCommandButtonProps {
  activeTab: Tab;
  config: NoCConfig;
  onUpdateConfig: (partial: Partial<NoCConfig>) => void;
  onSetActiveTab: (tab: Tab) => void;
  onPlay: () => void;
  onPause: () => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onStepCycle: (cycles: number) => void;
  onRunComparison: () => void;
  onRunFaultSweep: () => void;
  onRunSweep: () => void;
}

type RecState = 'idle' | 'recording' | 'processing' | 'error';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function describeAction(action: VoiceAction, config: NoCConfig): string {
  switch (action.type) {
    case 'updateConfig': {
      const entries = Object.entries(action.partial);
      if (entries.length === 0) return "Heard a config change but couldn't tell which field.";
      return `Set ${entries.map(([k, v]) => `${k} = ${v}`).join(', ')}`;
    }
    case 'setActiveTab':
      return `Switched to the ${action.tab} tab`;
    case 'togglePlay':
      return 'Toggled play/pause';
    case 'play':
      return 'Resumed the simulation';
    case 'pause':
      return 'Paused the simulation';
    case 'reset':
      return 'Reset the simulation';
    case 'stepCycle':
      return `Stepped forward ${action.cycles} cycles`;
    case 'runComparison':
      return 'Running the architecture comparison…';
    case 'runFaultSweep':
      return 'Running the fault rate sweep…';
    case 'runSweep':
      return 'Running the full benchmark sweep…';
    case 'applyPreset': {
      const preset = PRESETS.find((p) => p.id === action.preset);
      return `Applied ${preset?.name ?? `preset ${action.preset}`}`;
    }
    case 'unknown':
    default:
      return "Didn't understand that as a command.";
  }
}

export const VoiceCommandButton: React.FC<VoiceCommandButtonProps> = ({
  activeTab,
  config,
  onUpdateConfig,
  onSetActiveTab,
  onPlay,
  onPause,
  onTogglePlay,
  onReset,
  onStepCycle,
  onRunComparison,
  onRunFaultSweep,
  onRunSweep,
}) => {
  const [state, setState] = useState<RecState>('idle');
  const [feedback, setFeedback] = useState<{ transcript: string; text: string; isError: boolean } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const executeAction = useCallback(
    (action: VoiceAction) => {
      switch (action.type) {
        case 'updateConfig':
          if (Object.keys(action.partial).length > 0) onUpdateConfig(action.partial);
          break;
        case 'setActiveTab':
          onSetActiveTab(action.tab);
          break;
        case 'togglePlay':
          onTogglePlay();
          break;
        case 'play':
          onPlay();
          break;
        case 'pause':
          onPause();
          break;
        case 'reset':
          onReset();
          break;
        case 'stepCycle':
          onStepCycle(action.cycles);
          break;
        case 'runComparison':
          onRunComparison();
          break;
        case 'runFaultSweep':
          onRunFaultSweep();
          break;
        case 'runSweep':
          onRunSweep();
          break;
        case 'applyPreset': {
          const preset = PRESETS.find((p) => p.id === action.preset);
          if (preset) onUpdateConfig(preset.config);
          break;
        }
        case 'unknown':
        default:
          break;
      }
    },
    [onUpdateConfig, onSetActiveTab, onTogglePlay, onPlay, onPause, onReset, onStepCycle, onRunComparison, onRunFaultSweep, onRunSweep]
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (state !== 'idle') return;
    setFeedback(null);

    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setState('error');
      setFeedback({ transcript: '', text: 'Voice recording is not supported in this browser.', isError: true });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 500) {
          setState('idle');
          setFeedback({ transcript: '', text: 'Recording was too short — hold the button while speaking.', isError: true });
          return;
        }

        setState('processing');
        try {
          const base64 = await blobToBase64(blob);
          const result = await executeVoiceCommand(base64, mimeType, activeTab, config);
          if (result.action.type === 'unknown') {
            setFeedback({
              transcript: result.transcript,
              text: result.explanation || "Didn't understand that as a command.",
              isError: true,
            });
          } else {
            executeAction(result.action);
            setFeedback({ transcript: result.transcript, text: result.explanation || describeAction(result.action, config), isError: false });
          }
        } catch (err) {
          setFeedback({ transcript: '', text: err instanceof Error ? err.message : 'Voice command failed', isError: true });
        } finally {
          setState('idle');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setState('recording');
    } catch {
      setState('error');
      setFeedback({ transcript: '', text: 'Microphone access was denied.', isError: true });
    }
  }, [state, activeTab, config, executeAction, stopStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopStream();
      if (state === 'recording') setState('idle');
    }
  }, [state, stopStream]);

  return (
    <div className="fixed bottom-5 left-5 z-40 flex flex-col items-start gap-2">
      {feedback && (
        <div
          className={`max-w-xs rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur-sm ${
            feedback.isError
              ? 'bg-red-950/90 border-red-500/40 text-red-200'
              : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            {feedback.isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
            {feedback.text}
          </div>
          {feedback.transcript && <div className="mt-1 text-[10px] opacity-70 font-mono">"{feedback.transcript}"</div>}
        </div>
      )}

      <button
        onPointerDown={(e) => {
          e.preventDefault();
          startRecording();
        }}
        onPointerUp={stopRecording}
        onPointerLeave={() => state === 'recording' && stopRecording()}
        disabled={state === 'processing'}
        title="Hold to speak a voice command"
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm shadow-lg transition-colors select-none touch-none ${
          state === 'recording'
            ? 'bg-red-600 text-white animate-pulse'
            : state === 'processing'
            ? 'bg-slate-700 text-slate-300 cursor-wait'
            : 'bg-emerald-600 hover:bg-emerald-500 text-black'
        }`}
      >
        {state === 'processing' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : state === 'recording' ? (
          <Square className="w-4 h-4 fill-white" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
        {state === 'recording' ? 'Listening… release to send' : state === 'processing' ? 'Thinking…' : 'Hold to speak'}
      </button>
    </div>
  );
};
