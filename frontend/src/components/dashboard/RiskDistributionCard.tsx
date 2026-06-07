import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

// ── colour maps ────────────────────────────────────────────────────────────────

const HALLUC_CAT_C: Record<string, string> = {
  "Revenue / Funding":     "#8b5cf6",
  "Headcount / Growth":    "#0ea5e9",
  "Tech Stack":            "#10b981",
  "Product Claims":        "#f59e0b",
  "Company Facts":         "#f87171",
  "Awards / Partnerships": "#a78bfa",
  "Other Claims":          "#94a3b8",
};

const TONE_VIOLATION_C = [
  "#f87171", "#fb923c", "#fbbf24", "#a78bfa",
  "#60a5fa", "#34d399", "#e879f9",
];

const RISK_SEGS = [
  { key: "low",    color: "#8b5cf6", textClass: "text-violet-500", label: "Low"    },
  { key: "medium", color: "#f59e0b", textClass: "text-amber-500",  label: "Medium" },
  { key: "high",   color: "#f87171", textClass: "text-red-400",    label: "High"   },
] as const;

// ── donut (unchanged) ─────────────────────────────────────────────────────────

function RiskDonut({ low, medium, high }: { low: number; medium: number; high: number }) {
  const values = { low, medium, high };
  const total = low + medium + high || 1;
  const r = 30; const cx = 45; const cy = 45; const sw = 14;
  let angle = -90;
  return (
    <div className="flex items-center gap-4 mb-5">
      <svg width={90} height={90} viewBox="0 0 90 90" className="flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--c-surface-2))" strokeWidth={sw} />
        {RISK_SEGS.map(seg => {
          const v = values[seg.key];
          const sweep = (v / total) * 360;
          if (sweep < 1) { angle += sweep; return null; }
          const s = (angle * Math.PI) / 180;
          const e = ((angle + sweep) * Math.PI) / 180;
          const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
          const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
          angle += sweep;
          return (
            <path key={seg.key}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`}
              fill="none" stroke={seg.color} strokeWidth={sw} strokeLinecap="butt">
              <title>{seg.label}: {v} ({((v / total) * 100).toFixed(0)}%)</title>
            </path>
          );
        })}
        <text x={cx} y={cy - 3} textAnchor="middle" fill="rgb(var(--c-ink))" fontSize="11" fontWeight="700">
          {total}
        </text>
        <text x={cx} y={cy + 9} textAnchor="middle" fill="rgb(var(--c-ink-mute))" fontSize="7">msgs</text>
      </svg>
      <div className="flex flex-col gap-2 flex-1">
        {RISK_SEGS.map(seg => {
          const v = values[seg.key];
          return (
            <div key={seg.key} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                <span className="text-ink-2 font-medium">{seg.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("font-mono font-bold", seg.textClass)}>{v}</span>
                <span className="text-ink-mute text-[9px]">({((v / total) * 100).toFixed(0)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── stacked breakdown bar ─────────────────────────────────────────────────────

interface Segment { label: string; count: number; pct: number; color: string }

function FactorBar({
  label, passLabel, passRate, passColor, failColor,
  passCount, failCount, subCauses,
}: {
  label: string;
  passLabel: string;
  passRate: number;
  passColor: string;
  failColor: string;
  passCount: number;
  failCount: number;
  subCauses: Segment[];
}) {
  const total = passCount + failCount || 1;
  const passPct = (passCount / total) * 100;

  // Assign sub-cause widths within the fail portion
  const subTotal = subCauses.reduce((s, c) => s + c.count, 0) || 1;
  const failPct = 100 - passPct;
  const subSegs = subCauses.map(c => ({
    ...c,
    barPct: (c.count / subTotal) * failPct,
  }));

  // Remaining unaccounted failure (counts not covered by named sub-causes)
  const namedFail = subCauses.reduce((s, c) => s + c.count, 0);
  const unnamedFail = Math.max(0, failCount - namedFail);
  const unnamedPct = (unnamedFail / total) * 100;

  const riskLabel =
    passRate >= 80 ? "low risk" : passRate >= 55 ? "medium" : "high risk";
  const riskBadgeClass =
    passRate >= 80
      ? "bg-emerald-500/10 text-emerald-500"
      : passRate >= 55
      ? "bg-amber-500/10 text-amber-500"
      : "bg-red-500/10 text-red-400";

  return (
    <div>
      {/* Row header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-[3px] h-4 rounded-full" style={{ background: passRate >= 70 ? passColor : failColor }} />
          <span className="text-[13px] font-semibold text-ink">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full", riskBadgeClass)}>
            {riskLabel}
          </span>
          <span className="text-[13px] font-mono font-bold" style={{ color: passColor }}>
            {passRate.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-5 rounded-full overflow-hidden flex bg-surface-2 mb-2.5">
        {/* Pass segment */}
        {passPct > 0.5 && (
          <div
            className="h-full"
            style={{ width: `${passPct}%`, background: passColor, opacity: 0.85 }}
            title={`${passLabel}: ${passCount} (${passPct.toFixed(1)}%)`}
          />
        )}
        {/* Named failure sub-causes */}
        {subSegs.map((seg, i) =>
          seg.barPct > 0.3 ? (
            <div
              key={i}
              className="h-full"
              style={{ width: `${seg.barPct}%`, background: seg.color, opacity: 0.8 }}
              title={`${seg.label}: ${seg.count}`}
            />
          ) : null
        )}
        {/* Unnamed remaining failures */}
        {unnamedPct > 0.3 && (
          <div
            className="h-full bg-red-400/30"
            style={{ width: `${unnamedPct}%` }}
            title={`Other failures: ${unnamedFail}`}
          />
        )}
      </div>

      {/* Inline legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 pl-0.5">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: passColor, opacity: 0.85 }} />
          <span>{passLabel} {passPct.toFixed(0)}%</span>
        </div>
        {subSegs.filter(s => s.barPct > 0.3).map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px] text-ink-mute">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color, opacity: 0.8 }} />
            <span>{seg.label}</span>
            <span className="font-mono font-semibold">{seg.count}</span>
          </div>
        ))}
        {unnamedPct > 0.3 && (
          <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-red-400/30" />
            <span>Other {unnamedPct.toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── props ─────────────────────────────────────────────────────────────────────

interface ValidationStats {
  tone_pass_count: number; tone_fail_count: number; tone_pass_rate: number;
  halluc_pass_count: number; halluc_fail_count: number; halluc_pass_rate: number;
  both_passed: number; total_checks: number;
  violation_types: { label: string; count: number }[];
  hallucination_categories: { label: string; count: number }[];
}

interface RiskDistributionCardProps {
  hallucCategories?: { label: string; count: number }[];
  validationStats?: ValidationStats;
}

// ── card ──────────────────────────────────────────────────────────────────────

export function RiskDistributionCard({ hallucCategories, validationStats }: RiskDistributionCardProps) {
  const { data: stats } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: api.dashboardStats,
  });

  if (!stats) return null;
  const { low, medium, high } = stats.risk_distribution;
  const total = low + medium + high;

  // Build tone sub-causes from violation_types
  const toneSubCauses: Segment[] = (validationStats?.violation_types ?? [])
    .filter(v => !v.label.toLowerCase().includes("hallucin") && !v.label.toLowerCase().includes("unverifi"))
    .slice(0, 6)
    .map((v, i) => ({
      label: v.label,
      count: v.count,
      pct: 0,
      color: TONE_VIOLATION_C[i % TONE_VIOLATION_C.length],
    }));

  // Hallucination sub-causes from hallucination_categories
  const hallucSubCauses: Segment[] = (hallucCategories ?? [])
    .slice(0, 7)
    .map(c => ({
      label: c.label,
      count: c.count,
      pct: 0,
      color: HALLUC_CAT_C[c.label] ?? "#94a3b8",
    }));

  return (
    <div className="card-base h-full flex flex-col">
      <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between flex-shrink-0">
        <div className="font-serif text-display-md text-ink">
          Risk <em className="text-brand italic">distribution</em>
        </div>
        <div className="label-mono">Last 30d · {total} msgs</div>
      </div>

      <div className="p-5 space-y-5 flex-1">

        {/* ── Donut ──────────────────────────────────────────────────────── */}
        <RiskDonut low={low} medium={medium} high={high} />

        {/* ── Risk Factor Breakdown ──────────────────────────────────────── */}
        {validationStats && (
          <>
            <div className="flex items-center gap-2 mb-0">
              <div className="h-px flex-1 bg-line-soft" />
              <span className="text-[9px] uppercase tracking-[0.12em] text-ink-mute font-mono font-semibold px-1">
                Risk Factor Breakdown
              </span>
              <div className="h-px flex-1 bg-line-soft" />
            </div>

            <div className="space-y-4">
              {/* Tone Check bar */}
              <FactorBar
                label="Tone Check"
                passLabel="Passed"
                passRate={validationStats.tone_pass_rate}
                passColor="#10b981"
                failColor="#f87171"
                passCount={validationStats.tone_pass_count}
                failCount={validationStats.tone_fail_count}
                subCauses={toneSubCauses}
              />

              {/* Hallucination Guard bar */}
              <FactorBar
                label="Hallucination Guard"
                passLabel="Verified"
                passRate={validationStats.halluc_pass_rate}
                passColor="#8b5cf6"
                failColor="#f87171"
                passCount={validationStats.halluc_pass_count}
                failCount={validationStats.halluc_fail_count}
                subCauses={hallucSubCauses}
              />

              {/* Both-passed summary pill */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
                <span className="text-[10px] text-ink-2 font-medium">Both checks passed</span>
                <span className="font-mono text-[11px] font-bold text-emerald-500">
                  {validationStats.both_passed}
                  <span className="text-ink-mute font-normal"> / {validationStats.total_checks}</span>
                </span>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
