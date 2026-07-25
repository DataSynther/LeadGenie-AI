import { cn } from "../../lib/utils";
import type { FinOpsSummary, DashboardExtendedStats } from "../../lib/api";

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

interface RetryItem {
  key: string; name: string; shortName: string;
  firstOk: number; retryOk: number; failed: number; total: number;
  accentColor: string; retryCost?: number;
}

export function RetryEfficiencyCard({ finops, extended }: {
  finops: FinOpsSummary;
  extended: DashboardExtendedStats;
}) {
  const c2s = finops.cost_to_success;
  const outreach = c2s.find(r => r.agent === "outreach");
  const agentRetries = c2s
    .filter(r => r.agent !== "outreach" && r.retry_calls > 0)
    .sort((a, b) => b.retry_cost_usd - a.retry_cost_usd);
  const val = extended.validation_stats;

  const items: RetryItem[] = [];

  if (outreach && (outreach.jobs_total ?? 0) > 0) {
    items.push({
      key: "gov", name: "Governance", shortName: "Gov",
      firstOk: outreach.jobs_first_attempt_ok ?? 0,
      retryOk: outreach.jobs_retry_succeeded  ?? 0,
      failed:  outreach.jobs_retry_failed     ?? 0,
      total: outreach.jobs_total!,
      accentColor: "#10b981", retryCost: outreach.retry_cost_usd,
    });
  }
  if (val.tone_pass_count + val.tone_fail_count > 0) {
    items.push({
      key: "tone", name: "Tone Check", shortName: "Tone",
      firstOk: val.tone_pass_count, retryOk: 0, failed: val.tone_fail_count,
      total: val.tone_pass_count + val.tone_fail_count,
      accentColor: "#0ea5e9",
    });
  }
  if (val.halluc_pass_count + val.halluc_fail_count > 0) {
    items.push({
      key: "halluc", name: "Halluc. Guard", shortName: "Guard",
      firstOk: val.halluc_pass_count, retryOk: 0, failed: val.halluc_fail_count,
      total: val.halluc_pass_count + val.halluc_fail_count,
      accentColor: "#8b5cf6",
      retryCost: finops.governance_info.governance_cost_usd,
    });
  }
  agentRetries.slice(0, 3).forEach(r => {
    const firstOk = Math.max(0, r.raw_success_calls - r.retry_success);
    const failed  = Math.max(0, r.calls - r.raw_success_calls);
    items.push({
      key: r.agent,
      name: r.agent.charAt(0).toUpperCase() + r.agent.slice(1),
      shortName: r.agent.slice(0, 5),
      firstOk, retryOk: r.retry_success, failed, total: r.calls,
      accentColor: AGENT_LINE[r.agent] ?? "#94a3b8",
      retryCost: r.retry_cost_usd,
    });
  });

  const yAxisW = 32;
  const barW   = 36;
  const barGap = 14;
  const TOP    = 18;
  const CH     = 120;
  const BOT    = 22;
  const totalW      = yAxisW + items.length * (barW + barGap) + 8;
  const costItems   = items.filter(it => (it.retryCost ?? 0) > 0);
  const totalRCost  = costItems.reduce((s, it) => s + (it.retryCost ?? 0), 0) || 1;

  return (
    <div className="card-base h-full flex flex-col">
      <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between flex-shrink-0">
        <div className="font-serif text-display-md text-ink">
          Retry <span className="text-brand">efficiency</span>
        </div>
        <div className="label-mono">pipeline flow</div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[11px] text-ink-mute">No retry data yet.</p>
          </div>
        ) : (
          <>
            {costItems.length > 0 && (() => {
              const r = 22; const cx = 28; const cy = 28; const sw = 9;
              let cAngle = -90;
              return (
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-line-soft flex-shrink-0">
                  <svg width={56} height={56} viewBox="0 0 56 56" className="flex-shrink-0">
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--c-surface-2))" strokeWidth={sw} />
                    {costItems.map(it => {
                      const cost  = it.retryCost ?? 0;
                      const sweep = (cost / totalRCost) * 360;
                      if (sweep < 1) { cAngle += sweep; return null; }
                      if (sweep >= 359.9) {
                        cAngle += sweep;
                        return (
                          <circle key={it.key} cx={cx} cy={cy} r={r}
                            fill="none" stroke={it.accentColor} strokeWidth={sw}>
                            <title>{it.name}: ${cost.toFixed(4)}</title>
                          </circle>
                        );
                      }
                      const s  = ((cAngle) * Math.PI) / 180;
                      const e  = ((cAngle + sweep) * Math.PI) / 180;
                      const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
                      const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
                      cAngle += sweep;
                      return (
                        <path key={it.key}
                          d={`M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`}
                          fill="none" stroke={it.accentColor} strokeWidth={sw} strokeLinecap="butt">
                          <title>{it.name}: ${cost.toFixed(4)}</title>
                        </path>
                      );
                    })}
                    <text x={cx} y={cy + 3} textAnchor="middle" fill="rgb(var(--c-ink))"
                      fontSize="6.5" fontWeight="700" fontFamily="monospace">
                      ${totalRCost < 0.001 ? totalRCost.toFixed(5) : totalRCost.toFixed(4)}
                    </text>
                  </svg>
                  <div className="flex-1 space-y-1.5">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-ink-mute font-mono font-semibold mb-1.5">
                      LLM cost split
                    </div>
                    {costItems.map(it => {
                      const cost = it.retryCost ?? 0;
                      const pct  = (cost / totalRCost) * 100;
                      return (
                        <div key={it.key} className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: it.accentColor }} />
                            <span className="text-ink-2">{it.shortName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold" style={{ color: it.accentColor }}>
                              ${cost < 0.001 ? cost.toFixed(5) : cost.toFixed(4)}
                            </span>
                            <span className="text-ink-mute text-[9px]">({pct.toFixed(0)}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <svg
              viewBox={`0 0 ${totalW} ${TOP + CH + BOT}`}
              className="w-full flex-1 block"
              preserveAspectRatio="xMidYMid meet"
              style={{ minHeight: 120 }}
            >
              {[0, 25, 50, 75, 100].map(v => {
                const gy = TOP + (1 - v / 100) * CH;
                return (
                  <g key={v}>
                    <line
                      x1={yAxisW} x2={totalW - 4} y1={gy} y2={gy}
                      stroke="rgba(148,163,184,0.25)"
                      strokeWidth={v === 0 || v === 100 ? 1 : 0.5}
                      strokeDasharray={v === 0 || v === 100 ? "0" : "4 3"}
                    />
                    <text x={yAxisW - 4} y={gy + 3.5} fontSize="8.5" fill="rgba(148,163,184,0.65)"
                      textAnchor="end" fontFamily="monospace">
                      {v}%
                    </text>
                  </g>
                );
              })}

              {items.map((item, i) => {
                const fPct  = (item.firstOk / (item.total || 1)) * 100;
                const rPct  = (item.retryOk / (item.total || 1)) * 100;
                const flPct = (item.failed  / (item.total || 1)) * 100;
                const successPct = fPct + rPct;
                const bx   = yAxisW + i * (barW + barGap);

                const fH  = (fPct  / 100) * CH;
                const rH  = (rPct  / 100) * CH;
                const flH = (flPct / 100) * CH;

                const flY = TOP;
                const rY  = TOP + flH;
                const fY  = TOP + flH + rH;

                return (
                  <g key={item.key}>
                    <rect x={bx} y={TOP} width={barW} height={CH}
                      fill="rgba(148,163,184,0.08)" rx={3} />
                    {flH > 0.5 && (
                      <rect x={bx} y={flY} width={barW} height={flH}
                        fill="#f87171" opacity={0.85} rx={2}>
                        <title>Failed: {flPct.toFixed(0)}%</title>
                      </rect>
                    )}
                    {rH > 0.5 && (
                      <rect x={bx} y={rY} width={barW} height={rH}
                        fill="#f59e0b" opacity={0.85}>
                        <title>Retry OK: {rPct.toFixed(0)}%</title>
                      </rect>
                    )}
                    {fH > 0.5 && (
                      <rect x={bx} y={fY} width={barW} height={fH}
                        fill="#10b981" opacity={0.85} rx={2}>
                        <title>1st pass: {fPct.toFixed(0)}%</title>
                      </rect>
                    )}
                    <text
                      x={bx + barW / 2} y={TOP - 5}
                      fontSize="9" fill={item.accentColor}
                      textAnchor="middle" fontFamily="monospace" fontWeight="700">
                      {successPct.toFixed(0)}%
                    </text>
                    <text
                      x={bx + barW / 2} y={TOP + CH + 14}
                      fontSize="9" fill={item.accentColor}
                      textAnchor="middle" fontFamily="monospace" fontWeight="600">
                      {item.shortName}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[8.5px] text-ink-mute">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ background: "#10b981", opacity: 0.85 }} />
                1st pass
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ background: "#f59e0b", opacity: 0.85 }} />
                retry OK
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ background: "#f87171", opacity: 0.85 }} />
                failed
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-line-soft grid grid-cols-3 gap-2 flex-shrink-0">
              {[
                { label: "Retries",   value: String(finops.retry_info.retry_calls), color: "text-amber-500" },
                { label: "Cost",      value: `$${finops.retry_info.retry_cost_usd < 0.001 ? finops.retry_info.retry_cost_usd.toFixed(6) : finops.retry_info.retry_cost_usd.toFixed(4)}`, color: "text-amber-500" },
                { label: "Fail Rate", value: `${finops.retry_info.failure_rate_pct}%`, color: finops.retry_info.failure_rate_pct > 10 ? "text-red-400" : "text-emerald-500" },
              ].map(s => (
                <div key={s.label} className="text-center p-1.5 rounded-lg bg-surface-2">
                  <div className={cn("text-[12px] font-bold font-mono", s.color)}>{s.value}</div>
                  <div className="text-[7px] uppercase tracking-widest text-ink-mute mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
