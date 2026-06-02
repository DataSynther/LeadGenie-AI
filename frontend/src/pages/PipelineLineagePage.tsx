import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { Topbar } from "../components/layout/Topbar";
import {
  api,
  type LineageStage,
  type LineageStageValidation,
  type PipelineLineage,
} from "../lib/api";

// ── Status styling ────────────────────────────────────────────────────────────

const STATUS_CARD: Record<string, string> = {
  success: "border-emerald-500/30 bg-emerald-500/5",
  flagged: "border-amber-500/30 bg-amber-500/5",
  blocked: "border-red-500/30 bg-red-500/5",
  error:   "border-red-500/30 bg-red-500/5",
  unknown: "border-line-soft bg-surface-2",
};

const STATUS_BADGE: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-400",
  flagged: "bg-amber-500/10 text-amber-400",
  blocked: "bg-red-500/10 text-red-400",
  error:   "bg-red-500/10 text-red-400",
  unknown: "bg-surface-2 text-ink-mute",
};

const STATUS_DOT: Record<string, string> = {
  success: "bg-emerald-400",
  flagged: "bg-amber-400",
  blocked: "bg-red-400",
  error:   "bg-red-400",
  unknown: "bg-surface-2 border border-line-soft",
};

const STATUS_LABEL: Record<string, string> = {
  success: "success",
  flagged: "flagged",
  blocked: "blocked",
  error:   "error",
  unknown: "no data",
};

const CONSEQUENCE_STYLE: Record<string, string> = {
  allow: "bg-emerald-500/10 text-emerald-400",
  block: "bg-red-500/10 text-red-400",
  defer: "bg-amber-500/10 text-amber-400",
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, unit: string) {
  if (n == null) return null;
  return `${Math.round(n)}${unit}`;
}

function BoolPill({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok == null) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-px rounded font-mono", ok ? "text-emerald-400" : "text-red-400")}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

function KV({ k, v }: { k: string; v: unknown }) {
  if (v == null || v === "" || v === "null" || v === "undefined") return null;

  // Array: render as bullet list
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    return (
      <div className="py-0.5">
        <span className="text-ink-mute font-mono text-[10px] block mb-0.5">{k}</span>
        <ul className="pl-2 space-y-0.5">
          {v.map((item, i) => (
            <li key={i} className="text-[11px] text-ink-2 leading-snug flex gap-1">
              <span className="text-ink-mute shrink-0">·</span>
              <span className="break-words min-w-0">{typeof item === "object" ? JSON.stringify(item) : String(item)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Boolean
  if (typeof v === "boolean") {
    return (
      <div className="flex gap-2 text-[11px] leading-snug py-0.5">
        <span className="text-ink-mute font-mono shrink-0 w-28 truncate">{k}</span>
        <span className={cn("font-mono", v ? "text-emerald-400" : "text-red-400")}>{v ? "true" : "false"}</span>
      </div>
    );
  }

  // Number
  if (typeof v === "number") {
    return (
      <div className="flex gap-2 text-[11px] leading-snug py-0.5">
        <span className="text-ink-mute font-mono shrink-0 w-28 truncate">{k}</span>
        <span className="text-ink font-mono">{v}</span>
      </div>
    );
  }

  const str = String(v);
  if (str === "—" || str === "") return null;

  // Long text: truncate with expand
  if (str.length > 180) {
    return <KVLong k={k} v={str} />;
  }

  return (
    <div className="flex gap-2 text-[11px] leading-snug py-0.5">
      <span className="text-ink-mute font-mono shrink-0 w-28 truncate">{k}</span>
      <span className="text-ink-2 break-words min-w-0">{str}</span>
    </div>
  );
}

function KVLong({ k, v }: { k: string; v: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="py-0.5">
      <span className="text-ink-mute font-mono text-[10px] block mb-0.5">{k}</span>
      <span className="text-ink-2 text-[11px] leading-snug break-words">
        {expanded ? v : v.slice(0, 180) + "…"}
      </span>
      <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-brand font-mono ml-1">
        {expanded ? "collapse" : "expand"}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-2">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ── Stage card (in the pipeline strip) ───────────────────────────────────────

function StageCard({
  stage,
  selected,
  onClick,
}: {
  stage: LineageStage;
  selected: boolean;
  onClick: () => void;
}) {
  const latency = fmt(stage.perf.latency_ms, "ms");
  const tokens = fmt(stage.perf.tokens, "tk");
  const ctxScore = stage.perf.context_score != null ? `ctx ${Math.round(stage.perf.context_score * 100)}%` : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-xl border px-4 py-3.5 w-[140px] shrink-0",
        "text-left transition-all duration-150 cursor-pointer",
        STATUS_CARD[stage.status] ?? STATUS_CARD.unknown,
        selected && "ring-2 ring-brand ring-offset-1 ring-offset-surface",
      )}
    >
      <span className="text-2xl leading-none">{stage.icon}</span>

      <div className="text-center">
        <div className="text-[12px] font-medium text-ink leading-snug">{stage.label}</div>
        <div className="text-[10px] text-ink-mute font-mono mt-0.5 truncate w-full">{stage.module}</div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[stage.status])} />
        <span className={cn("text-[10px] px-1.5 py-px rounded font-mono", STATUS_BADGE[stage.status])}>
          {STATUS_LABEL[stage.status]}
        </span>
      </div>

      {(latency || tokens || ctxScore) && (
        <div className="flex flex-wrap gap-1 justify-center">
          {latency && <span className="text-[10px] text-ink-mute font-mono">{latency}</span>}
          {tokens && <span className="text-[10px] text-ink-mute font-mono">· {tokens}</span>}
          {ctxScore && <span className="text-[10px] text-ink-mute font-mono">· {ctxScore}</span>}
        </div>
      )}

      {stage.validation && (
        <span className={cn("text-[10px] px-1.5 py-px rounded font-mono", CONSEQUENCE_STYLE[stage.validation.consequence])}>
          {stage.validation.consequence}
        </span>
      )}
    </button>
  );
}

// ── Arrow connector ───────────────────────────────────────────────────────────

function Arrow({ dim }: { dim?: boolean }) {
  return (
    <div className={cn("flex items-center shrink-0 px-1", dim && "opacity-30")}>
      <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
        <line x1="0" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5" className="text-line-soft" />
        <polyline points="15,3 22,8 15,13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-mute" fill="none" />
      </svg>
    </div>
  );
}

// ── Detail panel (below the strip) ───────────────────────────────────────────

function CheckpointRow({ label, cp }: {
  label: string;
  cp: { ok: boolean; issues?: string[]; violations?: string[]; confidence?: number; explanation?: string };
}) {
  const allIssues = [...(cp.issues ?? []), ...(cp.violations ?? [])];
  return (
    <div className="py-1 border-b border-line-soft last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn(
          "text-[10px] px-1.5 py-px rounded font-mono font-semibold",
          cp.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        )}>
          {cp.ok ? "✓" : "✗"} {label}
        </span>
        {cp.confidence != null && (
          <span className="text-[10px] text-ink-mute font-mono">conf {Math.round(cp.confidence * 100)}%</span>
        )}
      </div>
      {allIssues.map((iss, i) => (
        <div key={i} className="mt-0.5 pl-2 text-[10px] text-red-300 font-mono leading-snug">⚠ {iss}</div>
      ))}
      {cp.explanation && (
        <div className="mt-0.5 pl-2 text-[10px] text-ink-mute leading-snug italic">{cp.explanation.slice(0, 180)}{cp.explanation.length > 180 ? "…" : ""}</div>
      )}
    </div>
  );
}

function ValidationBlock({ v }: { v: LineageStageValidation }) {
  const [showHistory, setShowHistory] = useState(false);
  const cps = v.checkpoints;
  const hasAttempts = (v.attempts ?? 1) > 1;

  return (
    <div className="space-y-2">
      {/* Consequence + attempt badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("text-[11px] px-2 py-px rounded-full font-mono font-medium", CONSEQUENCE_STYLE[v.consequence])}>
          {v.consequence.toUpperCase()}
        </span>
        {hasAttempts && (
          <span className="text-[10px] px-1.5 py-px rounded font-mono bg-amber-500/10 text-amber-400">
            {v.attempts} attempts
          </span>
        )}
      </div>

      {/* Per-checkpoint breakdown */}
      {cps ? (
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <div className="px-2.5 py-1 border-b border-line-soft bg-surface-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-ink-mute">Checkpoint Results</span>
          </div>
          <div className="px-2.5 py-1">
            <CheckpointRow label="Shape" cp={cps.shape} />
            <CheckpointRow label="Context" cp={cps.context} />
            <CheckpointRow label="Policy" cp={cps.policy} />
            {cps.hallucination && (
              <CheckpointRow label="Hallucination" cp={cps.hallucination} />
            )}
          </div>
        </div>
      ) : (
        // Fallback: flat issue list
        v.issues.length > 0 && (
          <ul className="space-y-1">
            {v.issues.map((issue, i) => (
              <li key={i} className="text-[11px] text-amber-400 font-mono">⚠ {issue}</li>
            ))}
          </ul>
        )
      )}

      {/* Attempt history */}
      {v.attempt_history && v.attempt_history.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="text-[10px] font-mono text-ink-mute hover:text-ink flex items-center gap-1"
          >
            {showHistory ? "▲" : "▼"} Auto-correction history ({v.attempt_history.length} attempt{v.attempt_history.length > 1 ? "s" : ""})
          </button>
          {showHistory && (
            <div className="mt-1.5 space-y-1.5">
              {v.attempt_history.map((ah) => (
                <div key={ah.attempt} className={cn(
                  "rounded border px-2.5 py-1.5 text-[10px] font-mono",
                  ah.consequence === "allow" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                    : "border-red-500/30 bg-red-500/5 text-red-400"
                )}>
                  <div className="font-semibold mb-0.5">
                    Attempt {ah.attempt} → {ah.consequence.toUpperCase()}
                  </div>
                  {ah.issues.map((iss, i) => (
                    <div key={i} className="text-ink-mute leading-snug">⚠ {iss}</div>
                  ))}
                  {ah.issues.length === 0 && <div className="text-ink-mute">All checks passed.</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPanel({ stage, onClose }: { stage: LineageStage; onClose: () => void }) {
  const inputEntries = Object.entries(stage.inputs);
  const outputEntries = Object.entries(stage.outputs);

  return (
    <div className="rounded-[10px] border border-line-soft bg-surface p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{stage.icon}</span>
          <div>
            <div className="text-sm font-semibold text-ink">{stage.label}</div>
            <div className="text-[11px] text-ink-mute font-mono">{stage.module}</div>
          </div>
          <span className={cn("text-[10px] px-1.5 py-px rounded font-mono ml-1", STATUS_BADGE[stage.status])}>
            {STATUS_LABEL[stage.status]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {stage.perf.latency_ms != null && (
            <span className="text-[11px] text-ink-mute font-mono">{Math.round(stage.perf.latency_ms)}ms</span>
          )}
          {stage.perf.tokens != null && (
            <span className="text-[11px] text-ink-mute font-mono">{stage.perf.tokens} tokens</span>
          )}
          {stage.perf.context_score != null && (
            <span className="text-[11px] text-ink-mute font-mono">ctx {Math.round(stage.perf.context_score * 100)}%</span>
          )}
          <button
            onClick={onClose}
            className="text-ink-mute hover:text-ink text-[18px] leading-none ml-2"
            aria-label="Close detail panel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Three columns: inputs | outputs | validation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-line-soft bg-surface-2 p-3">
          <Section title="Inputs">
            {inputEntries.map(([k, v]) => <KV key={k} k={k} v={v} />)}
          </Section>
        </div>

        <div className="rounded-lg border border-line-soft bg-surface-2 p-3">
          <Section title="Outputs">
            {outputEntries.map(([k, v]) => <KV key={k} k={k} v={v} />)}
          </Section>
        </div>

        <div className="rounded-lg border border-line-soft bg-surface-2 p-3">
          <Section title="Validation">
            {stage.validation ? (
              <ValidationBlock v={stage.validation} />
            ) : (
              <span className="text-[11px] text-ink-mute">No validation layer for this stage.</span>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ lineage }: { lineage: PipelineLineage }) {
  const successCount = lineage.stages.filter((s) => s.status === "success").length;
  const flaggedCount = lineage.stages.filter((s) => s.status === "flagged").length;
  const blockedCount = lineage.stages.filter((s) => ["blocked", "error"].includes(s.status)).length;
  const totalLatency = lineage.stages.reduce((acc, s) => acc + (s.perf.latency_ms ?? 0), 0);
  const totalTokens = lineage.stages.reduce((acc, s) => acc + (s.perf.tokens ?? 0), 0);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg border border-line-soft bg-surface-2 text-[11px] font-mono">
      <span className="text-ink-mute">Stages:</span>
      {successCount > 0 && <span className="text-emerald-400">✓ {successCount} passed</span>}
      {flaggedCount > 0 && <span className="text-amber-400">⚠ {flaggedCount} flagged</span>}
      {blockedCount > 0 && <span className="text-red-400">✗ {blockedCount} blocked</span>}
      <span className="text-line-soft">|</span>
      {lineage.risk_score != null && (
        <span className={cn(
          lineage.risk_score >= 0.4 ? "text-amber-400" : "text-emerald-400"
        )}>
          risk {lineage.risk_score.toFixed(2)}
        </span>
      )}
      <span className={cn(
        "px-1.5 py-px rounded",
        lineage.final_status === "approved" ? "bg-emerald-500/10 text-emerald-400" :
        lineage.final_status === "flagged" ? "bg-amber-500/10 text-amber-400" :
        "bg-surface-2 text-ink-mute"
      )}>
        {lineage.final_status === "approved" ? "🚀 email sent" :
         lineage.final_status === "flagged" ? "🕐 approval queue" : lineage.final_status}
      </span>
      {totalLatency > 0 && <span className="text-ink-mute ml-auto">{Math.round(totalLatency)}ms total · {totalTokens} tokens</span>}
    </div>
  );
}

// ── Empty / error states ──────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-ink-mute">
      <span className="text-4xl">🗂️</span>
      <span className="text-sm">{message}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PipelineLineagePage() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const indexQuery = useQuery({
    queryKey: ["lineageIndex"],
    queryFn: api.lineageIndex,
    refetchInterval: 30_000,
  });

  const lineageQuery = useQuery({
    queryKey: ["lineage", selectedLeadId],
    queryFn: () => api.pipelineLineage(selectedLeadId!),
    enabled: !!selectedLeadId,
  });

  const lineage = lineageQuery.data;
  const selectedStage = lineage?.stages.find((s) => s.id === selectedStageId) ?? null;

  function handleSelectLead(id: string) {
    setSelectedLeadId(id);
    setSelectedStageId(null);
  }

  function handleSelectStage(id: string) {
    setSelectedStageId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-col min-h-screen bg-canvas">
      <Topbar breadcrumb="Observability" title="Pipeline Lineage" />

      <main className="flex-1 p-6 space-y-5 max-w-[1600px]">

        {/* Lead selector */}
        <div className="rounded-[10px] border border-line-soft bg-surface p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-ink shrink-0">Select lead run:</span>

            {indexQuery.isLoading && (
              <span className="text-[12px] text-ink-mute">Loading…</span>
            )}

            {indexQuery.data?.length === 0 && (
              <span className="text-[12px] text-ink-mute">
                No audit logs found. Run <span className="font-mono bg-surface-2 px-1 rounded">POST /outreach/generate</span> to create one.
              </span>
            )}

            <div className="flex flex-wrap gap-2">
              {indexQuery.data?.map((item) => (
                <button
                  key={item.lead_id}
                  onClick={() => handleSelectLead(item.lead_id)}
                  className={cn(
                    "flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all",
                    selectedLeadId === item.lead_id
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-line-soft bg-surface-2 text-ink-2 hover:border-brand/40 hover:text-ink",
                  )}
                >
                  <span className="font-mono text-[11px]">{item.lead_id.slice(0, 10)}…</span>
                  {item.subject && (
                    <span className="text-[10px] text-ink-mute truncate max-w-[200px]">{item.subject}</span>
                  )}
                  <span className={cn(
                    "text-[10px] font-mono mt-0.5",
                    item.decision === "approved" ? "text-emerald-400" : item.decision === "flagged" ? "text-amber-400" : "text-ink-mute",
                  )}>
                    {item.decision}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading state */}
        {lineageQuery.isLoading && (
          <div className="flex items-center justify-center py-16 text-ink-mute text-sm">
            Building lineage…
          </div>
        )}

        {/* No lead selected */}
        {!selectedLeadId && !lineageQuery.isLoading && (
          <EmptyState message="Select a lead above to visualise its pipeline execution." />
        )}

        {/* Lineage view */}
        {lineage && !lineageQuery.isLoading && (
          <>
            {/* Summary bar */}
            <SummaryBar lineage={lineage} />

            {/* Pipeline strip */}
            <div className="rounded-[10px] border border-line-soft bg-surface p-5">
              <div className="text-[11px] text-ink-mute font-mono mb-4">
                Click any stage to inspect inputs / outputs / validation
              </div>

              {lineage.has_data ? (
                <div className="overflow-x-auto pb-2">
                  <div className="flex items-center min-w-max gap-0">
                    {lineage.stages.map((stage, idx) => (
                      <div key={stage.id} className="flex items-center">
                        <StageCard
                          stage={stage}
                          selected={selectedStageId === stage.id}
                          onClick={() => handleSelectStage(stage.id)}
                        />
                        {idx < lineage.stages.length - 1 && (
                          <Arrow dim={stage.status === "blocked" || stage.status === "error"} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState message="No pipeline data found for this lead ID." />
              )}
            </div>

            {/* Detail panel */}
            {selectedStage && (
              <DetailPanel stage={selectedStage} onClose={() => setSelectedStageId(null)} />
            )}
          </>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-mute font-mono px-1">
          <span className="font-semibold text-ink-2">Legend:</span>
          {[
            { colour: "bg-emerald-400", label: "success — stage passed" },
            { colour: "bg-amber-400",   label: "flagged — review required" },
            { colour: "bg-red-400",     label: "blocked — output rejected" },
            { colour: "bg-surface-2 border border-line-soft", label: "no data — not yet traced" },
          ].map(({ colour, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", colour)} />
              {label}
            </span>
          ))}
        </div>

      </main>
    </div>
  );
}
