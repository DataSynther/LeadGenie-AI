import { useQuery } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { api, type AgentMetrics, type TraceRecord, type ValidationRecord } from "../lib/api";

// ── Colour tokens for diagnostic categories ──────────────────────────────────
const CATEGORY_COLOURS: Record<string, string> = {
  retrieval_failure:      "bg-red-500/10 text-red-400 border-red-500/20",
  insufficient_context:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  ambiguous_prompt:       "bg-violet-500/10 text-violet-400 border-violet-500/20",
  validation_gap:         "bg-orange-500/10 text-orange-400 border-orange-500/20",
  task_model_mismatch:    "bg-sky-500/10 text-sky-400 border-sky-500/20",
};

const CATEGORY_ICONS: Record<string, string> = {
  retrieval_failure:    "⟳",
  insufficient_context: "◫",
  ambiguous_prompt:     "≈",
  validation_gap:       "△",
  task_model_mismatch:  "⌇",
};

const CONSEQUENCE_COLOURS = {
  allow: "bg-emerald-500/10 text-emerald-400",
  block: "bg-red-500/10 text-red-400",
  defer: "bg-amber-500/10 text-amber-400",
};

const AGENT_COLOURS: Record<string, string> = {
  research:     "bg-sky-500/10 text-sky-400",
  outreach:     "bg-violet-500/10 text-violet-400",
  intent:       "bg-amber-500/10 text-amber-400",
  conversation: "bg-emerald-500/10 text-emerald-400",
  governance:   "bg-red-500/10 text-red-400",
};

function agentChip(agent: string) {
  return (
    <span className={cn("font-mono text-[10px] px-1.5 py-px rounded capitalize", AGENT_COLOURS[agent] ?? "bg-surface-2 text-ink-2")}>
      {agent}
    </span>
  );
}

function Bar({ value, max, colour }: { value: number; max: number; colour: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden w-full">
      <div className={cn("h-full rounded-full", colour)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2 mb-4">
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        {sub && <div className="text-[11px] text-ink-2 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[10px] border border-line-soft bg-surface p-5", className)}>
      {children}
    </div>
  );
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

// ── Pillar 4: Diagnostic Categories ─────────────────────────────────────────

function DiagnosticsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["devDiagnostics"],
    queryFn: api.devDiagnostics,
    refetchInterval: 10_000,
  });

  if (isLoading) return <Card><div className="text-ink-2 text-sm">Loading diagnostics…</div></Card>;
  if (!data) return null;

  const cats = Object.entries(data.by_category);

  return (
    <Card>
      <SectionHeader icon="🧬" title="Hallucination Root Cause Analysis" sub={`${data.total_traces} total traces`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {cats.map(([key, cat]) => (
          <div key={key} className={cn("rounded-lg border p-3.5", CATEGORY_COLOURS[key] ?? "bg-surface-2 border-line-soft")}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">{CATEGORY_ICONS[key]} {cat.label}</span>
              <span className="font-serif text-2xl font-bold">{cat.count}</span>
            </div>
            <p className="text-[11px] opacity-70 mb-2 leading-relaxed">{cat.description}</p>
            {cat.recent_events.length > 0 && (
              <div className="space-y-1 border-t border-current/10 pt-2 mt-1">
                {cat.recent_events.slice(0, 3).map((ev, i) => (
                  <div key={i} className="text-[10px] opacity-60 flex gap-1.5">
                    <span>{fmtTime(ev.ts)}</span>
                    <span className="opacity-50">·</span>
                    <span className="capitalize">{ev.agent}</span>
                    {ev.detail && <span className="opacity-50 truncate">· {ev.detail}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Pillar 1: AI Operations — Agent Metrics ──────────────────────────────────

function AgentMetricsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["devAgentMetrics"],
    queryFn: api.devAgentMetrics,
    refetchInterval: 10_000,
  });

  if (isLoading) return <Card><div className="text-ink-2 text-sm">Loading agent metrics…</div></Card>;
  if (!data || Object.keys(data).length === 0) {
    return (
      <Card>
        <SectionHeader icon="📊" title="AI Operations" sub="Per-agent performance" />
        <div className="text-ink-2 text-sm py-6 text-center">No traces yet — run some agent calls to populate.</div>
      </Card>
    );
  }

  const agents = Object.entries(data) as [string, AgentMetrics][];

  return (
    <Card>
      <SectionHeader icon="📊" title="AI Operations" sub="Per-agent aggregated metrics" />
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-ink-2 border-b border-line-soft">
              <th className="text-left font-mono text-[10px] uppercase tracking-widest pb-2 pr-4">Agent</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-widest pb-2 pr-4">Calls</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-widest pb-2 pr-4">Success</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-widest pb-2 pr-4">Latency</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-widest pb-2 pr-4">Tokens</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-widest pb-2 pr-4">Confidence</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-widest pb-2">Val. Pass</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(([agent, m]) => (
              <tr key={agent} className="border-b border-line-soft/50 hover:bg-surface-2/40 transition-colors">
                <td className="py-2.5 pr-4">{agentChip(agent)}</td>
                <td className="text-right pr-4 text-ink font-mono">{m.total_calls}</td>
                <td className="text-right pr-4">
                  <span className={cn("font-mono", m.success_rate >= 0.9 ? "text-emerald-400" : m.success_rate >= 0.7 ? "text-amber-400" : "text-red-400")}>
                    {(m.success_rate * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="text-right pr-4 text-ink-2 font-mono">{m.avg_latency_ms.toFixed(0)}ms</td>
                <td className="text-right pr-4 text-ink-2 font-mono">{m.avg_tokens}</td>
                <td className="text-right pr-4">
                  {m.avg_confidence != null
                    ? <span className={cn("font-mono", m.avg_confidence >= 0.8 ? "text-emerald-400" : m.avg_confidence >= 0.65 ? "text-amber-400" : "text-red-400")}>{(m.avg_confidence * 100).toFixed(0)}%</span>
                    : <span className="text-ink-2">—</span>}
                </td>
                <td className="text-right">
                  <span className={cn("font-mono", m.validation.pass_rate >= 0.9 ? "text-emerald-400" : m.validation.pass_rate >= 0.7 ? "text-amber-400" : "text-red-400")}>
                    {(m.validation.pass_rate * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Pillar 3: Governance & Validation ───────────────────────────────────────

function ValidationPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["devValidationLog"],
    queryFn: () => api.devValidationLog(30),
    refetchInterval: 10_000,
  });

  if (isLoading) return <Card><div className="text-ink-2 text-sm">Loading validation log…</div></Card>;
  if (!data || data.length === 0) {
    return (
      <Card>
        <SectionHeader icon="🛡️" title="Governance & Validation" sub="shape · context · policy · business rules" />
        <div className="text-ink-2 text-sm py-6 text-center">No validation events yet.</div>
      </Card>
    );
  }

  const allow = data.filter(v => v.consequence === "allow").length;
  const block = data.filter(v => v.consequence === "block").length;
  const defer = data.filter(v => v.consequence === "defer").length;
  const total = data.length;

  return (
    <Card>
      <SectionHeader icon="🛡️" title="Governance & Validation" sub="shape · context · policy · business rules" />

      {/* Summary pills */}
      <div className="flex gap-3 mb-4">
        {[
          { label: "Allow", count: allow, colour: "bg-emerald-500/10 text-emerald-400" },
          { label: "Defer", count: defer, colour: "bg-amber-500/10 text-amber-400" },
          { label: "Block", count: block, colour: "bg-red-500/10 text-red-400" },
        ].map(item => (
          <div key={item.label} className={cn("flex-1 rounded-lg p-3 text-center", item.colour)}>
            <div className="font-serif text-2xl font-bold">{item.count}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest opacity-70">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Stacked bar */}
      <div className="flex rounded-full overflow-hidden h-2 mb-4 gap-px">
        {allow > 0 && <div className="bg-emerald-500" style={{ width: `${(allow / total) * 100}%` }} />}
        {defer > 0 && <div className="bg-amber-500" style={{ width: `${(defer / total) * 100}%` }} />}
        {block > 0 && <div className="bg-red-500" style={{ width: `${(block / total) * 100}%` }} />}
      </div>

      {/* Recent events */}
      <div className="space-y-2 max-h-52 overflow-y-auto">
        {data.slice(-15).reverse().map((v: ValidationRecord, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px]">
            <span className={cn("font-mono px-1.5 py-px rounded text-[10px] shrink-0 mt-px", CONSEQUENCE_COLOURS[v.consequence])}>
              {v.consequence}
            </span>
            {agentChip(v.agent)}
            <span className="text-ink-2 truncate flex-1">{v.issues.length > 0 ? v.issues.join(" · ") : "all checks passed"}</span>
            <span className="text-ink-mute shrink-0">{fmtTime(v.ts)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Pillar 2 & 5: Retrieval Intelligence + Prompt Analytics (from traces) ────

function RetrievalAndPromptPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["devTraces"],
    queryFn: () => api.devTraces(100),
    refetchInterval: 10_000,
  });

  if (isLoading) return <Card><div className="text-ink-2 text-sm">Loading trace data…</div></Card>;
  if (!data || data.length === 0) {
    return (
      <Card>
        <SectionHeader icon="🔍" title="Retrieval & Prompt Intelligence" sub="context coverage · ambiguity scores" />
        <div className="text-ink-2 text-sm py-6 text-center">No traces yet.</div>
      </Card>
    );
  }

  // Context coverage by agent
  const byAgent: Record<string, { context_scores: number[]; ambiguity_scores: number[] }> = {};
  for (const t of data) {
    if (!byAgent[t.agent]) byAgent[t.agent] = { context_scores: [], ambiguity_scores: [] };
    if (t.metadata.context_score != null) byAgent[t.agent].context_scores.push(t.metadata.context_score);
    if (t.metadata.ambiguity_score != null) byAgent[t.agent].ambiguity_scores.push(t.metadata.ambiguity_score);
  }

  const agentRows = Object.entries(byAgent).map(([agent, d]) => ({
    agent,
    avgContext: d.context_scores.length ? d.context_scores.reduce((a, b) => a + b, 0) / d.context_scores.length : 0,
    avgAmbiguity: d.ambiguity_scores.length ? d.ambiguity_scores.reduce((a, b) => a + b, 0) / d.ambiguity_scores.length : 0,
  }));

  // Prompt version breakdown
  const promptVersions: Record<string, { count: number; cats: string[] }> = {};
  for (const t of data) {
    const v = t.metadata.prompt_version ?? "unknown";
    if (!promptVersions[v]) promptVersions[v] = { count: 0, cats: [] };
    promptVersions[v].count++;
    promptVersions[v].cats.push(...t.diagnostic_categories);
  }

  return (
    <Card>
      <SectionHeader icon="🔍" title="Retrieval & Prompt Intelligence" sub="context coverage · ambiguity scores · prompt versions" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Context & Ambiguity by agent */}
        <div>
          <div className="label-mono mb-3">Context Coverage & Ambiguity</div>
          <div className="space-y-3">
            {agentRows.map(row => (
              <div key={row.agent}>
                <div className="flex justify-between mb-1">
                  {agentChip(row.agent)}
                  <span className="text-[10px] text-ink-2 font-mono">
                    ctx {(row.avgContext * 100).toFixed(0)}% · ambig {(row.avgAmbiguity * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex gap-1">
                  <div className="flex-1">
                    <Bar value={row.avgContext * 100} max={100} colour="bg-sky-500" />
                  </div>
                  <div className="flex-1">
                    <Bar value={row.avgAmbiguity * 100} max={100} colour="bg-violet-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-3">
            <span className="flex items-center gap-1 text-[10px] text-ink-2"><span className="w-2 h-1.5 rounded-full bg-sky-500 inline-block" />Context</span>
            <span className="flex items-center gap-1 text-[10px] text-ink-2"><span className="w-2 h-1.5 rounded-full bg-violet-500 inline-block" />Ambiguity</span>
          </div>
        </div>

        {/* Prompt version breakdown */}
        <div>
          <div className="label-mono mb-3">Prompt Versions</div>
          <div className="space-y-2">
            {Object.entries(promptVersions).map(([v, d]) => {
              const hasCats = d.cats.filter(Boolean).length;
              return (
                <div key={v} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-ink-2 w-36 truncate">{v}</span>
                  <Bar value={d.count} max={Math.max(...Object.values(promptVersions).map(x => x.count))} colour="bg-brand/60" />
                  <span className="font-mono text-[10px] text-ink-2 w-6 text-right">{d.count}</span>
                  {hasCats > 0 && (
                    <span className="font-mono text-[10px] text-amber-400">{hasCats} flags</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Pillar 8: System Insights — Latency Bottleneck + Cost ───────────────────

function SystemInsightsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["devAgentMetrics"],
    queryFn: api.devAgentMetrics,
    refetchInterval: 10_000,
  });

  if (isLoading) return <Card><div className="text-ink-2 text-sm">Loading system insights…</div></Card>;
  if (!data || Object.keys(data).length === 0) {
    return (
      <Card>
        <SectionHeader icon="⚡" title="System Insights" sub="latency bottlenecks · token cost" />
        <div className="text-ink-2 text-sm py-6 text-center">No data yet.</div>
      </Card>
    );
  }

  const agents = Object.entries(data) as [string, AgentMetrics][];
  const maxLatency = Math.max(...agents.map(([, m]) => m.avg_latency_ms), 1);

  // Approx cost: Sonnet 4.6 = $3/1M input + $15/1M output. Assume 50/50 token split.
  const COST_PER_TOKEN = (3 + 15) / 2 / 1_000_000;
  const totalTokens = agents.reduce((s, [, m]) => s + m.avg_tokens * m.total_calls, 0);
  const totalCalls = agents.reduce((s, [, m]) => s + m.total_calls, 0);
  const estCostUsd = totalTokens * COST_PER_TOKEN;

  return (
    <Card>
      <SectionHeader icon="⚡" title="System Insights" sub="agent bottlenecks · token cost awareness" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Latency bottleneck */}
        <div>
          <div className="label-mono mb-3">Agent Latency (avg ms)</div>
          <div className="space-y-2.5">
            {agents.sort((a, b) => b[1].avg_latency_ms - a[1].avg_latency_ms).map(([agent, m]) => (
              <div key={agent}>
                <div className="flex justify-between mb-1">
                  {agentChip(agent)}
                  <span className="font-mono text-[10px] text-ink-2">{m.avg_latency_ms.toFixed(0)} ms</span>
                </div>
                <Bar value={m.avg_latency_ms} max={maxLatency}
                  colour={m.avg_latency_ms > maxLatency * 0.7 ? "bg-red-400" : m.avg_latency_ms > maxLatency * 0.4 ? "bg-amber-400" : "bg-emerald-400"}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Token cost */}
        <div className="space-y-4">
          <div>
            <div className="label-mono mb-2">Token Usage</div>
            <div className="font-serif text-3xl text-ink">{totalTokens.toLocaleString()}</div>
            <div className="text-[11px] text-ink-2 mt-0.5">across {totalCalls} agent calls</div>
          </div>
          <div>
            <div className="label-mono mb-2">Estimated Cost</div>
            <div className="font-serif text-3xl text-gold-dark">${estCostUsd.toFixed(4)}</div>
            <div className="text-[11px] text-ink-2 mt-0.5">Sonnet 4.6 blended rate</div>
          </div>
          <div className="border-t border-line-soft pt-3 space-y-1">
            {agents.map(([agent, m]) => (
              <div key={agent} className="flex justify-between text-[11px]">
                {agentChip(agent)}
                <span className="text-ink-2 font-mono">{(m.avg_tokens * m.total_calls).toLocaleString()} tok · ${(m.avg_tokens * m.total_calls * COST_PER_TOKEN).toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Live Trace Feed ───────────────────────────────────────────────────────────

function TraceFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["devTracesFeed"],
    queryFn: () => api.devTraces(20),
    refetchInterval: 10_000,
  });

  if (isLoading) return <Card><div className="text-ink-2 text-sm">Loading trace feed…</div></Card>;
  if (!data || data.length === 0) {
    return (
      <Card>
        <SectionHeader icon="📡" title="Live Trace Feed" sub="most recent agent calls" />
        <div className="text-ink-2 text-sm py-6 text-center">No traces yet — trigger an agent call to start.</div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader icon="📡" title="Live Trace Feed" sub="auto-refreshes every 10s" />
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {[...data].reverse().map((t: TraceRecord, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] py-1.5 border-b border-line-soft/50 last:border-0">
            <span className="text-ink-mute font-mono w-16 shrink-0">{fmtTime(t.ts)}</span>
            {agentChip(t.agent)}
            <span className={cn("font-mono shrink-0", t.success ? "text-emerald-400" : "text-red-400")}>
              {t.success ? "✓" : "✗"}
            </span>
            <span className="text-ink-2 font-mono shrink-0">{t.latency_ms.toFixed(0)}ms</span>
            <span className="text-ink-2 font-mono shrink-0">{t.tokens_used}tok</span>
            {t.diagnostic_categories.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {t.diagnostic_categories.map(cat => (
                  <span key={cat} className={cn("px-1 py-px rounded border text-[9px] font-mono", CATEGORY_COLOURS[cat] ?? "bg-surface-2 text-ink-2 border-line-soft")}>
                    {CATEGORY_ICONS[cat] ?? "?"} {cat.split("_")[0]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DevDashboardPage() {
  const { data: metrics } = useQuery({
    queryKey: ["devAgentMetrics"],
    queryFn: api.devAgentMetrics,
    refetchInterval: 10_000,
  });

  const totalCalls = metrics ? Object.values(metrics).reduce((s, m) => s + m.total_calls, 0) : 0;
  const avgSuccess = metrics && Object.keys(metrics).length > 0
    ? Object.values(metrics).reduce((s, m) => s + m.success_rate, 0) / Object.keys(metrics).length
    : null;

  return (
    <>
      <Topbar
        breadcrumb="Dev / Governed Dashboard"
        title={<>AI <em className="text-brand italic">Observability</em></>}
        right={
          <div className="flex items-center gap-2.5">
            <StatusPill>{totalCalls} traces</StatusPill>
            {avgSuccess != null && (
              <StatusPill>{(avgSuccess * 100).toFixed(0)}% avg success</StatusPill>
            )}
            <span className="font-mono text-[10px] text-ink-mute px-2 py-1 rounded bg-surface-2 border border-line-soft">
              Phase 1 · auto-refresh 10s
            </span>
          </div>
        }
      />

      <div className="p-4 sm:p-8 pb-20 space-y-5">
        {/* Row 1: Full-width diagnostic categories */}
        <DiagnosticsPanel />

        {/* Row 2: Agent metrics + validation */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
          <AgentMetricsPanel />
          <ValidationPanel />
        </div>

        {/* Row 3: Retrieval + Prompt */}
        <RetrievalAndPromptPanel />

        {/* Row 4: System Insights + Trace Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SystemInsightsPanel />
          <TraceFeed />
        </div>
      </div>
    </>
  );
}
