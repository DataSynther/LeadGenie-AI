import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Unlock, CheckCircle, Clock, XCircle, Users } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { api } from "../lib/api";

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone: "brand" | "emerald" | "amber" | "danger" | "neutral";
}) {
  const colors = {
    brand:   "bg-brand-soft text-brand border-brand/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    amber:   "bg-amber-500/10 text-amber-500 border-amber-500/20",
    danger:  "bg-danger/10 text-danger border-danger/20",
    neutral: "bg-surface-2 text-ink border-line",
  };
  return (
    <div className="card-base p-5 flex items-start gap-4">
      <div className={`p-2 rounded-lg border ${colors[tone]}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div>
        <div className="text-2xl font-semibold text-ink tabular-nums">{value}</div>
        <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-ink-mute mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function decisionBadge(decision?: string, status?: string) {
  if (decision === "APPROVE" || status === "EXECUTED")
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">APPROVED</span>;
  if (decision === "DEFER" || status === "DEFERRED")
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">DEFERRED</span>;
  if (decision === "BLOCK" || status === "BLOCKED")
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-danger/10 text-danger border border-danger/20">BLOCKED</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-surface-2 text-ink-mute border border-line">{status ?? "—"}</span>;
}

export function GovernanceDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["contactAudit"],
    queryFn: () => api.contactAudit(200),
    refetchInterval: 30_000,
  });

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Governance"
        title={<>Contact <span className="text-brand font-semibold">Governance</span></>}
        right={<span className="label-mono hidden sm:block">MCP Access Control</span>}
      />

      <div className="p-4 sm:p-8 pb-20 space-y-8">
        {isLoading && (
          <div className="py-20 text-center text-ink-mute text-sm font-mono animate-pulse">
            Loading audit data…
          </div>
        )}
        {isError && (
          <div className="py-20 text-center text-danger text-sm">
            Failed to load governance data.
          </div>
        )}

        {data && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total Reveals"  value={data.total_reveals} icon={Unlock}      tone="brand"   />
              <StatCard label="Approved"        value={data.approved}      icon={CheckCircle}  tone="emerald" />
              <StatCard label="Deferred"        value={data.deferred}      icon={Clock}        tone="amber"   />
              <StatCard label="Blocked"         value={data.blocked}       icon={XCircle}      tone="danger"  />
            </div>

            {/* By-user breakdown */}
            {Object.keys(data.by_user).length > 0 && (
              <div className="card-base">
                <div className="px-5 py-4 border-b border-line-soft flex items-center gap-2">
                  <Users size={14} className="text-brand" />
                  <span className="text-display-md font-semibold text-ink">Reveals by User</span>
                </div>
                <div className="divide-y divide-line-soft">
                  {Object.entries(data.by_user)
                    .sort(([, a], [, b]) => b - a)
                    .map(([user, count]) => (
                      <div key={user} className="px-5 py-3 flex items-center justify-between">
                        <span className="font-mono text-[12px] text-ink">{user}</span>
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-brand-soft text-brand border border-brand/20">
                          {count} reveal{count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Recent events table */}
            <div className="card-base">
              <div className="px-5 py-4 border-b border-line-soft flex items-center gap-2">
                <ShieldCheck size={14} className="text-brand" />
                <span className="text-display-md font-semibold text-ink">Recent Reveal Events</span>
              </div>
              {data.recent_events.length === 0 ? (
                <div className="py-12 text-center text-ink-mute text-sm">No reveal events yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-xs">
                    <thead>
                      <tr>
                        {["Request ID", "User", "Lead ID", "Decision", "Timestamp", "Reason"].map((h) => (
                          <th
                            key={h}
                            className="text-left px-5 py-3.5 bg-surface-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink font-medium border-b border-line-soft"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_events.map((ev) => (
                        <tr key={ev.request_id} className="hover:bg-surface-2 transition-colors">
                          <td className="px-5 py-3.5 border-b border-line-soft font-mono text-[10px] text-ink-mute">
                            {ev.request_id}
                          </td>
                          <td className="px-5 py-3.5 border-b border-line-soft text-ink font-mono text-[11px]">
                            {ev.user_id}
                          </td>
                          <td className="px-5 py-3.5 border-b border-line-soft text-ink-mute font-mono text-[10px]">
                            {ev.lead_id || "—"}
                          </td>
                          <td className="px-5 py-3.5 border-b border-line-soft">
                            {decisionBadge(ev.decision, ev.status)}
                          </td>
                          <td className="px-5 py-3.5 border-b border-line-soft font-mono text-[10px] text-ink-mute">
                            {new Date(ev.timestamp).toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 border-b border-line-soft text-[11px] text-ink-mute max-w-[200px] truncate">
                            {ev.block_reason || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
