import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Topbar } from "../components/layout/Topbar";
import { StatusPill } from "../components/StatusPill";
import { KpiCard } from "../components/dashboard/KpiCard";
import { FunnelCard } from "../components/dashboard/FunnelCard";
import { RiskDistributionCard } from "../components/dashboard/RiskDistributionCard";
import { api, type DashboardExtendedStats, type FinOpsSummary, type KbInsights } from "../lib/api";
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
      <div className="font-serif text-[18px] leading-snug tracking-[-0.01em] text-ink">{title}</div>
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
    <Panel><PanelTitle title="Pipeline Insights" /><p className="text-[11px] text-ink-mute">No outreach data yet.</p></Panel>
  );
  const maxCount = Math.max(...data.map(r => r.outreach_count), 1);
  return (
    <Panel className="flex flex-col max-h-[340px]">
      <PanelTitle title="Pipeline Insights" sub="Top companies by outreach volume · reply rate shows engagement quality" />
      <div className="space-y-3 flex-1 overflow-y-auto min-h-0 pr-1">
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
      <div className="flex gap-4 mt-3 pt-3 border-t border-line-soft flex-shrink-0">
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
  research:            "#0ea5e9",
  outreach:            "#8b5cf6",
  conversation:        "#10b981",
  intent:              "#f59e0b",
  gov:                 "#f87171",
  governance:          "#f87171",
  "hallucination chk": "#ec4899",
  schedule:            "#a78bfa",
  reply:               "#2dd4bf",
};

function MiniFinOpsPanel({ data }: { data: FinOpsSummary }) {
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
    <Panel className="h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 flex-shrink-0">
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

      {/* ── Cost split pie chart ──────────────────────────────────────────── */}
      {(() => {
        // Build entry list: all agents + inject hallucination check if tracked separately
        const rawEntries: [string, number][] = Object.entries(data.cost_by_agent)
          .map(([a, v]) => [a, v.cost_usd]);
        const hasGovInAgents = rawEntries.some(([a]) => a === "gov" || a === "governance");
        if (!hasGovInAgents && govCost > 0) {
          rawEntries.push(["hallucination chk", govCost]);
        }
        // Remove zero-cost entries
        const entries = rawEntries.filter(([, c]) => c > 1e-8);
        const chartTotal = entries.reduce((s, [, c]) => s + c, 0) || 1;

        const size = 110; const cx = size / 2; const cy = size / 2; const r = size / 2 - 2;
        let angle = -90;
        const wedges = entries.map(([agent, cost]) => {
          const sweep = (cost / chartTotal) * 360;
          if (sweep < 1) { angle += sweep; return null; }
          const s = (angle * Math.PI) / 180;
          const e = ((angle + sweep) * Math.PI) / 180;
          const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
          const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
          const colour = AGENT_LINE[agent] ?? "#94a3b8";
          angle += sweep;
          // Filled wedge: center → arc start → arc → close to center
          return (
            <path key={agent}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} Z`}
              fill={colour} stroke="rgb(var(--c-surface))" strokeWidth="1.5">
              <title>{agent}: ${cost.toFixed(4)} ({((cost / chartTotal) * 100).toFixed(1)}%)</title>
            </path>
          );
        });

        return (
          <div className="flex items-center gap-4 mb-4">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
              <circle cx={cx} cy={cy} r={r} fill="rgb(var(--c-surface-2))" />
              {wedges}
            </svg>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {entries.map(([agent, cost]) => {
                const pct = (cost / chartTotal) * 100;
                const colour = AGENT_LINE[agent] ?? "#94a3b8";
                return (
                  <div key={agent} className="flex items-center gap-1.5 text-[10px]">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: colour }} />
                    <span className="text-ink-2 capitalize flex-1 truncate">{agent}</span>
                    <span className="font-mono font-semibold text-ink">{pct.toFixed(0)}%</span>
                    <span className="font-mono text-ink-mute text-[9px]">${cost.toFixed(4)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Governance overhead ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 mb-3">
        <div className="text-[10px] font-semibold text-ink mb-2">Governance Overhead</div>
        {govCost === 0 && govChecks === 0 ? (
          <p className="text-[10px] text-ink-mute">
            No governance costs recorded yet — governance spend is bundled into agent traces when it runs.
          </p>
        ) : (
          <>
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
          </>
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

// ── KB Insights panel ─────────────────────────────────────────────────────────

const VERTICAL_C: Record<string, string> = {
  data_science:      "#8b5cf6",
  data_engineering:  "#0ea5e9",
  generic:           "#94a3b8",
};
const DOMAIN_C: Record<string, string> = {
  fintech:           "#f59e0b",
  ecommerce:         "#10b981",
  manufacturing:     "#0ea5e9",
  logistics:         "#8b5cf6",
  healthcare:        "#f87171",
  generic:           "#94a3b8",
};
const CATEGORY_BADGE: Record<string, string> = {
  case_study:   "bg-violet-500/10 text-violet-400",
  capability:   "bg-sky-500/10 text-sky-400",
  social_proof: "bg-emerald-500/10 text-emerald-400",
  differentiator:"bg-amber-500/10 text-amber-500",
};

// ── word cloud helper ─────────────────────────────────────────────────────────

const WC_COLORS = [
  "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#f87171",
  "#a78bfa", "#38bdf8", "#34d399", "#fbbf24", "#fb7185",
  "#c084fc", "#60a5fa", "#4ade80", "#e879f9", "#fb923c",
];

function shortenLabel(label: string, maxWords = 2): string {
  const words = label.trim().split(/\s+/);
  return words.length <= maxWords ? label : words.slice(0, maxWords).join(" ") + "…";
}

// ── KB keyword extractors ─────────────────────────────────────────────────────

const WORD_STOP = new Set([
  "a","an","the","and","or","in","on","at","to","for","of","with","by","from","as",
  "is","was","are","were","be","been","has","have","had","do","does","did","will",
  "would","could","should","may","might","can","our","we","their","its","this","that",
  "which","who","what","how","all","also","more","such","than","them","then","they",
  "via","per","after","into","out","about","not","just","it","your","you","both",
  "each","over","under","between","across","through","using","other","some","any",
  "one","two","three","four","five","six","seven","eight","nine","ten",
  "help","helps","enable","enables","building","built","made","make","create",
  "allows","allow","ensure","ensures","provide","provides","support","supports",
  "used","use","while","within","without","including","included","include",
  "ensuring","providing","resulting","based","like","new","end","top","high","large",
]);

const CAP_STOP = new Set([
  "The","For","And","With","Our","We","This","That","In","By","From","To","An","A",
  "Is","It","On","At","Of","As","Or","But","So","Has","Have","Had","Was","Were",
  "Are","Be","Been","Can","May","Will","Not","Its","Their","These","Those","Which",
  "Who","What","How","All","Also","More","Than","Them","Then","They","Into","Out",
]);

/** Clean a raw label — strip leading/trailing punctuation and whitespace */
function cleanLabel(raw: string): string {
  return raw.trim().replace(/^[\s,;&()\[\]|/\\]+|[\s,;&()\[\]|/\\]+$/g, "").trim();
}

/** Extract rich tech phrases and metric+descriptor combos from free text */
function extractTechTerms(text: string): { label: string; weight: number }[] {
  const results: { label: string; weight: number }[] = [];

  // Metric + 2-3 following CONTENT words (skip stop words): "50% cost reduction", "3x faster processing"
  const metricCtx = /\b(\d+(?:\.\d+)?[xX%×]|\$\d+(?:\.\d+)?[MKBk]?)\s+((?:[a-z][a-z\-]*\s+){0,3}[a-z][a-z\-]{2,})/g;
  for (const m of [...text.matchAll(metricCtx)]) {
    const contentWords = m[2].trim().split(/\s+/)
      .filter(w => !WORD_STOP.has(w.toLowerCase()) && w.length > 2)
      .slice(0, 3);
    if (contentWords.length >= 2) {
      const phrase = cleanLabel(`${m[1]} ${contentWords.join(" ")}`);
      if (phrase.length >= 6 && phrase.length <= 42) results.push({ label: phrase, weight: 5 });
    }
  }

  // Multi-word capitalized phrases up to 3 words: "AWS Data Lake", "Snowflake Lakehouse"
  const multi = text.match(/\b[A-Z][A-Za-z0-9]+(?:[\s\-][A-Z][A-Za-z0-9]+)+\b/g) ?? [];
  for (const t of multi) {
    const words = t.split(/[\s\-]+/).filter(w => !CAP_STOP.has(w));
    if (words.length >= 2) results.push({ label: words.slice(0, 3).join(" "), weight: 3 });
  }

  // All-caps acronyms: "SAP", "CPG", "ETL"
  for (const t of (text.match(/\b[A-Z]{2,6}\b/g) ?? [])) results.push({ label: t, weight: 3 });

  // Single capitalized product/tech names
  for (const t of (text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [])) {
    if (!CAP_STOP.has(t) && !WORD_STOP.has(t.toLowerCase())) results.push({ label: t, weight: 2 });
  }

  // Known compound tech phrases
  const techRx = /\b(data lake|lakehouse|data warehouse|machine learning|deep learning|real[\s\-]time|cloud native|end[\s\-]to[\s\-]end|three[\s\-]tier|data mesh|data pipeline|data science|data engineering|natural language|computer vision|feature store|model serving|stream processing|batch processing|event driven|microservices|api gateway|cost reduction|revenue growth|lead generation|pipeline automation|digital transformation|system integration|predictive analytics|cloud migration|customer acquisition|data integration|business intelligence|data governance|workflow automation|performance optimization|query performance|infrastructure cost|operational efficiency|time to market|data quality)\b/gi;
  for (const t of (text.match(techRx) ?? [])) results.push({ label: t.replace(/-/g, " ").toLowerCase(), weight: 3 });

  return results;
}

/** Cloud 1 — what's in the knowledge base (KB catalogue facts) */
function buildKbContentsCloud(data: KbInsights): { label: string; count: number }[] {
  const freq: Record<string, number> = {};
  const add = (raw: string, w: number) => {
    const k = cleanLabel(raw);
    if (k.length < 3 || k.length > 48) return;
    freq[k] = (freq[k] ?? 0) + w;
  };

  for (const c of data.top_claims) {
    // metric field is often a comma-separated list — split and add each part individually
    if (c.metric) {
      for (const part of c.metric.split(/[,;]/)) {
        const p = cleanLabel(part);
        if (p.length >= 3 && p.length <= 45) add(p, 5);
      }
    }
    const raw = `${c.claim} ${c.tone_use ?? ""}`;
    for (const { label, weight } of extractTechTerms(raw)) add(label, weight);
    add(c.domain.replace(/_/g, " "), 2);
    add(c.vertical.replace(/_/g, " "), 2);
  }

  for (const v of data.kb_coverage.by_vertical) add(v.vertical.replace(/_/g, " "), v.count);
  for (const d of data.kb_coverage.by_domain)   add(d.domain.replace(/_/g, " "),   d.count);

  return Object.entries(freq)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 32);
}

/** Cloud 2 — what's been retrieved and surfaced into outreach emails */
function buildRetrievedCloud(data: KbInsights): { label: string; count: number }[] {
  const freq: Record<string, number> = {};
  const add = (raw: string, w: number) => {
    const k = cleanLabel(raw);
    if (k.length < 3 || k.length > 48) return;
    freq[k] = (freq[k] ?? 0) + w;
  };

  for (const ind of data.retrieval_context.top_industries) {
    const terms = extractTechTerms(ind.label);
    for (const { label, weight } of terms.slice(0, 2)) add(label, ind.count * weight);
    // Full industry label — strip trailing "&", "and", connectors, keep ≤3 content words
    const indWords = ind.label.trim().split(/\s+/)
      .filter(w => w !== "&" && w.toLowerCase() !== "and" && w !== ",")
      .slice(0, 3);
    add(indWords.join(" "), ind.count * 2);
  }

  for (const p of data.retrieval_context.top_pain_points) {
    const terms = extractTechTerms(p.label);
    for (const { label, weight } of terms.slice(0, 3)) add(label, p.count * weight);
    const sig = p.label.split(/\s+/)
      .filter(w => !WORD_STOP.has(w.toLowerCase()) && w.length > 2)
      .slice(0, 4).join(" ");
    if (sig) add(sig, p.count * 2);
  }

  return Object.entries(freq)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 32);
}

// ── CSS flex-wrap tag cloud ───────────────────────────────────────────────────

function WordCloud({ items, centerWord, onTagClick }: {
  items: { label: string; count: number }[];
  centerWord: string;
  onTagClick?: (label: string) => void;
}) {
  if (!items.length) return null;

  const sorted = [...items].sort((a, b) => b.count - a.count).slice(0, 28);
  const max  = sorted[0]?.count  || 1;
  const min  = sorted[sorted.length - 1]?.count || 0;
  const rng  = max - min || 1;

  // Interleave high and low frequency items so sizes mix naturally across the cloud
  const interleaved: typeof sorted = [];
  const lo = sorted.filter((_, i) => i % 2 === 1);
  sorted.filter((_, i) => i % 2 === 0).forEach((it, i) => {
    interleaved.push(it);
    if (lo[i]) interleaved.push(lo[i]);
  });
  const half = Math.ceil(interleaved.length / 2);

  // Spread colors so adjacent tags avoid the same hue
  const colorFor = (idx: number) => WC_COLORS[(idx * 3 + 1) % WC_COLORS.length];

  const renderTag = (item: { label: string; count: number }, sortedIdx: number) => {
    const norm    = (item.count - min) / rng;
    const fs      = Math.round(9 + norm * 14);          // 9 – 23px
    const fw      = norm >= 0.6 ? 800 : norm >= 0.35 ? 700 : 600;
    const color   = colorFor(sortedIdx);
    const isPill  = norm >= 0.45;

    const clickable = !!onTagClick;
    return (
      <span key={sortedIdx}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onTagClick(item.label) : undefined}
        onKeyDown={clickable ? (e) => e.key === "Enter" && onTagClick(item.label) : undefined}
        className={cn(
          "inline-block leading-snug transition-transform",
          isPill ? "rounded-full border" : "rounded",
          clickable ? "hover:scale-105 hover:brightness-110" : "",
        )}
        style={{
          fontSize:    `${fs}px`,
          fontWeight:  fw,
          color,
          cursor:      clickable ? "pointer" : "default",
          padding:     isPill ? "2px 9px" : "1px 4px",
          ...(isPill ? { background: `${color}18`, borderColor: `${color}40` } : {}),
        }}
        title={clickable ? `Open emails where "${item.label}" was used` : item.label}>
        {item.label}
      </span>
    );
  };

  return (
    // Center word is inline — no w-full row — so tags flow on all sides of it
    <div className="flex flex-wrap gap-x-3 gap-y-2 items-baseline justify-center px-3 py-3 min-h-[140px]">
      {interleaved.slice(0, half).map((item) => renderTag(item, interleaved.indexOf(item)))}
      <span
        className="inline-block font-black tracking-tight select-none mx-1"
        style={{ fontSize: "30px", color: "#8b5cf6", lineHeight: "1.15", textShadow: "0 0 28px #8b5cf650" }}>
        {centerWord}
      </span>
      {interleaved.slice(half).map((item) => renderTag(item, interleaved.indexOf(item)))}
    </div>
  );
}

function KbInsightsPanel({ data }: { data: KbInsights }) {
  const { kb_coverage, retrieval_context } = data;
  const kbCloud       = useMemo(() => buildKbContentsCloud(data), [data]);
  const retrievedCloud = useMemo(() => buildRetrievedCloud(data),  [data]);
  const maxVertical = Math.max(...kb_coverage.by_vertical.map(v => v.count), 1);
  const scoreColour = retrieval_context.avg_retrieval_score >= 0.7
    ? "text-emerald-500" : retrieval_context.avg_retrieval_score >= 0.5
    ? "text-amber-500" : "text-red-400";
  const navigate = useNavigate();
  const handleRetrievedClick = (label: string) =>
    navigate(`/approval?q=${encodeURIComponent(label)}&tab=email`);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[3fr_7fr] gap-4">

      {/* ── Col 1 (30%): KB Coverage + Target Industries + link ─────────── */}
      <Panel className="flex flex-col gap-4">
        <PanelTitle
          title="Knowledge Base"
          sub={`${kb_coverage.total_claims} verified claims · retrieval grounding`}
        />

        {/* Coverage by vertical */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-2">By Vertical</div>
          <div className="space-y-2">
            {kb_coverage.by_vertical.map(v => {
              const colour = VERTICAL_C[v.vertical] ?? "#94a3b8";
              return (
                <div key={v.vertical}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="font-medium text-ink-2 capitalize">{v.vertical.replace(/_/g, " ")}</span>
                    <span className="font-mono font-semibold text-ink">{v.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(v.count / maxVertical) * 100}%`, background: colour }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coverage by domain */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-2">By Domain</div>
          <div className="flex flex-wrap gap-1.5">
            {kb_coverage.by_domain.map(d => {
              const colour = DOMAIN_C[d.domain] ?? "#94a3b8";
              return (
                <div key={d.domain} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border border-line-soft"
                  style={{ background: `${colour}14`, color: colour }}>
                  <span className="capitalize">{d.domain}</span>
                  <span className="opacity-70">{d.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grounding Score */}
        <div className="pt-3 border-t border-line-soft">
          <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-2">Grounding Score</div>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 flex-shrink-0">
              <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
                <circle cx="24" cy="24" r="18" fill="none" stroke="rgb(var(--c-surface-2))" strokeWidth="7" />
                <circle cx="24" cy="24" r="18" fill="none"
                  stroke={retrieval_context.avg_retrieval_score >= 0.7 ? "#10b981" : retrieval_context.avg_retrieval_score >= 0.5 ? "#f59e0b" : "#f87171"}
                  strokeWidth="7" strokeDasharray={`${retrieval_context.avg_retrieval_score * 113} 113`} strokeLinecap="butt" />
              </svg>
              <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-bold", scoreColour)}>
                {(retrieval_context.avg_retrieval_score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] font-semibold text-ink">{retrieval_context.scored_calls} scored calls</div>
              <div className="text-[10px] text-ink-2 font-medium">{retrieval_context.below_threshold} below threshold</div>
              <div className="text-[9px] text-ink-mute">Threshold: 0.55</div>
            </div>
          </div>
        </div>

        {/* Target Industries */}
        <div className="pt-3 border-t border-line-soft">
          <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-2">Target Industries</div>
          <div className="flex flex-wrap gap-1.5">
            {retrieval_context.top_industries.slice(0, 10).map((ind, i) => (
              <span key={ind.label}
                className="px-2 py-0.5 rounded-full text-[9px] font-semibold border border-line-soft"
                style={{ background: `${WC_COLORS[i % WC_COLORS.length]}14`, color: WC_COLORS[i % WC_COLORS.length] }}
                title={ind.label}>
                {shortenLabel(ind.label, 2)}
                <span className="opacity-60 ml-1">{ind.count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Retrieved facts link */}
        <Link
          to="/kb-facts"
          className="mt-auto flex items-center justify-between px-3 py-2.5 rounded-lg border border-brand/30 bg-brand/5 hover:bg-brand/10 transition-colors group"
        >
          <div>
            <div className="text-[11px] font-semibold text-brand">Retrieved Fact Highlights</div>
            <div className="text-[9px] text-ink-mute mt-0.5">Case studies surfaced per outreach</div>
          </div>
          <span className="text-brand text-[14px] group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      </Panel>

      {/* ── Col 2 (70%): Word clouds ─────────────────────────────────────── */}
      <Panel className="flex flex-col gap-4">
        <PanelTitle
          title="KB Signals"
          sub="What's in the knowledge base · what gets retrieved into emails"
        />

        {/* Cloud 1 — What's in the knowledge base */}
        <WordCloud items={kbCloud} centerWord="Knowledge" />

        <div className="border-t border-line-soft" />

        {/* Cloud 2 — What has been retrieved into outreach emails */}
        <WordCloud items={retrievedCloud} centerWord="Retrieved" onTagClick={handleRetrievedClick} />
        <div className="text-[9px] text-ink-mute text-center -mt-1">
          Click any term to search matching emails in the approval queue
        </div>
      </Panel>

    </div>
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

// ── Governance Outcomes card (standalone) ─────────────────────────────────────

type GovStats = DashboardExtendedStats["governance_summary"];

function GovernanceOutcomesCard({ gov, intent }: {
  gov: GovStats; intent: DashboardExtendedStats["intent_distribution"];
}) {
  return (
    <Panel className="flex flex-col">
      <PanelTitle title="Governance Outcomes" sub="Decisions · retry overhead · reply intent" />

      <div className="grid grid-cols-3 gap-2 mb-3">
        {([
          { label: "Approved", value: gov.approved, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Blocked",  value: gov.blocked,  color: "text-red-400",     bg: "bg-red-500/10"    },
          { label: "Pending",  value: gov.pending,  color: "text-amber-500",   bg: "bg-amber-500/10"  },
        ] as const).map(item => (
          <div key={item.label} className={cn("rounded-xl p-2.5 text-center", item.bg)}>
            <div className={cn("text-2xl font-bold font-mono leading-none", item.color)}>{item.value}</div>
            <div className="text-[8px] text-ink-mute mt-1 uppercase tracking-wide">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="h-2 rounded-full overflow-hidden flex mb-3">
        {([
          { v: gov.approved, c: "#10b981" },
          { v: gov.blocked,  c: "#f87171" },
          { v: gov.pending,  c: "#f59e0b" },
        ] as const).map((s, i) => {
          const pct = (s.v / (gov.total_outreach || 1)) * 100;
          return pct > 0.5 ? (
            <div key={i} className="h-full" style={{ width: `${pct}%`, background: s.c }} />
          ) : null;
        })}
      </div>

      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20 mb-3 text-[10px]">
        <span className="text-ink font-semibold">Retry overhead</span>
        <span className="text-ink-mute">avg {gov.avg_attempts} attempts</span>
        <span className="font-mono font-bold text-amber-500">{gov.multi_attempt_pct}%</span>
      </div>

      <IntentDistPanel data={intent} />
    </Panel>
  );
}

// ── Validation & Governance stats (full-width 3-col) ─────────────────────────

type ValStats = DashboardExtendedStats["validation_stats"];

function ValidationGovernanceRow({ val, gov, intent }: {
  val: ValStats; gov: GovStats; intent: DashboardExtendedStats["intent_distribution"];
}) {
  const maxViol = Math.max(...val.violation_types.map(v => v.count), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      {/* ── Tone Validator ──────────────────────────────────────────────────── */}
      <Panel>
        <PanelTitle title="Tone Validator" sub="Checks language, banned phrases, subject line quality" />
        <div className="flex items-center gap-6 mb-4">
          <div className="text-center flex-shrink-0">
            <div className="text-5xl font-bold leading-none" style={{ color: "#10b981" }}>{val.tone_pass_rate}%</div>
            <div className="text-[9px] text-ink-mute font-mono mt-1 uppercase tracking-wide">pass rate</div>
          </div>
          <div className="space-y-2 flex-1">
            {[
              { label: "Passed", value: val.tone_pass_count, barClass: "bg-emerald-500", textClass: "text-emerald-500" },
              { label: "Failed", value: val.tone_fail_count,  barClass: "bg-red-400",     textClass: "text-red-400"     },
            ].map((item, idx) => (
              <div key={item.label}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-2 h-2 rounded-full", item.barClass)} />
                    <span className="text-ink-2 font-medium">{item.label}</span>
                  </div>
                  <span className={cn("font-mono font-bold", item.textClass)}>{item.value}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className={cn("h-full rounded-full", item.barClass)}
                    style={{ width: `${idx === 0 ? val.tone_pass_rate : 100 - val.tone_pass_rate}%` }} />
                </div>
              </div>
            ))}
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
        <div className="flex items-center gap-6 mb-4">
          <div className="text-center flex-shrink-0">
            <div className="text-5xl font-bold leading-none" style={{ color: "#8b5cf6" }}>{val.halluc_pass_rate}%</div>
            <div className="text-[9px] text-ink-mute font-mono mt-1 uppercase tracking-wide">pass rate</div>
          </div>
          <div className="space-y-2 flex-1">
            {[
              { label: "Passed", value: val.halluc_pass_count, barClass: "bg-violet-500", textClass: "text-violet-500" },
              { label: "Failed", value: val.halluc_fail_count,  barClass: "bg-red-400",    textClass: "text-red-400"    },
            ].map((item, idx) => (
              <div key={item.label}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-2 h-2 rounded-full", item.barClass)} />
                    <span className="text-ink-2 font-medium">{item.label}</span>
                  </div>
                  <span className={cn("font-mono font-bold", item.textClass)}>{item.value}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className={cn("h-full rounded-full", item.barClass)}
                    style={{ width: `${idx === 0 ? val.halluc_pass_rate : 100 - val.halluc_pass_rate}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
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

        {/* Decision stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {([
            { label: "Approved", value: gov.approved, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Blocked",  value: gov.blocked,  color: "text-red-400",     bg: "bg-red-500/10"    },
            { label: "Pending",  value: gov.pending,  color: "text-amber-500",   bg: "bg-amber-500/10"  },
          ] as const).map(item => (
            <div key={item.label} className={cn("rounded-xl p-3 text-center", item.bg)}>
              <div className={cn("text-3xl font-bold font-mono leading-none", item.color)}>{item.value}</div>
              <div className="text-[9px] text-ink-mute mt-1 uppercase tracking-wide">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="h-2.5 rounded-full overflow-hidden flex mb-4">
          {([
            { v: gov.approved, c: "#10b981" },
            { v: gov.blocked,  c: "#f87171" },
            { v: gov.pending,  c: "#f59e0b" },
          ] as const).map((s, i) => {
            const pct = ((s.v) / (gov.total_outreach || 1)) * 100;
            return pct > 0.5 ? (
              <div key={i} className="h-full" style={{ width: `${pct}%`, background: s.c }} />
            ) : null;
          })}
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

// ── Outreach Cost Trend mini ──────────────────────────────────────────────────

function OutreachCostTrendMini({ data }: { data: FinOpsSummary }) {
  const AGENTS = ["research", "outreach", "conversation", "intent"];
  const COLORS: Record<string, string> = {
    research: "#0ea5e9", outreach: "#8b5cf6", conversation: "#10b981", intent: "#f59e0b",
  };

  const allDates = [...new Set(data.agent_daily_series.map(s => s.date))].sort();
  const outreachOutputs: Record<string, number> = {};
  for (const e of data.agent_daily_series) {
    if (e.agent === "outreach") outreachOutputs[e.date] = (outreachOutputs[e.date] ?? 0) + e.success_calls;
  }

  const byAgentDate: Record<string, Record<string, number>> = {};
  for (const e of data.agent_daily_series) {
    if (!AGENTS.includes(e.agent)) continue;
    const outputs = outreachOutputs[e.date] ?? 0;
    if (outputs === 0) continue;
    if (!byAgentDate[e.agent]) byAgentDate[e.agent] = {};
    byAgentDate[e.agent][e.date] = (byAgentDate[e.agent][e.date] ?? 0) + e.cost_usd / outputs;
  }

  const totalRawByDate: Record<string, number> = {};
  for (const e of data.agent_daily_series) {
    totalRawByDate[e.date] = (totalRawByDate[e.date] ?? 0) + e.cost_usd;
  }
  const totalAvgByDate: Record<string, number> = {};
  for (const d of allDates) {
    const out = outreachOutputs[d] ?? 0;
    if (out > 0) totalAvgByDate[d] = (totalRawByDate[d] ?? 0) / out;
  }

  const activeAgents = AGENTS.filter(a => byAgentDate[a]);
  const datesWithData = allDates.filter(d => outreachOutputs[d] > 0);

  if (datesWithData.length < 2) {
    return (
      <Panel className="h-full flex flex-col">
        <div className="flex items-start justify-between mb-3 flex-shrink-0">
          <PanelTitle title="Outreach Cost Trend" sub="Cost per email generated · by agent" />
          <Link to="/finops" className="text-[10px] text-brand font-medium hover:underline flex-shrink-0 mt-1">Full FinOps →</Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11px] text-ink-mute text-center">Not enough data — need at least 2 days of outreach.</p>
        </div>
      </Panel>
    );
  }

  const H = 170;
  const PAD = { top: 12, right: 12, bottom: 28, left: 48 };

  const allVals = [
    ...Object.values(totalAvgByDate),
    ...activeAgents.flatMap(a => Object.values(byAgentDate[a])),
  ].filter(v => v > 0);
  const maxVal = Math.max(...allVals) || 1;

  const xPct  = (i: number) => PAD.left + (i / Math.max(datesWithData.length - 1, 1)) * (100 - PAD.left - PAD.right);
  const yPct  = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) - (v / maxVal) * (H - PAD.top - PAD.bottom);

  const linePath = (vals: Record<string, number>) => {
    const pts = datesWithData
      .map((d, i) => vals[d] != null ? `${xPct(i).toFixed(1)}%,${yPct(vals[d]).toFixed(1)}` : null)
      .filter(Boolean) as string[];
    return pts.length >= 2 ? `M ${pts.join(" L ")}` : "";
  };

  const fmtDate = (d: string) => { const dt = new Date(d); return `${dt.getDate()} ${dt.toLocaleString("en", { month: "short" })}`; };
  const fmtCost = (v: number) => v < 0.001 ? `$${(v * 1000).toFixed(2)}m` : `$${v.toFixed(4)}`;

  return (
    <Panel className="h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 flex-shrink-0">
        <PanelTitle title="Outreach Cost Trend" sub="Avg cost per email generated · by agent" />
        <Link to="/finops" className="text-[10px] text-brand font-medium hover:underline flex-shrink-0 mt-1">Full FinOps →</Link>
      </div>
      <div className="flex-1 min-h-0 relative">
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H }}>
          {[0.25, 0.5, 0.75, 1].map(t => (
            <line key={t} x1={`${PAD.left}%`} x2={`${100 - PAD.right}%`}
              y1={yPct(maxVal * t)} y2={yPct(maxVal * t)}
              stroke="rgba(148,163,184,0.12)" strokeDasharray="2 2" strokeWidth="0.4" />
          ))}
          {[0, 0.5, 1].map(t => (
            <text key={t} x={`${PAD.left - 1}%`} y={yPct(maxVal * t) + 2}
              textAnchor="end" fill="#64748b" fontSize="4" fontFamily="monospace">
              {fmtCost(maxVal * t)}
            </text>
          ))}
          {datesWithData.filter((_, i, arr) => i === 0 || i === arr.length - 1 || (arr.length > 4 && i === Math.floor(arr.length / 2))).map(d => {
            const idx = datesWithData.indexOf(d);
            return (
              <text key={d} x={`${xPct(idx)}%`} y={H - 4}
                textAnchor="middle" fill="#64748b" fontSize="4" fontFamily="monospace">
                {fmtDate(d)}
              </text>
            );
          })}
          {activeAgents.map(agent => {
            const path = linePath(byAgentDate[agent]);
            return path ? <path key={agent} d={path} fill="none" stroke={COLORS[agent] ?? "#94a3b8"} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" vectorEffect="non-scaling-stroke" /> : null;
          })}
          {(() => { const path = linePath(totalAvgByDate); return path ? <path d={path} fill="none" stroke="#e2e8f0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null; })()}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 flex-shrink-0">
        {activeAgents.map(a => (
          <div key={a} className="flex items-center gap-1.5 text-[9px] text-ink-mute font-mono">
            <div className="w-2.5 h-1.5 rounded-sm" style={{ background: COLORS[a] }} />
            {a}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[9px] text-ink-mute font-mono">
          <div className="w-2.5 h-1.5 rounded-sm bg-slate-300/50" />
          total
        </div>
      </div>
    </Panel>
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

  const { data: kbInsights } = useQuery({
    queryKey: ["kbInsights"],
    queryFn: api.dashboardKbInsights,
    refetchInterval: 120_000,
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

            {/* ── Funnel · Pipeline Insights (50/50) ───────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5 items-stretch">
              <FunnelCard rows={stats.funnel} />
              {extended && <CompanyInsightsPanel data={extended.company_breakdown} />}
            </div>

            {/* ── AI Spend · Outreach Cost Trend ────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-5 mb-5 items-stretch">
              {finops && <MiniFinOpsPanel data={finops} />}
              {finops && <OutreachCostTrendMini data={finops} />}
            </div>

            {/* ── KB Retrieval Insights ─────────────────────────────────────── */}
            {kbInsights && (
              <div className="mb-5">
                <KbInsightsPanel data={kbInsights} />
              </div>
            )}

            {/* ── Governance Outcomes · Risk Distribution ──────────────── */}
            {extended && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5" style={{ height: 600 }}>
                <GovernanceOutcomesCard
                  gov={extended.governance_summary}
                  intent={extended.intent_distribution}
                />
                <RiskDistributionCard />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
