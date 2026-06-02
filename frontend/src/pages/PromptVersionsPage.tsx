import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { Topbar } from "../components/layout/Topbar";
import { api, type PromptVersionStats, type PromptVersionRun } from "../lib/api";

// ── Colour helpers ────────────────────────────────────────────────────────────

function passRateColor(rate: number) {
  if (rate >= 0.8) return "text-emerald-400";
  if (rate >= 0.5) return "text-amber-400";
  return "text-red-400";
}

function attemptColor(n: number) {
  if (n === 1) return "bg-emerald-500/10 text-emerald-400";
  if (n === 2) return "bg-amber-500/10 text-amber-400";
  return "bg-red-500/10 text-red-400";
}

// ── Version selector card ─────────────────────────────────────────────────────

function VersionCard({
  version, stats, selected, onClick,
}: { version: string; stats: PromptVersionStats; selected: boolean; onClick: () => void }) {
  const pct = Math.round(stats.first_attempt_pass_rate * 100);
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3.5 transition-all",
        selected
          ? "border-brand bg-brand/5 ring-1 ring-brand"
          : "border-line-soft bg-surface hover:border-line"
      )}
    >
      <div className="text-[11px] font-mono font-semibold text-ink truncate mb-2">{version}</div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-ink-mute font-mono">{stats.total_runs} runs</span>
        <span className={cn("text-[10px] font-mono font-semibold", passRateColor(stats.first_attempt_pass_rate))}>
          {pct}% 1st-pass
        </span>
      </div>
      {/* Pass rate bar */}
      <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] text-ink-mute font-mono uppercase tracking-wider">{stats.agent}</span>
        <span className="text-[10px] text-ink-mute font-mono">avg {stats.avg_attempts}× attempts</span>
      </div>
    </button>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface-2 px-4 py-3">
      <div className="text-[11px] text-ink-mute font-mono mb-1">{label}</div>
      <div className="text-[22px] font-semibold text-ink font-mono leading-none">
        {value ?? "—"}
      </div>
      {sub && <div className="text-[10px] text-ink-mute mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Attempt distribution bar ──────────────────────────────────────────────────

function AttemptDistBar({ dist, total }: { dist: Record<string, number>; total: number }) {
  const segments = [
    { label: "1 attempt", key: "1", color: "bg-emerald-500" },
    { label: "2 attempts", key: "2", color: "bg-amber-500" },
    { label: "3 attempts", key: "3", color: "bg-red-500" },
  ];
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-2">Attempt Distribution</div>
      <div className="flex h-5 rounded-full overflow-hidden gap-px">
        {segments.map(({ key, color }) => {
          const count = dist[key] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              className={cn("h-full transition-all", color)}
              style={{ width: `${pct}%` }}
              title={`${key} attempt: ${count} run${count !== 1 ? "s" : ""} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div className="flex gap-3 mt-1.5">
        {segments.map(({ key, label, color }) => {
          const count = dist[key] ?? 0;
          if (count === 0) return null;
          return (
            <div key={key} className="flex items-center gap-1">
              <span className={cn("w-2 h-2 rounded-full inline-block", color)} />
              <span className="text-[10px] text-ink-mute font-mono">{label}: {count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Single run card ───────────────────────────────────────────────────────────

function LayerBadge({ layer, result }: { layer: string; result: { passed?: boolean; consequence?: string; issues?: string[]; violations?: string[] } }) {
  const ok = result.passed !== false && result.consequence !== "block" && result.consequence !== "defer";
  const issueCount = (result.issues?.length ?? 0) + (result.violations?.length ?? 0);
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[9px] px-1.5 py-px rounded font-mono",
      ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
    )}>
      {ok ? "✓" : "✗"} {layer}{!ok && issueCount > 0 ? ` (${issueCount})` : ""}
    </span>
  );
}

function AttemptRow({ ah, index }: { ah: { attempt: number; passed: boolean; layers: Record<string, unknown> }; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const layers = ah.layers as Record<string, { passed?: boolean; consequence?: string; issues?: string[]; violations?: string[] }>;

  return (
    <div className={cn("rounded border mb-1.5", ah.passed ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-mono font-semibold", ah.passed ? "text-emerald-400" : "text-red-400")}>
            Attempt {ah.attempt} → {ah.passed ? "PASSED" : "FAILED"}
          </span>
          <div className="flex gap-1">
            {layers.validator && <LayerBadge layer="validator" result={layers.validator} />}
            {layers.tone && <LayerBadge layer="tone" result={layers.tone} />}
            {layers.hallucination && <LayerBadge layer="hallucination" result={layers.hallucination} />}
          </div>
        </div>
        <span className="text-[10px] text-ink-mute font-mono">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-line-soft pt-2">
          {Object.entries(layers).map(([name, res]) => {
            const r = res as { passed?: boolean; consequence?: string; issues?: string[]; violations?: string[] };
            const allIssues = [...(r.issues ?? []), ...(r.violations ?? [])];
            return (
              <div key={name}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn(
                    "text-[9px] px-1.5 py-px rounded font-mono font-semibold",
                    (r.passed !== false && r.consequence !== "block" && r.consequence !== "defer")
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  )}>
                    {(r.passed !== false && r.consequence !== "block" && r.consequence !== "defer") ? "✓" : "✗"} {name}
                  </span>
                </div>
                {allIssues.map((iss, i) => (
                  <div key={i} className="pl-3 text-[10px] text-red-300 font-mono leading-snug">⚠ {iss}</div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: PromptVersionRun }) {
  const [expanded, setExpanded] = useState(false);
  const hasHistory = run.attempt_history && run.attempt_history.length > 0;

  return (
    <div className="rounded-lg border border-line-soft bg-surface mb-3 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft bg-surface-2">
        <div className="flex items-center gap-2.5">
          <span className={cn("text-[10px] px-1.5 py-px rounded font-mono", attemptColor(run.attempt_number))}>
            {run.attempt_number} attempt{run.attempt_number > 1 ? "s" : ""}
          </span>
          <span className="text-[11px] text-ink-mute font-mono">{run.lead_id ?? "—"}</span>
          {run.diagnostic_categories.length > 0 && (
            <span className="text-[9px] px-1.5 py-px rounded bg-amber-500/10 text-amber-400 font-mono">
              {run.diagnostic_categories[0]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {run.retrieval_score != null && (
            <span className="text-[10px] text-ink-mute font-mono">retrieval {Math.round(run.retrieval_score * 100)}%</span>
          )}
          {run.self_eval_confidence != null && (
            <span className="text-[10px] text-ink-mute font-mono">conf {Math.round(run.self_eval_confidence * 100)}%</span>
          )}
          {run.latency_ms != null && (
            <span className="text-[10px] text-ink-mute font-mono">{Math.round(run.latency_ms)}ms</span>
          )}
          <span className="text-[10px] text-ink-mute font-mono">{run.ts.slice(0, 16).replace("T", " ")}</span>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-ink-mute hover:text-ink font-mono"
          >
            {expanded ? "▲ hide" : "▼ detail"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Prompt + Final output side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-1.5">Prompt (preview)</div>
              <div className="rounded border border-line-soft bg-surface-2 p-3 text-[11px] text-ink-2 font-mono leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {run.prompt_preview || "—"}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-1.5">
                Final Output (attempt {run.attempt_number})
              </div>
              <div className="rounded border border-line-soft bg-surface-2 p-3 text-[11px] text-ink-2 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {run.response_preview || "—"}
              </div>
            </div>
          </div>

          {/* Attempt history */}
          {hasHistory && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-2">
                Auto-Correction History ({run.attempt_history.length} attempt{run.attempt_history.length !== 1 ? "s" : ""})
              </div>
              {run.attempt_history.map((ah, i) => (
                <AttemptRow key={ah.attempt} ah={ah} index={i} />
              ))}
            </div>
          )}

          {!hasHistory && (
            <div className="text-[11px] text-emerald-400 font-mono">
              ✓ Passed all governance checks on first attempt — no corrections needed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PromptVersionsPage() {
  const { data: versions = {}, isLoading } = useQuery({
    queryKey: ["promptVersions"],
    queryFn: api.devPromptVersions,
  });

  const versionKeys = Object.keys(versions).sort();
  const [selected, setSelected] = useState<string | null>(null);
  const activeKey = selected ?? versionKeys[0] ?? null;
  const active = activeKey ? versions[activeKey] : null;

  return (
    <>
      <Topbar breadcrumb="Observability" title="Prompt Version Performance" />

      <div className="p-8 pb-20">
        {isLoading && (
          <div className="text-ink-mute text-sm text-center py-12">Loading prompt version data…</div>
        )}

        {!isLoading && versionKeys.length === 0 && (
          <div className="text-ink-mute text-sm text-center py-12">
            No prompt version data yet. Run the outreach pipeline to generate traces.
          </div>
        )}

        {!isLoading && versionKeys.length > 0 && (
          <div className="flex gap-6">
            {/* Left: version list */}
            <div className="w-64 shrink-0 space-y-2">
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-3">Versions</div>
              {versionKeys.map(v => (
                <VersionCard
                  key={v}
                  version={v}
                  stats={versions[v]}
                  selected={v === activeKey}
                  onClick={() => setSelected(v)}
                />
              ))}
            </div>

            {/* Right: version detail */}
            {active && activeKey && (
              <div className="flex-1 min-w-0">
                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <StatTile label="Total Runs" value={active.total_runs} />
                  <StatTile
                    label="1st-Pass Rate"
                    value={`${Math.round(active.first_attempt_pass_rate * 100)}%`}
                    sub="no corrections needed"
                  />
                  <StatTile label="Avg Attempts" value={active.avg_attempts} sub="per successful run" />
                  <StatTile
                    label="Avg Retrieval"
                    value={active.avg_retrieval_score != null ? `${Math.round(active.avg_retrieval_score * 100)}%` : "—"}
                    sub="grounding score"
                  />
                  <StatTile
                    label="Avg Self-Eval"
                    value={active.avg_self_eval_confidence != null ? `${Math.round(active.avg_self_eval_confidence * 100)}%` : "—"}
                    sub="model confidence"
                  />
                </div>

                {/* Attempt distribution */}
                <div className="card-base p-5 mb-6">
                  <AttemptDistBar
                    dist={active.attempt_distribution}
                    total={active.total_runs}
                  />
                </div>

                {/* Recent runs */}
                <div className="card-base p-5">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-4">
                    Recent Runs — expand to see prompt · output · correction steps
                  </div>
                  {active.recent_runs.map((run, i) => (
                    <RunCard key={i} run={run} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
