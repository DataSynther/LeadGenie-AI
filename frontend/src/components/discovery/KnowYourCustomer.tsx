import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building2, Users, DollarSign, Calendar, Cpu, TrendingUp, TrendingDown, Minus,
  Sparkles, Target, Flag, Gauge, Loader2,
} from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

const SIGNAL_STYLES: Record<string, string> = {
  hot: "bg-danger-tint text-danger border-danger/20",
  med: "bg-gold-tint text-gold-dark border-gold/20",
  low: "bg-surface-2 text-ink-2 border-line",
  ai:  "bg-brand-soft text-brand border-brand/20",
};

// ── Reveal-on-scroll hook — fires once, never re-collapses ────────────────────

function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { rootMargin: "150px 0px", threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  return [ref, inView];
}

function Tile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-surface rounded-md p-2.5 border border-line-soft">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={10} className="text-ink-2" />
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-2">{label}</span>
      </div>
      <div className="text-[12px] font-medium text-ink truncate">{value}</div>
    </div>
  );
}

function GrowthStat({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const positive = value > 0;
  const negative = value < 0;
  return (
    <div>
      <div className="font-mono text-[9px] text-ink-2 uppercase tracking-[0.08em]">{label}</div>
      <div className={cn(
        "font-mono text-[13px] font-semibold mt-0.5",
        positive ? "text-brand" : negative ? "text-danger" : "text-ink-2"
      )}>
        {value >= 0 ? "+" : ""}{value.toFixed(1)}%
      </div>
    </div>
  );
}

function ReadinessMeter({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-brand/10 overflow-hidden">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] font-semibold text-ink shrink-0">{score.toFixed(1)}/10</span>
    </div>
  );
}

// ── AI insights — opt-in, since it costs an LLM call per company ──────────────

function AiInsights({ companyName }: { companyName: string }) {
  const suggestMutation = useMutation({
    mutationFn: () => api.companyResearchBrief(companyName),
  });

  if (!suggestMutation.data && !suggestMutation.isPending) {
    return (
      <button
        onClick={() => suggestMutation.mutate()}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-brand/10 text-brand text-[11px] font-medium hover:bg-brand/20 transition-colors"
      >
        <Sparkles size={11} /> Reveal AI Insights (pain points, priorities)
      </button>
    );
  }

  if (suggestMutation.isPending) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
        <Loader2 size={11} className="animate-spin" /> Analyzing company signals…
      </div>
    );
  }

  if (suggestMutation.isError) {
    return <div className="text-[10px] text-red-400">Couldn't generate insights right now.</div>;
  }

  const research = suggestMutation.data!;
  const painPoints = research.likely_pain_points ?? [];
  const priorities = research.strategic_priorities ?? [];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        {research.growth_stage && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-line-soft text-ink-2 capitalize">
            {research.growth_stage}
          </span>
        )}
        {research.ai_readiness_score != null && (
          <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
            <Gauge size={10} className="text-ink-2 shrink-0" />
            <ReadinessMeter score={research.ai_readiness_score} />
          </div>
        )}
      </div>

      {research.summary && (
        <p className="text-[11px] text-ink-2 leading-relaxed">{research.summary}</p>
      )}

      {painPoints.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
            <Target size={10} /> Likely Pain Points
          </div>
          <ul className="space-y-0.5">
            {painPoints.map((p, i) => (
              <li key={i} className="text-[11px] text-ink leading-snug flex gap-1.5">
                <span className="text-brand shrink-0">•</span>{p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {priorities.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
            <Flag size={10} /> Strategic Priorities
          </div>
          <div className="flex flex-wrap gap-1">
            {priorities.map((p, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface text-ink border border-line-soft">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

function KnowYourCustomerPanel({ companyName }: { companyName: string }) {
  const { data: company, isLoading, error } = useQuery({
    queryKey: ["companyResearch", companyName],
    queryFn: () => api.companyResearch(companyName),
  });

  if (isLoading) {
    return <div className="text-[11px] text-ink-mute font-mono py-2">Loading customer profile…</div>;
  }
  if (error || !company) {
    return <div className="text-[11px] text-ink-mute py-2">No company data available for {companyName}.</div>;
  }

  return (
    <div className="py-3 space-y-3">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-brand font-semibold">
        Know Your Customer — {companyName}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile icon={Building2} label="Industry" value={company.industry || "—"} />
        <Tile icon={Users} label="Employees" value={company.employee_count ? company.employee_count.toLocaleString() : "—"} />
        <Tile icon={DollarSign} label="Revenue" value={company.revenue ? `$${company.revenue}` : "—"} />
        <Tile icon={Calendar} label="Founded" value={company.founded_year ? String(company.founded_year) : "—"} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {company.funding_stage && (
          <div className="px-2.5 py-1 bg-brand-soft rounded-md border border-brand/15 flex items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-brand font-semibold">Funding</span>
            <span className="text-[11px] text-brand font-medium">{company.funding_stage}</span>
          </div>
        )}
        <GrowthStat label="Growth 6m" value={company.headcount_growth_6m != null ? company.headcount_growth_6m * 100 : null} />
        <GrowthStat label="Growth 12m" value={company.headcount_growth_12m != null ? company.headcount_growth_12m * 100 : null} />
      </div>

      {(company.signals ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(company.signals ?? []).map((sig, i) => (
            <span key={i} className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium",
              SIGNAL_STYLES[sig.strength] ?? SIGNAL_STYLES.low
            )}>
              {sig.type === "ai" ? <Cpu size={10} /> : sig.strength === "low" ? <TrendingDown size={10} /> : sig.strength === "hot" ? <TrendingUp size={10} /> : <Minus size={10} />}
              {sig.label}
            </span>
          ))}
        </div>
      )}

      {(company.technologies ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(company.technologies ?? []).slice(0, 8).map(tech => (
            <span key={tech} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-2 text-ink border border-line">
              {tech}
            </span>
          ))}
        </div>
      )}

      {company.description && (
        <p className="text-[11px] text-ink-2 leading-relaxed">{company.description}</p>
      )}

      <div className="border-t border-line-soft pt-2.5">
        <AiInsights companyName={companyName} />
      </div>
    </div>
  );
}

// ── Table row wrapper — lazy-reveals when scrolled into view ─────────────────

export function KnowYourCustomerRow({ companyName, colSpan }: { companyName: string; colSpan: number }) {
  const [ref, inView] = useInView<HTMLTableRowElement>();
  return (
    <tr ref={ref} className="bg-surface-2/40">
      <td colSpan={colSpan} className="px-5 border-b border-line-soft">
        {inView ? <KnowYourCustomerPanel companyName={companyName} /> : <div className="h-2" />}
      </td>
    </tr>
  );
}
