import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { Topbar } from "../components/layout/Topbar";
import {
  api,
  type LineageStage,
  type LineageIndexItem,
  type PipelineLineage,
} from "../lib/api";

// ── Attempt history item (union of old validator format + new governance format) ──

type AttemptLayerResult = {
  passed?: boolean;
  consequence?: string;
  issues?: string[];
  violations?: string[];
  confidence?: number;
  explanation?: string;
};

type AttemptHistoryItem = {
  attempt: number;
  passed?: boolean;
  consequence?: string;
  issues?: string[];
  checkpoints?: Record<string, { ok: boolean; issues: string[] }>;
  layers?: Record<string, AttemptLayerResult>;
};

function ahPassed(ah: AttemptHistoryItem): boolean {
  if (ah.passed !== undefined) return ah.passed;
  return ah.consequence === "allow";
}

function ahLayers(ah: AttemptHistoryItem): Record<string, AttemptLayerResult> {
  if (ah.layers) return ah.layers;
  if (ah.checkpoints) {
    return Object.fromEntries(
      Object.entries(ah.checkpoints).map(([k, v]) => [k, { passed: v.ok, issues: v.issues }])
    );
  }
  return { validation: { passed: ah.consequence === "allow", issues: ah.issues ?? [] } };
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  strip: string; bg: string; border: string; text: string; dot: string; label: string;
}> = {
  success: { strip: "bg-emerald-500", bg: "bg-emerald-500/5",  border: "border-emerald-500/40", text: "text-emerald-400", dot: "bg-emerald-400",                       label: "success" },
  flagged: { strip: "bg-amber-500",   bg: "bg-amber-500/5",    border: "border-amber-500/40",   text: "text-amber-400",   dot: "bg-amber-400",                         label: "flagged" },
  blocked: { strip: "bg-red-500",     bg: "bg-red-500/5",      border: "border-red-500/40",     text: "text-red-400",     dot: "bg-red-400",                           label: "blocked" },
  error:   { strip: "bg-red-500",     bg: "bg-red-500/5",      border: "border-red-500/40",     text: "text-red-400",     dot: "bg-red-400",                           label: "error"   },
  unknown: { strip: "bg-surface-2",   bg: "bg-surface-2/30",   border: "border-line-soft",      text: "text-ink-mute",    dot: "bg-surface-2 border border-line-soft", label: "no data" },
};
const sc = (s: string) => STATUS_CFG[s] ?? STATUS_CFG.unknown;

// ── KV renderer ───────────────────────────────────────────────────────────────

function KVLong({ k, v }: { k: string; v: string }) {
  const [exp, setExp] = useState(false);
  return (
    <div className="py-0.5">
      <span className="text-ink-mute font-mono text-[10px] block mb-0.5">{k}</span>
      <span className="text-ink-2 text-[11px] leading-snug break-words">
        {exp ? v : v.slice(0, 200) + "…"}
      </span>
      <button onClick={() => setExp(e => !e)} className="text-[10px] text-brand font-mono ml-1">
        {exp ? "collapse" : "expand"}
      </button>
    </div>
  );
}

function KV({ k, v }: { k: string; v: unknown }) {
  if (v == null || v === "" || v === "null" || v === "undefined") return null;
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
  if (typeof v === "boolean") {
    return (
      <div className="flex gap-2 text-[11px] leading-snug py-0.5">
        <span className="text-ink-mute font-mono shrink-0 w-28 truncate">{k}</span>
        <span className={cn("font-mono", v ? "text-emerald-400" : "text-red-400")}>{v ? "true" : "false"}</span>
      </div>
    );
  }
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
  if (str.length > 200) return <KVLong k={k} v={str} />;
  return (
    <div className="flex gap-2 text-[11px] leading-snug py-0.5">
      <span className="text-ink-mute font-mono shrink-0 w-28 truncate">{k}</span>
      <span className="text-ink-2 break-words min-w-0">{str}</span>
    </div>
  );
}

function DataSection({ title, entries }: { title: string; entries: [string, unknown][] }) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface-2 p-4">
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-3">{title}</div>
      <div className="space-y-0.5">
        {entries.map(([k, v]) => <KV key={k} k={k} v={v} />)}
      </div>
    </div>
  );
}

// ── Checkpoint row ────────────────────────────────────────────────────────────

function CheckpointRow({ label, cp }: {
  label: string;
  cp: { ok?: boolean; passed?: boolean; issues?: string[]; violations?: string[]; confidence?: number; explanation?: string };
}) {
  const ok = cp.ok ?? cp.passed ?? true;
  const allIssues = [...(cp.issues ?? []), ...(cp.violations ?? [])];
  return (
    <div className="py-1.5 border-b border-line-soft last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn(
          "text-[10px] px-1.5 py-px rounded font-mono font-semibold",
          ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        )}>
          {ok ? "✓" : "✗"} {label}
        </span>
        {cp.confidence != null && (
          <span className="text-[10px] text-ink-mute font-mono">conf {Math.round(cp.confidence * 100)}%</span>
        )}
      </div>
      {allIssues.map((iss, i) => (
        <div key={i} className="mt-0.5 pl-2 text-[10px] text-red-300 font-mono leading-snug">⚠ {iss}</div>
      ))}
      {cp.explanation && (
        <div className="mt-0.5 pl-2 text-[10px] text-ink-mute leading-snug italic">
          {cp.explanation.slice(0, 200)}{cp.explanation.length > 200 ? "…" : ""}
        </div>
      )}
    </div>
  );
}

// ── Layer mini-node (inside attempt subgraph) ─────────────────────────────────

function LayerMiniNode({
  name, result, selected, onClick,
}: {
  name: string;
  result: AttemptLayerResult;
  selected: boolean;
  onClick: () => void;
}) {
  const ok = result.passed !== false && result.consequence !== "block" && result.consequence !== "defer";
  const issueCount = (result.issues?.length ?? 0) + (result.violations?.length ?? 0);
  return (
    <button
      onClick={onClick}
      title={ok ? `${name}: passed` : `${name}: ${issueCount} issue${issueCount !== 1 ? "s" : ""}`}
      className={cn(
        "flex flex-col items-center px-2.5 py-2 rounded-lg border transition-all min-w-[64px]",
        "hover:brightness-110 focus:outline-none",
        ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5",
        selected && "ring-2 ring-brand ring-offset-1 ring-offset-surface shadow-sm shadow-brand/20",
      )}
    >
      {/* Airflow-style top strip */}
      <div className={cn("h-0.5 w-full rounded-full mb-1.5", ok ? "bg-emerald-500" : "bg-red-500")} />
      <span className={cn("text-[12px] font-bold font-mono", ok ? "text-emerald-400" : "text-red-400")}>
        {ok ? "✓" : "✗"}
      </span>
      <span className="text-[9px] text-ink-mute font-mono mt-0.5 capitalize leading-tight text-center">{name}</span>
      {!ok && issueCount > 0 && (
        <span className="text-[8px] text-red-400/70 font-mono mt-0.5">{issueCount} issue{issueCount !== 1 ? "s" : ""}</span>
      )}
    </button>
  );
}

// ── Attempt subgraph (Airflow TaskGroup) ──────────────────────────────────────

function AttemptSubgraph({
  history,
  selectedAttemptLayer,
  onSelectAttemptLayer,
}: {
  history: AttemptHistoryItem[];
  selectedAttemptLayer: string | null;
  onSelectAttemptLayer: (key: string | null) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border-2 border-dashed border-brand/25 bg-surface p-3 w-full">
      {/* Task-group header */}
      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-dashed border-brand/20">
        <span className="text-[8px] font-mono uppercase tracking-widest text-brand/50">⟳ Auto-Correction Subgraph</span>
        <span className="ml-auto text-[9px] px-1.5 py-px rounded bg-amber-500/10 text-amber-400 font-mono border border-amber-500/20">
          {history.length} attempt{history.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {history.map((ah, idx) => {
          const passed = ahPassed(ah);
          const layers = Object.entries(ahLayers(ah));
          return (
            <div key={ah.attempt}>
              {/* Attempt row */}
              <div className={cn(
                "flex items-center gap-2.5 p-2 rounded-lg border",
                passed ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5",
              )}>
                {/* Attempt number */}
                <div className="flex flex-col items-center min-w-[38px] shrink-0">
                  <span className="text-[7px] text-ink-mute font-mono uppercase leading-none">att</span>
                  <span className={cn("text-[18px] font-bold font-mono leading-none mt-0.5", passed ? "text-emerald-400" : "text-red-400")}>
                    {ah.attempt}
                  </span>
                  <span className={cn(
                    "text-[7px] font-mono px-1 py-px rounded mt-0.5",
                    passed ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}>
                    {passed ? "PASS" : "FAIL"}
                  </span>
                </div>

                <div className="w-px h-10 bg-line-soft shrink-0" />

                {/* Layer mini-nodes */}
                <div className="flex gap-1.5 flex-wrap">
                  {layers.map(([name, result]) => {
                    const key = `${ah.attempt}-${name}`;
                    return (
                      <LayerMiniNode
                        key={key}
                        name={name}
                        result={result}
                        selected={selectedAttemptLayer === key}
                        onClick={() => onSelectAttemptLayer(selectedAttemptLayer === key ? null : key)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Correction arrow between FAIL → next attempt */}
              {!passed && idx < history.length - 1 && (
                <div className="flex items-center gap-1.5 py-1 pl-[46px]">
                  <svg width="16" height="10" viewBox="0 0 16 10" className="text-amber-500/40 shrink-0">
                    <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" />
                    <polygon points="7,2 13,5 7,8" fill="currentColor" />
                  </svg>
                  <span className="text-[8px] text-amber-500/50 font-mono italic">
                    correction injected → attempt {ah.attempt + 1}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DAG Node ──────────────────────────────────────────────────────────────────

function DAGNode({
  stage, selected, hasSubgraph, subgraphOpen, onClick, onToggleSubgraph,
}: {
  stage: LineageStage;
  selected: boolean;
  hasSubgraph: boolean;
  subgraphOpen: boolean;
  onClick: () => void;
  onToggleSubgraph: () => void;
}) {
  const cfg = sc(stage.status);
  const attempts = (stage.validation?.attempt_history?.length ?? 0) > 1
    ? stage.validation!.attempt_history!.length
    : stage.validation?.attempts ?? 1;

  return (
    <div className="flex flex-col items-center">
      {/* Node button */}
      <button
        onClick={onClick}
        className={cn(
          "relative w-[152px] rounded-xl border text-left overflow-hidden transition-all duration-150",
          cfg.bg, cfg.border,
          selected
            ? "ring-2 ring-brand/60 ring-offset-2 ring-offset-surface shadow-lg shadow-brand/10"
            : "hover:shadow-md hover:brightness-105",
        )}
      >
        {/* Airflow-style status strip */}
        <div className={cn("h-[3px] w-full", cfg.strip)} />

        <div className="p-3">
          <div className="flex items-start justify-between mb-2">
            <span className="text-[22px] leading-none">{stage.icon}</span>
            {attempts > 1 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono border border-amber-500/20">
                {attempts}× retry
              </span>
            )}
          </div>

          <div className="font-semibold text-[12px] text-ink leading-snug">{stage.label}</div>
          <div className="text-[10px] text-ink-mute font-mono mt-0.5 truncate">{stage.module}</div>

          <div className="flex items-center gap-1.5 mt-2.5">
            <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
            <span className={cn("text-[10px] font-mono", cfg.text)}>{cfg.label}</span>
          </div>

          <div className="flex gap-2 mt-1.5 flex-wrap min-h-[14px]">
            {stage.perf.latency_ms != null && (
              <span className="text-[9px] text-ink-mute font-mono">{Math.round(stage.perf.latency_ms)}ms</span>
            )}
            {stage.perf.tokens != null && (
              <span className="text-[9px] text-ink-mute font-mono">{stage.perf.tokens}tk</span>
            )}
          </div>

          {stage.validation && (
            <span className={cn(
              "inline-block mt-1 text-[9px] px-1.5 py-px rounded font-mono",
              stage.validation.consequence === "allow" ? "bg-emerald-500/10 text-emerald-400"
                : stage.validation.consequence === "block" ? "bg-red-500/10 text-red-400"
                : "bg-amber-500/10 text-amber-400"
            )}>
              {stage.validation.consequence}
            </span>
          )}
        </div>
      </button>

      {/* "Inspecting" label */}
      {selected && !hasSubgraph && (
        <div className="mt-1 text-[8px] text-brand/70 font-mono">▶ details open</div>
      )}

      {/* Subgraph toggle */}
      {hasSubgraph && (
        <div className="flex flex-col items-center mt-1">
          <svg width="2" height="10" viewBox="0 0 2 10" className="text-brand/30">
            <line x1="1" y1="0" x2="1" y2="10" stroke="currentColor" strokeWidth="2" strokeDasharray="2.5 1.5" />
          </svg>
          <button
            onClick={onToggleSubgraph}
            className={cn(
              "text-[8px] font-mono px-2 py-0.5 rounded border transition-all mt-0.5",
              subgraphOpen
                ? "border-brand/30 bg-brand/5 text-brand/60"
                : "border-amber-500/20 bg-amber-500/5 text-amber-500/60 hover:border-amber-500/40 hover:text-amber-500/80",
            )}
          >
            {subgraphOpen ? "▲ hide retries" : "▼ show retries"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── DAG Edge (horizontal dashed arrow) ───────────────────────────────────────

function DAGEdge({ dim }: { dim?: boolean }) {
  return (
    <div className={cn("flex items-start shrink-0 px-1 pt-[56px]", dim && "opacity-20")}>
      <svg width="36" height="14" viewBox="0 0 36 14" fill="none">
        <line x1="0" y1="7" x2="27" y2="7" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2.5" className="text-line-soft" />
        <polygon points="21,3 29,7 21,11" fill="currentColor" className="text-ink-mute/50" />
      </svg>
    </div>
  );
}

// ── Lead header ───────────────────────────────────────────────────────────────

function LeadHeader({ lineage }: { lineage: PipelineLineage }) {
  const outreach = lineage.stages.find(s => s.id === "outreach");
  const subject = (outreach?.outputs as { subject?: string })?.subject;
  const totalLatency = lineage.stages.reduce((a, s) => a + (s.perf.latency_ms ?? 0), 0);
  const totalTokens  = lineage.stages.reduce((a, s) => a + (s.perf.tokens ?? 0), 0);

  const decisionCfg =
    lineage.final_status === "approved" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
    : lineage.final_status === "flagged" ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
    : "bg-surface-2 text-ink-mute border-line-soft";

  return (
    <div className="rounded-xl border border-line-soft bg-surface px-5 py-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center font-mono text-sm font-bold text-white shrink-0 bg-gradient-to-br",
            lineage.final_status === "approved" ? "from-emerald-600 to-emerald-400"
            : lineage.final_status === "flagged" ? "from-amber-600 to-amber-400"
            : "from-brand to-gold",
          )}>
            {lineage.lead_id.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-mono text-[12px] font-semibold text-ink">{lineage.lead_id}</div>
            {subject && (
              <div className="text-[11px] text-ink-mute italic mt-0.5 max-w-[340px] truncate">{subject}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[11px] px-2.5 py-1 rounded-full border font-mono", decisionCfg)}>
            {lineage.final_status === "approved" ? "🚀 sent" : lineage.final_status === "flagged" ? "🕐 pending approval" : lineage.final_status}
          </span>
          {lineage.risk_score != null && (
            <span className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border font-mono",
              lineage.risk_score >= 0.4
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            )}>
              risk {lineage.risk_score.toFixed(2)}
            </span>
          )}
          <span className="text-[10px] px-2.5 py-1 rounded-full border border-line-soft text-ink-mute font-mono">
            {Math.round(totalLatency)}ms · {totalTokens}tk total
          </span>
        </div>
      </div>

      {/* Stage status pills */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line-soft">
        {lineage.stages.map(s => {
          const cfg = sc(s.status);
          return (
            <span key={s.id} className={cn(
              "inline-flex items-center gap-1 text-[9px] px-2 py-px rounded-full font-mono border",
              cfg.bg, cfg.border, cfg.text,
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
              {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── DAG Canvas ────────────────────────────────────────────────────────────────

function DAGCanvas({
  lineage,
  selectedStageId,
  selectedAttemptLayer,
  openSubgraphs,
  onSelectStage,
  onSelectStageForLayer,
  onToggleSubgraph,
  onSelectAttemptLayer,
}: {
  lineage: PipelineLineage;
  selectedStageId: string | null;
  selectedAttemptLayer: string | null;
  openSubgraphs: Set<string>;
  onSelectStage: (id: string) => void;
  onSelectStageForLayer: (id: string) => void;
  onToggleSubgraph: (id: string) => void;
  onSelectAttemptLayer: (key: string | null) => void;
}) {
  return (
    <div className="rounded-xl border border-line-soft bg-surface p-6 overflow-x-auto">
      <div className="text-[9px] text-ink-mute font-mono mb-4 uppercase tracking-widest">
        Click any node to inspect · ▼ show retries to expand auto-correction subgraph · click a layer node for full detail
      </div>
      <div className="min-w-max">
        <div className="flex items-start gap-0">
          {lineage.stages.map((stage, idx) => {
            const history = (stage.validation?.attempt_history ?? []) as AttemptHistoryItem[];
            const hasSubgraph = history.length > 1;
            const subOpen = openSubgraphs.has(stage.id);
            const isLast = idx === lineage.stages.length - 1;
            const prevStage = idx > 0 ? lineage.stages[idx - 1] : null;
            const prevBlocked = prevStage ? ["blocked", "error"].includes(prevStage.status) : false;

            return (
              <div key={stage.id} className="flex items-start">
                {/* Column: node + optional subgraph */}
                <div className="flex flex-col items-center">
                  <DAGNode
                    stage={stage}
                    selected={selectedStageId === stage.id}
                    hasSubgraph={hasSubgraph}
                    subgraphOpen={subOpen}
                    onClick={() => onSelectStage(stage.id)}
                    onToggleSubgraph={() => onToggleSubgraph(stage.id)}
                  />
                  {hasSubgraph && subOpen && (
                    <AttemptSubgraph
                      history={history}
                      selectedAttemptLayer={selectedAttemptLayer}
                      onSelectAttemptLayer={(key) => {
                        onSelectAttemptLayer(key);
                        if (key) onSelectStageForLayer(stage.id);
                      }}
                    />
                  )}
                </div>

                {!isLast && <DAGEdge dim={prevBlocked} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({
  stage,
  attemptLayerKey,
  history,
  onClose,
}: {
  stage: LineageStage;
  attemptLayerKey: string | null;
  history: AttemptHistoryItem[];
  onClose: () => void;
}) {
  const cfg = sc(stage.status);

  // Parse attempt-layer key: "2-validator" → attempt=2, layer="validator"
  let attemptNum: number | null = null;
  let layerName: string | null = null;
  if (attemptLayerKey) {
    const dashIdx = attemptLayerKey.indexOf("-");
    attemptNum = parseInt(attemptLayerKey.slice(0, dashIdx));
    layerName = attemptLayerKey.slice(dashIdx + 1);
  }

  const selectedAttempt = attemptNum != null ? history.find(ah => ah.attempt === attemptNum) : null;
  const selectedLayerResult = selectedAttempt && layerName ? ahLayers(selectedAttempt)[layerName] : null;

  const drawerMode = attemptLayerKey ? "attempt" : "stage";

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] max-w-[95vw] bg-surface border-l border-line-soft z-40 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft bg-surface-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">{stage.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-ink">{stage.label}</span>
              <span className={cn("text-[9px] px-1.5 py-px rounded font-mono", cfg.bg, cfg.border, cfg.text, "border")}>
                {cfg.label}
              </span>
              {drawerMode === "attempt" && (
                <>
                  <span className="text-ink-mute/50">›</span>
                  <span className="text-[11px] font-mono text-brand">
                    Attempt {attemptNum} · {layerName}
                  </span>
                </>
              )}
            </div>
            <div className="text-[10px] text-ink-mute font-mono mt-0.5">{stage.module}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-ink-mute hover:text-ink text-[20px] leading-none ml-3 shrink-0">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {drawerMode === "stage" && (
          <>
            {/* Perf tiles */}
            {(stage.perf.latency_ms != null || stage.perf.tokens != null || stage.perf.context_score != null) && (
              <div className="flex gap-2 flex-wrap">
                {stage.perf.latency_ms != null && (
                  <div className="rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-center">
                    <div className="text-[10px] text-ink-mute font-mono">latency</div>
                    <div className="text-[18px] font-mono font-semibold text-ink">{Math.round(stage.perf.latency_ms)}ms</div>
                  </div>
                )}
                {stage.perf.tokens != null && (
                  <div className="rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-center">
                    <div className="text-[10px] text-ink-mute font-mono">tokens</div>
                    <div className="text-[18px] font-mono font-semibold text-ink">{stage.perf.tokens}</div>
                  </div>
                )}
                {stage.perf.context_score != null && (
                  <div className="rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-center">
                    <div className="text-[10px] text-ink-mute font-mono">ctx score</div>
                    <div className="text-[18px] font-mono font-semibold text-ink">{Math.round(stage.perf.context_score * 100)}%</div>
                  </div>
                )}
              </div>
            )}

            <DataSection title="Inputs" entries={Object.entries(stage.inputs)} />
            <DataSection title="Outputs" entries={Object.entries(stage.outputs)} />

            {stage.validation && (
              <div className="rounded-lg border border-line-soft bg-surface-2 p-4">
                <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-3">Governance Checks</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold border",
                      stage.validation.consequence === "allow"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : stage.validation.consequence === "block"
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    )}>
                      {stage.validation.consequence.toUpperCase()}
                    </span>
                    {(stage.validation.attempts ?? 1) > 1 && (
                      <span className="text-[10px] px-1.5 py-px rounded bg-amber-500/10 text-amber-400 font-mono">
                        {stage.validation.attempts} attempts
                      </span>
                    )}
                  </div>

                  {stage.validation.checkpoints && (
                    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
                      <div className="px-2.5 py-1.5 border-b border-line-soft bg-surface-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-mute">Checkpoint Detail</span>
                      </div>
                      <div className="px-2.5 py-1">
                        <CheckpointRow label="Shape" cp={stage.validation.checkpoints.shape} />
                        <CheckpointRow label="Context" cp={stage.validation.checkpoints.context} />
                        <CheckpointRow label="Policy" cp={stage.validation.checkpoints.policy} />
                        {stage.validation.checkpoints.hallucination && (
                          <CheckpointRow label="Hallucination" cp={stage.validation.checkpoints.hallucination} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {drawerMode === "attempt" && selectedAttempt && (
          <>
            {/* Attempt summary */}
            <div className={cn(
              "rounded-lg border p-4",
              ahPassed(selectedAttempt)
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-red-500/30 bg-red-500/5"
            )}>
              <div className="text-sm font-semibold text-ink mb-1">
                Attempt {selectedAttempt.attempt} —{" "}
                <span className={ahPassed(selectedAttempt) ? "text-emerald-400" : "text-red-400"}>
                  {ahPassed(selectedAttempt) ? "PASSED" : "FAILED"}
                </span>
              </div>
              {!ahPassed(selectedAttempt) && selectedAttempt.attempt < history.length && (
                <div className="text-[11px] text-amber-400 font-mono mt-1">
                  ↳ Correction prompt injected → attempt {selectedAttempt.attempt + 1}
                </div>
              )}
              {ahPassed(selectedAttempt) && (
                <div className="text-[11px] text-emerald-400/70 font-mono mt-1">
                  ✓ All governance checks passed on this attempt.
                </div>
              )}
            </div>

            {/* Selected layer detail */}
            {selectedLayerResult && layerName && (
              <div className="rounded-lg border border-line-soft bg-surface-2 p-4">
                <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-3">
                  Layer Breakdown — {layerName}
                </div>
                <CheckpointRow
                  label={layerName}
                  cp={{
                    ok: selectedLayerResult.passed !== false && selectedLayerResult.consequence !== "block",
                    issues: selectedLayerResult.issues,
                    violations: selectedLayerResult.violations,
                    confidence: selectedLayerResult.confidence,
                    explanation: selectedLayerResult.explanation,
                  }}
                />
              </div>
            )}

            {/* All layers for this attempt */}
            <div className="rounded-lg border border-line-soft bg-surface-2 p-4">
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-3">
                All Layers — Attempt {selectedAttempt.attempt}
              </div>
              {Object.entries(ahLayers(selectedAttempt)).map(([name, result]) => (
                <CheckpointRow
                  key={name}
                  label={name}
                  cp={{
                    ok: result.passed !== false && result.consequence !== "block",
                    issues: result.issues,
                    violations: result.violations,
                    confidence: result.confidence,
                    explanation: result.explanation,
                  }}
                />
              ))}
            </div>

            {/* Stage outputs */}
            <DataSection title="Stage Outputs" entries={Object.entries(stage.outputs)} />
            <DataSection title="Stage Inputs" entries={Object.entries(stage.inputs)} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Lead index sidebar ────────────────────────────────────────────────────────

function LeadIndexSidebar({
  items, selectedId, onSelect, loading,
}: {
  items: LineageIndexItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="w-60 shrink-0 flex flex-col gap-1.5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute px-1 mb-1.5">Lead Runs</div>

      {loading && <div className="text-[11px] text-ink-mute px-1">Loading…</div>}
      {!loading && items.length === 0 && (
        <div className="text-[11px] text-ink-mute px-1 leading-relaxed">
          No runs yet.{" "}
          <span className="font-mono bg-surface-2 px-1 rounded text-[10px]">POST /outreach/generate</span>
          {" "}to create one.
        </div>
      )}

      {items.map(item => {
        const isSel = selectedId === item.lead_id;
        const dotColor =
          item.decision === "approved" ? "bg-emerald-400"
          : item.decision === "flagged" ? "bg-amber-400"
          : "bg-ink-mute/30";
        const stripColor =
          item.decision === "approved" ? "bg-emerald-500"
          : item.decision === "flagged" ? "bg-amber-500"
          : "bg-surface-2";
        return (
          <button
            key={item.lead_id}
            onClick={() => onSelect(item.lead_id)}
            className={cn(
              "w-full text-left rounded-xl border px-3 py-2.5 transition-all overflow-hidden",
              isSel
                ? "border-brand bg-brand/5 ring-1 ring-brand/30 shadow-sm shadow-brand/10"
                : "border-line-soft bg-surface hover:border-brand/30",
            )}
          >
            <div className={cn("h-0.5 w-full rounded-full mb-2", stripColor)} />
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />
              <span className={cn(
                "text-[10px] font-mono",
                item.decision === "approved" ? "text-emerald-400"
                : item.decision === "flagged" ? "text-amber-400"
                : "text-ink-mute",
              )}>
                {item.decision}
              </span>
              <span className="text-[9px] text-ink-mute font-mono ml-auto">
                {item.timestamp?.slice(5, 16).replace("T", " ")}
              </span>
            </div>
            <div className="text-[10px] font-mono text-ink-mute truncate">{item.lead_id}</div>
            {item.subject && (
              <div className="text-[10px] text-ink-2 truncate mt-0.5 italic opacity-70">{item.subject}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PipelineLineagePage() {
  const [selectedLeadId, setSelectedLeadId]       = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId]     = useState<string | null>(null);
  const [selectedAttemptLayer, setSelectedAttemptLayer] = useState<string | null>(null);
  const [openSubgraphs, setOpenSubgraphs]         = useState<Set<string>>(new Set());

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
  const selectedStage = lineage?.stages.find(s => s.id === selectedStageId) ?? null;
  const stageHistory = (selectedStage?.validation?.attempt_history ?? []) as AttemptHistoryItem[];

  function handleSelectLead(id: string) {
    setSelectedLeadId(id);
    setSelectedStageId(null);
    setSelectedAttemptLayer(null);
    setOpenSubgraphs(new Set());
  }

  function handleSelectStage(id: string) {
    if (selectedStageId === id) {
      setSelectedStageId(null);
      setSelectedAttemptLayer(null);
    } else {
      setSelectedStageId(id);
      setSelectedAttemptLayer(null);
    }
  }

  function handleSelectStageForLayer(id: string) {
    setSelectedStageId(id);
  }

  function handleToggleSubgraph(id: string) {
    setOpenSubgraphs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const drawerOpen = !!selectedStage;

  return (
    <div className="flex flex-col min-h-screen bg-canvas">
      <Topbar breadcrumb="Observability" title="Pipeline Lineage — DAG View" />

      <main className="flex-1 flex p-6 gap-6 max-w-[1800px]">

        {/* Left: Lead index */}
        <LeadIndexSidebar
          items={indexQuery.data ?? []}
          selectedId={selectedLeadId}
          onSelect={handleSelectLead}
          loading={indexQuery.isLoading}
        />

        {/* Right: DAG */}
        <div className={cn(
          "flex-1 min-w-0 space-y-4 transition-all duration-200",
          drawerOpen && "mr-[488px]",
        )}>
          {!selectedLeadId && (
            <div className="flex flex-col items-center justify-center py-28 text-ink-mute gap-4">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-20">
                <rect x="2" y="22" width="18" height="20" rx="3" stroke="currentColor" strokeWidth="2"/>
                <rect x="23" y="12" width="18" height="20" rx="3" stroke="currentColor" strokeWidth="2"/>
                <rect x="23" y="32" width="18" height="20" rx="3" stroke="currentColor" strokeWidth="2"/>
                <rect x="44" y="22" width="18" height="20" rx="3" stroke="currentColor" strokeWidth="2"/>
                <line x1="20" y1="32" x2="23" y2="22" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="20" y1="32" x2="23" y2="42" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="41" y1="22" x2="44" y2="32" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="41" y1="42" x2="44" y2="32" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span className="text-sm">Select a lead run from the sidebar to visualise its pipeline DAG</span>
            </div>
          )}

          {selectedLeadId && lineageQuery.isLoading && (
            <div className="flex items-center justify-center py-24 text-ink-mute">
              <span className="text-sm font-mono animate-pulse">Building DAG…</span>
            </div>
          )}

          {lineage && !lineageQuery.isLoading && (
            <>
              <LeadHeader lineage={lineage} />

              {lineage.has_data ? (
                <DAGCanvas
                  lineage={lineage}
                  selectedStageId={selectedStageId}
                  selectedAttemptLayer={selectedAttemptLayer}
                  openSubgraphs={openSubgraphs}
                  onSelectStage={handleSelectStage}
                  onSelectStageForLayer={handleSelectStageForLayer}
                  onToggleSubgraph={handleToggleSubgraph}
                  onSelectAttemptLayer={setSelectedAttemptLayer}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-ink-mute gap-3">
                  <span className="text-4xl opacity-30">🗂️</span>
                  <span className="text-sm">No pipeline data found for this lead.</span>
                </div>
              )}

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-[10px] text-ink-mute font-mono px-1">
                <span className="font-semibold text-ink-2 text-[11px]">Legend</span>
                {[
                  { color: "bg-emerald-500", label: "success" },
                  { color: "bg-amber-500",   label: "flagged" },
                  { color: "bg-red-500",     label: "blocked" },
                  { color: "bg-surface-2 border border-line-soft", label: "no data" },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className={cn("w-2.5 h-1.5 rounded-sm", color)} />
                    {label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] border border-dashed border-brand/30 px-1 rounded text-brand/50">⟳</span>
                  auto-correction subgraph
                </span>
                <span className="flex items-center gap-1.5 ml-2">
                  <span className="text-brand/50">▶</span>
                  click node to inspect inputs / outputs / validation
                </span>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Backdrop + detail drawer */}
      {drawerOpen && selectedStage && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
            onClick={() => { setSelectedStageId(null); setSelectedAttemptLayer(null); }}
          />
          <DetailDrawer
            stage={selectedStage}
            attemptLayerKey={selectedAttemptLayer}
            history={stageHistory}
            onClose={() => { setSelectedStageId(null); setSelectedAttemptLayer(null); }}
          />
        </>
      )}
    </div>
  );
}
