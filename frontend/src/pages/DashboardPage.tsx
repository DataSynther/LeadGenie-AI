import { useQuery } from "@tanstack/react-query";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { KpiCard } from "../components/dashboard/KpiCard";
import { FunnelCard } from "../components/dashboard/FunnelCard";
import { AgentFeedCard } from "../components/dashboard/AgentFeedCard";
import { ApprovalPreviewCard } from "../components/dashboard/ApprovalPreviewCard";
import { RiskDistributionCard } from "../components/dashboard/RiskDistributionCard";
import { api } from "../lib/api";
import { formatNumber } from "../lib/utils";

function DeltaLabel({ value, direction }: { value: number; direction?: "up" | "down" }) {
  if (value === 0) return null;
  const arrow = direction === "down" ? "↓" : value >= 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(value)}%`;
}

export function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: api.dashboardStats,
    refetchInterval: 30_000,
  });

  const empty = !stats || stats.messages_sent.value === 0;

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Dashboard"
        title={
          <>
            Mission <em className="text-brand italic">Control</em>
          </>
        }
        right={
          <>
            <div className="hidden sm:flex items-center gap-2.5">
              <StatusPill>{isLoading ? "loading…" : empty ? "no data yet" : "live"}</StatusPill>
              <button className="btn-ghost">Export</button>
            </div>
            <button className="btn-primary">+ Campaign</button>
          </>
        }
      />

      <div className="p-4 sm:p-8 pb-20">
        {isLoading && (
          <div className="text-ink-mute text-sm py-12 text-center">Loading dashboard…</div>
        )}

        {!isLoading && stats && (
          <>
            {empty && (
              <div className="mb-6 px-4 py-3 rounded-lg border border-line-soft bg-surface text-xs text-ink-2">
                No outreach has been generated yet — KPIs will populate after the first email is sent.
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-7">
              <KpiCard
                label="Prospects Discovered"
                value={formatNumber(stats.prospects_discovered.value)}
                delta={stats.prospects_discovered.delta_pct !== 0 ? {
                  value: `${stats.prospects_discovered.delta_pct >= 0 ? "↑" : "↓"} ${Math.abs(stats.prospects_discovered.delta_pct)}%`,
                  direction: stats.prospects_discovered.delta_pct < 0 ? "down" : "up",
                } : undefined}
                sub="Past 7 days"
              />
              <KpiCard
                label="Messages Sent"
                value={formatNumber(stats.messages_sent.value)}
                delta={stats.messages_sent.delta_pct !== 0 ? {
                  value: `${stats.messages_sent.delta_pct >= 0 ? "↑" : "↓"} ${Math.abs(stats.messages_sent.delta_pct)}%`,
                  direction: stats.messages_sent.delta_pct < 0 ? "down" : "up",
                } : undefined}
                sub="Past 7 days"
              />
              <KpiCard
                label="Reply Rate"
                value={`${stats.reply_rate.value}%`}
                delta={stats.reply_rate.delta_pct !== 0 ? {
                  value: `${stats.reply_rate.delta_pct >= 0 ? "↑" : "↓"} ${Math.abs(stats.reply_rate.delta_pct)}%`,
                  direction: stats.reply_rate.delta_pct < 0 ? "down" : "up",
                } : undefined}
                sub="Industry avg: 4.8%"
              />
              <KpiCard
                label="Meetings Booked"
                value={stats.meetings_booked.value}
                delta={stats.meetings_booked.delta_abs !== 0 ? {
                  value: `${stats.meetings_booked.delta_abs >= 0 ? "↑" : "↓"} ${Math.abs(stats.meetings_booked.delta_abs)}`,
                  direction: stats.meetings_booked.delta_abs < 0 ? "down" : "up",
                } : undefined}
                sub="Past 7 days"
                gold
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 mb-5">
              <FunnelCard rows={stats.funnel} />
              <AgentFeedCard />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ApprovalPreviewCard />
              <RiskDistributionCard />
            </div>
          </>
        )}
      </div>
    </>
  );
}
