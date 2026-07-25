import { Topbar } from "../components/layout/Topbar";
import { GovStatCard } from "../components/approval/GovStatCard";
import { cn } from "../lib/utils";

interface AuditEntry {
  timestamp: string;
  status: "pass" | "review" | "block";
  detail: React.ReactNode;
  actor: string;
}

const STATUS_STYLES = {
  pass: "bg-brand-soft text-brand",
  review: "bg-gold-tint text-gold-dark",
  block: "bg-danger-tint text-danger",
};

const STATUS_LABELS = {
  pass: "Passed",
  review: "Routed",
  block: "Blocked",
};

const AUDIT_LOG: AuditEntry[] = [
  { timestamp: "2026-05-27 12:42:08", status: "pass", detail: <><strong>Outreach</strong> · Ravi Sharma / Britannia · Email · Low risk (0.12)</>, actor: "SYSTEM" },
  { timestamp: "2026-05-27 12:41:30", status: "review", detail: <><strong>Outreach</strong> · Sandip Agarwal / Traya · Pricing language → human queue</>, actor: "RISK SCORER" },
  { timestamp: "2026-05-27 12:40:12", status: "pass", detail: <><strong>Reply</strong> · Sandip Agarwal inbound classified · Objection: budget (conf 0.91)</>, actor: "CONV AGENT" },
  { timestamp: "2026-05-27 12:38:47", status: "pass", detail: <><strong>Schedule</strong> · Lalit Verma / Zomato · Meeting booked Fri 3pm IST</>, actor: "SCHED AGENT" },
  { timestamp: "2026-05-27 12:35:22", status: "block", detail: <><strong>Outreach</strong> · Marcus Webb / Quanta · "Guaranteed 3x pipeline" → blocked</>, actor: "VALIDATOR" },
  { timestamp: "2026-05-27 12:31:08", status: "pass", detail: <><strong>Outreach</strong> · 47 first-touch emails dispatched (Q2 campaign)</>, actor: "DISPATCHER" },
  { timestamp: "2026-05-27 12:28:14", status: "review", detail: <><strong>Outreach</strong> · Madhusudhan Rao / Flipkart · Competitor comparison flagged</>, actor: "RISK SCORER" },
  { timestamp: "2026-05-27 12:24:55", status: "pass", detail: <><strong>Research</strong> · 312 accounts enriched · Funding signal cached</>, actor: "RESEARCH AGENT" },
  { timestamp: "2026-05-27 12:21:03", status: "block", detail: <><strong>Outreach</strong> · Unknown prospect · Missing unsubscribe footer · auto-rejected</>, actor: "VALIDATOR" },
];

export function AuditTrailPage() {
  return (
    <>
      <Topbar
        breadcrumb="Governance / Audit Trail"
        title={<>Audit <span className="text-brand">Trail</span></>}
        right={
          <>
            <button className="btn-ghost">Filter</button>
            <button className="btn-ghost">Export CSV</button>
          </>
        }
      />

      <div className="p-8 pb-20">
        <div className="grid grid-cols-4 gap-3.5 mb-6">
          <GovStatCard label="Total decisions" value="14,827" />
          <GovStatCard label="Auto-passed" value="14,082" tone="brand" />
          <GovStatCard label="Human reviewed" value="689" tone="gold" />
          <GovStatCard label="Blocked" value="56" tone="danger" />
        </div>

        <div className="card-base">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <div className="font-serif text-display-md text-ink">
              Decision <span className="text-brand">log</span>
            </div>
            <div className="label-mono">Every outbound action is recorded</div>
          </div>
          <div className="px-5 py-2">
            {AUDIT_LOG.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-[130px_100px_1fr_110px] gap-3.5 py-3 items-center text-xs",
                  i < AUDIT_LOG.length - 1 && "border-b border-line-soft"
                )}
              >
                <div className="font-mono text-[10px] text-ink-mute">{entry.timestamp}</div>
                <div className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded w-fit font-semibold",
                  STATUS_STYLES[entry.status]
                )}>
                  {STATUS_LABELS[entry.status]}
                </div>
                <div className="text-ink-2">{entry.detail}</div>
                <div className="font-mono text-[10px] text-ink-mute text-right">{entry.actor}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
