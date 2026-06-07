import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";
import { api } from "../lib/api";
import type { OutreachResult, PipelineStageEvent } from "../lib/api";

export type PipelineRun = {
  isStreaming: boolean;
  stages: PipelineStageEvent[];
  result: (OutreachResult & { queued_event_id: string }) | null;
  error: string | null;
  leadName: string;
  companyName: string;
};

type PipelineContextType = {
  run: PipelineRun;
  startPipeline: (params: {
    leadId: string;
    leadName: string;
    companyName: string;
    companyDomain: string;
    vertical?: string;
    domain?: string;
  }) => void;
  clearRun: () => void;
};

const defaultRun: PipelineRun = {
  isStreaming: false,
  stages: [],
  result: null,
  error: null,
  leadName: "",
  companyName: "",
};

const PipelineContext = createContext<PipelineContextType>({
  run: defaultRun,
  startPipeline: () => {},
  clearRun: () => {},
});

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<PipelineRun>(defaultRun);
  // Track abort so we can cancel if user starts a new pipeline
  const abortRef = useRef<AbortController | null>(null);

  const clearRun = useCallback(() => setRun(defaultRun), []);

  const startPipeline = useCallback(({ leadId, leadName, companyName, companyDomain, vertical, domain }: {
    leadId: string; leadName: string; companyName: string; companyDomain: string;
    vertical?: string; domain?: string;
  }) => {
    // Cancel any in-flight run
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setRun({ isStreaming: true, stages: [], result: null, error: null, leadName, companyName });

    // Run the stream — this closure outlives any component that called startPipeline
    api.streamGenerateOutreach(
      leadId,
      companyDomain,
      (event: PipelineStageEvent) => {
        if (ctrl.signal.aborted) return;
        if (event.stage === "done" && event.result) {
          setRun(prev => ({
            ...prev,
            isStreaming: false,
            stages: [],
            result: event.result as OutreachResult & { queued_event_id: string },
          }));
        } else if (event.stage !== "done") {
          setRun(prev => {
            const idx = prev.stages.findIndex(s => s.stage === event.stage);
            const stages = idx >= 0
              ? prev.stages.map((s, i) => i === idx ? event : s)
              : [...prev.stages, event];
            return { ...prev, stages };
          });
        }
      },
      vertical,
      domain,
    ).catch((err: unknown) => {
      if (ctrl.signal.aborted) return;
      setRun(prev => ({ ...prev, isStreaming: false, error: String(err) }));
    });
  }, []);

  return (
    <PipelineContext.Provider value={{ run, startPipeline, clearRun }}>
      {children}
    </PipelineContext.Provider>
  );
}

export const usePipeline = () => useContext(PipelineContext);
