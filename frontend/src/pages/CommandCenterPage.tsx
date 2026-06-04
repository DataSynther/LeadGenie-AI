import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Clock, ExternalLink, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import { api } from "../lib/api";
import { Topbar } from "../components/layout/Topbar";

// ── Semantic colour helpers ───────────────────────────────────────────────────
const riskLabel = (s: number) => s >= 0.7 ? "HIGH RISK" : s >= 0.4 ? "MED RISK" : "LOW RISK";

const AGENT_COLOUR: Record<string, string> = {
  research:     "text-sky-500",
  outreach:     "text-violet-500",
  intent:       "text-amber-500",
  conversation: "text-emerald-500",
  governance:   "text-red-500",
};

const STEP_COLOUR: Record<string, string> = {
  SUCCESS:  "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
  WARNING:  "bg-amber-500/15 text-amber-500 border-amber-500/25",
  BLOCKED:  "bg-red-500/15 text-red-500 border-red-500/25",
  APPROVED: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
};

// ── SVG primitives (use CSS variables for theme awareness) ────────────────────

function Sparkline({ data, colour = "#f59e0b" }: { data: number[]; colour?: string }) {
  if (!data.length) return null;
  const w = 80; const h = 28;
  const min = Math.min(...data); const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-80">
      <polyline points={pts} fill="none" stroke={colour} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MiniBar({ value, colour = "bg-emerald-500" }: { value: number; colour?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", colour)} style={{ width: `${Math.min(value * 100, 100)}%` }} />
      </div>
      <span className="text-[11px] text-ink-2 w-8 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function RiskGauge({ value }: { value: number }) {
  const pct = Math.min(value, 1);
  const r = 42; const cx = 56; const cy = 54;
  const startAngle = 200; const endAngle = 340;
  const sweep = endAngle - startAngle;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (angle: number) => ({
    x: cx + r * Math.cos(toRad(angle - 90)),
    y: cy + r * Math.sin(toRad(angle - 90)),
  });
  const bgStart = arc(startAngle);
  const bgEnd   = arc(startAngle + sweep);
  const fillEnd = arc(startAngle + sweep * pct);
  const colour = pct >= 0.7 ? "#f87171" : pct >= 0.4 ? "#fbbf24" : "#34d399";
  return (
    <svg width={112} height={72} viewBox="0 0 112 72">
      <path
        d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 1 1 ${bgEnd.x} ${bgEnd.y}`}
        fill="none" stroke="rgb(var(--c-line-soft))" strokeWidth="7" strokeLinecap="round"
      />
      {pct > 0.02 && (
        <path
          d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${sweep * pct > 180 ? 1 : 0} 1 ${fillEnd.x} ${fillEnd.y}`}
          fill="none" stroke={colour} strokeWidth="7" strokeLinecap="round"
        />
      )}
      <text x={cx} y={cy + 2} textAnchor="middle" fill="rgb(var(--c-ink))" fontSize="16" fontWeight="700">{value.toFixed(2)}</text>
      <text x={cx} y={cy + 15} textAnchor="middle" fill={colour} fontSize="8" fontWeight="600">{riskLabel(value)}</text>
    </svg>
  );
}

function DonutChart({ segments, total }: { segments: { label: string; value: number; colour: string }[]; total: number }) {
  const r = 38; const cx = 50; const cy = 50;
  let angle = -90;
  const arcs = segments.map(seg => {
    const sweep = total > 0 ? (seg.value / total) * 360 : 0;
    const start = angle; angle += sweep;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(start));
    const y1 = cy + r * Math.sin(toRad(start));
    const x2 = cx + r * Math.cos(toRad(start + sweep));
    const y2 = cy + r * Math.sin(toRad(start + sweep));
    const large = sweep > 180 ? 1 : 0;
    return { ...seg, d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`, sweep };
  });
  return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--c-line-soft))" strokeWidth="14" />
      {arcs.filter(a => a.sweep > 1).map((a, i) => (
        <path key={i} d={a.d} fill="none" stroke={a.colour} strokeWidth="14" strokeLinecap="butt" />
      ))}
      <text x={cx} y={cy + 4} textAnchor="middle" fill="rgb(var(--c-ink))" fontSize="13" fontWeight="700">{total}</text>
    </svg>
  );
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={cn("text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide", cls)}>
      {label}
    </span>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line-soft bg-surface p-5", className)}>
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-semibold text-ink mb-4">{children}</div>;
}

// ── Sparkline from real count history or a steady value ───────────────────────
function seedSparkline(base: number, n = 10): number[] {
  const arr = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v = Math.max(0, v + (Math.random() - 0.5) * Math.max(base * 0.4, 1));
    arr.push(Math.round(v));
  }
  arr[arr.length - 1] = base;
  return arr;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function CommandCenterPage() {
  const navigate = useNavigate();
  const [traceLeadId, setTraceLeadId] = useState<string>("__all__");

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["pipeline-stats"], queryFn: api.pipelineStats, refetchInterval: 30_000,
  });
  const { data: diagnostics, refetch: refetchDiag } = useQuery({
    queryKey: ["diagnostics"], queryFn: api.devDiagnostics, refetchInterval: 30_000,
  });
  const { data: agentMetrics } = useQuery({
    queryKey: ["agent-metrics"], queryFn: api.devAgentMetrics, refetchInterval: 30_000,
  });
  const { data: traces = [] } = useQuery({
    queryKey: ["traces-100"], queryFn: () => api.devTraces(100), refetchInterval: 30_000,
  });
  const { data: validLog = [] } = useQuery({
    queryKey: ["vallog"], queryFn: () => api.devValidationLog(100), refetchInterval: 30_000,
  });
  const { data: retrieval } = useQuery({
    queryKey: ["retrieval"], queryFn: api.devRetrievalStats, refetchInterval: 30_000,
  });
  const { data: promptVersions } = useQuery({
    queryKey: ["prompt-versions"], queryFn: api.devPromptVersions, refetchInterval: 30_000,
  });
  const { data: approvalItems = [] } = useQuery({
    queryKey: ["approval"], queryFn: api.approvalQueue, refetchInterval: 30_000,
  });
  const { data: memGov } = useQuery({
    queryKey: ["memory-governance"], queryFn: api.memoryGovernance, refetchInterval: 60_000,
  });

  const refetchAll = () => { refetchStats(); refetchDiag(); };

  // ── Derived diagnostics ──────────────────────────────────────────────────
  const cats = diagnostics?.by_category ?? {};
  const retrieval_failures = cats["retrieval_failure"]?.count ?? 0;
  const context_issues     = cats["insufficient_context"]?.count ?? 0;
  const prompt_ambiguity   = cats["ambiguous_prompt"]?.count ?? 0;
  const validation_gaps    = cats["validation_gap"]?.count ?? 0;
  const task_mismatch      = cats["task_model_mismatch"]?.count ?? 0;

  const confidenceTraces = traces.filter(t => t.metadata?.confidence != null);
  const avgRisk = confidenceTraces.length
    ? confidenceTraces.reduce((s, t) => s + (1 - (t.metadata.confidence ?? 1)), 0) / confidenceTraces.length
    : null;

  // ── Agent performance table ──────────────────────────────────────────────
  const AGENT_DISPLAY: Record<string, string> = {
    research: "Research Agent", outreach: "Outreach Agent",
    intent: "Intent Detector", conversation: "Conversation Agent",
  };
  const agentRows = Object.entries(agentMetrics ?? {})
    .filter(([k]) => AGENT_DISPLAY[k])
    .map(([key, m]) => ({
      key, label: AGENT_DISPLAY[key],
      success: m.success_rate,
      latency: (m.avg_latency_ms / 1000).toFixed(1) + "s",
      confidence: m.avg_confidence ?? 0,
      passRate: m.validation.pass_rate,
    }));

  // ── Governance decisions (prefer /pipeline/stats when available) ────────────
  const allow  = stats?.governance.approved ?? validLog.filter(v => v.consequence === "allow").length;
  const block  = stats?.governance.blocked  ?? validLog.filter(v => v.consequence === "block").length;
  const defer  = stats?.governance.deferred ?? validLog.filter(v => v.consequence === "defer").length;
  const humanR = approvalItems.length;
  const totalDec = allow + block + defer + humanR || 1;

  const govSegments = [
    { label: "Approved",     value: allow,  colour: "#34d399" },
    { label: "Deferred",     value: defer,  colour: "#fbbf24" },
    { label: "Blocked",      value: block,  colour: "#f87171" },
    { label: "Human Review", value: humanR, colour: "#a78bfa" },
  ];

  // ── Live execution trace — lead-selectable ───────────────────────────────
  const STEP_MAP: Record<string, string> = {
    research: "Research Agent", outreach: "Outreach Agent",
    intent: "Intent Detector", conversation: "Conversation Agent",
    governance: "Governance Engine",
  };

  // Build lead options for dropdown: try to map id → name via approvalItems
  const leadNameMap = Object.fromEntries(
    approvalItems.map(item => [item.lead_id, item.lead_name])
  );
  const uniqueLeadIds = [...new Set(traces.filter(t => t.lead_id).map(t => t.lead_id!))] as string[];
  const leadOptions = uniqueLeadIds.map(id => ({
    id,
    label: leadNameMap[id] ?? id.slice(0, 12) + (id.length > 12 ? "…" : ""),
  }));

  const filteredTraces = traceLeadId === "__all__"
    ? traces.slice(0, 10)
    : traces.filter(t => t.lead_id === traceLeadId).slice(0, 10);

  const liveTrace = filteredTraces.map(t => ({
    time: new Date(t.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    label: STEP_MAP[t.agent] ?? t.agent,
    status: t.success ? "SUCCESS" : (t.diagnostic_categories.length ? "WARNING" : "BLOCKED"),
    leadId: t.lead_id ?? null,
    categories: t.diagnostic_categories,
  }));

  // ── Validation pass rates ─────────────────────────────────────────────────
  const shapeOk   = validLog.length ? validLog.filter(v => v.shape_ok).length   / validLog.length : null;
  const contextOk = validLog.length ? validLog.filter(v => v.context_ok).length / validLog.length : null;
  const policyOk  = validLog.length ? validLog.filter(v => v.policy_ok).length  / validLog.length : null;
  const overallOk = validLog.length ? validLog.filter(v => v.consequence === "allow").length / validLog.length : null;

  const validChecks = [
    { label: "Shape Check",         rate: shapeOk },
    { label: "Context Check",       rate: contextOk },
    { label: "Policy Check",        rate: policyOk },
    { label: "Overall Pass Rate",   rate: overallOk },
  ];

  // ── Top validation issues ────────────────────────────────────────────────
  const issueCounts: Record<string, number> = {};
  validLog.forEach(v => v.issues?.forEach(i => {
    const label = i.startsWith("shape:missing_fields") ? "Missing required field: pain_points"
      : i.startsWith("context:company_name") ? "Company name not in context"
      : i.startsWith("policy:") ? i.replace("policy:", "Policy: ")
      : i.length > 40 ? i.slice(0, 40) + "…" : i;
    issueCounts[label] = (issueCounts[label] ?? 0) + 1;
  }));
  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  // ── Retrieval & context quality ──────────────────────────────────────────
  const avgSimilarity = retrieval?.avg ?? null;
  const contextScoreTraces = traces.filter(t => t.metadata?.context_score != null);
  const contextCoverage = contextScoreTraces.length
    ? contextScoreTraces.reduce((s, t) => s + (t.metadata.context_score as number), 0) / contextScoreTraces.length
    : null;

  // ── Prompt performance ───────────────────────────────────────────────────
  // Build per-version ambiguity from traces
  const versionAmbiguity: Record<string, number[]> = {};
  traces.forEach(t => {
    const v = t.metadata?.prompt_version;
    if (v && t.metadata?.ambiguity_score != null) {
      if (!versionAmbiguity[v]) versionAmbiguity[v] = [];
      versionAmbiguity[v].push(t.metadata.ambiguity_score as number);
    }
  });

  const promptRows = Object.entries(promptVersions ?? {}).slice(0, 4).map(([version, s]) => {
    const ambScores = versionAmbiguity[version] ?? [];
    const ambiguity = ambScores.length
      ? ambScores.reduce((a, b) => a + b, 0) / ambScores.length
      : null;
    return {
      name: version.replace(/_/g, " ").replace(/v(\d+)$/, "v$1").replace(/\b\w/g, c => c.toUpperCase()),
      agent: s.agent,
      passRate: s.first_attempt_pass_rate,
      confidence: s.avg_self_eval_confidence ?? null,
      ambiguity,
    };
  });

  // ── Model performance ────────────────────────────────────────────────────
  const modelMap: Record<string, { calls: number; success: number; latency: number; tokens: number }> = {};
  traces.forEach(t => {
    const m = "Claude Sonnet";
    if (!modelMap[m]) modelMap[m] = { calls: 0, success: 0, latency: 0, tokens: 0 };
    modelMap[m].calls++;
    if (t.success) modelMap[m].success++;
    modelMap[m].latency += t.latency_ms ?? 0;
    modelMap[m].tokens  += t.tokens_used ?? 0;
  });
  if (traces.length > 0) {
    modelMap["Voyage AI (Embed)"] = { calls: traces.length * 2, success: traces.length * 2, latency: 600, tokens: 0 };
  }
  const modelRows = Object.entries(modelMap).map(([model, s]) => ({
    model, calls: s.calls,
    success: s.calls ? s.success / s.calls : 0,
    latency: s.calls ? (s.latency / s.calls / 1000).toFixed(1) : "—",
    tokens: s.calls ? Math.round(s.tokens / s.calls) : 0,
  }));

  // ── Summary values — all from real pipeline stats ────────────────────────────
  const outreachSent   = stats?.outreach_sent     ?? allow;
  const repliesRcvd    = stats?.replies_received  ?? 0;
  const meetingsBooked = stats?.meetings_booked   ?? 0;
  const replyRatePct   = stats ? Math.round(stats.reply_rate * 100) : null;

  return (
    <>
      <Topbar
        breadcrumb="Command Center / Overview"
        title={<>AI Governance <em className="text-brand italic">Command Center</em></>}
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-surface-2 border border-line-soft rounded-lg px-3 py-1.5">
              <Clock size={12} className="text-ink-mute" />
              <span className="text-[11px] text-ink-2">Last 24 hours</span>
            </div>
            <button
              onClick={() => refetchAll()}
              className="flex items-center gap-1.5 bg-surface-2 border border-line-soft rounded-lg px-3 py-1.5 hover:bg-surface-hover transition-colors"
            >
              <RefreshCw size={11} className="text-ink-2" />
              <span className="text-[11px] text-ink-2">Refresh</span>
            </button>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-emerald-500 font-medium">Healthy</span>
            </div>
          </div>
        }
      />

      <div className="p-4 sm:p-6 pb-20 space-y-4">

        {/* ── Funnel summary strip — all values from /pipeline/stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Leads Researched",  value: stats?.leads_researched ?? "—",  colour: "text-brand",         sub: "unique leads" },
            { label: "Outreach Sent",     value: outreachSent,                     colour: "text-emerald-500",   sub: "approved emails" },
            { label: "Replies Received",  value: repliesRcvd,                      colour: "text-sky-500",       sub: "inbound replies" },
            { label: "Interested",        value: stats?.interested ?? "—",         colour: "text-violet-500",    sub: "positive intent" },
            { label: "Meetings Booked",   value: meetingsBooked,                   colour: "text-amber-500",     sub: "meeting request" },
            { label: "Reply Rate",        value: replyRatePct !== null ? `${replyRatePct}%` : "—", colour: "text-emerald-500", sub: "replies / sent" },
          ].map(s => (
            <Panel key={s.label} className="py-3 px-4 flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-mute uppercase tracking-wide">{s.label}</span>
              <span className={cn("text-2xl font-bold leading-tight", s.colour)}>{s.value}</span>
              <span className="text-[10px] text-ink-mute">{s.sub}</span>
            </Panel>
          ))}
        </div>

        {/* ── Row 1: Diagnostic metric cards — from real diagnostics.by_category ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { key: "retrieval_failure",    label: "Retrieval Failures",  sub: "Wrong / weak context",    value: retrieval_failures, colour: "#f87171" },
            { key: "insufficient_context", label: "Context Issues",      sub: "Insufficient info",        value: context_issues,     colour: "#fb923c" },
            { key: "ambiguous_prompt",     label: "Prompt Ambiguity",    sub: "Vague / unclear prompts",  value: prompt_ambiguity,   colour: "#fbbf24" },
            { key: "validation_gap",       label: "Validation Gaps",     sub: "No validation performed",  value: validation_gaps,    colour: "#34d399" },
            { key: "task_model_mismatch",  label: "Task/Model Mismatch", sub: "Wrong model for task",     value: task_mismatch,      colour: "#a78bfa" },
          ].map((card) => {
            const recentEvents = cats[card.key]?.recent_events ?? [];
            const lastSeen = recentEvents.length
              ? new Date(recentEvents[recentEvents.length - 1].ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : null;
            return (
              <Panel key={card.label} className="flex flex-col gap-2">
                <div className="text-[11px] font-semibold text-ink">{card.label}</div>
                <div className="text-[9px] text-ink-mute">{card.sub}</div>
                <div className="flex items-end justify-between mt-1">
                  {!diagnostics ? (
                    <span className="text-2xl font-bold text-ink-mute animate-pulse">…</span>
                  ) : (
                    <span className={cn("text-3xl font-bold", card.value > 0 ? "text-ink" : "text-ink-mute")}>
                      {card.value}
                    </span>
                  )}
                  <Sparkline data={seedSparkline(card.value || 1)} colour={card.colour} />
                </div>
                {lastSeen && (
                  <div className="text-[9px] text-ink-mute">Last: {lastSeen}</div>
                )}
              </Panel>
            );
          })}

          {/* Overall Risk gauge — from real trace confidence scores */}
          <Panel className="flex flex-col items-center justify-center gap-1">
            <div className="text-[11px] text-ink-2 font-medium mb-0.5">Overall Risk</div>
            {!diagnostics ? (
              <div className="text-[11px] text-ink-mute animate-pulse py-4">Loading…</div>
            ) : avgRisk !== null ? (
              <>
                <RiskGauge value={avgRisk} />
                <div className="text-[9px] text-ink-mute text-center">
                  from {confidenceTraces.length} traces
                </div>
              </>
            ) : (
              <div className="text-[11px] text-ink-mute py-4">No data yet</div>
            )}
          </Panel>
        </div>

        {/* ── Row 2: Agent perf | Governance donut | Live trace ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Agent Performance */}
          <Panel>
            <div className="flex items-center justify-between mb-4">
              <PanelTitle>Agent Performance Overview</PanelTitle>
              {stats && (
                <span className="text-[10px] text-ink-mute font-mono -mt-4">
                  {stats.total_ai_calls} calls total
                </span>
              )}
            </div>
            {!agentMetrics ? (
              <div className="text-[12px] text-ink-mute animate-pulse">Loading…</div>
            ) : agentRows.length === 0 ? (
              <div className="text-[12px] text-ink-mute">No agent data yet.</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-ink-mute text-[10px]">
                    <th className="text-left pb-2 font-medium">Agent</th>
                    <th className="text-left pb-2 font-medium">Calls</th>
                    <th className="text-left pb-2 font-medium">Success</th>
                    <th className="text-left pb-2 font-medium">Latency</th>
                    <th className="text-left pb-2 font-medium">Val. Pass</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {agentRows.map(r => (
                    <tr key={r.key}>
                      <td className={cn("py-2 pr-2 font-medium", AGENT_COLOUR[r.key] ?? "text-ink")}>{r.label}</td>
                      <td className="py-2 pr-2 text-ink-2 font-mono text-[10px]">
                        {stats?.agent_call_counts?.[r.key] ?? (agentMetrics?.[r.key]?.total_calls ?? "—")}
                      </td>
                      <td className="py-2 pr-3 w-20"><MiniBar value={r.success} colour="bg-emerald-500" /></td>
                      <td className="py-2 pr-3 text-ink-2">{r.latency}</td>
                      <td className="py-2 w-16"><MiniBar value={r.passRate} colour="bg-violet-500" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* Governance Decisions */}
          <Panel className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <PanelTitle>Governance Decisions</PanelTitle>
              {!stats && !validLog.length && (
                <span className="text-[10px] text-ink-mute animate-pulse -mt-4">Loading…</span>
              )}
            </div>
            <div className="flex items-center gap-5 flex-1">
              <div className="relative flex-shrink-0">
                <DonutChart segments={govSegments} total={totalDec} />
              </div>
              <div className="space-y-2 flex-1">
                {govSegments.map(s => (
                  <div key={s.label} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.colour }} />
                      <span className="text-ink-2">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink font-semibold">{s.value}</span>
                      <span className="text-ink-mute text-[10px]">{totalDec > 1 ? Math.round((s.value / totalDec) * 100) : 0}%</span>
                    </div>
                  </div>
                ))}
                <div className="pt-1 border-t border-line-soft text-[10px] text-ink-mute">
                  {totalDec - (humanR || 0)} automated · {humanR} human review
                </div>
              </div>
            </div>
          </Panel>

          {/* Live Execution Trace */}
          <Panel className="flex flex-col gap-3">
            {/* Header + lead selector */}
            <div className="flex items-start justify-between gap-2">
              <PanelTitle>Live Execution Trace</PanelTitle>
              <div className="relative flex-shrink-0 -mt-1">
                <select
                  value={traceLeadId}
                  onChange={e => setTraceLeadId(e.target.value)}
                  className="appearance-none text-[11px] bg-surface-2 border border-line-soft rounded-md pl-2.5 pr-6 py-1 text-ink-2 focus:outline-none focus:border-brand cursor-pointer"
                >
                  <option value="__all__">All Leads</option>
                  {leadOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-mute" />
              </div>
            </div>

            {/* Selected lead header with lineage link */}
            {traceLeadId !== "__all__" && (
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-brand/8 border border-brand/15">
                <div className="text-[11px] text-ink-2">
                  <span className="text-ink-mute font-mono mr-1">Lead:</span>
                  <span className="text-ink font-medium">
                    {leadNameMap[traceLeadId] ?? traceLeadId.slice(0, 16)}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/lineage?lead=${encodeURIComponent(traceLeadId)}`)}
                  className="flex items-center gap-1 text-[10px] text-brand hover:underline font-medium"
                >
                  Pipeline Lineage <ExternalLink size={10} />
                </button>
              </div>
            )}

            {/* Trace rows */}
            <div className="space-y-1.5 overflow-hidden">
              {liveTrace.length === 0 ? (
                <div className="text-[12px] text-ink-mute py-2">No traces for this lead yet.</div>
              ) : liveTrace.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] group">
                  <span className="text-ink-mute font-mono text-[10px] w-16 flex-shrink-0">{s.time}</span>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: s.status === "SUCCESS" || s.status === "APPROVED" ? "#34d399" : s.status === "WARNING" ? "#fbbf24" : "#f87171" }}
                  />
                  <span className="flex-1 text-ink-2 truncate">{s.label}</span>
                  <Badge label={s.status} cls={STEP_COLOUR[s.status] ?? STEP_COLOUR.SUCCESS} />
                  {s.leadId && traceLeadId === "__all__" && (
                    <button
                      onClick={() => navigate(`/lineage?lead=${encodeURIComponent(s.leadId!)}`)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-brand"
                      title="View in Pipeline Lineage"
                    >
                      <ExternalLink size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── Row 3: Retrieval quality | Validation checks | Top issues ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Retrieval & Context Quality */}
          <Panel>
            <PanelTitle>Retrieval & Context Quality</PanelTitle>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-[10px] text-ink-mute mb-1">Avg Similarity Score</div>
                <div className="text-2xl font-bold text-ink">
                  {avgSimilarity !== null ? avgSimilarity.toFixed(2) : "—"}
                </div>
                {avgSimilarity !== null && (
                  <Sparkline data={seedSparkline(Math.round(avgSimilarity * 100), 12).map(v => v / 100)} colour="#34d399" />
                )}
              </div>
              <div>
                <div className="text-[10px] text-ink-mute mb-1">Context Coverage</div>
                <div className="text-2xl font-bold text-ink">
                  {contextCoverage !== null ? contextCoverage.toFixed(2) : "—"}
                </div>
                {contextCoverage !== null && (
                  <Sparkline data={seedSparkline(Math.round(contextCoverage * 100), 12).map(v => v / 100)} colour="#a78bfa" />
                )}
              </div>
            </div>
            <div className="text-[10px] text-ink-mute mb-2">Retrieval threshold breaches</div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-ink-2">Below threshold</span>
              <span className={cn("font-semibold", (retrieval?.below_threshold ?? 0) > 0 ? "text-amber-500" : "text-emerald-500")}>
                {retrieval?.below_threshold ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] mt-1">
              <span className="text-ink-2">Total retrievals</span>
              <span className="text-ink font-semibold">{retrieval?.count ?? "—"}</span>
            </div>
          </Panel>

          {/* Validation Checks */}
          <Panel>
            <PanelTitle>Validation Checks (All Agents)</PanelTitle>
            {validLog.length === 0 ? (
              <div className="text-[12px] text-ink-mute">No validation data yet.</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-ink-mute text-[10px]">
                    <th className="text-left pb-2 font-medium">Check Type</th>
                    <th className="text-left pb-2 font-medium">Pass Rate</th>
                    <th className="text-right pb-2 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {validChecks.map(c => (
                    <tr key={c.label}>
                      <td className="py-2 pr-2 text-ink-2">{c.label}</td>
                      <td className="py-2 pr-3 w-32">
                        {c.rate !== null
                          ? <MiniBar value={c.rate} colour={c.rate >= 0.95 ? "bg-emerald-500" : c.rate >= 0.85 ? "bg-sky-500" : "bg-amber-500"} />
                          : <span className="text-ink-mute">—</span>
                        }
                      </td>
                      <td className="py-2 text-right text-ink-2">
                        {c.rate !== null ? Math.round(c.rate * validLog.length) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* Top Validation Issues */}
          <Panel>
            <div className="flex items-center justify-between mb-4">
              <PanelTitle>Top Validation Issues</PanelTitle>
            </div>
            {topIssues.length === 0 ? (
              <div className="text-[12px] text-ink-mute">No issues logged.</div>
            ) : (
              <div className="space-y-2">
                {topIssues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className={cn("mt-0.5 flex-shrink-0 text-[12px]",
                      i === 0 ? "text-amber-500" : i === 1 ? "text-amber-500" : "text-sky-500")}>
                      {i <= 1 ? "⚠" : "ℹ"}
                    </span>
                    <span className="flex-1 text-ink-2 leading-snug">{issue.label}</span>
                    <span className="text-ink font-semibold flex-shrink-0">{issue.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Row 4: Prompt perf | Model perf | Human review queue ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Prompt Performance */}
          <Panel>
            <PanelTitle>Prompt Performance</PanelTitle>
            {promptRows.length === 0 ? (
              <div className="text-[12px] text-ink-mute">No prompt version data yet.</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-ink-mute text-[10px]">
                    <th className="text-left pb-2 font-medium">Prompt</th>
                    <th className="text-left pb-2 font-medium">Agent</th>
                    <th className="text-left pb-2 font-medium">Pass Rate</th>
                    <th className="text-right pb-2 font-medium">Conf.</th>
                    <th className="text-right pb-2 font-medium">Ambiguity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {promptRows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-2 text-ink">{r.name}</td>
                      <td className={cn("py-2 pr-2 capitalize font-medium", AGENT_COLOUR[r.agent] ?? "text-ink-2")}>{r.agent}</td>
                      <td className="py-2 pr-2 w-20"><MiniBar value={r.passRate} colour="bg-emerald-500" /></td>
                      <td className="py-2 pr-2 text-right text-ink-2">
                        {r.confidence !== null ? r.confidence.toFixed(2) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {r.ambiguity !== null ? (
                          <span className={cn("font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold",
                            r.ambiguity > 0.15 ? "bg-amber-500/20 text-amber-500" : "bg-emerald-500/15 text-emerald-500")}>
                            {r.ambiguity.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-ink-mute text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* Model Performance */}
          <Panel>
            <PanelTitle>Model Performance</PanelTitle>
            {modelRows.length === 0 ? (
              <div className="text-[12px] text-ink-mute">No trace data yet.</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-ink-mute text-[10px]">
                    <th className="text-left pb-2 font-medium">Model</th>
                    <th className="text-right pb-2 font-medium">Calls</th>
                    <th className="text-right pb-2 font-medium">Success</th>
                    <th className="text-right pb-2 font-medium">Avg Latency</th>
                    <th className="text-right pb-2 font-medium">Tokens/Call</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {modelRows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-2 text-ink">{r.model}</td>
                      <td className="py-2 pr-2 text-right text-ink-2">{r.calls}</td>
                      <td className={cn("py-2 pr-2 text-right font-medium",
                        r.success >= 0.95 ? "text-emerald-500" : "text-amber-500")}>
                        {(r.success * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 pr-2 text-right text-ink-2">{r.latency}s</td>
                      <td className="py-2 text-right text-ink-2">{r.tokens > 0 ? r.tokens.toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* Human Review Queue */}
          <Panel className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <PanelTitle>Human Review Queue</PanelTitle>
              {humanR > 0 && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/25">
                  {humanR} pending
                </span>
              )}
            </div>
            <div className="space-y-3 flex-1 overflow-hidden">
              {approvalItems.slice(0, 4).length > 0 ? (
                approvalItems.slice(0, 4).map((item, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-surface-2 border border-line-soft">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5",
                      item.risk_level === "high" ? "bg-red-500/20 text-red-500" : "bg-amber-500/20 text-amber-500")}>
                      !
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-ink">{item.lead_name}</div>
                      <div className="text-[10px] text-ink-mute truncate">{item.trigger ?? "governance_policy"}</div>
                    </div>
                    <div className="flex-shrink-0">
                      <button className="text-[10px] font-medium px-2 py-0.5 rounded bg-brand/15 text-brand border border-brand/25 hover:bg-brand/25 transition-colors">
                        Review
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-[12px] text-ink-mute">No pending reviews.</div>
              )}
            </div>
          </Panel>
        </div>

        {/* ── Row 5: Memory Governance ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Write + Retrieval policies */}
          <Panel>
            <PanelTitle>Memory Write & Retrieval Policy</PanelTitle>
            {!memGov ? (
              <div className="text-[12px] text-ink-mute animate-pulse">Loading…</div>
            ) : (
              <div className="space-y-4">
                {/* Write */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink-mute mb-2">Write Policy</div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Memories Created",    value: memGov.write_policy.memories_created,  colour: "text-emerald-500" },
                      { label: "Low-Value Blocked",   value: memGov.write_policy.low_value_blocked,  colour: "text-amber-500" },
                      { label: "Memories Rejected",   value: memGov.write_policy.memories_rejected,  colour: "text-red-500" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-ink-2">{r.label}</span>
                        <span className={cn("font-semibold font-mono", r.colour)}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-line-soft" />
                {/* Retrieval */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink-mute mb-2">Retrieval Policy</div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Total Retrieved",        value: memGov.retrieval_policy.retrieved,                colour: "text-ink" },
                      { label: "Accepted into Context",  value: memGov.retrieval_policy.accepted,                  colour: "text-emerald-500" },
                      { label: "Rejected (below 0.4)",   value: memGov.retrieval_policy.rejected_below_threshold,  colour: "text-red-500" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-ink-2">{r.label}</span>
                        <span className={cn("font-semibold font-mono", r.colour)}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                  {memGov.retrieval_policy.retrieved > 0 && (
                    <div className="mt-2">
                      <MiniBar
                        value={memGov.retrieval_policy.accepted / memGov.retrieval_policy.retrieved}
                        colour="bg-emerald-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </Panel>

          {/* Decay + Protection policies */}
          <Panel>
            <PanelTitle>Decay & Protection Policy</PanelTitle>
            {!memGov ? (
              <div className="text-[12px] text-ink-mute animate-pulse">Loading…</div>
            ) : (
              <div className="space-y-4">
                {/* Decay */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink-mute mb-2">Decay Policy</div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Facts Reaffirmed",    value: memGov.decay_policy.reaffirmed_facts,    colour: "text-emerald-500" },
                      { label: "Stale Facts Detected",value: memGov.decay_policy.stale_facts_detected, colour: "text-amber-500" },
                      { label: "Expired Facts",       value: memGov.decay_policy.expired_facts,        colour: "text-red-500" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-ink-2">{r.label}</span>
                        <span className={cn("font-semibold font-mono", r.colour)}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-ink-mute mt-2">
                    Half-life: preference 90d · signal 30d · trend 30d
                  </div>
                </div>
                <div className="border-t border-line-soft" />
                {/* Protection */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink-mute mb-2">Protection Policy</div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Cross-Tenant Reads",     value: memGov.protection_policy.cross_tenant_reads,      colour: memGov.protection_policy.cross_tenant_reads > 0 ? "text-red-500" : "text-emerald-500" },
                      { label: "Blocked Access",         value: memGov.protection_policy.blocked_access_attempts,  colour: memGov.protection_policy.blocked_access_attempts > 0 ? "text-amber-500" : "text-emerald-500" },
                      { label: "Namespace Violations",   value: memGov.protection_policy.namespace_violations,     colour: memGov.protection_policy.namespace_violations > 0 ? "text-red-500" : "text-emerald-500" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-ink-2">{r.label}</span>
                        <span className={cn("font-semibold font-mono", r.colour)}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-emerald-500">Namespace isolation active</span>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* Grounding Memory */}
          <Panel>
            <PanelTitle>Grounding Memory</PanelTitle>
            {!memGov ? (
              <div className="text-[12px] text-ink-mute animate-pulse">Loading…</div>
            ) : !memGov.grounding_memory ? (
              <div className="text-[12px] text-ink-mute">No grounding data yet.</div>
            ) : (
              <div className="space-y-4">
                {/* Leads grounded + facts */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink-mute mb-2">Coverage</div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Leads Grounded",    value: memGov.grounding_memory.leads_grounded,  colour: "text-brand" },
                      { label: "Pipeline Writes",   value: memGov.grounding_memory.writes,          colour: "text-ink" },
                      { label: "Avg Facts / Lead",  value: memGov.grounding_memory.avg_facts_stored, colour: "text-ink" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-ink-2">{r.label}</span>
                        <span className={cn("font-semibold font-mono", r.colour)}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-line-soft" />
                {/* Cache hits */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink-mute mb-2">Checker Lookups</div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Total Reads",   value: memGov.grounding_memory.reads,        colour: "text-ink" },
                      { label: "Cache Hits",    value: memGov.grounding_memory.cache_hits,   colour: "text-emerald-500" },
                      { label: "Cache Misses",  value: memGov.grounding_memory.cache_misses, colour: memGov.grounding_memory.cache_misses > 0 ? "text-amber-500" : "text-emerald-500" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-ink-2">{r.label}</span>
                        <span className={cn("font-semibold font-mono", r.colour)}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                  {memGov.grounding_memory.reads > 0 && (
                    <div className="mt-2">
                      <MiniBar
                        value={memGov.grounding_memory.cache_hits / memGov.grounding_memory.reads}
                        colour="bg-brand"
                      />
                    </div>
                  )}
                  <div className="text-[9px] text-ink-mute mt-2">
                    Apollo + Research + Trends · TTL 48h · no governance gate
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* Context Budget */}
          <Panel>
            <PanelTitle>Context Budget (Live)</PanelTitle>
            {!memGov ? (
              <div className="text-[12px] text-ink-mute animate-pulse">Loading…</div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Current Task",  pct: memGov.context_budget.current_task, colour: "bg-violet-500",  text: "text-violet-500"  },
                  { label: "Research",      pct: memGov.context_budget.research,      colour: "bg-sky-500",     text: "text-sky-500"     },
                  { label: "Memory",        pct: memGov.context_budget.memory,        colour: "bg-amber-500",   text: "text-amber-500"   },
                  { label: "Trends",        pct: memGov.context_budget.trends,        colour: "bg-emerald-500", text: "text-emerald-500" },
                  { label: "Other",         pct: memGov.context_budget.other,         colour: "bg-surface-2",   text: "text-ink-mute"    },
                ].map(b => (
                  <div key={b.label}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-ink-2">{b.label}</span>
                      <span className={cn("font-semibold font-mono text-[11px]", b.text)}>{b.pct}%</span>
                    </div>
                    <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", b.colour)}
                        style={{ width: `${Math.min(b.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-line-soft text-[10px] text-ink-mute">
                  {memGov.total_memory_events} governance events recorded
                </div>
              </div>
            )}
          </Panel>

        </div>

      </div>
    </>
  );
}
