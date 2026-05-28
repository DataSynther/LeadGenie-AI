import { useQuery } from "@tanstack/react-query";
import {
  X, ExternalLink, TrendingUp, TrendingDown, Minus,
  Building2, Users, DollarSign, Calendar, Zap, Cpu,
} from "lucide-react";
import { api } from "../../lib/api";
import type { Lead } from "../../lib/api";
import { cn } from "../../lib/utils";

interface ResearchPanelProps {
  lead: Lead | null;
  onClose: () => void;
}

const SIGNAL_STYLES: Record<string, string> = {
  hot: "bg-danger-tint text-danger border-danger/20",
  med: "bg-gold-tint text-gold-dark border-gold/20",
  low: "bg-surface-2 text-ink-2 border-line",
  ai: "bg-brand-soft text-brand border-brand/20",
};

const TECH_AI_KEYWORDS = ["AI", "Anthropic Claude", "machine learning", "TensorFlow", "PyTorch", "OpenAI"];

export function ResearchPanel({ lead, onClose }: ResearchPanelProps) {
  const { data: company, isLoading, error } = useQuery({
    queryKey: ["companyResearch", lead?.company],
    queryFn: () => api.companyResearch(lead!.company),
    enabled: !!lead?.company,
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[440px] bg-surface border-l border-line-soft z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-6 py-5 border-b border-line-soft flex items-start justify-between shrink-0">
          <div>
            <div className="font-serif text-[20px] text-ink leading-tight">
              {lead?.name}
            </div>
            <div className="font-mono text-[11px] text-ink mt-0.5">
              {lead?.title}
            </div>
            <div className="font-mono text-[11px] text-brand mt-0.5 font-medium">
              {lead?.company}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-2 text-ink-2 hover:text-ink transition-colors mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="py-20 text-center text-ink-mute text-sm font-mono">
              Loading research data...
            </div>
          )}

          {error && (
            <div className="py-20 text-center">
              <div className="text-danger text-sm font-medium">Company not found in dataset</div>
              <div className="text-ink-mute text-xs font-mono mt-1">{lead?.company}</div>
            </div>
          )}

          {company && (
            <div className="p-6 flex flex-col gap-5">

              {/* Overview stats */}
              <section>
                <div className="label-mono text-ink mb-3">Company Overview</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <StatTile icon={Building2} label="Industry" value={company.industry || "—"} />
                  <StatTile
                    icon={Users}
                    label="Employees"
                    value={company.employee_count ? company.employee_count.toLocaleString() : "—"}
                  />
                  <StatTile
                    icon={DollarSign}
                    label="Revenue"
                    value={company.revenue ? `$${company.revenue}` : "—"}
                  />
                  <StatTile
                    icon={Calendar}
                    label="Founded"
                    value={company.founded_year ? String(company.founded_year) : "—"}
                  />
                </div>
                {company.funding_stage && (
                  <div className="mt-2.5 px-3 py-2 bg-brand-soft rounded-md border border-brand/15 flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-brand font-semibold">
                      Funding
                    </span>
                    <span className="text-[12px] text-brand font-medium">{company.funding_stage}</span>
                  </div>
                )}
              </section>

              {/* Hiring signals */}
              {company.signals.length > 0 && (
                <section>
                  <div className="label-mono text-ink mb-3">Hiring Signals</div>
                  <div className="flex flex-col gap-2">
                    {company.signals.map((sig, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-md border text-[12px] font-medium",
                          SIGNAL_STYLES[sig.strength] ?? SIGNAL_STYLES.low
                        )}
                      >
                        <SignalIcon type={sig.type} strength={sig.strength} />
                        {sig.label}
                      </div>
                    ))}
                  </div>

                  {/* Headcount growth bar */}
                  <HeadcountBar growth6m={company.headcount_growth_6m} growth12m={company.headcount_growth_12m} />
                </section>
              )}

              {/* Tech stack */}
              {company.technologies.length > 0 && (
                <section>
                  <div className="label-mono text-ink mb-3 flex items-center gap-2">
                    <Cpu size={12} />
                    Tech Stack
                    <span className="font-mono text-[10px] text-ink-2">
                      {company.technologies.length} tools
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {company.technologies.map((tech) => {
                      const isAI = TECH_AI_KEYWORDS.some(k => tech.toLowerCase().includes(k.toLowerCase()));
                      return (
                        <span
                          key={tech}
                          className={cn(
                            "px-2 py-0.5 rounded text-[11px] font-mono border",
                            isAI
                              ? "bg-brand-soft text-brand border-brand/20 font-semibold"
                              : "bg-surface-2 text-ink border-line"
                          )}
                        >
                          {tech}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* About */}
              {company.description && (
                <section>
                  <div className="label-mono text-ink mb-3">About</div>
                  <p className="text-[12px] text-ink leading-relaxed">
                    {company.description}
                  </p>
                </section>
              )}

              {/* LinkedIn */}
              {company.linkedin_url && (
                <a
                  href={company.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] font-mono text-brand hover:underline"
                >
                  <ExternalLink size={11} />
                  View on LinkedIn
                </a>
              )}

            </div>
          )}
        </div>

        {/* Footer CTAs */}
        {company && (
          <div className="px-6 py-4 border-t border-line-soft flex gap-2.5 shrink-0 bg-surface">
            <button className="btn-primary flex items-center gap-2 flex-1 justify-center">
              <Zap size={13} />
              Generate Outreach
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium bg-surface-2 text-ink border border-line hover:border-brand hover:text-brand transition-colors">
              Add to Pipeline
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-surface-2 rounded-md p-3 border border-line-soft">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} className="text-ink-2" />
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-2">{label}</span>
      </div>
      <div className="text-[13px] font-medium text-ink truncate">{value}</div>
    </div>
  );
}

function SignalIcon({ type, strength }: { type: string; strength: string }) {
  if (type === "ai") return <Cpu size={13} />;
  if (strength === "low") return <TrendingDown size={13} />;
  if (strength === "hot") return <TrendingUp size={13} />;
  return <Minus size={13} />;
}

function HeadcountBar({
  growth6m,
  growth12m,
}: {
  growth6m: number | null;
  growth12m: number | null;
}) {
  if (growth6m == null && growth12m == null) return null;

  const fmt = (v: number | null) =>
    v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  return (
    <div className="mt-3 bg-surface-2 rounded-md p-3 border border-line-soft">
      <div className="label-mono text-ink mb-2">Headcount growth</div>
      <div className="flex gap-6">
        <GrowthStat label="6 months" value={growth6m} fmt={fmt} />
        <GrowthStat label="12 months" value={growth12m} fmt={fmt} />
      </div>
    </div>
  );
}

function GrowthStat({
  label,
  value,
  fmt,
}: {
  label: string;
  value: number | null;
  fmt: (v: number | null) => string;
}) {
  const positive = (value ?? 0) > 0;
  const negative = (value ?? 0) < 0;
  return (
    <div>
      <div className="font-mono text-[9px] text-ink-2 uppercase tracking-[0.08em]">{label}</div>
      <div
        className={cn(
          "font-mono text-[16px] font-semibold mt-0.5",
          positive ? "text-brand" : negative ? "text-danger" : "text-ink-2"
        )}
      >
        {fmt(value)}
      </div>
    </div>
  );
}
