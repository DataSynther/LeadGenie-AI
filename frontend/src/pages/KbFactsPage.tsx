import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

const VERTICAL_C: Record<string, string> = {
  data_science:     "#8b5cf6",
  data_engineering: "#0ea5e9",
  generic:          "#94a3b8",
};
const DOMAIN_C: Record<string, string> = {
  fintech:       "#f59e0b",
  ecommerce:     "#10b981",
  manufacturing: "#0ea5e9",
  logistics:     "#8b5cf6",
  healthcare:    "#f87171",
  generic:       "#94a3b8",
};
const CATEGORY_BADGE: Record<string, string> = {
  case_study:    "bg-violet-500/10 text-violet-400 border-violet-500/20",
  capability:    "bg-sky-500/10 text-sky-400 border-sky-500/20",
  social_proof:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  differentiator:"bg-amber-500/10 text-amber-500 border-amber-500/20",
};
const INDUSTRY_COLORS = [
  "#8b5cf6","#0ea5e9","#10b981","#f59e0b","#f87171",
  "#a78bfa","#38bdf8","#34d399","#fbbf24","#fb7185",
];

export function KbFactsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["kbInsights"],
    queryFn: api.dashboardKbInsights,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[12px] text-ink-mute font-mono">Loading KB facts…</div>
      </div>
    );
  }

  const { kb_coverage, top_claims, retrieval_context, industry_memory } = data;

  // Group claims by vertical
  const byVertical: Record<string, typeof top_claims> = {};
  for (const c of top_claims) {
    if (!byVertical[c.vertical]) byVertical[c.vertical] = [];
    byVertical[c.vertical].push(c);
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-serif text-[26px] text-ink leading-tight">
            Retrieved <span className="text-brand">Fact Highlights</span>
          </div>
          <div className="text-[12px] text-ink-mute mt-1">
            Case studies &amp; verified claims surfaced during email generation
          </div>
        </div>
        <Link
          to="/dashboard"
          className="flex items-center gap-1.5 text-[11px] text-ink-mute hover:text-ink transition-colors px-3 py-1.5 rounded-lg border border-line-soft hover:border-line bg-surface"
        >
          ← Back to dashboard
        </Link>
      </div>

      {/* ── Coverage pills ── */}
      <div className="flex flex-wrap gap-3">
        <div className="px-4 py-2 rounded-lg border border-line-soft bg-surface flex items-center gap-2">
          <span className="text-[11px] text-ink-mute">Total claims</span>
          <span className="font-mono font-bold text-brand text-[14px]">{kb_coverage.total_claims}</span>
        </div>
        <div className="px-4 py-2 rounded-lg border border-line-soft bg-surface flex items-center gap-2">
          <span className="text-[11px] text-ink-mute">Avg retrieval score</span>
          <span className={cn("font-mono font-bold text-[14px]",
            retrieval_context.avg_retrieval_score >= 0.7 ? "text-emerald-500"
            : retrieval_context.avg_retrieval_score >= 0.5 ? "text-amber-500" : "text-red-400")}>
            {(retrieval_context.avg_retrieval_score * 100).toFixed(0)}%
          </span>
        </div>
        <div className="px-4 py-2 rounded-lg border border-line-soft bg-surface flex items-center gap-2">
          <span className="text-[11px] text-ink-mute">Scored outreaches</span>
          <span className="font-mono font-bold text-ink text-[14px]">{retrieval_context.scored_calls}</span>
        </div>
        <div className="px-4 py-2 rounded-lg border border-line-soft bg-surface flex items-center gap-2">
          <span className="text-[11px] text-ink-mute">Below threshold</span>
          <span className={cn("font-mono font-bold text-[14px]",
            retrieval_context.below_threshold > 0 ? "text-amber-500" : "text-emerald-500")}>
            {retrieval_context.below_threshold}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* ── Main: claims grouped by vertical ── */}
        <div className="space-y-6">
          {top_claims.length === 0 ? (
            <div className="rounded-xl border border-line-soft bg-surface p-8 text-center text-[12px] text-ink-mute">
              No claims retrieved yet. Generate some outreach emails to populate this view.
            </div>
          ) : (
            Object.entries(byVertical).map(([vertical, claims]) => {
              const vColour = VERTICAL_C[vertical] ?? "#94a3b8";
              return (
                <div key={vertical}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-4 rounded-full" style={{ background: vColour }} />
                    <span className="text-[13px] font-semibold text-ink capitalize">
                      {vertical.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-mono text-ink-mute">
                      {claims.length} claim{claims.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {claims.map(claim => {
                      const dColour = DOMAIN_C[claim.domain] ?? "#94a3b8";
                      const badge   = CATEGORY_BADGE[claim.category] ?? "bg-surface-2 text-ink-2 border-line-soft";
                      return (
                        <div key={claim.id}
                          className="rounded-xl border border-line-soft bg-surface p-4 hover:border-brand/30 transition-colors">
                          {/* Tags */}
                          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold capitalize border"
                              style={{ background: `${dColour}14`, color: dColour, borderColor: `${dColour}30` }}>
                              {claim.domain}
                            </span>
                            <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-semibold capitalize border", badge)}>
                              {claim.category.replace(/_/g, " ")}
                            </span>
                          </div>
                          {/* Claim text */}
                          <p className="text-[11px] text-ink font-medium leading-relaxed mb-2.5">
                            {claim.claim}
                          </p>
                          {/* Metric */}
                          {claim.metric && (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand/8 border border-brand/20">
                              <span className="text-[10px] text-brand font-mono font-semibold">{claim.metric}</span>
                            </div>
                          )}
                          {/* Tone use */}
                          {claim.tone_use && (
                            <div className="mt-2 text-[9px] text-ink-mute italic leading-snug">
                              "{claim.tone_use}"
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Right sidebar: retrieval context ── */}
        <div className="space-y-4">

          {/* Top Industries */}
          <div className="rounded-xl border border-line-soft bg-surface p-4">
            <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-3">Industries Retrieved</div>
            <div className="space-y-2">
              {retrieval_context.top_industries.map((ind, i) => {
                const max = retrieval_context.top_industries[0]?.count || 1;
                return (
                  <div key={ind.label}>
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className="text-ink-2 font-medium truncate pr-2" title={ind.label}>
                        {ind.label.length > 26 ? ind.label.slice(0, 24) + "…" : ind.label}
                      </span>
                      <span className="font-mono font-bold flex-shrink-0" style={{ color: INDUSTRY_COLORS[i % INDUSTRY_COLORS.length] }}>
                        {ind.count}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${(ind.count / max) * 100}%`,
                        background: INDUSTRY_COLORS[i % INDUSTRY_COLORS.length],
                        opacity: 0.7,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Pain Points */}
          <div className="rounded-xl border border-line-soft bg-surface p-4">
            <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-3">Pain Points Surfaced</div>
            <div className="space-y-2.5">
              {retrieval_context.top_pain_points.map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-amber-500/60" />
                  <span className="text-[10px] text-ink-2 leading-snug">{p.label}</span>
                  <span className="text-[9px] font-mono text-amber-500 font-bold ml-auto flex-shrink-0">{p.count}×</span>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt versions */}
          {retrieval_context.prompt_versions.length > 0 && (
            <div className="rounded-xl border border-line-soft bg-surface p-4">
              <div className="text-[10px] uppercase tracking-widest text-ink font-semibold mb-3">Prompt Versions Used</div>
              <div className="space-y-1.5">
                {retrieval_context.prompt_versions.map(pv => (
                  <div key={pv.label} className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-ink-2 truncate">{pv.label}</span>
                    <span className="font-mono font-bold text-brand ml-2 flex-shrink-0">{pv.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Industry memory patterns */}
          {industry_memory.recent_patterns.length > 0 && (
            <div className="rounded-xl border border-line-soft bg-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-widest text-ink font-semibold">Learned Patterns</div>
                <span className="text-[9px] font-mono text-ink-mute">{industry_memory.total} in memory</span>
              </div>
              <div className="space-y-3">
                {industry_memory.recent_patterns.slice(0, 4).map((p, i) => (
                  <div key={i} className="rounded-lg border border-line-soft bg-surface-2/30 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-[9px] px-1.5 py-px rounded font-semibold capitalize bg-violet-500/10 text-violet-400">
                        {p.stream}
                      </span>
                      {p.tech_tags.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-px rounded font-mono bg-surface border border-line-soft text-ink-mute">{t}</span>
                      ))}
                    </div>
                    <div className="text-[10px] font-semibold text-ink mb-0.5 truncate">{p.subject}</div>
                    <p className="text-[9px] text-ink-2 leading-snug line-clamp-2">{p.hook}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
