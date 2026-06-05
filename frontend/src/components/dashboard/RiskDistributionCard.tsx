import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

interface RiskRow {
  label: string;
  value: number;
  total: number;
  colorClass: string;
  labelClass: string;
}

function RiskRow({ row }: { row: RiskRow }) {
  const pct = (row.value / row.total) * 100;
  return (
    <div className="grid grid-cols-[60px_1fr_50px] items-center gap-3">
      <span className={cn("font-mono text-[11px] uppercase tracking-[0.08em] font-semibold", row.labelClass)}>
        {row.label}
      </span>
      <div className="h-2 bg-surface-2 rounded overflow-hidden">
        <div className={cn("h-full rounded", row.colorClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right font-mono text-[13px] text-ink">{row.value}</span>
    </div>
  );
}

const HALLUC_CAT_C: Record<string, string> = {
  "Revenue / Funding":    "#8b5cf6",
  "Headcount / Growth":   "#0ea5e9",
  "Tech Stack":           "#10b981",
  "Product Claims":       "#f59e0b",
  "Company Facts":        "#f87171",
  "Awards / Partnerships":"#a78bfa",
  "Other Claims":         "#94a3b8",
};

interface RiskDistributionCardProps {
  hallucCategories?: { label: string; count: number }[];
}

export function RiskDistributionCard({ hallucCategories }: RiskDistributionCardProps) {
  const { data: stats } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: api.dashboardStats,
  });

  if (!stats) return null;
  const { low, medium, high } = stats.risk_distribution;
  const total = low + medium + high;
  const maxHalluc = hallucCategories?.length
    ? Math.max(...hallucCategories.map(c => c.count), 1)
    : 1;

  return (
    <div className="card-base">
      <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
        <div className="font-serif text-display-md text-ink">
          Risk <em className="text-brand italic">distribution</em>
        </div>
        <div className="label-mono">Last 30d · {total} msgs</div>
      </div>
      <div className="p-5">
        <div className="flex flex-col gap-3.5">
          <RiskRow row={{ label: "Low",    value: low,    total, colorClass: "bg-brand",  labelClass: "text-brand"     }} />
          <RiskRow row={{ label: "Medium", value: medium, total, colorClass: "bg-gold",   labelClass: "text-gold-dark" }} />
          <RiskRow row={{ label: "High",   value: high,   total, colorClass: "bg-danger", labelClass: "text-danger"    }} />
        </div>

        <div className="h-px bg-line-soft my-4" />

        <div className="label-mono mb-3">Top blocked patterns</div>
        <div className="flex flex-col gap-2 text-xs mb-4">
          {stats.blocked_patterns.map((p) => (
            <div key={p.label} className="flex justify-between">
              <span className="text-ink-2 font-medium">{p.label}</span>
              <span className={cn("font-mono font-semibold",
                p.count >= 10 ? "text-danger" : p.count >= 5 ? "text-gold-dark" : "text-brand")}>
                {p.count}
              </span>
            </div>
          ))}
        </div>

        {/* Hallucination violation categories */}
        {hallucCategories && hallucCategories.length > 0 && (
          <>
            <div className="h-px bg-line-soft mb-4" />
            <div className="label-mono mb-3">Hallucination categories</div>
            <div className="flex flex-col gap-2.5">
              {hallucCategories.map(cat => {
                const colour = HALLUC_CAT_C[cat.label] ?? HALLUC_CAT_C["Other Claims"];
                const pct = (cat.count / maxHalluc) * 100;
                return (
                  <div key={cat.label}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colour }} />
                        <span className="text-ink-2 font-medium">{cat.label}</span>
                      </div>
                      <span className="font-mono font-semibold text-ink">{cat.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour, opacity: 0.75 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {hallucCategories && hallucCategories.length === 0 && (
          <>
            <div className="h-px bg-line-soft mb-4" />
            <div className="label-mono mb-2">Hallucination categories</div>
            <p className="text-[11px] text-emerald-500 font-medium">No hallucination violations detected</p>
          </>
        )}
      </div>
    </div>
  );
}
