import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { GovStatCard } from "../components/approval/GovStatCard";
import { ApprovalItem } from "../components/approval/ApprovalItem";
import { api } from "../lib/api";

export function ApprovalQueuePage() {
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["approvalQueue"],
    queryFn: api.approvalQueue,
  });

  function removeItem(eventId: string) {
    queryClient.setQueryData(["approvalQueue"], (old: any[] = []) =>
      old.filter((i) => i.event_id !== eventId)
    );
  }

  return (
    <>
      <Topbar
        breadcrumb="Governance / Approval Queue"
        title={<>Approval <em className="text-brand italic">Queue</em></>}
        right={
          <>
            <StatusPill tone="danger">{items.length} awaiting</StatusPill>
            <button className="btn-ghost">Bulk Approve Low</button>
          </>
        }
      />

      <div className="p-8 pb-20">
        <div className="grid grid-cols-4 gap-3.5 mb-6">
          <GovStatCard label="Pending" value={items.length} tone="danger" />
          <GovStatCard label="Approved today" value={23} tone="brand" />
          <GovStatCard label="Avg response" value="4m" />
          <GovStatCard label="Auto-blocked" value={12} tone="gold" />
        </div>

        <div className="card-base">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <div className="font-serif text-display-md text-ink">
              Awaiting your <em className="text-brand italic">review</em>
            </div>
            <div className="label-mono">Sorted by risk, then age</div>
          </div>
          <div className="p-5">
            {items.length === 0 && (
              <div className="py-12 text-center text-ink-mute text-sm">
                🎉 No items awaiting review. All clear.
              </div>
            )}
            {items.map((item) => (
              <ApprovalItem
                key={item.event_id}
                item={item}
                onApprove={removeItem}
                onReject={removeItem}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
