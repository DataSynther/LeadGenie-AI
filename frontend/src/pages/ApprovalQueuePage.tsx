import { useQuery } from "@tanstack/react-query";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { GovStatCard } from "../components/approval/GovStatCard";
import { ApprovalItem } from "../components/approval/ApprovalItem";
import { api } from "../lib/api";

export function ApprovalQueuePage() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["approvalQueue"],
    queryFn: api.approvalQueue,
    refetchInterval: 15_000,
  });

  const failedCount  = items.filter(i => !i.governance_passed).length;
  const passedCount  = items.filter(i => i.governance_passed).length;
  const retriedCount = items.filter(i => i.total_attempts > 1).length;
  const highRisk     = items.filter(i => i.risk_level === "high").length;

  return (
    <>
      <Topbar
        breadcrumb="Governance / Approval Queue"
        title={<>Outreach <em className="text-brand italic">Queue</em></>}
        right={
          <>
            <StatusPill tone={failedCount > 0 ? "danger" : "brand"}>
              {items.length} pending
            </StatusPill>
            {failedCount > 0 && (
              <StatusPill tone="danger">{failedCount} governance failed</StatusPill>
            )}
          </>
        }
      />

      <div className="p-8 pb-20">
        <div className="grid grid-cols-4 gap-3.5 mb-6">
          <GovStatCard label="Awaiting review"  value={items.length}    tone="brand" />
          <GovStatCard label="Governance failed" value={failedCount}     tone="danger" />
          <GovStatCard label="Passed (queued)"   value={passedCount}     tone="brand" />
          <GovStatCard label="Required retry"    value={retriedCount}    tone="gold" />
        </div>

        <div className="card-base">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <div className="font-serif text-display-md text-ink">
              All emails awaiting your <em className="text-brand italic">approval</em>
            </div>
            <div className="flex items-center gap-3">
              {highRisk > 0 && (
                <span className="text-[11px] font-mono text-danger">{highRisk} high-risk</span>
              )}
              <div className="label-mono">Sorted by risk score</div>
            </div>
          </div>

          <div className="p-5">
            {isLoading && (
              <div className="py-12 text-center text-ink-mute text-sm animate-pulse">
                Loading queue…
              </div>
            )}

            {!isLoading && items.length === 0 && (
              <div className="py-12 text-center text-ink-mute text-sm">
                <div className="text-2xl mb-2">✓</div>
                Queue is empty. Generate outreach from the Pipeline page to populate it.
              </div>
            )}

            {!isLoading && items.length > 0 && (
              <div>
                {/* Failed governance items first */}
                {failedCount > 0 && (
                  <div className="mb-4">
                    <div className="label-mono mb-2 text-red-400">⚠ Governance failed — requires review</div>
                    {items
                      .filter(i => !i.governance_passed)
                      .map(item => (
                        <ApprovalItem key={item.event_id} item={item} />
                      ))}
                  </div>
                )}

                {/* Passed items */}
                {passedCount > 0 && (
                  <div>
                    {failedCount > 0 && (
                      <div className="label-mono mb-2 text-emerald-400">✓ Passed governance — ready to send</div>
                    )}
                    {items
                      .filter(i => i.governance_passed)
                      .map(item => (
                        <ApprovalItem key={item.event_id} item={item} />
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
