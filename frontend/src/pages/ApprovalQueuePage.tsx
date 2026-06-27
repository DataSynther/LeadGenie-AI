import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { ApprovalItem as ApprovalItemComponent } from "../components/approval/ApprovalItem";
import { api, type ApprovalItem as ApprovalItemType, type FollowupDraft } from "../lib/api";
import { cn } from "../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type QueueTab = "outreach" | "replied" | "followup";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const RISK_C: Record<string, { text: string; bg: string }> = {
  high:   { text: "text-red-400",     bg: "bg-red-500/10"     },
  medium: { text: "text-amber-500",   bg: "bg-amber-500/10"   },
  low:    { text: "text-emerald-500", bg: "bg-emerald-500/10" },
};

// ── Individual email message (collapsible) ────────────────────────────────────

function EmailMessage({
  from, to, subject, body, date, isInitial, followupNumber, isSent,
}: {
  from: string;
  to?: string;
  subject: string;
  body: string;
  date: string;
  isInitial?: boolean;
  followupNumber?: number;
  isSent?: boolean;
}) {
  const [expanded, setExpanded] = useState(isInitial ?? false);
  const scheduled = followupNumber != null && !isSent;

  return (
    <div className={cn(
      "border rounded-lg mb-3 overflow-hidden transition-opacity",
      isInitial ? "bg-surface shadow-sm border-line-soft" :
      scheduled  ? "bg-surface-2/10 border-line-soft/40 opacity-50" :
                   "bg-surface-2/30 border-line-soft",
    )}>
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-surface-2/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 border",
          isInitial
            ? "bg-brand/10 text-brand border-brand/20"
            : scheduled
              ? "bg-surface-2/50 text-ink-mute border-line-soft/40"
              : "bg-surface-2 text-ink-2 border-line-soft",
        )}>
          {from.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              "text-[12px] truncate",
              scheduled ? "font-normal text-ink-mute" : "font-bold text-ink",
            )}>
              {from}
            </span>
            {isInitial && (
              <span className="text-[9px] font-mono px-1.5 py-px rounded-full bg-brand/10 text-brand font-semibold border border-brand/20">
                Initial
              </span>
            )}
            {followupNumber != null && (
              <span className={cn(
                "text-[9px] font-mono px-1.5 py-px rounded-full font-semibold border",
                scheduled
                  ? "bg-surface-2/30 text-ink-mute border-line-soft/40"
                  : "bg-violet-500/10 text-violet-400 border-violet-500/20",
              )}>
                {scheduled ? `Scheduled: Follow-up #${followupNumber}` : `Follow-up #${followupNumber}`}
              </span>
            )}
            <span className={cn(
              "ml-auto text-[10px] font-mono flex-shrink-0",
              scheduled ? "text-ink-mute/60" : "text-ink-mute",
            )}>
              {date}
            </span>
            <span className={cn("text-ink-mute text-[10px] ml-1 select-none transition-transform duration-150", expanded ? "rotate-180" : "")}>
              ▾
            </span>
          </div>
          <div className={cn(
            "text-[11px] truncate",
            scheduled ? "font-normal text-ink-mute/60" : "font-medium text-ink-2",
          )}>
            {subject}
          </div>
          {!expanded && (
            <div className="text-[10px] text-ink-mute truncate mt-0.5">
              {body.replace(/\n+/g, " ").slice(0, 120)}…
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-5 pt-2 border-t border-line-soft/50">
          {to && (
            <div className="text-[10px] text-ink-mute mb-3 font-mono">To: {to}</div>
          )}
          <div className={cn(
            "text-[12.5px] leading-relaxed whitespace-pre-wrap font-sans",
            scheduled ? "text-ink-mute/70" : "text-ink",
          )}>
            {body}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full email thread (initial + follow-ups) ──────────────────────────────────

function EmailThread({ item }: { item: ApprovalItemType }) {
  const senderName = "LeadGenie AI";
  const recipientEmail = item.lead_email ?? item.lead_name ?? "Lead";
  const sequence: FollowupDraft[] = item.followup_sequence ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-5 py-3.5 border-b border-line-soft flex-shrink-0">
        <div className="text-[13px] font-semibold text-ink truncate mb-1">
          {item.email?.subject ?? "(No subject)"}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[10px] text-ink-mute font-mono">
          <span className="text-ink-2 font-semibold">{item.lead_name}</span>
          <span>·</span>
          <span className="text-brand">{item.company_name}</span>
          {item.lead_title && <><span>·</span><span>{item.lead_title}</span></>}
          {item.lead_email && <><span>·</span><span>{item.lead_email}</span></>}
        </div>
      </div>

      {/* Scrollable email messages */}
      <div className="flex-1 overflow-y-auto p-5 min-h-0">
        <EmailMessage
          from={senderName}
          to={recipientEmail}
          subject={item.email?.subject ?? "(No subject)"}
          body={item.email?.body ?? ""}
          date={fmtDate(item.timestamp)}
          isInitial
        />

        {sequence.map((fu) => {
          const sent = fu.sent_at != null;
          return (
            <EmailMessage
              key={fu.number}
              from={senderName}
              to={recipientEmail}
              subject={fu.subject ?? `Re: ${item.email?.subject ?? ""}`}
              body={fu.body ?? ""}
              date={sent
                ? fmtDate(fu.sent_at!)
                : fu.delay_seconds != null
                  ? `In ${fu.delay_seconds}s`
                  : `Day +${fu.delay_days ?? fu.number * 3}`
              }
              followupNumber={fu.number}
              isSent={sent}
            />
          );
        })}

        {sequence.length === 0 && (
          <div className="text-center text-[11px] text-ink-mute py-5 border border-dashed border-line-soft rounded-lg mt-2">
            Follow-up sequence generating in background…
          </div>
        )}
      </div>

      {/* Status footer */}
      <div className="border-t border-line-soft px-5 py-3 flex items-center gap-2.5 flex-shrink-0 bg-surface-2/30">
        <span className={cn(
          "text-[10px] font-mono font-semibold px-2 py-0.5 rounded",
          (RISK_C[item.risk_level] ?? RISK_C.low).text,
          (RISK_C[item.risk_level] ?? RISK_C.low).bg,
        )}>
          {item.risk_level} risk
        </span>
        <span className="text-[10px] text-ink-mute font-mono">
          conf {((item.confidence ?? 0.5) * 100).toFixed(0)}%
        </span>
        {item.total_attempts > 1 && (
          <span className="text-[10px] font-mono text-amber-500">{item.total_attempts} attempts</span>
        )}
        <span className="flex-1" />
        <span className={cn(
          "text-[10px] font-mono px-2 py-0.5 rounded",
          item.governance_passed
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400",
        )}>
          {item.governance_passed ? "✓ Gov passed" : "✗ Gov failed"}
        </span>
      </div>
    </div>
  );
}

// ── Left panel: conversation list row ────────────────────────────────────────

function ConvRow({
  item,
  isSelected,
  onClick,
  showFollowupBadge = false,
}: {
  item: ApprovalItemType;
  isSelected: boolean;
  onClick: () => void;
  showFollowupBadge?: boolean;
}) {
  const rc = RISK_C[item.risk_level] ?? RISK_C.low;
  const ts = item.status_updated_at ?? item.timestamp;
  const followupCount = item.followup_sequence?.length ?? 0;
  const initials = (item.lead_name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3.5 border-b border-line-soft/60 transition-all",
        "border-l-[3px]",
        isSelected
          ? "bg-brand/5 border-l-brand"
          : "hover:bg-surface-2/40 border-l-transparent",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 border",
          isSelected
            ? "bg-brand/15 text-brand border-brand/30"
            : "bg-surface-2 text-ink-2 border-line-soft",
        )}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between mb-0.5 gap-1">
            <span className={cn("text-[12px] font-semibold truncate", isSelected ? "text-brand" : "text-ink")}>
              {item.lead_name}
            </span>
            <span className="text-[10px] text-ink-mute font-mono flex-shrink-0">{fmtDate(ts)}</span>
          </div>
          <div className="text-[11px] text-ink-2 truncate mb-1">{item.company_name}</div>
          <div className="text-[10px] text-ink-mute truncate mb-1.5">
            {item.email?.subject ?? "(No subject)"}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("text-[9px] font-mono px-1.5 py-px rounded-full font-semibold border", rc.text, rc.bg,
              rc.text.replace("text-", "border-").replace("400", "400/30").replace("500", "500/30"))}>
              {item.risk_level}
            </span>
            {showFollowupBadge && followupCount > 0 && (
              <span className="text-[9px] font-mono px-1.5 py-px rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-semibold">
                {followupCount} follow-ups
              </span>
            )}
            {!item.governance_passed && (
              <span className="text-[9px] font-mono px-1.5 py-px rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                gov failed
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon = "✉", message }: { icon?: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-ink-mute select-none">
      <div className="text-5xl mb-3 opacity-20">{icon}</div>
      <div className="text-[12px] font-medium">{message}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ApprovalQueuePage() {
  const [activeTab, setActiveTab] = useState<QueueTab>("outreach");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showApprovalDetail, setShowApprovalDetail] = useState(false);
  const [search, setSearch] = useState("");

  const { data: queueItems = [], isLoading: queueLoading } = useQuery({
    queryKey: ["approvalQueue"],
    queryFn: api.approvalQueue,
    refetchInterval: 15_000,
  });

  const { data: sentItems = [], isLoading: sentLoading } = useQuery({
    queryKey: ["sentEmails"],
    queryFn: api.sentEmails,
    refetchInterval: 15_000,
  });

  const filterFn = (item: ApprovalItemType) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.lead_name ?? "").toLowerCase().includes(q) ||
      (item.company_name ?? "").toLowerCase().includes(q) ||
      (item.email?.subject ?? "").toLowerCase().includes(q)
    );
  };

  // Tab data
  // Outreach: pending items awaiting first send approval
  const outreachItems = useMemo(() => queueItems.filter(filterFn), [queueItems, search]);

  // Replied Back: sent emails where a reply was detected (trigger/policy indicates engagement)
  const REPLY_SIGNALS = new Set([
    "intent_detected", "replied", "reply", "meeting_request", "pricing_inquiry",
    "interested", "positive_reply", "not_interested", "out_of_office",
  ]);
  const repliedItems = useMemo(
    () => sentItems.filter(i =>
      (REPLY_SIGNALS.has(i.trigger?.toLowerCase() ?? "") ||
       REPLY_SIGNALS.has(i.policy?.toLowerCase() ?? "")) &&
      filterFn(i)
    ),
    [sentItems, search],
  );

  // Follow Up: sent items where at least the 1st follow-up has been sent, no reply yet
  const repliedLeadIds = useMemo(() => new Set(repliedItems.map(i => i.lead_id)), [repliedItems]);
  const followupItems = useMemo(
    () => sentItems.filter(i =>
      (i.followup_sequence ?? []).some(fu => fu.sent_at != null) &&  // at least 1 sent
      !repliedLeadIds.has(i.lead_id) &&                               // remove once replied
      filterFn(i)
    ),
    [sentItems, repliedLeadIds, search],
  );

  const activeItems =
    activeTab === "outreach" ? outreachItems :
    activeTab === "replied"  ? repliedItems  :
    followupItems;

  const selectedItem = activeItems.find(i => i.event_id === selectedId) ?? null;

  const govFailed = queueItems.filter(i => !i.governance_passed).length;

  const TABS: { id: QueueTab; label: string; count: number; desc: string }[] = [
    { id: "outreach", label: "Outreach",     count: queueItems.length,   desc: "Queued for first send" },
    { id: "replied",  label: "Replied Back", count: repliedItems.length, desc: "Prospect replied"       },
    { id: "followup", label: "Follow Up",    count: followupItems.length, desc: "Auto follow-ups sent"  },
  ];

  const handleTabChange = (tab: QueueTab) => {
    setActiveTab(tab);
    setSelectedId(null);
    setShowApprovalDetail(false);
  };

  const isLoading = queueLoading || sentLoading;

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Outreach Queue"
        title={<>Outreach <em className="text-brand italic">Queue</em></>}
        right={
          <div className="flex items-center gap-2">
            <StatusPill tone={govFailed > 0 ? "danger" : "brand"}>
              {queueItems.length} pending
            </StatusPill>
            {govFailed > 0 && (
              <StatusPill tone="danger">{govFailed} gov failed</StatusPill>
            )}
          </div>
        }
      />

      {/* Full-viewport Outlook-style layout */}
      <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>

        {/* ── Tab bar + search ─────────────────────────────────────────────── */}
        <div className="flex items-center border-b border-line-soft bg-surface flex-shrink-0">
          <div className="flex">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "px-5 py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
                  activeTab === tab.id
                    ? "border-brand text-brand"
                    : "border-transparent text-ink-2 hover:text-ink hover:bg-surface-2/40",
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    "text-[10px] font-mono px-1.5 py-px rounded-full font-semibold",
                    activeTab === tab.id
                      ? (tab.id === "outreach" && govFailed > 0 ? "bg-red-500/15 text-red-400" : "bg-brand/10 text-brand")
                      : "bg-surface-2 text-ink-mute",
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="ml-auto px-4">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-mute" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 12a7.5 7.5 0 0012.15 5.65z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-7 pr-6 py-1.5 text-[11px] rounded-md border border-line-soft bg-surface-2/50 text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/10 w-44"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink text-sm leading-none"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Two-panel layout ─────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left: conversation list */}
          <div className="w-[300px] flex-shrink-0 border-r border-line-soft flex flex-col min-h-0 bg-surface">
            {/* Sub-header */}
            <div className="px-4 py-2 border-b border-line-soft flex-shrink-0 bg-surface-2/20">
              <span className="text-[10px] font-mono uppercase tracking-widest text-ink-mute">
                {isLoading ? "Loading…" : `${activeItems.length} ${TABS.find(t => t.id === activeTab)?.desc ?? ""}`}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {!isLoading && activeItems.length === 0 && (
                <EmptyState message={
                  activeTab === "outreach" ? "Queue is empty — no pending emails" :
                  activeTab === "replied"  ? "No replies detected yet" :
                  "No unreplied follow-up sequences"
                } />
              )}
              {activeItems.map(item => (
                <ConvRow
                  key={item.event_id}
                  item={item}
                  isSelected={selectedId === item.event_id}
                  showFollowupBadge={activeTab === "followup"}
                  onClick={() => {
                    setSelectedId(item.event_id);
                    setShowApprovalDetail(false);
                  }}
                />
              ))}
            </div>
          </div>

          {/* Right: reading pane */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-surface">
            {!selectedItem ? (
              <EmptyState icon="✉" message="Select an email to read the thread" />
            ) : (
              <>
                {/* Thread/Approval toggle — only on Outreach tab */}
                {activeTab === "outreach" && (
                  <div className="px-5 py-2 border-b border-line-soft flex-shrink-0 flex items-center gap-1.5 bg-surface-2/15">
                    {[
                      { id: false, label: "Email Thread" },
                      { id: true,  label: "Approval Detail" },
                    ].map(opt => (
                      <button
                        key={String(opt.id)}
                        onClick={() => setShowApprovalDetail(opt.id)}
                        className={cn(
                          "text-[11px] px-3 py-1 rounded-md font-medium transition-colors",
                          showApprovalDetail === opt.id
                            ? "bg-brand/10 text-brand"
                            : "text-ink-2 hover:text-ink hover:bg-surface-2/50",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Email thread */}
                {(!showApprovalDetail || activeTab !== "outreach") && (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <EmailThread item={selectedItem} />
                  </div>
                )}

                {/* Approval detail (existing component) */}
                {showApprovalDetail && activeTab === "outreach" && (
                  <div className="flex-1 overflow-y-auto p-4 min-h-0">
                    <ApprovalItemComponent item={selectedItem} initialExpanded />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
