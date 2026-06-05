import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { KpiCard } from "../components/dashboard/KpiCard";
import { FunnelCard } from "../components/dashboard/FunnelCard";
import { AgentFeedCard } from "../components/dashboard/AgentFeedCard";
import { RiskDistributionCard } from "../components/dashboard/RiskDistributionCard";
import { api, type DashboardExtendedStats, type FinOpsSummary } from "../lib/api";
import { formatNumber, cn } from "../lib/utils";

// ── Design tokens (CommandCenter palette) ─────────────────────────────────────

const INTENT_C: Record<string, { text: string; bg: string; line: string }> = {
  meeting_request:  { text: "text-emerald-500", bg: "bg-emerald-500/10", line: "#10b981" },
  pricing_inquiry:  { text: "text-sky-500",     bg: "bg-sky-500/10",     line: "#0ea5e9" },
  interested:       { text: "text-violet-500",  bg: "bg-violet-500/10",  line: "#8b5cf6" },
  not_interested:   { text: "text-red-400",     bg: "bg-red-500/10",     line: "#f87171" },
  out_of_office:    { text: "text-amber-500",   bg: "bg-amber-500/10",   line: "#f59e0b" },
  default:          { text: "text-ink-2",       bg: "bg-surface-2",      line: "#94a3b8" },
};
const getIC = (intent: string) => INTENT_C[intent] ?? INTENT_C.default;

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ── Shared primitives ─────────────────────────────────────────────────────────

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line-soft bg-surface p-5", className)}>{children}</div>;
}
function PanelTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      {sub && <div className="text-[10px] text-ink-mute mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Tiny donut ────────────────────────────────────────────────────────────────

function MiniDonut({ pass, fail, passColour, center }: {
  pass: number; fail: number; passColour: string; center?: string;
}) {
  const total = pass + fail || 1;
  const r = 28; const cx = 36; const cy = 36;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const passSweep = (pass / total) * 360;
  const s1x = cx + r * Math.cos(toRad(-90));
  const s1y = cy + r * Math.sin(toRad(-90));
  const s2x = cx + r * Math.cos(toRad(-90 + passSweep));
  const s2y = cy + r * Math.sin(toRad(-90 + passSweep));
  const passArc = passSweep > 1
    ? `M ${s1x} ${s1y} A ${r} ${r} 0 ${passSweep > 180 ? 1 : 0} 1 ${s2x} ${s2y}`
    : "";
  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--c-line-soft))" strokeWidth="10" />
      {passArc && (
        <path d={passArc} fill="none" stroke={passColour} strokeWidth="10" strokeLinecap="butt" />
      )}
      {center && (
        <text x={cx} y={cy + 4} textAnchor="middle" fill="rgb(var(--c-ink))" fontSize="11" fontWeight="700">
          {center}
        </text>
      )}
    </svg>
  );
}

// ── Company domain breakdown ──────────────────────────────────────────────────

function CompanyInsightsPanel({ data }: { data: DashboardExtendedStats["company_breakdown"] }) {
  if (!data.length) return (
    <Panel><PanelTitle title="Domain Insights" /><p className="text-[11px] text-ink-mute">No outreach data yet.</p></Panel>
  );
  const maxCount = Math.max(...data.map(r => r.outreach_count), 1);
  return (
    <Panel>
      <PanelTitle title="Domain Insights" sub="Top companies by outreach volume · reply rate shows engagement quality" />
      <div className="space-y-3">
        {data.map(row => {
          const replyRate = row.outreach_count > 0 ? row.reply_count / row.outreach_count : 0;
          const riskColour = row.avg_risk >= 0.7 ? "text-red-400" : row.avg_risk >= 0.4 ? "text-amber-500" : "text-emerald-500";
          return (
            <div key={row.company}>
              <div className="flex items-center justify-between mb-1 text-[11px]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                  <span className="font-medium text-ink truncate">{row.company}</span>
                  <span className={cn("font-mono text-[10px] flex-shrink-0", riskColour)}>
                    risk {fmtPct(row.avg_risk * 100)}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-[10px]">
                  <span className="text-emerald-500 font-mono font-semibold">{row.reply_count} replies</span>
                  <span className="text-ink-2 font-mono">{row.outreach_count} sent</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden flex">
                <div className="h-full bg-brand/60 rounded-l-full"
                  style={{ width: `${(row.approved_count / maxCount) * 100}%` }}
                  title={`Approved: ${row.approved_count}`} />
                {row.blocked_count > 0 && (
                  <div className="h-full bg-red-500/40"
                    style={{ width: `${(row.blocked_count / maxCount) * 100}%` }}
                    title={`Blocked: ${row.blocked_count}`} />
                )}
              </div>
              <div className="flex justify-between text-[9px] text-ink-mute mt-0.5 font-mono">
                <span className="text-brand/70">{row.approved_count} approved</span>
                {row.blocked_count > 0 && <span className="text-red-400">{row.blocked_count} blocked</span>}
                <span>{(replyRate * 100).toFixed(0)}% reply rate</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 pt-3 border-t border-line-soft">
        <div className="flex items-center gap-1.5 text-[10px] text-ink-mute">
          <div className="w-3 h-2 rounded-sm bg-brand/60" /> Approved
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-mute">
          <div className="w-3 h-2 rounded-sm bg-red-500/40" /> Blocked
        </div>
      </div>
    </Panel>
  );
}

// ── Mini FinOps widget ────────────────────────────────────────────────────────

const AGENT_LINE: Record<string, string> = {
  research: "#0ea5e9", outreach: "#8b5cf6", conversation: "#10b981",
  intent: "#f59e0b", gov: "#f87171", governance: "#f87171",
};

function MiniFinOpsPanel({ data }: { data: FinOpsSummary }) {
  const agentEntries = Object.entries(data.cost_by_agent).slice(0, 4);
  const totalCost = data.total_cost_usd || 1e-9;
  const wastedPct = (data.wasted_cost_usd / totalCost) * 100;
  const effPct    = 100 - wastedPct;
  const effColour = effPct >= 90 ? "text-emerald-500" : effPct >= 70 ? "text-amber-500" : "text-red-400";

  // Governance spend: gov + governance agent costs combined
  const govEntry  = data.cost_by_agent["gov"]        ?? data.cost_by_agent["governance"];
  const govCost   = govEntry?.cost_usd ?? data.governance_info.governance_cost_usd;
  const govPct    = (govCost / totalCost) * 100;
  const govChecks = data.governance_info.hallucination_check_calls;

  // Efficacy: success cost vs wasted, cost-per-outcome
  const successPct = (data.success_cost_usd / totalCost) * 100;
  const outcome    = data.cost_per_outcome;
  const valRate    = data.validator_success?.both_success_rate ?? null;

  const fmt5 = (n: number) => n < 0.0001 ? `$${n.toFixed(6)}` : `$${n.toFixed(4)}`;

  return (
    <Panel>
      <div className="flex items-start justify-between mb-3">
        <PanelTitle
          title="AI Spend Summary"
          sub="Governance overhead · efficacy · cost per outcome"
        />
        <Link to="/finops" className="text-[10px] text-brand font-medium hover:underline flex-shrink-0 mt-1">
          Full FinOps →
        </Link>
      </div>

      {/* Top-line KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Total Cost",  value: `$${data.total_cost_usd.toFixed(4)}`, colour: "text-brand"    },
          { label: "Efficiency",  value: `${effPct.toFixed(0)}%`,              colour: effColour        },
          { label: "Wasted",      value: `$${data.wasted_cost_usd.toFixed(4)}`, colour: "text-amber-500"},
        ].map(k => (
          <div key={k.label} className="p-2 rounded-lg bg-surface-2 text-center">
            <div className="text-[9px] uppercase tracking-widest text-ink font-semibold mb-0.5">{k.label}</div>
            <div className={cn("text-[15px] font-bold font-mono", k.colour)}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Agent cost bars */}
      <div className="space-y-2 mb-4">
        {agentEntries.map(([agent, v]) => {
          const pct    = (v.cost_usd / totalCost) * 100;
          const colour = AGENT_LINE[agent] ?? "#94a3b8";
          const isGov  = agent === "gov" || agent === "governance";
          return (
            <div key={agent}>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colour }} />
                  <span className="font-medium text-ink capitalize">{agent}</span>
                  {isGov && <span className="text-[9px] px-1 py-px rounded font-mono font-semibold bg-red-500/10 text-red-400">gov</span>}
                </div>
                <span className="font-mono text-ink-2 text-[10px]">${v.cost_usd.toFixed(5)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour, opacity: 0.8 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Governance overhead ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 mb-3">
        <div className="text-[10px] font-semibold text-ink mb-2">Governance Overhead</div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-ink-2 font-medium">Gov agent cost</div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-red-400 text-[11px]">${govCost.toFixed(5)}</span>
            <span className="text-[9px] font-mono text-ink-mute">({govPct.toFixed(1)}% of spend)</span>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-2">
          <div className="h-full rounded-full bg-red-400/70" style={{ width: `${Math.min(govPct, 100)}%` }} />
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-ink-2 font-medium">Hallucination checks run</span>
          <span className="font-mono font-semibold text-ink">{govChecks}</span>
        </div>
        {valRate !== null && (
          <div className="flex items-center justify-between text-[10px] mt-1">
            <span className="text-ink-2 font-medium">Validator → reply rate</span>
            <span className={cn("font-mono font-semibold", valRate >= 0.5 ? "text-emerald-500" : "text-amber-500")}>
              {(valRate * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Spend efficacy ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3">
        <div className="text-[10px] font-semibold text-ink mb-2">Spend Efficacy</div>
        {/* Success vs wasted stacked bar */}
        <div className="h-3 rounded-full bg-surface-2 overflow-hidden flex mb-1.5">
          <div className="h-full bg-emerald-500" style={{ width: `${successPct}%` }}
            title={`Effective: $${data.success_cost_usd.toFixed(4)}`} />
          <div className="h-full bg-amber-500/70" style={{ width: `${Math.min(wastedPct, 100 - successPct)}%` }}
            title={`Wasted: $${data.wasted_cost_usd.toFixed(4)}`} />
        </div>
        <div className="flex gap-3 text-[9px] text-ink-mute mb-2">
          <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-emerald-500 inline-block" />Effective {successPct.toFixed(0)}%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-amber-500/70 inline-block" />Wasted {wastedPct.toFixed(0)}%</span>
        </div>
        {/* Cost per outcome */}
        {outcome?.total_outreach_leads > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Per Approved",   value: fmt5(outcome.per_approved_outreach),   colour: "text-emerald-500" },
              { label: "Per Meeting",    value: fmt5(outcome.per_meeting_booked),       colour: "text-amber-500"   },
            ].map(item => (
              <div key={item.label} className="p-1.5 rounded bg-surface/60 border border-line-soft text-center">
                <div className="text-[8px] uppercase tracking-widest text-ink font-semibold">{item.label}</div>
                <div className={cn("text-[12px] font-bold font-mono mt-0.5", item.colour)}>{item.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Model routing strip */}
      <div className="pt-2 border-t border-line-soft flex items-center gap-2 text-[10px]">
        <span className="text-ink-mute">Model:</span>
        {Object.entries(data.model_routing).map(([m, v]) => (
          <span key={m} className={cn("font-mono font-semibold px-1.5 py-0.5 rounded",
            m === "sonnet" ? "bg-brand/10 text-brand" : "bg-amber-500/10 text-amber-500")}>
            {m} {v.pct_cost}%
          </span>
        ))}
        <span className="text-ink-mute ml-auto">{data.total_traces} traces</span>
      </div>
    </Panel>
  );
}

// ── Retry Efficiency card ─────────────────────────────────────────────────────

function RetryEfficiencyCard({ finops, extended }: {
  finops: FinOpsSummary;
  extended: DashboardExtendedStats;
}) {
  const c2s = finops.cost_to_success;
  const outreach = c2s.find(r => r.agent === "outreach");
  const agentRetries = c2s
    .filter(r => r.agent !== "outreach" && r.retry_calls > 0)
    .sort((a, b) => b.retry_cost_usd - a.retry_cost_usd);
  const val = extended.validation_stats;
  const fmt5 = (n: number) => n < 0.0001 ? `$${n.toFixed(6)}` : `$${n.toFixed(5)}`;

  return (
    <Panel>
      <PanelTitle
        title="Retry Efficiency"
        sub="Per-layer success rates · cost of unsuccessful first attempts"
      />

      {/* ── Governance pipeline ──────────────────────────────────────────── */}
      {outreach && outreach.jobs_total != null && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-2">Governance Pipeline</div>
          {([
            { label: "First Pass",   value: outreach.jobs_first_attempt_ok ?? 0, bar: "bg-emerald-500", text: "text-emerald-500" },
            { label: "Retry → OK",   value: outreach.jobs_retry_succeeded  ?? 0, bar: "bg-amber-500",   text: "text-amber-500"   },
            { label: "Retry → Fail", value: outreach.jobs_retry_failed     ?? 0, bar: "bg-red-400",     text: "text-red-400"     },
          ] as const).map(item => {
            const pct = outreach.jobs_total! > 0 ? (item.value / outreach.jobs_total!) * 100 : 0;
            return (
              <div key={item.label} className="mb-2">
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-ink-2 font-medium">{item.label}</span>
                  <span className={cn("font-mono font-semibold", item.text)}>
                    {item.value} <span className="text-ink-mute">({pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className={cn("h-full rounded-full", item.bar)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex justify-between text-[10px] pt-1.5 border-t border-line-soft">
            <span className="text-ink-mute">Gov retry cost</span>
            <span className="font-mono font-semibold text-amber-500">{fmt5(outreach.retry_cost_usd)}</span>
          </div>
        </div>
      )}

      {/* ── Validation layers ────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-2">Validation Layers</div>
        {[
          { label: "Tone Check",   pass: val.tone_pass_count,   fail: val.tone_fail_count,   rate: val.tone_pass_rate,   passBar: "bg-sky-500",    text: "text-sky-500"    },
          { label: "Halluc Guard", pass: val.halluc_pass_count, fail: val.halluc_fail_count, rate: val.halluc_pass_rate, passBar: "bg-violet-500", text: "text-violet-500" },
        ].map(layer => (
          <div key={layer.label} className="mb-2.5">
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-ink-2 font-medium">{layer.label}</span>
              <div className="flex items-center gap-2">
                <span className={cn("font-mono font-bold", layer.text)}>{layer.rate}%</span>
                <span className="text-ink-mute">pass rate</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden flex">
              <div className={cn("h-full rounded-l-full", layer.passBar)} style={{ width: `${layer.rate}%` }} />
              <div className="h-full bg-red-400/40" style={{ width: `${100 - layer.rate}%` }} />
            </div>
            <div className="text-[9px] text-ink-mute font-mono mt-0.5">
              {layer.pass} passed ·{" "}
              <span className="text-red-400 font-semibold">{layer.fail} failed</span>
              {" "}→ triggered retries
            </div>
          </div>
        ))}
      </div>

      {/* ── Per-agent retries ────────────────────────────────────────────── */}
      {agentRetries.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-2">Agent Retries</div>
          <div className="space-y-2">
            {agentRetries.map(r => {
              const firstOkPct = r.calls > 0 ? ((r.raw_success_calls - r.retry_success) / r.calls) * 100 : 0;
              const retryOkPct = r.calls > 0 ? (r.retry_success / r.calls) * 100 : 0;
              const failedPct  = r.calls > 0 ? ((r.calls - r.raw_success_calls) / r.calls) * 100 : 0;
              const colour = AGENT_LINE[r.agent] ?? "#94a3b8";
              return (
                <div key={r.agent}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: colour }} />
                      <span className="font-medium text-ink capitalize">{r.agent}</span>
                      <span className="text-ink-mute">({r.calls} calls · {r.retry_calls} retries)</span>
                    </div>
                    <span className="font-mono font-semibold text-amber-500">{fmt5(r.retry_cost_usd)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden flex">
                    {firstOkPct > 0.5 && <div className="h-full bg-emerald-500" style={{ width: `${firstOkPct}%` }} title="1st pass" />}
                    {retryOkPct > 0.5 && <div className="h-full bg-amber-500"   style={{ width: `${retryOkPct}%` }} title="Retry OK" />}
                    {failedPct  > 0.5 && <div className="h-full bg-red-400/70"  style={{ width: `${failedPct}%`  }} title="Failed"   />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Total footer ─────────────────────────────────────────────────── */}
      <div className="pt-2 border-t border-line-soft flex justify-between items-center text-[10px]">
        <span className="text-ink-mute">Total retry overhead</span>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-amber-500">{fmt5(finops.retry_info.retry_cost_usd)}</span>
          <span className="text-ink-mute">· {finops.retry_info.retry_calls} retries</span>
        </div>
      </div>
    </Panel>
  );
}

// ── Intent distribution chart ─────────────────────────────────────────────────

function IntentDistPanel({ data }: { data: DashboardExtendedStats["intent_distribution"] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(r => r.count), 1);
  const intentLabel = (i: string) => i.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <div>
      <div className="text-[11px] font-semibold text-ink mb-2">Reply Intent Breakdown</div>
      <div className="space-y-2">
        {data.map(r => {
          const ic = getIC(r.intent);
          return (
            <div key={r.intent}>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className={cn("font-medium", ic.text)}>{intentLabel(r.intent)}</span>
                <span className="font-mono text-ink-2 font-semibold">{r.count} <span className="text-ink-mute">({r.pct}%)</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: ic.line }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Validation & Governance stats (full-width 3-col) ─────────────────────────

type ValStats = DashboardExtendedStats["validation_stats"];
type GovStats = DashboardExtendedStats["governance_summary"];

function ValidationGovernanceRow({ val, gov, intent }: {
  val: ValStats; gov: GovStats; intent: DashboardExtendedStats["intent_distribution"];
}) {
  const maxViol = Math.max(...val.violation_types.map(v => v.count), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      {/* ── Tone Validator ──────────────────────────────────────────────────── */}
      <Panel>
        <PanelTitle title="Tone Validator" sub="Checks language, banned phrases, subject line quality" />
        <div className="flex items-start gap-4 mb-4">
          <MiniDonut pass={val.tone_pass_count} fail={val.tone_fail_count}
            passColour="#10b981" center={`${val.tone_pass_rate}%`} />
          <div className="space-y-2 flex-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-2 font-medium">Passed</span>
              <span className="font-mono font-bold text-emerald-500">{val.tone_pass_count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500"
                style={{ width: `${val.tone_pass_rate}%` }} />
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-2 font-medium">Failed</span>
              <span className="font-mono font-bold text-red-400">{val.tone_fail_count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full rounded-full bg-red-400"
                style={{ width: `${100 - val.tone_pass_rate}%` }} />
            </div>
          </div>
        </div>
        <div className="text-[10px] font-semibold text-ink mb-2">Top Issues Flagged</div>
        <div className="space-y-1.5">
          {val.violation_types.filter(v =>
            !v.label.toLowerCase().includes("hallucin") && !v.label.toLowerCase().includes("unverifi")
          ).slice(0, 4).map(v => (
            <div key={v.label}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-ink-2 font-medium truncate max-w-[140px]">{v.label}</span>
                <span className="font-mono font-semibold text-ink flex-shrink-0 ml-1">{v.count}</span>
              </div>
              <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-amber-500/70"
                  style={{ width: `${(v.count / maxViol) * 100}%` }} />
              </div>
            </div>
          ))}
          {val.violation_types.length === 0 && (
            <p className="text-[10px] text-emerald-500 font-medium">No tone issues detected</p>
          )}
        </div>
      </Panel>

      {/* ── Hallucination Guard ──────────────────────────────────────────────── */}
      <Panel>
        <PanelTitle title="Hallucination Guard" sub="Verifies factual claims: revenue, headcount, technology stack" />
        <div className="flex items-start gap-4 mb-4">
          <MiniDonut pass={val.halluc_pass_count} fail={val.halluc_fail_count}
            passColour="#8b5cf6" center={`${val.halluc_pass_rate}%`} />
          <div className="space-y-2 flex-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-2 font-medium">Passed</span>
              <span className="font-mono font-bold text-violet-500">{val.halluc_pass_count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full rounded-full bg-violet-500"
                style={{ width: `${val.halluc_pass_rate}%` }} />
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-2 font-medium">Failed</span>
              <span className="font-mono font-bold text-red-400">{val.halluc_fail_count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full rounded-full bg-red-400"
                style={{ width: `${100 - val.halluc_pass_rate}%` }} />
            </div>
          </div>
        </div>
        {/* What's checked */}
        <div className="text-[10px] font-semibold text-ink mb-2">What Gets Checked</div>
        <div className="space-y-1.5">
          {[
            { label: "Revenue / funding claims", colour: "bg-violet-500/60" },
            { label: "Headcount & growth stats", colour: "bg-sky-500/60" },
            { label: "Technology stack mentions", colour: "bg-emerald-500/60" },
            { label: "Unverified product claims", colour: "bg-amber-500/60" },
            { label: "Company name accuracy",    colour: "bg-red-500/60" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-[10px]">
              <div className={cn("w-2 h-2 rounded-sm flex-shrink-0", item.colour)} />
              <span className="text-ink-2 font-medium">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t border-line-soft flex justify-between text-[10px]">
          <span className="text-ink-mute">Both checks passed:</span>
          <span className="font-mono font-bold text-emerald-500">{val.both_passed} / {val.total_checks}</span>
        </div>
      </Panel>

      {/* ── Governance Decisions + Intent ───────────────────────────────────── */}
      <Panel>
        <PanelTitle title="Governance Outcomes" sub="Decisions across all outreach · retry overhead · reply intent" />

        {/* Decision donut */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0">
            <svg width={72} height={72} viewBox="0 0 72 72">
              {(() => {
                const total = (gov.approved + gov.blocked + gov.pending) || 1;
                const segs = [
                  { v: gov.approved, c: "#10b981" },
                  { v: gov.blocked,  c: "#f87171" },
                  { v: gov.pending,  c: "#f59e0b" },
                ];
                const r = 28; const cx = 36; const cy = 36;
                const toRad = (d: number) => (d * Math.PI) / 180;
                let ang = -90;
                return segs.map((s, i) => {
                  const sweep = (s.v / total) * 360;
                  const sa = ang; ang += sweep;
                  if (sweep < 2) return null;
                  const x1 = cx + r * Math.cos(toRad(sa));
                  const y1 = cy + r * Math.sin(toRad(sa));
                  const x2 = cx + r * Math.cos(toRad(sa + sweep));
                  const y2 = cy + r * Math.sin(toRad(sa + sweep));
                  return (
                    <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`}
                      fill="none" stroke={s.c} strokeWidth="10" strokeLinecap="butt">
                      <title>{["Approved","Blocked","Pending"][i]}: {s.v}</title>
                    </path>
                  );
                });
              })()}
              <circle cx={36} cy={36} r={28} fill="none" stroke="rgb(var(--c-line-soft))" strokeWidth="10"
                style={{ display: (gov.approved + gov.blocked + gov.pending) === 0 ? "block" : "none" }} />
            </svg>
          </div>
          <div className="space-y-2 flex-1">
            {[
              { label: "Approved", value: gov.approved, colour: "text-emerald-500", bar: "bg-emerald-500" },
              { label: "Blocked",  value: gov.blocked,  colour: "text-red-400",     bar: "bg-red-400"     },
              { label: "Pending",  value: gov.pending,  colour: "text-amber-500",   bar: "bg-amber-500"   },
            ].map(item => {
              const total = gov.total_outreach || 1;
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-ink-2 font-medium">{item.label}</span>
                    <span className={cn("font-mono font-bold", item.colour)}>{item.value}</span>
                  </div>
                  <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                    <div className={cn("h-full rounded-full", item.bar)}
                      style={{ width: `${(item.value / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Retry overhead */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/8 border border-amber-500/20 mb-3">
          <div className="text-[10px]">
            <span className="text-ink font-semibold">Retry overhead</span>
            <span className="text-ink-mute ml-1">— avg {gov.avg_attempts} attempts</span>
          </div>
          <span className="font-mono text-[11px] font-bold text-amber-500">{gov.multi_attempt_pct}%</span>
        </div>

        {/* Intent dist */}
        <IntentDistPanel data={intent} />
      </Panel>

    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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

  const { data: extended } = useQuery({
    queryKey: ["dashboardExtended"],
    queryFn: api.dashboardExtendedStats,
    refetchInterval: 60_000,
  });

  const { data: finops } = useQuery({
    queryKey: ["finops"],
    queryFn: api.devFinOps,
    refetchInterval: 60_000,
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

            {/* ── KPI strip ─────────────────────────────────────────────────── */}
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

            {/* ── Funnel + Agent Feed ───────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 mb-5">
              <FunnelCard rows={stats.funnel} />
              <AgentFeedCard />
            </div>

            {/* ── Domain Insights + Mini FinOps ────────────────────────────── */}
            {(extended || finops) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                {extended && <CompanyInsightsPanel data={extended.company_breakdown} />}
                {finops && <MiniFinOpsPanel data={finops} />}
              </div>
            )}

            {/* ── Validation & Governance stats ────────────────────────────── */}
            {extended && (
              <div className="mb-5">
                <ValidationGovernanceRow
                  val={extended.validation_stats}
                  gov={extended.governance_summary}
                  intent={extended.intent_distribution}
                />
              </div>
            )}

            {/* ── Retry Efficiency + Risk distribution ─────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {finops && extended && <RetryEfficiencyCard finops={finops} extended={extended} />}
              <RiskDistributionCard hallucCategories={extended?.validation_stats.hallucination_categories} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
