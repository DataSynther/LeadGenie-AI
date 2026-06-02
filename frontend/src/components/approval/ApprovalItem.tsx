import { useState } from "react";
import { cn, formatRelativeTime } from "../../lib/utils";
import type { ApprovalItem as ApprovalItemType, ValidatorCheckpoints, CitationEntry2 } from "../../lib/api";

interface ApprovalItemProps {
  item: ApprovalItemType;
  onApprove?: (eventId: string) => void;
  onReject?: (eventId: string) => void;
  onEdit?: (eventId: string) => void;
}

// ── Checkpoint row ─────────────────────────────────────────────────────────

function CheckpointRow({ label, cp }: { label: string; cp: { ok: boolean; issues?: string[]; violations?: string[]; confidence?: number; explanation?: string } }) {
  const allIssues = [...(cp.issues ?? []), ...(cp.violations ?? [])];
  return (
    <div className="py-1.5 border-b border-line-soft last:border-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className={cn(
          "inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded",
          cp.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        )}>
          {cp.ok ? "✓" : "✗"} {label}
        </span>
        {cp.confidence != null && (
          <span className="text-[10px] text-ink-mute font-mono">conf {Math.round(cp.confidence * 100)}%</span>
        )}
      </div>
      {allIssues.length > 0 && (
        <div className="mt-1 space-y-0.5 pl-2">
          {allIssues.map((iss, i) => (
            <div key={i} className="text-[10px] text-red-300 font-mono leading-snug">⚠ {iss}</div>
          ))}
        </div>
      )}
      {cp.explanation && (
        <div className="mt-0.5 pl-2 text-[10px] text-ink-mute leading-snug">{cp.explanation}</div>
      )}
    </div>
  );
}

// ── Checkpoints panel ─────────────────────────────────────────────────────

function CheckpointsPanel({ checkpoints }: { checkpoints: ValidatorCheckpoints }) {
  const allPassed = checkpoints.shape.ok && checkpoints.context.ok && checkpoints.policy.ok && (checkpoints.hallucination?.ok ?? true);
  return (
    <div className="mt-2.5 rounded border border-line-soft bg-surface-2 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-line-soft bg-surface flex items-center gap-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-mute">Validator Checkpoints</span>
        <span className={cn("text-[9px] px-1.5 py-px rounded font-mono", allPassed ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
          {allPassed ? "all passed" : "failed — flagged for review"}
        </span>
      </div>
      <div className="px-3 py-1">
        <CheckpointRow label="Shape" cp={checkpoints.shape} />
        <CheckpointRow label="Context" cp={checkpoints.context} />
        <CheckpointRow label="Policy" cp={checkpoints.policy} />
        {checkpoints.hallucination && (
          <CheckpointRow label="Hallucination" cp={checkpoints.hallucination} />
        )}
      </div>
    </div>
  );
}

// ── Citations panel ───────────────────────────────────────────────────────

const SOURCE_TAG: Record<string, string> = {
  "Apollo People API":               "bg-blue-500/10 text-blue-300",
  "Apollo Company API":              "bg-blue-500/10 text-blue-300",
  "Apollo Signals API":              "bg-blue-500/10 text-blue-300",
  "Research Agent (AI-generated)":   "bg-purple-500/10 text-purple-300",
  "Research Agent (industry comparison)": "bg-purple-500/10 text-purple-300",
  "Research Agent":                  "bg-purple-500/10 text-purple-300",
  "LeadGenie product capability":    "bg-brand/10 text-brand",
};

function sourceClass(source: string) {
  return SOURCE_TAG[source] ?? (
    source.toLowerCase().includes("unknown") || source.toLowerCase().includes("hallucinated") || source.toLowerCase().includes("unverified")
      ? "bg-red-500/10 text-red-300"
      : "bg-surface-2 text-ink-mute"
  );
}

function CitationsPanel({ citations }: { citations: Record<string, CitationEntry2> }) {
  return (
    <div className="mt-2 rounded border border-line-soft bg-surface-2 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-line-soft bg-surface">
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-mute">Source Citations</span>
      </div>
      <div className="divide-y divide-line-soft">
        {Object.entries(citations).map(([key, cit]) => (
          <div key={key} className="px-3 py-1.5 flex items-start gap-2.5">
            <span className="font-mono text-[10px] text-ink-mute w-28 shrink-0 truncate pt-0.5">{key}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-ink-2 leading-snug truncate">
                {Array.isArray(cit.value)
                  ? cit.value.join(", ")
                  : String(cit.value ?? "—")}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={cn("text-[9px] px-1.5 py-px rounded font-mono", sourceClass(cit.source))}>
                  {cit.source}
                </span>
                <span className="text-[9px] text-ink-mute font-mono">{cit.field}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ApprovalItem({ item, onApprove, onReject, onEdit }: ApprovalItemProps) {
  const [acting, setActing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const isHigh = item.risk_level === "high";

  function handle(action: "approve" | "reject") {
    setActing(true);
    if (action === "approve") onApprove?.(item.event_id);
    if (action === "reject") onReject?.(item.event_id);
  }

  if (acting) return null;

  const failedCheckpointCount = item.checkpoints
    ? Object.values(item.checkpoints).filter((cp) => cp && !cp.ok).length
    : 0;

  return (
    <div
      className={cn(
        "bg-surface rounded-md p-4 border border-line-soft border-l-[3px] mb-2.5",
        isHigh ? "border-l-danger" : "border-l-gold"
      )}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex gap-2 items-center">
          <span className={cn(
            "font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded font-semibold",
            isHigh ? "bg-danger-tint text-danger" : "bg-gold-tint text-gold-dark"
          )}>
            {isHigh ? "High Risk" : "Med Risk"}
          </span>
          <span className="text-[13px] font-medium text-ink">{item.lead_name}</span>
          <span className="text-[11px] text-ink-2 font-mono">
            · {item.lead_title} @ {item.company_name}
          </span>
        </div>
        <span className="label-mono">{formatRelativeTime(item.timestamp)}</span>
      </div>

      {/* Email snippet */}
      <div className="text-xs text-ink-2 leading-relaxed p-2.5 bg-surface-2 rounded border border-line-soft mb-2.5">
        "{item.content_snippet}"
      </div>

      {/* Trigger / policy / confidence */}
      <div className="text-[11px] text-ink-mute font-mono mb-2.5 flex items-center gap-1.5 flex-wrap">
        <span>⚠ TRIGGER:</span>
        <span className="text-ink-2">{item.trigger}</span>
        <span>· POLICY:</span>
        <span className="text-ink-2">{item.policy}</span>
        <span>· CONF:</span>
        <span className="text-ink-2">{Math.round(item.confidence * 100)}%</span>
        {failedCheckpointCount > 0 && (
          <span className="ml-auto text-red-400">{failedCheckpointCount} check{failedCheckpointCount > 1 ? "s" : ""} failed</span>
        )}
      </div>

      {/* Expandable detail: checkpoints + citations */}
      {(item.checkpoints || item.citations) && (
        <>
          <button
            onClick={() => setShowDetail((v) => !v)}
            className="text-[10px] font-mono text-ink-mute hover:text-ink mb-2 flex items-center gap-1"
          >
            {showDetail ? "▲" : "▼"} {showDetail ? "Hide" : "Show"} validator detail &amp; citations
          </button>
          {showDetail && (
            <div className="space-y-2">
              {item.checkpoints && <CheckpointsPanel checkpoints={item.checkpoints} />}
              {item.citations && <CitationsPanel citations={item.citations} />}
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-2.5">
        <button onClick={() => handle("approve")} className="px-2.5 py-1 rounded text-[11px] font-medium bg-brand text-white">
          Approve &amp; Send
        </button>
        <button onClick={() => onEdit?.(item.event_id)} className="px-2.5 py-1 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line">
          Edit Draft
        </button>
        <button onClick={() => handle("reject")} className="px-2.5 py-1 rounded text-[11px] font-medium text-danger border border-line bg-transparent">
          Reject
        </button>
        <button className="px-2.5 py-1 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line ml-auto">
          View context
        </button>
      </div>
    </div>
  );
}
