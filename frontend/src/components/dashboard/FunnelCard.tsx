import { formatNumber } from "../../lib/utils";

interface FunnelRow {
  label: string;
  count: number;
  pct: number;
}

const FILL_GRADIENTS = [
  "linear-gradient(90deg, #4C1D95, #6D28D9)",
  "linear-gradient(90deg, #6D28D9, #8B5CF6)",
  "linear-gradient(90deg, #8B5CF6, #C4B5FD)",
  "linear-gradient(90deg, #B45309, #D97706)",
];

export function FunnelCard({ rows }: { rows: FunnelRow[] }) {
  return (
    <div className="card-base flex flex-col max-h-[340px]">
      <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between flex-shrink-0">
        <div className="font-serif text-display-md text-ink">
          Pipeline <span className="text-brand">funnel</span>
        </div>
        <div className="label-mono">Last 30 days</div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-evenly">
        <div className="flex flex-col gap-4">
          {rows.map((row, i) => (
            <div key={row.label} className="flex items-center gap-3">
              {/* Bar + label overlay */}
              <div className="flex-1 relative h-9 bg-surface-2 rounded overflow-hidden">
                {/* Filled portion — shows the count */}
                <div
                  className="h-full rounded flex items-center justify-end pr-2 font-mono text-[13px] font-bold transition-[width] duration-700 select-none"
                  style={{
                    width: `${row.pct}%`,
                    background: FILL_GRADIENTS[i] ?? FILL_GRADIENTS[0],
                    color: "white",
                    minWidth: row.count > 0 ? 28 : 0,
                  }}
                >
                  {row.pct >= 22 && formatNumber(row.count)}
                </div>

                {/* Label centered in the unfilled (right) portion */}
                {row.pct < 100 ? (
                  <div
                    className="absolute inset-y-0 flex items-center justify-center pointer-events-none"
                    style={{ left: `${row.pct}%`, right: 0 }}
                  >
                    <span className="text-[13px] font-semibold text-ink-2 truncate px-2">
                      {row.label}
                      {row.pct < 22 && (
                        <span className="ml-2 font-mono text-ink">{formatNumber(row.count)}</span>
                      )}
                    </span>
                  </div>
                ) : (
                  /* 100% bar — label inside, right-aligned */
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                    <span className="text-[13px] font-semibold text-white/80">{row.label}</span>
                  </div>
                )}
              </div>

              {/* Percentage pill */}
              <div className="w-11 text-right font-mono text-[14px] font-semibold text-ink flex-shrink-0">
                {row.pct}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
