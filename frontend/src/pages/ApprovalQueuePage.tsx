import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { GovStatCard } from "../components/approval/GovStatCard";
import { ApprovalItem } from "../components/approval/ApprovalItem";
import { api, type ApprovalItem as ApprovalItemType } from "../lib/api";

function matchesSearch(item: ApprovalItemType, q: string): boolean {
  const lq = q.toLowerCase();
  return (
    item.lead_name.toLowerCase().includes(lq) ||
    item.company_name.toLowerCase().includes(lq) ||
    item.content_snippet.toLowerCase().includes(lq) ||
    (item.email?.subject ?? "").toLowerCase().includes(lq) ||
    (item.email?.body ?? "").toLowerCase().includes(lq) ||
    item.trigger.toLowerCase().includes(lq)
  );
}

export function ApprovalQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam   = searchParams.get("q") ?? "";
  const tabParam = searchParams.get("tab") as "email" | "validation" | "citations" | null;
  const [search, setSearch] = useState(qParam);

  // Sync input when URL param changes (e.g. navigating from dashboard)
  useEffect(() => { setSearch(qParam); }, [qParam]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["approvalQueue"],
    queryFn: api.approvalQueue,
    refetchInterval: 15_000,
  });

  const { data: sentItems = [] } = useQuery({
    queryKey: ["sentEmails"],
    queryFn: api.sentEmails,
    refetchInterval: 10_000,
  });

  const allItems = search
    ? [
        ...items.filter(i => matchesSearch(i, search)),
        ...sentItems.filter(i => matchesSearch(i, search)),
      ]
    : items;

  const displayItems   = search ? allItems : items;
  const failedCount    = items.filter(i => !i.governance_passed).length;
  const passedCount    = items.filter(i => i.governance_passed).length;
  const retriedCount   = items.filter(i => i.total_attempts > 1).length;
  const highRisk       = items.filter(i => i.risk_level === "high").length;
  const sentMatches    = search ? sentItems.filter(i => matchesSearch(i, search)) : [];

  const clearSearch = () => {
    setSearch("");
    setSearchParams({});
  };

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

        {/* ── Search / filter bar ── */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 12a7.5 7.5 0 0012.15 5.65z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search emails by keyword, company, lead…"
              className="w-full pl-8 pr-8 py-2 text-[12px] rounded-lg border border-line-soft bg-surface text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20"
            />
            {search && (
              <button
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink text-[14px] leading-none"
                title="Clear search">
                ×
              </button>
            )}
          </div>
          {search && (
            <span className="text-[11px] text-ink-mute font-mono">
              {displayItems.length + sentMatches.length} match{displayItems.length + sentMatches.length !== 1 ? "es" : ""}
              {sentMatches.length > 0 && <span className="text-brand ml-1">({sentMatches.length} sent)</span>}
            </span>
          )}
        </div>

        {/* ── Active KB filter banner ── */}
        {qParam && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-brand/30 bg-brand/5 text-[11px]">
            <span className="text-[15px]">🔍</span>
            <div>
              <span className="text-brand font-semibold">KB fact:</span>
              <span className="font-mono text-ink ml-1.5">"{qParam}"</span>
              <span className="text-ink-mute ml-1.5">— emails where this fact appears in the generated content are expanded below</span>
            </div>
            <button onClick={clearSearch} className="ml-auto text-ink-mute hover:text-ink transition-colors text-[10px] font-mono flex-shrink-0">
              clear ×
            </button>
          </div>
        )}

        <div className="card-base">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <div className="font-serif text-display-md text-ink">
              {search
                ? <>Emails matching <em className="text-brand italic">"{search}"</em></>
                : <>All emails awaiting your <em className="text-brand italic">approval</em></>}
            </div>
            <div className="flex items-center gap-3">
              {search ? (
                <>
                  <span className="text-[11px] font-mono text-brand">{displayItems.length} queued</span>
                  <span className="text-[11px] font-mono text-emerald-400">{sentMatches.length} sent</span>
                </>
              ) : (
                <>
                  {highRisk > 0 && <span className="text-[11px] font-mono text-danger">{highRisk} high-risk</span>}
                  <div className="label-mono">Sorted by risk score</div>
                </>
              )}
            </div>
          </div>

          {/* ── Default queue view (single scrollable column) ── */}
          {!search && (
            <div className="p-5 overflow-y-auto max-h-[calc(100vh-340px)]">
              {isLoading && (
                <div className="py-12 text-center text-ink-mute text-sm animate-pulse">Loading queue…</div>
              )}
              {!isLoading && items.length === 0 && (
                <div className="py-12 text-center text-ink-mute text-sm">
                  <div className="text-2xl mb-2">✓</div>Queue is empty.
                </div>
              )}
              {!isLoading && failedCount > 0 && (
                <div className="mb-4">
                  <div className="label-mono mb-2 text-red-400">⚠ Governance failed — requires review</div>
                  {items.filter(i => !i.governance_passed).map(item => (
                    <ApprovalItem key={item.event_id} item={item} />
                  ))}
                </div>
              )}
              {!isLoading && passedCount > 0 && (
                <div>
                  {failedCount > 0 && <div className="label-mono mb-2 text-emerald-400">✓ Passed governance — ready to send</div>}
                  {items.filter(i => i.governance_passed).map(item => (
                    <ApprovalItem key={item.event_id} item={item} />
                  ))}
                </div>
              )}
              {!isLoading && sentItems.length > 0 && (
                <div className="mt-6 pt-4 border-t border-line-soft">
                  <div className="label-mono mb-2 text-emerald-400">✓ Recently sent ({sentItems.slice(0, 5).length})</div>
                  {sentItems.slice(0, 5).map(item => (
                    <ApprovalItem key={item.event_id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Search results: two aligned scrollable columns ── */}
          {search && (
            <div className="grid grid-cols-2 divide-x divide-line-soft" style={{ height: "calc(100vh - 340px)", minHeight: 400 }}>

              {/* Left: In queue */}
              <div className="flex flex-col min-h-0">
                <div className="px-5 py-2.5 border-b border-line-soft flex items-center gap-2 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-brand flex-shrink-0" />
                  <span className="label-mono text-brand">In queue</span>
                  <span className="font-mono text-[11px] text-ink-mute ml-auto">{displayItems.length} match{displayItems.length !== 1 ? "es" : ""}</span>
                </div>
                <div className="overflow-y-auto flex-1 p-4">
                  {isLoading && <div className="py-8 text-center text-ink-mute text-sm animate-pulse">Loading…</div>}
                  {!isLoading && displayItems.length === 0 && (
                    <div className="py-12 text-center text-ink-mute text-sm">No queued emails match this term.</div>
                  )}
                  {!isLoading && displayItems.map(item => (
                    <ApprovalItem
                      key={item.event_id}
                      item={item}
                      initialExpanded
                      initialTab={tabParam ?? "email"}
                      highlight={search}
                    />
                  ))}
                </div>
              </div>

              {/* Right: Already sent */}
              <div className="flex flex-col min-h-0">
                <div className="px-5 py-2.5 border-b border-line-soft flex items-center gap-2 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="label-mono text-emerald-400">Already sent</span>
                  <span className="font-mono text-[11px] text-ink-mute ml-auto">{sentMatches.length} match{sentMatches.length !== 1 ? "es" : ""}</span>
                </div>
                <div className="overflow-y-auto flex-1 p-4">
                  {sentMatches.length === 0 && (
                    <div className="py-12 text-center text-ink-mute text-sm">No sent emails match this term.</div>
                  )}
                  {sentMatches.map(item => (
                    <ApprovalItem
                      key={item.event_id}
                      item={item}
                      initialExpanded
                      initialTab={tabParam ?? "email"}
                      highlight={search}
                    />
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
