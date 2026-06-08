import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Loader2, X, ExternalLink } from "lucide-react";
import { usePipeline } from "../context/PipelineContext";
import { cn } from "../lib/utils";
import type { PipelineStageEvent } from "../lib/api";

const STAGE_LABELS: Record<string, string> = {
  enriching_lead:    "Fetching lead data",
  enriching_company: "Enriching company",
  detecting_signals: "Hiring signals",
  researching:       "AI research",
  building_context:  "Building context",
  fetching_trends:   "Market trends",
  ranking_relevance: "Relevance ranking",
  generating_email:  "Generating email",
  governance:        "Governance checks",
  queueing:          "Queuing",
};

const ALL_STAGES = Object.keys(STAGE_LABELS);

function StageRow({ id, event }: { id: string; event?: PipelineStageEvent }) {
  const status = event?.status ?? "pending";
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 w-3.5 flex items-center justify-center">
        {status === "running" && <Loader2 size={11} className="animate-spin text-brand" />}
        {status === "done"    && <CheckCircle2 size={11} className="text-emerald-500" />}
        {status === "error"   && <AlertCircle size={11} className="text-red-400" />}
        {status === "pending" && <span className="w-1.5 h-1.5 rounded-full bg-line-soft" />}
      </span>
      <span className={cn(
        "text-[11px] font-mono truncate",
        status === "running" ? "text-brand font-semibold" :
        status === "done"    ? "text-ink" :
        status === "error"   ? "text-red-400" :
        "text-ink-mute"
      )}>
        {event?.label ?? STAGE_LABELS[id]}
      </span>
    </div>
  );
}

export function PipelineToast() {
  const { run, clearRun } = usePipeline();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!run.isStreaming && !run.result && !run.error) return null;

  const stageMap = Object.fromEntries(run.stages.map(s => [s.stage, s]));
  const currentStage = run.stages.findLast?.(s => s.status === "running")?.label ?? "Starting…";

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-72 rounded-xl border border-line shadow-2xl bg-surface overflow-hidden">

      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-2.5 text-[11px] font-mono font-semibold",
        run.error   ? "bg-red-500/10 text-red-400" :
        run.result  ? "bg-emerald-500/10 text-emerald-600" :
        "bg-brand/8 text-brand"
      )}>
        <div className="flex items-center gap-2">
          {run.error  && <AlertCircle size={12} />}
          {run.result && <CheckCircle2 size={12} />}
          {run.isStreaming && <Loader2 size={12} className="animate-spin" />}
          <span>
            {run.error   ? "Pipeline failed"
             : run.result ? `Email ready — ${run.leadName}`
             : `Generating — ${run.leadName}`}
          </span>
        </div>
        <button onClick={clearRun} className="hover:opacity-60 transition-opacity ml-2 shrink-0">
          <X size={12} />
        </button>
      </div>

      {/* Streaming: stage list */}
      {run.isStreaming && (
        <div className="px-4 py-3 flex flex-col gap-1.5 border-t border-line-soft">
          {ALL_STAGES.map(id => (
            <StageRow key={id} id={id} event={stageMap[id]} />
          ))}
          <div className="mt-1 text-[10px] text-ink-mute font-mono truncate">{currentStage}</div>
        </div>
      )}

      {/* Error */}
      {run.error && (
        <div className="px-4 py-3 text-[11px] text-red-400 font-mono border-t border-line-soft">
          {run.error}
        </div>
      )}

      {/* Done: CTA */}
      {run.result && (
        <div className="px-4 py-3 flex flex-col gap-2 border-t border-line-soft">
          <div className="text-[11px] font-mono text-ink-2">
            {run.result.governance?.approved
              ? "Auto-approved — email ready to send"
              : "Queued for review"}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { queryClient.invalidateQueries({ queryKey: ["approvalQueue"] }); navigate("/approval"); clearRun(); }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-[11px] font-mono font-semibold hover:bg-brand/85 transition-colors"
            >
              <ExternalLink size={10} /> View in Queue
            </button>
            <button
              onClick={clearRun}
              className="px-3 py-1.5 rounded-md bg-surface-2 text-ink text-[11px] font-mono border border-line hover:bg-surface transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
