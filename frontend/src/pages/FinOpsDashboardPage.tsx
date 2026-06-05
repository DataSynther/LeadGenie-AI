import { useQuery } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { Topbar } from "../components/layout/Topbar";
import { api, type FinOpsSummary, type FinOpsAgentEntry } from "../lib/api";
import { RefreshCw } from "lucide-react";

// ── Design tokens (match CommandCenter palette) ───────────────────────────────

const AGENT_C: Record<string, { line: string; bar: string; text: string; bg: string }> = {
  research:     { line: "#0ea5e9", bar: "bg-sky-500",      text: "text-sky-500",      bg: "bg-sky-500/10"     },
  outreach:     { line: "#8b5cf6", bar: "bg-violet-500",   text: "text-violet-500",   bg: "bg-violet-500/10"  },
  conversation: { line: "#10b981", bar: "bg-emerald-500",  text: "text-emerald-500",  bg: "bg-emerald-500/10" },
  intent:       { line: "#f59e0b", bar: "bg-amber-500",    text: "text-amber-500",    bg: "bg-amber-500/10"   },
  gov:          { line: "#f87171", bar: "bg-red-500",       text: "text-red-500",      bg: "bg-red-500/10"     },
  governance:   { line: "#f87171", bar: "bg-red-500",       text: "text-red-500",      bg: "bg-red-500/10"     },
  schedule:     { line: "#a78bfa", bar: "bg-purple-400",    text: "text-purple-400",   bg: "bg-purple-400/10"  },
};
const getAC = (a: string) => AGENT_C[a] ?? { line: "#94a3b8", bar: "bg-surface-2", text: "text-ink-2", bg: "bg-surface-2" };

const MODEL_C: Record<string, { bar: string; text: string; line: string }> = {
  sonnet: { bar: "bg-brand",      text: "text-brand",      line: "#7c3aed" },
  haiku:  { bar: "bg-amber-500",  text: "text-amber-500",  line: "#f59e0b" },
};

const fmt  = (n: number, d = 4) => n === 0 ? "$0.00" : n < 0.001 ? `$${n.toFixed(6)}` : `$${n.toFixed(d)}`;
const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

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

// ── DonutChart (reused from CommandCenter pattern) ────────────────────────────

function DonutChart({ segs, center }: {
  segs: { label: string; value: number; colour: string }[];
  center?: string;
}) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  const r = 40; const cx = 52; const cy = 52;
  let angle = -90;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arcs = segs.map(seg => {
    const sweep = (seg.value / total) * 360;
    const s = angle; angle += sweep;
    const x1 = cx + r * Math.cos(toRad(s));
    const y1 = cy + r * Math.sin(toRad(s));
    const x2 = cx + r * Math.cos(toRad(s + sweep));
    const y2 = cy + r * Math.sin(toRad(s + sweep));
    return { ...seg, sweep, d: `M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}` };
  });
  return (
    <svg width={104} height={104} viewBox="0 0 104 104">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--c-line-soft))" strokeWidth="15" />
      {arcs.filter(a => a.sweep > 1).map((a, i) => (
        <path key={i} d={a.d} fill="none" stroke={a.colour} strokeWidth="15" strokeLinecap="butt">
          <title>{a.label}: {(a.value / total * 100).toFixed(1)}%</title>
        </path>
      ))}
      {center && (
        <text x={cx} y={cy + 5} textAnchor="middle" fill="rgb(var(--c-ink))" fontSize="12" fontWeight="700">{center}</text>
      )}
    </svg>
  );
}

// ── EfficiencyArc — shows success efficiency as a small arc gauge ─────────────

function EfficiencyArc({ score }: { score: number }) {
  const pct = Math.min(score / 100, 1);
  const r = 28; const cx = 36; const cy = 36;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const startAngle = 210; const sweepMax = 300;
  const arc = (a: number) => ({
    x: cx + r * Math.cos(toRad(a - 90)),
    y: cy + r * Math.sin(toRad(a - 90)),
  });
  const s1 = arc(startAngle);
  const s2 = arc(startAngle + sweepMax);
  const fillEnd = arc(startAngle + sweepMax * pct);
  const colour = pct >= 0.9 ? "#10b981" : pct >= 0.6 ? "#f59e0b" : "#f87171";
  return (
    <svg width={72} height={64} viewBox="0 0 72 64">
      <path d={`M ${s1.x} ${s1.y} A ${r} ${r} 0 1 1 ${s2.x} ${s2.y}`}
        fill="none" stroke="rgb(var(--c-line-soft))" strokeWidth="6" strokeLinecap="round" />
      {pct > 0.02 && (
        <path d={`M ${s1.x} ${s1.y} A ${r} ${r} 0 ${sweepMax * pct > 180 ? 1 : 0} 1 ${fillEnd.x} ${fillEnd.y}`}
          fill="none" stroke={colour} strokeWidth="6" strokeLinecap="round" />
      )}
      <text x={cx} y={cy + 2} textAnchor="middle" fill={colour} fontSize="11" fontWeight="700">{score}%</text>
    </svg>
  );
}

// ── AgentCostIntelligence: horizontal bars + donut ────────────────────────────

function AgentCostIntelligence({ data }: { data: Record<string, FinOpsAgentEntry> }) {
  const rows = Object.entries(data);
  const totalCost = rows.reduce((s, [, v]) => s + v.cost_usd, 0) || 1;

  const donutSegs = rows.map(([agent, v]) => ({
    label: agent,
    value: v.cost_usd,
    colour: getAC(agent).line,
  }));

  return (
    <Panel>
      <PanelTitle title="Agent Cost Intelligence" sub="Solid bar = successful spend · faded = retry waste · donut = share of total" />
      {/* grid: bars take all available space, donut gets a fixed 160px column */}
      <div className="grid grid-cols-[1fr_160px] gap-6 items-start">

        {/* ── Left: horizontal stacked bars ───────────────────────────── */}
        <div className="space-y-4 min-w-0">
          {rows.map(([agent, v]) => {
            const ac = getAC(agent);
            const successPct = v.calls > 0 ? v.success_calls / v.calls : 1;
            const barW = (v.cost_usd / totalCost) * 100;
            const successW = barW * successPct;
            const wastedW  = barW * (1 - successPct);
            return (
              <div key={agent}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ac.line }} />
                    <span className={cn("text-[12px] font-semibold capitalize", ac.text)}>{agent}</span>
                    <span className={cn("text-[9px] font-mono px-1.5 py-px rounded font-semibold",
                      MODEL_C[v.model]?.text ?? "text-ink-2",
                      v.model === "sonnet" ? "bg-brand/10" : "bg-amber-500/10"
                    )}>{v.model}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] flex-shrink-0">
                    <span className="text-ink-2 font-mono">{fmtK(v.tokens)} tok</span>
                    <span className="text-ink font-semibold font-mono">{fmt(v.cost_usd)}</span>
                  </div>
                </div>
                <div className="h-3 rounded-full bg-surface-2 overflow-hidden flex">
                  <div className={cn("h-full rounded-l-full", ac.bar)}
                    style={{ width: `${successW}%` }}
                    title={`Success cost: ${fmt(v.success_cost_usd)}`} />
                  {wastedW > 0.5 && (
                    <div className={cn("h-full opacity-25", ac.bar)}
                      style={{ width: `${wastedW}%` }}
                      title={`Retry/wasted: ${fmt(v.failure_cost_usd)}`} />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-ink-mute mt-0.5 font-mono">
                  <span>{v.calls} calls · {barW.toFixed(1)}% of spend</span>
                  <span>{v.success_calls}/{v.calls} ok</span>
                </div>
              </div>
            );
          })}
          <div className="flex gap-4 pt-1 border-t border-line-soft">
            <div className="flex items-center gap-1.5 text-[10px] text-ink-mute">
              <div className="w-3 h-2 rounded-sm bg-emerald-500 opacity-80" /> Success spend
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-ink-mute">
              <div className="w-3 h-2 rounded-sm bg-surface-2 border border-line-soft" /> Retry / wasted
            </div>
          </div>
        </div>

        {/* ── Right: donut + legend (fixed 160px) ──────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <DonutChart segs={donutSegs} center={`$${totalCost.toFixed(2)}`} />
          <div className="space-y-1.5 w-full">
            {rows.map(([agent, v]) => (
              <div key={agent} className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getAC(agent).line }} />
                  <span className="text-ink-2 capitalize truncate">{agent}</span>
                </div>
                <span className="text-ink font-mono text-[10px] flex-shrink-0">
                  {(v.cost_usd / totalCost * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Panel>
  );
}

// ── Cost-to-Success matrix ────────────────────────────────────────────────────

type C2SRow = FinOpsSummary["cost_to_success"][number];

function CostToSuccessCard({ row }: { row: C2SRow }) {
  const ac = getAC(row.agent);
  const effColour = row.efficiency_score >= 90 ? "text-emerald-500" : row.efficiency_score >= 60 ? "text-amber-500" : "text-red-500";

  // Three-tier attempt breakdown
  // Use job-level stats for outreach (cleaner semantics), trace-level for others
  let firstOk: number, retryOk: number, failed: number, total: number;
  if (row.agent === "outreach" && row.jobs_total != null) {
    total   = row.jobs_total;
    firstOk = row.jobs_first_attempt_ok ?? 0;
    retryOk = row.jobs_retry_succeeded  ?? 0;
    failed  = (row.jobs_retry_failed ?? 0) + (total - firstOk - (row.jobs_needed_retry ?? 0));
  } else {
    total   = row.calls;
    retryOk = row.retry_success;
    failed  = row.calls - (row.raw_success_calls ?? row.success_count);
    firstOk = total - retryOk - failed;
  }
  const firstOkPct = total > 0 ? (firstOk / total) * 100 : 0;
  const retryOkPct = total > 0 ? (retryOk / total) * 100 : 0;
  const failedPct  = total > 0 ? (failed  / total) * 100 : 0;

  return (
    <Panel className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className={cn("text-[12px] font-bold capitalize", ac.text)}>{row.agent}</div>
          <div className="text-[10px] text-ink-mute mt-0.5 leading-snug max-w-[140px]">{row.success_criteria}</div>
        </div>
        <EfficiencyArc score={row.efficiency_score} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-lg bg-surface-2">
          <div className="text-[9px] uppercase tracking-widest text-ink-mute mb-1">Success Rate</div>
          <div className={cn("text-[18px] font-bold", effColour)}>
            {(row.success_rate * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-ink-mute">{row.success_count}/{row.calls} calls</div>
        </div>
        <div className="p-2.5 rounded-lg bg-surface-2">
          <div className="text-[9px] uppercase tracking-widest text-ink-mute mb-1">Cost / Success</div>
          <div className="text-[18px] font-bold font-mono text-ink">{fmt(row.cost_per_success, 5)}</div>
          <div className="text-[10px] text-ink-mute">per outcome</div>
        </div>
      </div>

      {/* Three-tier attempt bar */}
      <div>
        <div className="flex justify-between text-[10px] mb-1.5">
          <span className="text-ink-2 font-medium">Attempt breakdown</span>
          <span className="text-ink-mute font-mono">{total} {row.agent === "outreach" && row.jobs_total != null ? "jobs" : "calls"}</span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden flex">
          {firstOkPct > 0.5 && (
            <div className="h-full bg-emerald-500" style={{ width: `${firstOkPct}%` }}
              title={`First-attempt success: ${firstOk}`} />
          )}
          {retryOkPct > 0.5 && (
            <div className="h-full bg-amber-500" style={{ width: `${retryOkPct}%` }}
              title={`Retry succeeded: ${retryOk}`} />
          )}
          {failedPct > 0.5 && (
            <div className="h-full bg-red-500/70" style={{ width: `${failedPct}%` }}
              title={`Failed: ${failed}`} />
          )}
        </div>
        <div className="flex gap-3 mt-1.5 flex-wrap">
          <div className="flex items-center gap-1 text-[10px] text-ink-mute">
            <div className="w-2 h-2 rounded-sm bg-emerald-500" />
            <span>1st pass <span className="font-mono font-semibold text-emerald-500">{firstOk}</span></span>
          </div>
          {retryOk > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-ink-mute">
              <div className="w-2 h-2 rounded-sm bg-amber-500" />
              <span>Retry ✓ <span className="font-mono font-semibold text-amber-500">{retryOk}</span></span>
            </div>
          )}
          {failed > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-ink-mute">
              <div className="w-2 h-2 rounded-sm bg-red-500/70" />
              <span>Failed <span className="font-mono font-semibold text-red-400">{failed}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* Retry cost */}
      {row.retry_calls > 0 && (
        <div className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded bg-amber-500/8 border border-amber-500/20">
          <span className="text-amber-500 font-medium">{row.retry_calls} retry calls</span>
          <span className="font-mono text-amber-500">{fmt(row.retry_cost_usd)} wasted</span>
        </div>
      )}

      {/* Total cost pill */}
      <div className={cn("text-[10px] font-mono px-2.5 py-1.5 rounded-lg border text-center", ac.bg)}>
        <span className={ac.text}>{fmt(row.cost_usd)}</span>
        <span className="text-ink-mute"> total · {fmtK(row.calls)} calls</span>
      </div>
    </Panel>
  );
}

// ── Validator Success Panel ───────────────────────────────────────────────────

type ValidatorData = NonNullable<FinOpsSummary["validator_success"]>;

function ValidatorSuccessPanel({ data }: { data: ValidatorData }) {
  const validators = [
    {
      key:      "tone",
      label:    "Tone Validator",
      passed:   data.tone_passed_total,
      replied:  data.tone_passed_replied,
      rate:     data.tone_success_rate,
      colour:   { line: "#0ea5e9", bar: "bg-sky-500", text: "text-sky-500", bg: "bg-sky-500/10" },
      desc:     "Leads where tone check passed",
    },
    {
      key:      "halluc",
      label:    "Hallucination Guard",
      passed:   data.halluc_passed_total,
      replied:  data.halluc_passed_replied,
      rate:     data.halluc_success_rate,
      colour:   { line: "#8b5cf6", bar: "bg-violet-500", text: "text-violet-500", bg: "bg-violet-500/10" },
      desc:     "Leads where hallucination check passed",
    },
    {
      key:      "both",
      label:    "Both Checks Passed",
      passed:   data.both_passed_total,
      replied:  data.both_passed_replied,
      rate:     data.both_success_rate,
      colour:   { line: "#10b981", bar: "bg-emerald-500", text: "text-emerald-500", bg: "bg-emerald-500/10" },
      desc:     "Leads cleared by tone + hallucination",
    },
  ];

  const rateColour = (r: number) => r >= 0.5 ? "text-emerald-500" : r >= 0.25 ? "text-amber-500" : "text-red-400";
  const barColour  = (r: number) => r >= 0.5 ? "bg-emerald-500" : r >= 0.25 ? "bg-amber-500" : "bg-red-400";

  return (
    <Panel>
      <PanelTitle
        title="Validator Effectiveness"
        sub="Of leads cleared by each validator, what fraction replied back? High reply rate = validators are correctly allowing quality outreach through."
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {validators.map(v => (
          <div key={v.key} className={cn("rounded-lg p-3 border border-line-soft", v.colour.bg)}>
            <div className={cn("text-[11px] font-semibold mb-0.5", v.colour.text)}>{v.label}</div>
            <div className="text-[9px] text-ink-mute mb-2">{v.desc}</div>
            <div className={cn("text-[26px] font-bold font-mono leading-none mb-1", rateColour(v.rate))}>
              {(v.rate * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-ink-mute mb-2 font-mono">{v.replied}/{v.passed} replied</div>
            <div className="h-1.5 rounded-full bg-surface/50 overflow-hidden">
              <div className={cn("h-full rounded-full", barColour(v.rate))}
                style={{ width: `${v.rate * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* False positive row */}
      <div className="border-t border-line-soft pt-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div>
          <div className="text-[11px] font-semibold text-ink">
            False Positives — blocked but replied anyway
          </div>
          <div className="text-[10px] text-ink-mute mt-0.5">
            Leads rejected by the hallucination check who sent a reply — possible over-blocking
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className={cn("text-[22px] font-bold font-mono",
            data.false_positives === 0 ? "text-emerald-500" : "text-amber-500")}>
            {data.false_positives}
          </div>
          <div className="text-[10px] text-ink-mute font-mono">
            {(data.false_positive_rate * 100).toFixed(0)}% of blocked leads
          </div>
        </div>
      </div>

      {/* Total replied */}
      <div className="mt-3 text-[10px] text-ink-mute font-mono text-right">
        {data.replied_total} total conversation replies across all leads
      </div>
    </Panel>
  );
}

// ── Multi-agent token trend (SVG polyline chart) ──────────────────────────────

type DailyEntry = FinOpsSummary["agent_daily_series"][number];

function MultiAgentTrendChart({ series }: { series: DailyEntry[] }) {
  const AGENTS_SHOW = ["research", "outreach", "conversation", "intent"];

  const allDates = [...new Set(series.map(s => s.date))].sort();
  if (allDates.length < 2) {
    return (
      <Panel>
        <PanelTitle title="Agent Token & Success Trend" sub="Needs at least 2 days of data" />
        <div className="text-[11px] text-ink-mute py-6 text-center">Not enough data yet ({allDates.length} day)</div>
      </Panel>
    );
  }

  // Build lookup: agent → date → { avg_tokens, success_rate }
  const byAgentDate: Record<string, Record<string, { tokens: number; successRate: number }>> = {};
  for (const entry of series) {
    if (!AGENTS_SHOW.includes(entry.agent)) continue;
    if (!byAgentDate[entry.agent]) byAgentDate[entry.agent] = {};
    byAgentDate[entry.agent][entry.date] = {
      tokens:      entry.avg_tokens,
      successRate: entry.calls > 0 ? entry.success_calls / entry.calls : 1,
    };
  }

  const activeAgents = AGENTS_SHOW.filter(a => byAgentDate[a]);

  // SVG dimensions
  const W = 480; const H = 160;
  const PAD = { top: 12, right: 10, bottom: 28, left: 44 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allTokenVals = Object.values(byAgentDate).flatMap(d => Object.values(d).map(v => v.tokens));
  const yMax = Math.max(...allTokenVals, 100) * 1.1;
  const xScale = (i: number) => PAD.left + (i / Math.max(allDates.length - 1, 1)) * chartW;
  const yScale = (v: number) => PAD.top + chartH - (v / yMax) * chartH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax);

  // Per-agent overall success rate (across all dates)
  const agentSuccessRate = (agent: string): number => {
    const entries = Object.values(byAgentDate[agent] || {});
    if (!entries.length) return 0;
    return entries.reduce((s, e) => s + e.successRate, 0) / entries.length;
  };

  return (
    <Panel>
      <PanelTitle
        title="Agent Token & Success Trend"
        sub="Avg tokens per call over time — lower trend = leaner prompts · right panel = avg success rate per agent across all days"
      />
      {/* grid: chart left, success-rate panel right */}
      <div className="grid grid-cols-[1fr_180px] gap-5 items-start">

        {/* ── SVG polyline chart ─────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
              {/* Y grid + labels */}
              {yTicks.map((v, i) => (
                <g key={i}>
                  <line x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)}
                    stroke="rgb(var(--c-line-soft))" strokeWidth="0.5" />
                  <text x={PAD.left - 4} y={yScale(v) + 3} textAnchor="end"
                    fill="rgb(var(--c-ink-mute))" fontSize="8">
                    {v >= 1000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v)}
                  </text>
                </g>
              ))}
              {/* X labels */}
              {allDates.map((d, i) => {
                const every = allDates.length > 7 ? Math.ceil(allDates.length / 5) : 1;
                if (i % every !== 0 && i !== allDates.length - 1) return null;
                return (
                  <text key={d} x={xScale(i)} y={H - 6} textAnchor="middle"
                    fill="rgb(var(--c-ink-mute))" fontSize="8">{d.slice(5)}</text>
                );
              })}
              {/* Lines */}
              {activeAgents.map(agent => {
                const ac = getAC(agent);
                const segments: string[][] = [];
                let cur: string[] = [];
                allDates.forEach((d, i) => {
                  const v = byAgentDate[agent][d]?.tokens;
                  if (v != null) { cur.push(`${xScale(i)},${yScale(v)}`); }
                  else if (cur.length) { segments.push(cur); cur = []; }
                });
                if (cur.length) segments.push(cur);
                if (!segments.length) return null;
                return (
                  <g key={agent}>
                    {segments.map((seg, si) => (
                      <polyline key={si} points={seg.join(" ")}
                        fill="none" stroke={ac.line} strokeWidth="1.8"
                        strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
                    ))}
                    {allDates.map((d, i) => {
                      const v = byAgentDate[agent][d]?.tokens;
                      if (v == null) return null;
                      return (
                        <circle key={d} cx={xScale(i)} cy={yScale(v)} r="2.5" fill={ac.line} opacity="0.9">
                          <title>{agent} · {d}: {Math.round(v)} avg tokens</title>
                        </circle>
                      );
                    })}
                    {(() => {
                      const last = [...allDates].reverse().find(d => byAgentDate[agent][d] != null);
                      if (!last) return null;
                      const li = allDates.indexOf(last);
                      const lv = byAgentDate[agent][last].tokens;
                      return (
                        <text x={xScale(li) + 5} y={yScale(lv) + 3}
                          fill={ac.line} fontSize="9" fontWeight="600">{agent}</text>
                      );
                    })()}
                  </g>
                );
              })}
            </svg>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-2">
            {activeAgents.map(agent => {
              const ac = getAC(agent);
              const vals = Object.values(byAgentDate[agent] || {}).map(v => v.tokens);
              const avg = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
              return (
                <div key={agent} className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-4 h-0.5 rounded-full" style={{ background: ac.line }} />
                  <span className={cn("capitalize font-medium", ac.text)}>{agent}</span>
                  <span className="text-ink-mute font-mono text-[10px]">avg {fmtK(avg)} tok</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: avg success rate per agent ─────────────────────── */}
        <div className="border-l border-line-soft pl-5 space-y-3">
          <div className="text-[11px] font-semibold text-ink mb-3">Avg Success Rate</div>
          {activeAgents.map(agent => {
            const ac = getAC(agent);
            const rate = agentSuccessRate(agent);
            const pctLabel = `${(rate * 100).toFixed(0)}%`;
            const barColour = rate >= 0.9 ? "bg-emerald-500" : rate >= 0.6 ? "bg-amber-500" : "bg-red-400";
            const textColour = rate >= 0.9 ? "text-emerald-500" : rate >= 0.6 ? "text-amber-500" : "text-red-400";
            return (
              <div key={agent}>
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ac.line }} />
                    <span className={cn("capitalize font-medium", ac.text)}>{agent}</span>
                  </div>
                  <span className={cn("font-mono font-semibold", textColour)}>{pctLabel}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className={cn("h-full rounded-full", barColour)}
                    style={{ width: `${rate * 100}%` }} />
                </div>
              </div>
            );
          })}
          <div className="pt-2 border-t border-line-soft text-[10px] text-ink-mute leading-snug">
            Rate = successful calls ÷ total calls per day, averaged
          </div>
        </div>

      </div>
    </Panel>
  );
}

// ── Model routing + unit economics row ───────────────────────────────────────

function ModelRoutingPanel({ data }: { data: FinOpsSummary["model_routing"] }) {
  const entries = Object.entries(data);
  return (
    <Panel>
      <PanelTitle title="Model Routing Split" sub="Haiku for classification · Sonnet for generation" />
      <div className="space-y-4">
        {entries.map(([model, v]) => {
          const mc = MODEL_C[model] ?? { bar: "bg-surface-2", text: "text-ink-2" };
          return (
            <div key={model}>
              <div className="flex items-center justify-between mb-1.5 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className={cn("font-semibold capitalize", mc.text)}>{model}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold",
                    model === "sonnet" ? "bg-brand/10 text-brand" : "bg-amber-500/10 text-amber-500")}>
                    {v.pct_calls}% of calls
                  </span>
                </div>
                <span className="font-mono text-ink">{fmt(v.cost_usd)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
                <div className={cn("h-full rounded-full", mc.bar)} style={{ width: `${v.pct_cost}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-ink-mute mt-0.5 font-mono">
                <span>{v.calls} calls · {fmtK(v.tokens)} tok</span>
                <span>{v.pct_cost}% of cost</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function UnitEconomicsPanel({ data }: { data: FinOpsSummary["cost_per_outcome"] }) {
  if (!data?.total_outreach_leads) {
    return (
      <Panel>
        <PanelTitle title="Unit Economics" sub="Cost per business outcome" />
        <p className="text-[11px] text-ink-mute">No outcome data yet — run outreach to populate.</p>
      </Panel>
    );
  }
  const items = [
    { label: "Per Outreach",  value: fmt(data.per_outreach_generated),  n: data.total_outreach_leads, colour: "text-sky-500",     bg: "bg-sky-500/10" },
    { label: "Per Approved",  value: fmt(data.per_approved_outreach),   n: data.total_approved_leads,  colour: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Per Blocked",   value: fmt(data.per_blocked_outreach),    n: data.total_blocked_leads,   colour: "text-red-500",     bg: "bg-red-500/10" },
    { label: "Per Meeting",   value: fmt(data.per_meeting_booked, 3),   n: data.total_meeting_leads,   colour: "text-amber-500",   bg: "bg-amber-500/10", gold: true },
  ];
  return (
    <Panel>
      <PanelTitle title="Unit Economics" sub="Average AI cost to reach each business milestone" />
      <div className="space-y-3">
        {items.map(it => (
          <div key={it.label} className={cn("flex items-center justify-between p-2.5 rounded-lg", it.bg)}>
            <div>
              <div className="text-[10px] text-ink-mute uppercase tracking-widest">{it.label}</div>
              <div className={cn("text-[18px] font-bold font-mono mt-0.5", it.colour)}>{it.value}</div>
            </div>
            <div className={cn("text-[11px] font-mono px-2 py-1 rounded-md bg-surface/50", it.colour)}>
              {it.n} leads
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Per-lead table ────────────────────────────────────────────────────────────

function LeadCostTable({ data }: { data: FinOpsSummary["cost_by_lead"] }) {
  if (!data.length) return null;
  const maxCost = Math.max(...data.map(r => r.cost_usd), 1e-6);
  return (
    <Panel>
      <PanelTitle title="Token Attribution by Lead" sub="Top 20 leads by AI spend" />
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-line-soft text-ink-mute text-[10px]">
              <th className="pb-2 text-left font-medium">Lead ID</th>
              <th className="pb-2 text-right font-medium">Tokens</th>
              <th className="pb-2 text-right font-medium">Cost</th>
              <th className="pb-2 text-left font-medium pl-4">Agents</th>
              <th className="pb-2 text-left font-medium pl-4 w-28">Spend bar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft/50">
            {data.map(row => (
              <tr key={row.lead_id} className="hover:bg-surface-2 transition-colors">
                <td className="py-2 pr-2 font-mono text-ink-2">{row.lead_id}</td>
                <td className="py-2 pr-2 text-right font-mono text-ink">{fmtK(row.tokens)}</td>
                <td className="py-2 pr-2 text-right font-mono text-brand font-semibold">{fmt(row.cost_usd)}</td>
                <td className="py-2 pl-4">
                  <div className="flex flex-wrap gap-1">
                    {row.agents.map(a => (
                      <span key={a} className={cn("text-[9px] px-1.5 py-px rounded font-mono font-semibold", getAC(a).bg, getAC(a).text)}>{a}</span>
                    ))}
                  </div>
                </td>
                <td className="py-2 pl-4 w-28">
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-brand opacity-60"
                      style={{ width: `${(row.cost_usd / maxCost) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function FinOpsDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["finops"],
    queryFn: api.devFinOps,
    refetchInterval: 60_000,
  });

  return (
    <>
      <Topbar
        breadcrumb="Workspace / AI FinOps"
        title={<>AI <em className="text-brand italic">FinOps</em></>}
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="flex items-center gap-1.5 bg-surface-2 border border-line-soft rounded-lg px-3 py-1.5 hover:bg-surface-hover transition-colors">
              <RefreshCw size={11} className="text-ink-2" />
              <span className="text-[11px] text-ink-2">Refresh</span>
            </button>
            <div className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 border",
              isError ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20")}>
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse",
                isError ? "bg-red-500" : "bg-emerald-500")} />
              <span className={cn("text-[11px] font-medium",
                isError ? "text-red-500" : "text-emerald-500")}>
                {isLoading ? "loading" : isError ? "error" : "live"}
              </span>
            </div>
          </div>
        }
      />

      <div className="p-4 sm:p-6 pb-20 space-y-4">
        {isLoading && (
          <div className="text-ink-mute text-[12px] py-16 text-center animate-pulse">Loading FinOps data…</div>
        )}
        {isError && (
          <div className="text-red-500 text-[12px] py-16 text-center">
            Failed to load FinOps data — ensure the backend is running at localhost:8000.
          </div>
        )}

        {data && (
          <>
            {/* ── KPI strip ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total AI Cost",   value: `$${data.total_cost_usd.toFixed(4)}`,    sub: `${data.total_traces} traces`,                colour: "text-brand",      bg: "bg-brand/10"       },
                { label: "Success Spend",   value: `$${data.success_cost_usd.toFixed(4)}`,  sub: "cost of successful calls",                    colour: "text-emerald-500",bg: "bg-emerald-500/10" },
                { label: "Wasted Spend",    value: `$${data.wasted_cost_usd.toFixed(4)}`,   sub: "retries + failed calls",                      colour: "text-amber-500",  bg: "bg-amber-500/10"   },
                { label: "Total Tokens",    value: fmtK(data.total_tokens),                  sub: "across all agents",                           colour: "text-sky-500",    bg: "bg-sky-500/10"     },
                { label: "Retry Calls",     value: String(data.retry_info.retry_calls),      sub: `${fmt(data.retry_info.retry_cost_usd)} cost`,  colour: "text-red-400",    bg: "bg-red-500/10"     },
                { label: "Failure Rate",    value: `${data.retry_info.failure_rate_pct}%`,   sub: `${data.retry_info.failed_calls} failed calls`, colour: "text-ink",        bg: "bg-surface-2"      },
              ].map(s => (
                <Panel key={s.label} className={cn("py-3 px-4 flex flex-col gap-0.5", s.bg)}>
                  <span className="text-[10px] text-ink-mute uppercase tracking-wide">{s.label}</span>
                  <span className={cn("text-2xl font-bold leading-tight font-mono", s.colour)}>{s.value}</span>
                  <span className="text-[10px] text-ink-mute">{s.sub}</span>
                </Panel>
              ))}
            </div>

            {/* ── Agent cost intelligence (bars + donut) ────────────────── */}
            <AgentCostIntelligence data={data.cost_by_agent} />

            {/* ── Cost-to-Success ───────────────────────────────────────── */}
            <div>
              <div className="text-[13px] font-semibold text-ink mb-1">Cost-to-Success Analysis</div>
              <div className="text-[10px] text-ink-mute mb-3">
                Per-agent success criteria · arc gauge = efficiency (100% = zero waste) · green bar = 1st-pass · amber = retry succeeded · red = failed
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {data.cost_to_success.map(row => (
                  <CostToSuccessCard key={row.agent} row={row} />
                ))}
              </div>
            </div>

            {/* ── Validator effectiveness ───────────────────────────────── */}
            {data.validator_success && (
              <ValidatorSuccessPanel data={data.validator_success} />
            )}

            {/* ── Model routing + unit economics ────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ModelRoutingPanel data={data.model_routing} />
              <UnitEconomicsPanel data={data.cost_per_outcome} />
            </div>

            {/* ── Multi-agent token trend chart ─────────────────────────── */}
            <MultiAgentTrendChart series={data.agent_daily_series} />

            {/* ── Per-lead attribution ──────────────────────────────────── */}
            <LeadCostTable data={data.cost_by_lead} />

            {/* Pricing footnote */}
            <div className="text-[10px] text-ink-mute font-mono px-1 pt-1">
              Pricing: Sonnet $6.60/1M tokens blended (70% in / 30% out) · Haiku $1.76/1M blended.
              Traces from diagnostics/traces.jsonl · refreshes every 60s.
            </div>
          </>
        )}
      </div>
    </>
  );
}
