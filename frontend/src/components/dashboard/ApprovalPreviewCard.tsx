import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { cn, formatRelativeTime } from "../../lib/utils";

export function ApprovalPreviewCard() {
  const { data: items = [] } = useQuery({
    queryKey: ["approvalQueue"],
    queryFn: api.approvalQueue,
  });

  const preview = items.slice(0, 2);

  return (
    <div className="card-base">
      <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
        <div className="text-display-md font-semibold text-ink">
          Pending <span className="text-brand">Approvals</span>
        </div>
        <Link to="/approval" className="label-mono hover:text-ink">
          {items.length} awaiting review →
        </Link>
      </div>
      <div className="p-5 flex flex-col gap-2.5">
        {preview.map((item) => (
          <div
            key={item.event_id}
            className={cn(
              "bg-surface rounded-md p-4 border border-line-soft border-l-[3px]",
              item.risk_level === "high" ? "border-l-danger" : "border-l-gold",
            )}
          >
            <div className="flex justify-between items-center mb-2.5">
              <div className="flex gap-2 items-center">
                <span
                  className={cn(
                    "font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded font-semibold",
                    item.risk_level === "high"
                      ? "bg-danger-tint text-danger"
                      : "bg-gold-tint text-gold-dark",
                  )}
                >
                  {item.risk_level === "high" ? "High Risk" : "Med Risk"}
                </span>
                <span className="text-[13px] font-medium text-ink">
                  {item.lead_name}
                </span>
                <span className="text-[11px] text-ink-2 font-mono">
                  · {item.lead_title} @ {item.company_name}
                </span>
              </div>
              <span className="label-mono">
                {formatRelativeTime(item.timestamp)}
              </span>
            </div>
            <div className="text-xs text-ink-2 leading-relaxed p-2.5 bg-surface-2 rounded border border-line-soft mb-2.5">
              "{item.content_snippet}"
            </div>
            <div className="text-[11px] text-ink-mute font-mono mb-2.5">
              ⚠ Reason: {item.trigger}
            </div>
            <div className="flex gap-2">
              <button className="px-2.5 py-1 rounded text-[11px] font-medium bg-brand text-white">
                Approve & Send
              </button>
              <button className="px-2.5 py-1 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line">
                Edit Draft
              </button>
              <button className="px-2.5 py-1 rounded text-[11px] font-medium text-danger border border-line bg-transparent">
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
