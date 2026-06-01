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

export function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: api.dashboardStats,
  });

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
              <StatusPill>6 agents active</StatusPill>
              <button className="btn-ghost">Export</button>
            </div>
            <button className="btn-primary">+ Campaign</button>
          </>
        }
      />

      <div className="p-4 sm:p-8 pb-20">
        {stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-7">
              <KpiCard
                label="Prospects Discovered"
                value={formatNumber(stats.prospects_discovered.value)}
                delta={{ value: `↑ ${stats.prospects_discovered.delta_pct}%` }}
                sub="Past 7 days · 4 active sources"
              />
              <KpiCard
                label="Messages Sent"
                value={formatNumber(stats.messages_sent.value)}
                delta={{ value: `↑ ${stats.messages_sent.delta_pct}%` }}
                sub="Email · LinkedIn · WhatsApp"
              />
              <KpiCard
                label="Reply Rate"
                value={`${stats.reply_rate.value}%`}
                delta={{ value: `↑ ${stats.reply_rate.delta_pct}%` }}
                sub="Industry avg: 4.8%"
              />
              <KpiCard
                label="Meetings Booked"
                value={stats.meetings_booked.value}
                delta={{ value: `↑ ${stats.meetings_booked.delta_abs}` }}
                sub="This week · $2.4M projected pipeline"
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
