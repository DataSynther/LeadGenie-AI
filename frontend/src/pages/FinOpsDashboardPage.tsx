import { useQuery } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { Topbar } from "../components/layout/Topbar";
import { api, type FinOpsSummary, type FinOpsAgentEntry } from "../lib/api";
import { RefreshCw } from "lucide-react";

type IntentRow = { intent: string; count: number; pct: number };

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

function DonutChart({ segs, center, size = 104 }: {
  segs: { label: string; value: number; colour: string }[];
  center?: string;
  size?: number;
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
    <svg width={size} height={size} viewBox="0 0 104 104">
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

// ── PieChart — solid filled wedge slices (no hole) ────────────────────────────

function PieChart({ segs, size = 112 }: {
  segs: { label: string; value: number; colour: string }[];
  size?: number;
}) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  const cx = size / 2; const cy = size / 2;
  const r  = size / 2 - 3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let angle = -90;
  const slices = segs.map(seg => {
    const sweep = (seg.value / total) * 360;
    const s = angle; angle += sweep;
    const x1 = cx + r * Math.cos(toRad(s));
    const y1 = cy + r * Math.sin(toRad(s));
    const x2 = cx + r * Math.cos(toRad(s + sweep));
    const y2 = cy + r * Math.sin(toRad(s + sweep));
    // For 360°, draw full circle as two arcs to avoid degenerate path
    const path = sweep >= 359.9
      ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
    return { ...seg, path, sweep };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.filter(s => s.sweep > 0.5).map((s, i) => (
        <path key={i} d={s.path} fill={s.colour} stroke="rgb(var(--c-surface))" strokeWidth="1.5">
          <title>{s.label}: {(s.value / total * 100).toFixed(1)}%</title>
        </path>
      ))}
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

// ── System Cost-to-Success chart ─────────────────────────────────────────────

const INTENT_C: Record<string, string> = {
  "meeting request": "#22c55e",   // bright green
  "interested":      "#8b5cf6",   // violet
  "fact question":   "#06b6d4",   // cyan — distinct from violet + green
  "unsubscribe":     "#f87171",   // red
  "objection":       "#f59e0b",   // amber
};
const intentColor = (s: string) => INTENT_C[s.toLowerCase()] ?? "#94a3b8";
const isNegativeIntent = (s: string) => {
  const l = s.toLowerCase();
  return l === "unsubscribe" || l === "objection";
};

function SystemCostToSuccessChart({
  finops, intent,
}: {
  finops: FinOpsSummary;
  intent: IntentRow[];
}) {
  if (!intent.length) return null;

  const agentCost    = finops.total_cost_usd;
  const govCost      = finops.governance_info.governance_cost_usd;
  const systemTotal  = agentCost + govCost;          // agents + governance guard

  const totalOutcomes  = intent.reduce((s, i) => s + i.count, 0) || 1;
  const successCount   = intent.filter(i => !isNegativeIntent(i.intent)).reduce((s, i) => s + i.count, 0);
  const negCount       = totalOutcomes - successCount;
  const successRate    = successCount / totalOutcomes;
  const costPerSuccess = successCount > 0 ? systemTotal / successCount : 0;
  const arcScore       = Math.round(successRate * 100);

  // DonutChart segments — negative intents get muted colour
  const pieSeg = intent.map(item => ({
    label:  item.intent,
    value:  item.count,
    colour: isNegativeIntent(item.intent)
      ? intentColor(item.intent) + "55"   // ~33% opacity via hex alpha
      : intentColor(item.intent),
  }));

  // Per-email cost scenarios
  const govPerCheck = finops.governance_info.hallucination_check_calls > 0
    ? govCost / finops.governance_info.hallucination_check_calls
    : 0;

  type EmailStage = { label: string; noRetry: number; colour: string };
  const emailStages: EmailStage[] = [
    ...finops.cost_to_success.map(row => {
      const firstAttemptCalls = Math.max(row.calls - row.retry_calls, 1);
      const firstAttemptCost  = row.cost_usd - row.retry_cost_usd;
      return {
        label:   row.agent,
        noRetry: firstAttemptCost / firstAttemptCalls,
        colour:  getAC(row.agent).line,
      };
    }),
    ...(govPerCheck > 0 ? [{ label: "Governance", noRetry: govPerCheck, colour: "#f87171" }] : []),
  ];
  const totalNoRetry    = emailStages.reduce((s, r) => s + r.noRetry, 0);
  const totalWithRetry  = emailStages.reduce((s, r) => s + r.noRetry * 3, 0);  // 1 initial + 2 retries
  const retryPremiumPct = totalNoRetry > 0 ? ((totalWithRetry / totalNoRetry - 1) * 100) : 200;

  return (
    <Panel>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[13px] font-semibold text-ink">System Cost-to-Success</div>
          <div className="text-[10px] text-ink-mute mt-0.5">
            All agents + governance guard · success = every intent except Objection &amp; Unsubscribe
          </div>
        </div>
        <span className="text-[11px] font-mono font-semibold px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
          {arcScore}% system success rate
        </span>
      </div>

      {/* 4-column grid: gauge | donut (auto) | pies (1fr) | outreach card */}
      <div className="grid grid-cols-1 md:grid-cols-[110px_1fr_1fr_1fr] gap-4 items-stretch">

        {/* ── Col 1: gauge + headline cost ── */}
        <div className="flex flex-col items-center gap-2.5">
          <EfficiencyArc score={arcScore} />
          <div className="text-center w-full">
            <div className="text-[9px] uppercase tracking-widest text-ink-mute mb-0.5">Cost / Success</div>
            <div className="text-[20px] font-bold font-mono text-ink leading-tight">{fmt(costPerSuccess, 5)}</div>
            <div className="text-[9px] text-ink-mute mt-0.5">{successCount} of {totalOutcomes} outcomes</div>
          </div>
          <div className="w-full px-2.5 py-2 rounded-lg bg-brand/8 border border-brand/20 text-center">
            <div className="text-[8px] text-ink-mute uppercase tracking-wide">System total</div>
            <div className="text-[14px] font-bold font-mono text-brand">{fmt(systemTotal, 4)}</div>
            <div className="text-[8px] text-ink-mute mt-0.5 leading-tight">
              {fmt(agentCost, 4)} agents<br />+ {fmt(govCost, 4)} gov
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 w-full">
            <div className="p-1.5 rounded-lg bg-emerald-500/8 border border-emerald-500/20 text-center">
              <div className="text-[8px] text-ink-mute">Success</div>
              <div className="text-[12px] font-bold font-mono text-emerald-500">{successCount}</div>
            </div>
            <div className="p-1.5 rounded-lg bg-red-500/8 border border-red-500/20 text-center">
              <div className="text-[8px] text-ink-mute">Negative</div>
              <div className="text-[12px] font-bold font-mono text-red-400">{negCount}</div>
            </div>
          </div>
        </div>

        {/* ── Col 2: outcome donut ── */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="text-[10px] uppercase tracking-widest text-ink font-semibold self-start mb-0.5">
            Outcome Distribution
          </div>
          <DonutChart segs={pieSeg} center={`${arcScore}%`} size={88} />
          <div className="w-full space-y-1 mt-0.5">
            {intent.map(item => {
              const neg   = isNegativeIntent(item.intent);
              const color = intentColor(item.intent);
              return (
                <div key={item.intent} className="flex items-center gap-1 text-[9px]">
                  <div className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: color, opacity: neg ? 0.45 : 1 }} />
                  <span className={cn("font-medium whitespace-nowrap", neg ? "text-ink-mute" : "text-ink")}>
                    {item.intent}
                  </span>
                  {neg && <span className="text-[8px] text-red-400 font-mono ml-0.5">✗</span>}
                  <span className="font-mono font-semibold ml-auto pl-2 text-[9px] flex-shrink-0"
                    style={{ color, opacity: neg ? 0.6 : 1 }}>
                    {item.count}·{item.pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Col 3: cost pies filling the center ── */}
        <div className="flex flex-col gap-2 h-full">

          {/* No Retry */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 pt-2 pb-1.5 flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">No Retry</span>
              <span className="text-[13px] font-bold font-mono text-emerald-500">{fmt(totalNoRetry, 5)}</span>
            </div>
            <div className="flex items-center gap-2.5 flex-1 min-h-0">
              <div className="flex-shrink-0 self-center">
                <PieChart
                  segs={emailStages.map(r => ({ label: r.label, value: r.noRetry, colour: r.colour }))}
                  size={130}
                />
              </div>
              <div className="flex flex-col justify-center gap-1">
                {emailStages.map(r => (
                  <div key={r.label} className="flex items-center gap-1.5 text-[9px]">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.colour }} />
                    <span className="capitalize text-ink-2 whitespace-nowrap">{r.label}</span>
                    <span className="font-mono text-ink whitespace-nowrap">{fmt(r.noRetry, 5)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-[8px] text-ink-mute mt-1">1 call per stage · first-attempt only</div>
          </div>

          {/* 2 Retries */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 pt-2 pb-1.5 flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">2 Retries / Stage</span>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-mono text-red-400 font-semibold">+{retryPremiumPct.toFixed(0)}%</span>
                <span className="text-[13px] font-bold font-mono text-amber-500">{fmt(totalWithRetry, 5)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-1 min-h-0">
              <div className="flex-shrink-0 self-center">
                <PieChart
                  segs={emailStages.map(r => ({ label: r.label, value: r.noRetry * 3, colour: r.colour }))}
                  size={130}
                />
              </div>
              <div className="flex flex-col justify-center gap-1">
                {emailStages.map(r => (
                  <div key={r.label} className="flex items-center gap-1.5 text-[9px]">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.colour }} />
                    <span className="capitalize text-ink-2 whitespace-nowrap">{r.label}</span>
                    <span className="text-[8px] font-mono text-ink-mute whitespace-nowrap">×3</span>
                    <span className="font-mono text-ink whitespace-nowrap">{fmt(r.noRetry * 3, 5)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-[8px] text-ink-mute mt-1">3 calls per stage · 1 + 2 retries</div>
          </div>

        </div>

        {/* ── Col 4: full outreach C2S card (matches CostToSuccessCard layout) ── */}
        {(() => {
          const outrow = finops.cost_to_success.find(r => r.agent === "outreach");
          if (!outrow) return null;
          const ac = getAC("outreach");
          const total   = outrow.jobs_total   ?? outrow.calls;
          const firstOk = outrow.jobs_first_attempt_ok ?? 0;
          const retryOk = outrow.jobs_retry_succeeded  ?? 0;
          const failed  = Math.max(total - firstOk - retryOk, 0);
          const firstOkPct = total > 0 ? (firstOk / total) * 100 : 0;
          const retryOkPct = total > 0 ? (retryOk / total) * 100 : 0;
          const failedPct  = total > 0 ? (failed  / total) * 100 : 0;
          const rate = outrow.success_rate * 100;
          const effColour = outrow.efficiency_score >= 90 ? "text-emerald-500" : outrow.efficiency_score >= 60 ? "text-amber-500" : "text-red-500";
          const rateColour = rate >= 50 ? "text-emerald-500" : rate >= 25 ? "text-amber-500" : "text-red-400";
          return (
            <div className="rounded-xl border border-line-soft bg-surface-2/50 p-4 flex flex-col gap-3 h-full">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className={cn("text-[12px] font-bold capitalize", ac.text)}>outreach</div>
                  <div className="text-[10px] text-ink-2 font-medium mt-0.5 leading-snug max-w-[130px]">
                    {outrow.success_criteria}
                  </div>
                </div>
                <EfficiencyArc score={outrow.efficiency_score} />
              </div>
              {/* Rate + C/S */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-surface-2">
                  <div className="text-[9px] uppercase tracking-widest text-ink font-semibold mb-1">Success Rate</div>
                  <div className={cn("text-[20px] font-bold leading-tight", rateColour)}>{rate.toFixed(0)}%</div>
                  <div className="text-[10px] text-ink-2 font-mono">{outrow.success_count}/{outrow.calls} calls</div>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2">
                  <div className="text-[9px] uppercase tracking-widest text-ink font-semibold mb-1">Cost / Success</div>
                  <div className={cn("text-[16px] font-bold font-mono leading-tight", effColour)}>{fmt(outrow.cost_per_success, 5)}</div>
                  <div className="text-[10px] text-ink-2">per outcome</div>
                </div>
              </div>
              {/* Attempt bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1.5">
                  <span className="text-ink font-semibold">Attempt breakdown</span>
                  <span className="text-ink-2 font-mono">{total} jobs</span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden flex">
                  {firstOkPct > 0.5 && <div className="h-full bg-emerald-500" style={{ width: `${firstOkPct}%` }} title={`1st pass: ${firstOk}`} />}
                  {retryOkPct > 0.5 && <div className="h-full bg-amber-500"   style={{ width: `${retryOkPct}%` }} title={`Retry ✓: ${retryOk}`} />}
                  {failedPct  > 0.5 && <div className="h-full bg-red-500/70"  style={{ width: `${failedPct}%`  }} title={`Failed: ${failed}`} />}
                </div>
                <div className="flex gap-3 mt-1.5 text-[10px] text-ink-2 flex-wrap">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-500" /><span>1st pass <span className="font-bold font-mono text-emerald-500">{firstOk}</span></span></div>
                  {retryOk > 0 && <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-500" /><span>Retry ✓ <span className="font-bold font-mono text-amber-500">{retryOk}</span></span></div>}
                  {failed  > 0 && <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-red-500/70" /><span>Failed <span className="font-bold font-mono text-red-400">{failed}</span></span></div>}
                </div>
              </div>
              {/* Retry waste */}
              {outrow.retry_calls > 0 && (
                <div className="flex items-center justify-between text-[10px] px-2.5 py-1.5 rounded bg-amber-500/8 border border-amber-500/20">
                  <span className="text-amber-500 font-semibold">{outrow.retry_calls} retry calls</span>
                  <span className="font-mono font-semibold text-amber-500">{fmt(outrow.retry_cost_usd)} wasted</span>
                </div>
              )}
              {/* Total */}
              <div className={cn("mt-auto text-[10px] font-mono px-2.5 py-1.5 rounded-lg border text-center", ac.bg)}>
                <span className={ac.text}>{fmt(outrow.cost_usd)}</span>
                <span className="text-ink-2 font-semibold"> total · {fmtK(outrow.calls)} calls</span>
              </div>
            </div>
          );
        })()}

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
          <div className="text-[10px] text-ink-2 font-medium mt-0.5 leading-snug max-w-[140px]">{row.success_criteria}</div>
        </div>
        <EfficiencyArc score={row.efficiency_score} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-lg bg-surface-2">
          <div className="text-[9px] uppercase tracking-widest text-ink font-semibold mb-1">Success Rate</div>
          <div className={cn("text-[18px] font-bold", effColour)}>
            {(row.success_rate * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-ink-2 font-medium">{row.success_count}/{row.calls} calls</div>
        </div>
        <div className="p-2.5 rounded-lg bg-surface-2">
          <div className="text-[9px] uppercase tracking-widest text-ink font-semibold mb-1">Cost / Success</div>
          <div className="text-[18px] font-bold font-mono text-ink">{fmt(row.cost_per_success, 5)}</div>
          <div className="text-[10px] text-ink-2 font-medium">per outcome</div>
        </div>
      </div>

      {/* Three-tier attempt bar */}
      <div>
        <div className="flex justify-between text-[10px] mb-1.5">
          <span className="text-ink font-semibold">Attempt breakdown</span>
          <span className="text-ink-2 font-mono font-medium">{total} {row.agent === "outreach" && row.jobs_total != null ? "jobs" : "calls"}</span>
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
          <div className="flex items-center gap-1 text-[10px] text-ink-2 font-medium">
            <div className="w-2 h-2 rounded-sm bg-emerald-500" />
            <span>1st pass <span className="font-mono font-bold text-emerald-500">{firstOk}</span></span>
          </div>
          {retryOk > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-ink-2 font-medium">
              <div className="w-2 h-2 rounded-sm bg-amber-500" />
              <span>Retry ✓ <span className="font-mono font-bold text-amber-500">{retryOk}</span></span>
            </div>
          )}
          {failed > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-ink-2 font-medium">
              <div className="w-2 h-2 rounded-sm bg-red-500/70" />
              <span>Failed <span className="font-mono font-bold text-red-400">{failed}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* Retry cost */}
      {row.retry_calls > 0 && (
        <div className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded bg-amber-500/8 border border-amber-500/20">
          <span className="text-amber-500 font-semibold">{row.retry_calls} retry calls</span>
          <span className="font-mono font-semibold text-amber-500">{fmt(row.retry_cost_usd)} wasted</span>
        </div>
      )}

      {/* Total cost pill */}
      <div className={cn("text-[10px] font-mono px-2.5 py-1.5 rounded-lg border text-center", ac.bg)}>
        <span className={ac.text}>{fmt(row.cost_usd)}</span>
        <span className="text-ink-2 font-semibold"> total · {fmtK(row.calls)} calls</span>
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

// ── Outreach cost trend — per-agent + bold total line ────────────────────────

function OutreachCostTrendChart({ series }: { series: DailyEntry[] }) {
  const AGENTS_SHOW = ["research", "outreach", "conversation", "intent"];
  const allDates = [...new Set(series.map(s => s.date))].sort();

  if (allDates.length < 2) {
    return (
      <Panel>
        <PanelTitle title="Outreach Cost Trend" sub="Needs at least 2 days of data" />
        <div className="text-[11px] text-ink-mute py-6 text-center">Not enough data yet</div>
      </Panel>
    );
  }

  // Outreach success_calls per day — denominator for avg cost per email
  const outreachOutputs: Record<string, number> = {};
  for (const entry of series) {
    if (entry.agent === "outreach") {
      outreachOutputs[entry.date] = (outreachOutputs[entry.date] ?? 0) + entry.success_calls;
    }
  }

  // Per-agent daily avg cost per email (agent cost / outreach outputs that day)
  const byAgentDate: Record<string, Record<string, number>> = {};
  for (const entry of series) {
    if (!AGENTS_SHOW.includes(entry.agent)) continue;
    const outputs = outreachOutputs[entry.date] ?? 0;
    if (outputs === 0) continue;
    if (!byAgentDate[entry.agent]) byAgentDate[entry.agent] = {};
    byAgentDate[entry.agent][entry.date] =
      (byAgentDate[entry.agent][entry.date] ?? 0) + entry.cost_usd / outputs;
  }

  // Total daily avg cost per email (sum all agent costs / outreach outputs)
  const totalRawByDate: Record<string, number> = {};
  for (const entry of series) {
    totalRawByDate[entry.date] = (totalRawByDate[entry.date] ?? 0) + entry.cost_usd;
  }
  const totalByDate: Record<string, number> = {};
  for (const d of allDates) {
    const outputs = outreachOutputs[d] ?? 0;
    if (outputs > 0) totalByDate[d] = (totalRawByDate[d] ?? 0) / outputs;
  }

  // Daily retry cost per email (sum retry_cost_usd across agents / outreach outputs)
  const retryRawByDate: Record<string, number> = {};
  for (const entry of series) {
    const rc = entry.retry_cost_usd ?? 0;
    if (rc > 0) retryRawByDate[entry.date] = (retryRawByDate[entry.date] ?? 0) + rc;
  }
  const retryAvgByDate: Record<string, number> = {};
  for (const d of allDates) {
    const outputs = outreachOutputs[d] ?? 0;
    if (outputs > 0 && retryRawByDate[d]) retryAvgByDate[d] = retryRawByDate[d] / outputs;
  }

  const activeAgents = AGENTS_SHOW.filter(a => byAgentDate[a]);

  // SVG layout
  const W = 560; const H = 200;
  const PAD = { top: 14, right: 14, bottom: 26, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const allSeriesVals = [
    ...Object.values(totalByDate),
    ...Object.values(retryAvgByDate),
  ];
  const yMax   = Math.max(...allSeriesVals, 0.0001) * 1.15;
  const xS     = (i: number) => PAD.left + (i / Math.max(allDates.length - 1, 1)) * cW;
  const yS     = (v: number) => PAD.top + cH - (v / yMax) * cH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax);
  const fmtY   = (v: number) => v < 0.001 ? `$${v.toFixed(5)}` : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`;

  // Build polyline segments, splitting on gaps/zero
  const buildSegs = (getValue: (d: string) => number | null) => {
    const segs: string[][] = [];
    let cur: string[] = [];
    allDates.forEach((d, i) => {
      const v = getValue(d);
      if (v != null && v > 0) { cur.push(`${xS(i).toFixed(1)},${yS(v).toFixed(1)}`); }
      else if (cur.length)    { segs.push(cur); cur = []; }
    });
    if (cur.length) segs.push(cur);
    return segs;
  };

  // Area path under total line
  const areaPoints = allDates
    .map((d, i) => ({ x: xS(i), y: yS(totalByDate[d] ?? 0), hasData: (totalByDate[d] ?? 0) > 0 }))
    .filter(p => p.hasData);
  const areaPath = areaPoints.length >= 2
    ? `M ${areaPoints[0].x} ${areaPoints[0].y} ` +
      areaPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ") +
      ` L ${areaPoints[areaPoints.length - 1].x} ${yS(0)} L ${areaPoints[0].x} ${yS(0)} Z`
    : "";

  const daysWithOutputs = allDates.filter(d => (outreachOutputs[d] ?? 0) > 0).length;
  const avgCostOverall  = daysWithOutputs > 0
    ? Object.values(totalByDate).reduce((s, v) => s + v, 0) / daysWithOutputs
    : 0;
  const hasRetryData = Object.keys(retryAvgByDate).length > 0;

  return (
    <Panel>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[13px] font-semibold text-ink">Outreach Cost Trend</div>
          <div className="text-[10px] text-ink-mute mt-0.5">
            Avg cost per outreach email · red dotted = daily retry cost per email
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-ink-mute uppercase tracking-wide">Avg cost / email</div>
          <div className="text-[18px] font-bold font-mono text-ink">{fmtY(avgCostOverall)}</div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_160px] gap-5 items-start">

        {/* ── SVG chart ── */}
        <div className="overflow-x-auto">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
            <defs>
              <linearGradient id="totalAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="rgb(var(--c-ink))" stopOpacity="0.10" />
                <stop offset="100%" stopColor="rgb(var(--c-ink))" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Y grid + labels */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PAD.left} y1={yS(v)} x2={W - PAD.right} y2={yS(v)}
                  stroke="rgb(var(--c-line-soft))" strokeWidth="0.5" />
                <text x={PAD.left - 5} y={yS(v) + 3} textAnchor="end"
                  fill="rgb(var(--c-ink-mute))" fontSize="8">{fmtY(v)}</text>
              </g>
            ))}
            {/* X labels */}
            {allDates.map((d, i) => {
              const every = allDates.length > 7 ? Math.ceil(allDates.length / 5) : 1;
              if (i % every !== 0 && i !== allDates.length - 1) return null;
              return (
                <text key={d} x={xS(i)} y={H - 4} textAnchor="middle"
                  fill="rgb(var(--c-ink-mute))" fontSize="8">{d.slice(5)}</text>
              );
            })}

            {/* Agent lines — thin, coloured, semi-transparent */}
            {activeAgents.map(agent => {
              const ac   = getAC(agent);
              const segs = buildSegs(d => byAgentDate[agent]?.[d] ?? null);
              return (
                <g key={agent}>
                  {segs.map((seg, si) => (
                    <polyline key={si} points={seg.join(" ")}
                      fill="none" stroke={ac.line} strokeWidth="1.5"
                      strokeLinejoin="round" strokeLinecap="round" opacity="0.6" />
                  ))}
                  {allDates.map((d, i) => {
                    const v = byAgentDate[agent]?.[d];
                    if (v == null || v === 0) return null;
                    return (
                      <circle key={d} cx={xS(i)} cy={yS(v)} r="2" fill={ac.line} opacity="0.7">
                        <title>{agent} · {d}: {fmtY(v)}/email</title>
                      </circle>
                    );
                  })}
                </g>
              );
            })}

            {/* Total area fill */}
            {areaPath && <path d={areaPath} fill="url(#totalAreaGrad)" />}

            {/* Total avg cost line — thick, full-opacity ink */}
            {buildSegs(d => totalByDate[d] ?? null).map((seg, si) => (
              <polyline key={si} points={seg.join(" ")}
                fill="none" stroke="rgb(var(--c-ink))" strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
            ))}
            {allDates.map((d, i) => {
              const v = totalByDate[d];
              if (!v) return null;
              return (
                <circle key={d} cx={xS(i)} cy={yS(v)} r="3.5"
                  fill="rgb(var(--c-ink))" opacity="0.9">
                  <title>Total · {d}: {fmtY(v)}/email</title>
                </circle>
              );
            })}

            {/* Retry cost — red dotted line */}
            {buildSegs(d => retryAvgByDate[d] ?? null).map((seg, si) => (
              <polyline key={si} points={seg.join(" ")}
                fill="none" stroke="#f87171" strokeWidth="1.8"
                strokeDasharray="4 3"
                strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
            ))}
            {allDates.map((d, i) => {
              const v = retryAvgByDate[d];
              if (!v) return null;
              return (
                <circle key={d} cx={xS(i)} cy={yS(v)} r="2.5"
                  fill="none" stroke="#f87171" strokeWidth="1.5" opacity="0.85">
                  <title>Retry cost · {d}: {fmtY(v)}/email</title>
                </circle>
              );
            })}
          </svg>
        </div>

        {/* ── Legend ── */}
        <div className="border-l border-line-soft pl-4 space-y-2.5 pt-1">
          {/* Total row */}
          <div className="flex items-center gap-2 pb-2 border-b border-line-soft">
            <div className="w-5 h-0.5 rounded-full bg-ink opacity-90 flex-shrink-0" />
            <span className="text-[11px] font-bold text-ink">Avg / email</span>
            <span className="font-mono text-[10px] text-ink ml-auto font-bold">{fmtY(avgCostOverall)}</span>
          </div>
          {/* Agent rows */}
          {activeAgents.map(agent => {
            const ac = getAC(agent);
            const vals = Object.values(byAgentDate[agent] || {}).filter(v => v > 0);
            const agentAvg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
            return (
              <div key={agent} className="flex items-center gap-2 text-[11px]">
                <div className="w-4 h-0.5 rounded-full flex-shrink-0" style={{ background: ac.line, opacity: 0.7 }} />
                <span className={cn("capitalize font-medium", ac.text)}>{agent}</span>
                <span className="text-ink-mute font-mono text-[10px] ml-auto">{fmtY(agentAvg)}</span>
              </div>
            );
          })}
          {/* Retry row */}
          {hasRetryData && (
            <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-line-soft">
              <svg width="16" height="8" viewBox="0 0 16 8" className="flex-shrink-0">
                <line x1="0" y1="4" x2="16" y2="4" stroke="#f87171" strokeWidth="1.8" strokeDasharray="4 3" />
              </svg>
              <span className="text-red-400 font-medium">Retries</span>
              <span className="text-ink-mute font-mono text-[10px] ml-auto">
                {fmtY(Object.values(retryAvgByDate).reduce((s, v) => s + v, 0) / Math.max(Object.keys(retryAvgByDate).length, 1))}
              </span>
            </div>
          )}
          <div className="pt-1 text-[9px] text-ink-mute leading-snug border-t border-line-soft">
            Y = cost per outreach email<br />Thin = per-agent share
          </div>
        </div>

      </div>
    </Panel>
  );
}

// ── Multi-agent token trend (SVG polyline chart) ──────────────────────────────

type DailyEntry = FinOpsSummary["agent_daily_series"][number];

function PolylineChart({
  allDates, series, yLabel, agentColours, tooltipSuffix,
}: {
  allDates: string[];
  series: { agent: string; dates: Record<string, number | null> }[];
  yLabel: string;
  agentColours: Record<string, string>;
  tooltipSuffix: string;
}) {
  const W = 480; const H = 140;
  const PAD = { top: 10, right: 10, bottom: 24, left: 44 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allVals = series.flatMap(s => Object.values(s.dates).filter((v): v is number => v != null));
  const yMax = Math.max(...allVals, 1) * 1.12;
  const xScale = (i: number) => PAD.left + (i / Math.max(allDates.length - 1, 1)) * chartW;
  const yScale = (v: number) => PAD.top + chartH - (v / yMax) * chartH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax);

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
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
        {allDates.map((d, i) => {
          const every = allDates.length > 7 ? Math.ceil(allDates.length / 5) : 1;
          if (i % every !== 0 && i !== allDates.length - 1) return null;
          return (
            <text key={d} x={xScale(i)} y={H - 4} textAnchor="middle"
              fill="rgb(var(--c-ink-mute))" fontSize="8">{d.slice(5)}</text>
          );
        })}
        <text x={PAD.left - 38} y={PAD.top + chartH / 2} textAnchor="middle"
          fill="rgb(var(--c-ink-mute))" fontSize="7" transform={`rotate(-90 ${PAD.left - 38} ${PAD.top + chartH / 2})`}>
          {yLabel}
        </text>
        {series.map(({ agent, dates }) => {
          const colour = agentColours[agent] ?? "#94a3b8";
          const segments: string[][] = [];
          let cur: string[] = [];
          allDates.forEach((d, i) => {
            const v = dates[d];
            if (v != null) { cur.push(`${xScale(i)},${yScale(v)}`); }
            else if (cur.length) { segments.push(cur); cur = []; }
          });
          if (cur.length) segments.push(cur);
          if (!segments.length) return null;
          const last = [...allDates].reverse().find(d => dates[d] != null);
          return (
            <g key={agent}>
              {segments.map((seg, si) => (
                <polyline key={si} points={seg.join(" ")}
                  fill="none" stroke={colour} strokeWidth="1.8"
                  strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
              ))}
              {allDates.map((d, i) => {
                const v = dates[d];
                if (v == null) return null;
                return (
                  <circle key={d} cx={xScale(i)} cy={yScale(v)} r="2.5" fill={colour} opacity="0.9">
                    <title>{agent} · {d}: {Math.round(v)} {tooltipSuffix}</title>
                  </circle>
                );
              })}
              {last && (() => {
                const li = allDates.indexOf(last);
                const lv = dates[last]!;
                return (
                  <text x={xScale(li) + 5} y={yScale(lv) + 3}
                    fill={colour} fontSize="9" fontWeight="600">{agent}</text>
                );
              })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MultiAgentTrendChart({ series }: { series: DailyEntry[] }) {
  const AGENTS_SHOW = ["research", "outreach", "conversation", "intent"];

  const allDates = [...new Set(series.map(s => s.date))].sort();
  if (allDates.length < 2) {
    return (
      <Panel>
        <PanelTitle title="Tokens per Transaction Trend" sub="Needs at least 2 days of data" />
        <div className="text-[11px] text-ink-mute py-6 text-center">Not enough data yet ({allDates.length} day)</div>
      </Panel>
    );
  }

  // tokens per transaction = tokens / success_calls (one successful output = one transaction)
  const byAgentDate: Record<string, Record<string, number>> = {};
  for (const entry of series) {
    if (!AGENTS_SHOW.includes(entry.agent)) continue;
    if (!byAgentDate[entry.agent]) byAgentDate[entry.agent] = {};
    const tx = entry.success_calls > 0 ? entry.tokens / entry.success_calls : entry.avg_tokens;
    byAgentDate[entry.agent][entry.date] = tx;
  }

  // System-level: total tokens per email output (outreach success_calls = outputs produced)
  const byDateSystem: Record<string, { totalTokens: number; outputs: number }> = {};
  for (const entry of series) {
    if (!byDateSystem[entry.date]) byDateSystem[entry.date] = { totalTokens: 0, outputs: 0 };
    byDateSystem[entry.date].totalTokens += entry.tokens;
    if (entry.agent === "outreach") {
      byDateSystem[entry.date].outputs += entry.success_calls;
    }
  }
  const systemSeries = allDates.map(d => ({
    date: d,
    value: byDateSystem[d]?.outputs > 0
      ? byDateSystem[d].totalTokens / byDateSystem[d].outputs
      : null as number | null,
  }));

  const activeAgents = AGENTS_SHOW.filter(a => byAgentDate[a]);
  const agentColours = Object.fromEntries(activeAgents.map(a => [a, getAC(a).line]));

  const perAgentSeries = activeAgents.map(a => ({
    agent: a,
    dates: Object.fromEntries(allDates.map(d => [d, byAgentDate[a][d] ?? null])),
  }));

  const systemPolylines = [{
    agent: "system",
    dates: Object.fromEntries(systemSeries.map(r => [r.date, r.value])),
  }];

  // Per-agent overall success rate
  const agentSuccessRate = (agent: string): number => {
    const entries = Object.values(byAgentDate[agent] || {});
    if (!entries.length) return 0;
    const relevant = series.filter(e => e.agent === agent);
    const totalCalls = relevant.reduce((s, e) => s + e.calls, 0);
    const totalOk    = relevant.reduce((s, e) => s + e.success_calls, 0);
    return totalCalls > 0 ? totalOk / totalCalls : 0;
  };

  return (
    <Panel>
      <PanelTitle
        title="Tokens per Transaction Trend"
        sub="1 transaction = 1 successful agent output · lower trend = leaner prompts · second chart = total system tokens per email produced"
      />

      <div className="grid grid-cols-[1fr_180px] gap-5 items-start">

        {/* ── Charts column ─────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">

          {/* Chart 1: per-agent tokens / transaction */}
          <div>
            <div className="text-[10px] text-ink font-semibold mb-1.5">Tokens per Transaction — by Agent</div>
            <PolylineChart
              allDates={allDates}
              series={perAgentSeries}
              yLabel="tok/tx"
              agentColours={agentColours}
              tooltipSuffix="tok/tx"
            />
            <div className="flex flex-wrap gap-4 mt-1.5">
              {activeAgents.map(agent => {
                const ac = getAC(agent);
                const vals = Object.values(byAgentDate[agent]).filter(v => v != null);
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

          {/* Chart 2: total system tokens per email output */}
          <div className="border-t border-line-soft pt-4">
            <div className="text-[10px] text-ink font-semibold mb-1.5">Total System Tokens per Email Produced</div>
            <div className="text-[9px] text-ink-mute mb-2">Sum of all agent tokens on a given day ÷ outreach emails successfully produced that day</div>
            <PolylineChart
              allDates={allDates}
              series={systemPolylines}
              yLabel="tok/email"
              agentColours={{ system: "#10b981" }}
              tooltipSuffix="tok/email"
            />
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
              <div className="w-4 h-0.5 rounded-full bg-emerald-500" />
              <span className="text-emerald-500 font-medium">system</span>
              <span className="text-ink-mute font-mono text-[10px]">tokens across all agents per output</span>
            </div>
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
            Rate = success_calls ÷ total calls, aggregated across all days
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

  // Sort by timestamp descending (most recent first); fall back to cost for rows without ts
  const sorted = [...data].sort((a, b) => {
    const ta = a.timestamp ?? "";
    const tb = b.timestamp ?? "";
    if (ta && tb) return tb.localeCompare(ta);
    if (ta) return -1;
    if (tb) return 1;
    return b.cost_usd - a.cost_usd;
  });

  const maxCost = Math.max(...sorted.map(r => r.cost_usd), 1e-6);

  const fmtTs = (ts: string | undefined) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts.slice(0, 16).replace("T", " ");
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <Panel>
      <PanelTitle title="Token Attribution by Lead" sub="Top 20 leads · sorted by most recent activity" />
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-line-soft text-ink-mute text-[10px]">
              <th className="pb-2 text-left font-medium">Lead ID</th>
              <th className="pb-2 text-left font-medium pl-3">Last Activity</th>
              <th className="pb-2 text-right font-medium">Tokens</th>
              <th className="pb-2 text-right font-medium">Cost</th>
              <th className="pb-2 text-left font-medium pl-4">Agents</th>
              <th className="pb-2 text-left font-medium pl-4 w-24">Spend bar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft/50">
            {sorted.map(row => (
              <tr key={row.lead_id} className="hover:bg-surface-2 transition-colors">
                <td className="py-2 pr-2 font-mono text-ink-2">{row.lead_id}</td>
                <td className="py-2 pl-3 font-mono text-[10px] text-ink-mute whitespace-nowrap">{fmtTs(row.timestamp)}</td>
                <td className="py-2 pr-2 text-right font-mono text-ink">{fmtK(row.tokens)}</td>
                <td className="py-2 pr-2 text-right font-mono text-brand font-semibold">{fmt(row.cost_usd)}</td>
                <td className="py-2 pl-4">
                  <div className="flex flex-wrap gap-1">
                    {row.agents.map(a => (
                      <span key={a} className={cn("text-[9px] px-1.5 py-px rounded font-mono font-semibold", getAC(a).bg, getAC(a).text)}>{a}</span>
                    ))}
                  </div>
                </td>
                <td className="py-2 pl-4 w-24">
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

// ── Infrastructure Cost Breakdown ─────────────────────────────────────────────

const INFRA_SERVICES = [
  { name: "NAT Gateway",    icon: "🔀", hex: "#f87171", monthly_usd: 34.56, note: "$0.045/hr + $0.045/GB · largest fixed cost" },
  { name: "ECS Fargate",    icon: "⚙️", hex: "#8b5cf6", monthly_usd: 28.50, note: "API + Worker (0.5+1 vCPU, 1+2 GB) × 720 hr" },
  { name: "ALB",            icon: "⚡", hex: "#0ea5e9", monthly_usd: 16.20, note: "1 listener · $0.0225 base/hr + LCU" },
  { name: "ElastiCache",    icon: "🔴", hex: "#f97316", monthly_usd: 12.24, note: "cache.t3.micro · $0.017/hr × 720 hr" },
  { name: "DynamoDB",       icon: "🗄️", hex: "#f59e0b", monthly_usd:  1.25, note: "PAY_PER_REQUEST · scales to zero" },
  { name: "CloudWatch",     icon: "📋", hex: "#6366f1", monthly_usd:  0.60, note: "$0.50/GB ingested · 1-week retention" },
  { name: "ECR",            icon: "📦", hex: "#ec4899", monthly_usd:  0.50, note: "$0.10/GB/month · ~5 GB images" },
  { name: "CloudFront",     icon: "🌐", hex: "#10b981", monthly_usd:  0.00, note: "Free tier: 10 TB + 2 M req/month" },
  { name: "S3",             icon: "🪣", hex: "#14b8a6", monthly_usd:  0.03, note: "$0.023/GB · ~1 GB SPA assets" },
];

function InfrastructureCostPanel({ aiCostUsd = 0 }: { aiCostUsd?: number }) {
  const infraTotal = INFRA_SERVICES.reduce((s, r) => s + r.monthly_usd, 0);

  // Extrapolate AI spend to monthly (rough: assume data is for current month so far)
  // Show as "actual tracked" — no extrapolation, just a label
  const hasAi = aiCostUsd > 0;

  const pieSegs = [
    ...INFRA_SERVICES.filter(s => s.monthly_usd > 0).map(s => ({
      label: s.name, value: s.monthly_usd, colour: s.hex,
    })),
    ...(hasAi ? [{ label: "Claude AI", value: aiCostUsd, colour: "#7c3aed" }] : []),
  ];
  const pieTotal = pieSegs.reduce((s, x) => s + x.value, 0);
  const sorted   = [...pieSegs].sort((a, b) => b.value - a.value);

  return (
    <Panel className="mt-4">
      <PanelTitle
        title="Infrastructure + AI Cost Mix"
        sub="AWS monthly estimates (us-east-1 on-demand) · AI = actual tracked spend this period"
      />

      <div className="flex flex-col sm:flex-row gap-5">
        {/* Pie chart */}
        <div className="shrink-0 flex flex-col items-center gap-2">
          <PieChart segs={pieSegs} size={130} />
          <div className="text-[10px] text-ink-mute font-mono text-center">
            total shown<br />${pieTotal.toFixed(2)}
          </div>
        </div>

        {/* KPI cards */}
        <div className="flex flex-col gap-2 min-w-[170px]">
          <div className="rounded-lg bg-surface-2 p-2.5">
            <div className="text-[9px] uppercase tracking-widest text-ink-mute font-mono mb-0.5">AWS Infra / mo</div>
            <div className="text-[20px] font-bold font-mono text-sky-400">${infraTotal.toFixed(2)}</div>
            <div className="text-[10px] text-ink-mute">9 services · est. on-demand</div>
          </div>
          <div className="rounded-lg bg-surface-2 p-2.5">
            <div className="text-[9px] uppercase tracking-widest text-ink-mute font-mono mb-0.5">Claude AI (actual)</div>
            <div className="text-[20px] font-bold font-mono text-violet-400">
              {hasAi ? `$${aiCostUsd.toFixed(4)}` : "—"}
            </div>
            <div className="text-[10px] text-ink-mute">
              {hasAi ? "tracked from diagnostics" : "no AI traces recorded yet"}
            </div>
          </div>
          <div className="rounded-lg bg-brand/8 border border-brand/20 p-2 text-center">
            <div className="text-[9px] uppercase tracking-widest text-ink-mute font-mono">NAT Gateway tip</div>
            <div className="text-[10px] text-ink-mute mt-0.5">
              VPC endpoints for DynamoDB/S3 saves ~$30/mo
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-ink-mute font-mono uppercase tracking-widest mb-2">Breakdown</div>
          <div className="space-y-1.5">
            {sorted.map(seg => (
              <div key={seg.label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: seg.colour }} />
                <span className="text-[11px] text-ink-mute flex-1 truncate">{seg.label}</span>
                <span className="text-[11px] font-mono text-ink shrink-0">${seg.value.toFixed(2)}</span>
                <span className="text-[10px] text-ink-mute font-mono w-10 text-right shrink-0">
                  {((seg.value / pieTotal) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
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

  const { data: extended } = useQuery({
    queryKey: ["dashboardExtended"],
    queryFn: api.dashboardExtendedStats,
    staleTime: 120_000,
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

              {/* System-level chart */}
              {extended?.intent_distribution?.length && (
                <div className="mb-4">
                  <SystemCostToSuccessChart
                    finops={data}
                    intent={extended.intent_distribution}
                  />
                </div>
              )}

              {/* Outreach cost trend */}
              <OutreachCostTrendChart series={data.agent_daily_series} />

              {/* Infrastructure + AI cost mix */}
              <InfrastructureCostPanel aiCostUsd={data.total_cost_usd} />
            </div>

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
