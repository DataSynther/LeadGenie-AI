import { formatNumber } from "../../lib/utils";

interface FunnelRow {
  label: string;
  count: number;
  pct: number;
}

const FILL_GRADIENTS = [
  "linear-gradient(90deg, #4A2256, #6A327A)",
  "linear-gradient(90deg, #6A327A, #8B4FA0)",
  "linear-gradient(90deg, #8B4FA0, #B26FBE)",
  "linear-gradient(90deg, #C58324, #E29F25)",
  "linear-gradient(90deg, #E29F25, #FAB818)",
];

const FILL_TEXT_COLORS = ["white", "white", "white", "white", "#4A2256"];

export function FunnelCard({ rows }: { rows: FunnelRow[] }) {
  return (
    <div className="card-base">
      <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
        <div className="font-serif text-display-md text-ink">
          Pipeline <em className="text-brand italic">funnel</em>
        </div>
        <div className="label-mono">Last 30 days</div>
      </div>
      <div className="p-5">
        <div className="flex flex-col gap-2.5">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="grid grid-cols-[130px_1fr_60px] items-center gap-3"
            >
              <div className="text-xs text-ink-2">{row.label}</div>
              <div className="h-7 bg-surface-2 rounded">
                <div
                  className="h-full rounded flex items-center pl-3 font-mono text-[11px] font-semibold transition-[width] duration-700"
                  style={{
                    width: `${row.pct}%`,
                    background: FILL_GRADIENTS[i] || FILL_GRADIENTS[0],
                    color: FILL_TEXT_COLORS[i] || "white",
                  }}
                >
                  {formatNumber(row.count)}
                </div>
              </div>
              <div className="text-right font-mono text-[13px] text-ink">
                {row.pct}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
