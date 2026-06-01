import { useState } from "react";
import { cn, formatRelativeTime } from "../../lib/utils";
import type { ApprovalItem as ApprovalItemType } from "../../lib/api";

interface ApprovalItemProps {
  item: ApprovalItemType;
  onApprove?: (eventId: string) => void;
  onReject?: (eventId: string) => void;
  onEdit?: (eventId: string) => void;
}

export function ApprovalItem({ item, onApprove, onReject, onEdit }: ApprovalItemProps) {
  const [acting, setActing] = useState(false);
  const isHigh = item.risk_level === "high";

  function handle(action: "approve" | "reject") {
    setActing(true);
    if (action === "approve") onApprove?.(item.event_id);
    if (action === "reject") onReject?.(item.event_id);
  }

  if (acting) return null;

  return (
    <div
      className={cn(
        "bg-surface rounded-md p-4 border border-line-soft border-l-[3px] mb-2.5",
        isHigh ? "border-l-danger" : "border-l-gold"
      )}
    >
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex gap-2 items-center">
          <span
            className={cn(
              "font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded font-semibold",
              isHigh ? "bg-danger-tint text-danger" : "bg-gold-tint text-gold-dark"
            )}
          >
            {isHigh ? "High Risk" : "Med Risk"}
          </span>
          <span className="text-[13px] font-medium text-ink">{item.lead_name}</span>
          <span className="text-[11px] text-ink-2 font-mono">
            · {item.lead_title} @ {item.company_name}
          </span>
        </div>
        <span className="label-mono">{formatRelativeTime(item.timestamp)}</span>
      </div>

      <div className="text-xs text-ink-2 leading-relaxed p-2.5 bg-surface-2 rounded border border-line-soft mb-2.5">
        "{item.content_snippet}"
      </div>

      <div className="text-[11px] text-ink-mute font-mono mb-2.5">
        ⚠ TRIGGER: <span className="text-ink-2">{item.trigger}</span> · POLICY: <span className="text-ink-2">{item.policy}</span> · CONFIDENCE: <span className="text-ink-2">{Math.round(item.confidence * 100)}%</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handle("approve")}
          className="px-2.5 py-1 rounded text-[11px] font-medium bg-brand text-white"
        >
          Approve & Send
        </button>
        <button
          onClick={() => onEdit?.(item.event_id)}
          className="px-2.5 py-1 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line"
        >
          Edit Draft
        </button>
        <button
          onClick={() => handle("reject")}
          className="px-2.5 py-1 rounded text-[11px] font-medium text-danger border border-line bg-transparent"
        >
          Reject
        </button>
        <button className="px-2.5 py-1 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line ml-auto">
          View context
        </button>
      </div>
    </div>
  );
}
