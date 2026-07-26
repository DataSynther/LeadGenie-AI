import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Radar, MapPin, Eye, Clock } from "lucide-react";
import { api, type WebsiteVisitor } from "../../lib/api";
import { CompanyLogo } from "../CompanyLogo";
import { cn } from "../../lib/utils";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function WebsiteVisitorsPanel({ className, limit = 5 }: { className?: string; limit?: number }) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["websiteVisitors"],
    queryFn: api.listWebsiteVisitors,
    refetchInterval: 120_000,
  });

  const visitors = (data?.visitors ?? []).slice(0, limit);
  const configured = data?.leadfeeder_configured ?? true; // avoid a flash of "not configured" before first load

  function openBriefing(v: WebsiteVisitor) {
    if (!v.domain) return;
    navigate(`/kyc?domain=${encodeURIComponent(v.domain)}&name=${encodeURIComponent(v.name || "")}`);
  }

  return (
    <div className={cn("card-base overflow-hidden", className)}>
      <div className="px-4 py-3 border-b border-line-soft flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-mute">
          <Radar size={12} className="text-brand" /> Website Visitors
        </div>
        <span className="text-[9px] font-mono text-ink-mute">Leadfeeder</span>
      </div>

      {isLoading && (
        <div className="px-4 py-6 text-[11px] text-ink-mute text-center">Loading…</div>
      )}

      {!isLoading && !configured && (
        <div className="px-4 py-6 text-[11px] text-ink-mute text-center">
          Not configured yet — add a Leadfeeder API key to see who's visiting your site.
        </div>
      )}

      {!isLoading && configured && visitors.length === 0 && (
        <div className="px-4 py-6 text-[11px] text-ink-mute text-center">
          No tracked visitors in the last 90 days.
        </div>
      )}

      {!isLoading && visitors.length > 0 && (
        <div className="divide-y divide-line-soft">
          {visitors.map(v => (
            <button
              key={v.company_id}
              onClick={() => openBriefing(v)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-surface-2 transition-colors"
            >
              <CompanyLogo domain={v.domain} name={v.name} size={26} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-ink truncate">{v.name || v.domain}</div>
                <div className="flex items-center gap-2 text-[10px] text-ink-mute font-mono mt-0.5">
                  {(v.city || v.country) && (
                    <span className="flex items-center gap-0.5 truncate">
                      <MapPin size={9} /> {[v.city, v.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {v.pageviews != null && (
                    <span className="flex items-center gap-0.5 shrink-0">
                      <Eye size={9} /> {v.pageviews}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-ink-mute">
                <Clock size={9} /> {timeAgo(v.last_visit)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
