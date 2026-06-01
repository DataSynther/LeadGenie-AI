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
      <span
        className={cn(
          "font-mono text-[11px] uppercase tracking-[0.08em] font-semibold",
          row.labelClass,
        )}
      >
        {row.label}
      </span>
      <div className="h-2 bg-surface-2 rounded overflow-hidden">
        <div
          className={cn("h-full rounded", row.colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-right font-mono text-[13px] text-ink">
        {row.value}
      </span>
    </div>
  );
}

export function RiskDistributionCard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: api.dashboardStats,
  });

  if (!stats) return null;
  const { low, medium, high } = stats.risk_distribution;
  const total = low + medium + high;

  return (
    <div className="card-base">
      <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
        <div className="font-serif text-display-md text-ink">
          Risk <em className="text-brand italic">distribution</em>
        </div>
        <div className="label-mono">Last 24h · {total} msgs</div>
      </div>
      <div className="p-5">
        <div className="flex flex-col gap-3.5">
          <RiskRow
            row={{
              label: "Low",
              value: low,
              total,
              colorClass: "bg-brand",
              labelClass: "text-brand",
            }}
          />
          <RiskRow
            row={{
              label: "Medium",
              value: medium,
              total,
              colorClass: "bg-gold",
              labelClass: "text-gold-dark",
            }}
          />
          <RiskRow
            row={{
              label: "High",
              value: high,
              total,
              colorClass: "bg-danger",
              labelClass: "text-danger",
            }}
          />
        </div>

        <div className="h-px bg-line-soft my-5" />

        <div className="label-mono mb-3">Top blocked patterns</div>
        <div className="flex flex-col gap-2 text-xs">
          {stats.blocked_patterns.map((p) => (
            <div key={p.label} className="flex justify-between">
              <span className="text-ink-2">{p.label}</span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  p.count >= 10
                    ? "text-danger"
                    : p.count >= 5
                      ? "text-gold-dark"
                      : "text-brand",
                )}
              >
                {p.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
