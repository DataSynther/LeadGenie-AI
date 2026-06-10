import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { Topbar } from "../components/layout/Topbar";
import {
  api,
  type EngagementRun,
  type PromptAttempt,
  type PromptAttemptLayer,
} from "../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function agentLabel(agent: string): string {
  const map: Record<string, string> = {
    outreach:     "Initial Outreach",
    conversation: "Conversation Reply",
    objection:    "Objection Response",
    followup:     "Follow-up",
    research:     "Research",
    intent:       "Intent Classifier",
  };
  return map[agent] ?? agent;
}

function agentColor(agent: string): string {
  const map: Record<string, string> = {
    outreach:     "bg-brand/10 text-brand",
    conversation: "bg-violet-500/10 text-violet-400",
    objection:    "bg-amber-500/10 text-amber-400",
    followup:     "bg-sky-500/10 text-sky-400",
    research:     "bg-emerald-500/10 text-emerald-400",
    intent:       "bg-pink-500/10 text-pink-400",
  };
  return map[agent] ?? "bg-surface-2 text-ink-mute";
}

function attemptBadgeColor(n: number, passed: boolean): string {
  if (n === 1 && passed) return "bg-emerald-500/10 text-emerald-400";
  if (n === 2)           return "bg-amber-500/10 text-amber-400";
  return "bg-red-500/10 text-red-400";
}

function fmtTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-IN", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    });
  } catch {
    return ts.slice(0, 16).replace("T", " ");
  }
}

function layerOk(r: PromptAttemptLayer): boolean {
  return r.passed !== false && r.consequence !== "block" && r.consequence !== "defer";
}

// ── Engagement card (left panel) ──────────────────────────────────────────────

function EngagementCard({
  run, selected, onClick,
}: { run: EngagementRun; selected: boolean; onClick: () => void }) {
  const displayName = run.lead_name ?? (run.lead_id ? run.lead_id.slice(0, 10) + "…" : "Unknown Lead");
  const layers = (run.attempts[0]?.layers ?? {}) as Record<string, PromptAttemptLayer>;
  const layerNames = Object.keys(layers);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all",
        selected
          ? "border-brand bg-brand/5 ring-1 ring-brand"
          : "border-line-soft bg-surface hover:border-line"
      )}
    >
      {/* Name + company */}
      <div className="font-semibold text-[12px] text-ink truncate">{displayName}</div>
      {run.company_name && (
        <div className="text-[10px] text-ink-mute truncate mb-1.5">{run.company_name}</div>
      )}

      {/* Agent badge + attempt badge */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <span className={cn("text-[9px] px-1.5 py-px rounded-full font-mono font-semibold", agentColor(run.agent))}>
          {agentLabel(run.agent)}
        </span>
        <span className={cn("text-[9px] px-1.5 py-px rounded-full font-mono font-semibold", attemptBadgeColor(run.total_attempts, run.final_passed))}>
          {run.total_attempts} attempt{run.total_attempts !== 1 ? "s" : ""}
        </span>
        <span className={cn(
          "text-[9px] px-1.5 py-px rounded-full font-mono font-semibold ml-auto",
          run.final_passed ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        )}>
          {run.final_passed ? "✓ passed" : "✗ failed"}
        </span>
      </div>

      {/* Layer dots */}
      {layerNames.length > 0 && (
        <div className="flex gap-1 mb-1.5">
          {layerNames.map(k => {
            const ok = layerOk(layers[k]);
            return (
              <span key={k} className={cn(
                "text-[8px] px-1 py-px rounded font-mono",
                ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
              )}>
                {ok ? "✓" : "✗"} {k.slice(0, 3)}
              </span>
            );
          })}
        </div>
      )}

      <div className="text-[9px] text-ink-mute font-mono">{fmtTs(run.ts)}</div>
    </button>
  );
}

// ── Check panel ───────────────────────────────────────────────────────────────

function CheckPanel({ name, r }: { name: string; r: PromptAttemptLayer }) {
  const ok = layerOk(r);
  const allIssues = [...(r.issues ?? []), ...(r.violations ?? [])];
  return (
    <div className={cn(
      "rounded border p-3 flex-1 min-w-0",
      ok ? "border-emerald-500/25 bg-emerald-500/5" : "border-red-500/25 bg-red-500/5"
    )}>
      <div className={cn(
        "text-[9px] font-mono font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5",
        ok ? "text-emerald-400" : "text-red-400"
      )}>
        <span>{ok ? "✓" : "✗"}</span>
        <span>{name}</span>
        {!ok && allIssues.length > 0 && (
          <span className="ml-auto bg-red-500/20 text-red-300 rounded px-1 text-[9px]">{allIssues.length}</span>
        )}
      </div>
      {r.consequence && (
        <div className="text-[9px] text-ink-mute font-mono mb-1.5">
          consequence: <span className={cn(r.consequence === "allow" ? "text-emerald-400" : "text-amber-400")}>
            {r.consequence}
          </span>
        </div>
      )}
      {r.confidence != null && (
        <div className="text-[9px] text-ink-mute font-mono mb-1.5">
          confidence: <span className="text-ink">{Math.round(r.confidence * 100)}%</span>
        </div>
      )}
      {allIssues.length > 0 ? (
        <div className="space-y-1">
          {allIssues.map((iss, i) => (
            <div key={i} className="text-[10px] text-red-300 font-mono leading-snug break-words">⚠ {iss}</div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-emerald-400/70 font-mono">No issues</div>
      )}
      {r.explanation && (
        <div className="mt-1.5 text-[9px] text-ink-mute leading-relaxed italic border-t border-line-soft pt-1.5">
          {r.explanation}
        </div>
      )}
    </div>
  );
}

// ── Attempt row ───────────────────────────────────────────────────────────────

function AttemptRow({ ah, index }: { ah: PromptAttempt; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const layers = ah.layers as Record<string, PromptAttemptLayer>;
  const issueCount = Object.values(layers).reduce(
    (n, r) => n + (r.issues?.length ?? 0) + (r.violations?.length ?? 0), 0
  );

  return (
    <div className={cn(
      "rounded-lg border mb-3 overflow-hidden",
      ah.passed ? "border-emerald-500/30" : "border-red-500/30"
    )}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-2.5 text-left",
          ah.passed ? "bg-emerald-500/5" : "bg-red-500/5"
        )}
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={cn(
            "text-[11px] font-mono font-semibold",
            ah.passed ? "text-emerald-400" : "text-red-400"
          )}>
            Attempt {ah.attempt} — {ah.passed ? "PASSED" : "FAILED"}
          </span>
          {!ah.passed && issueCount > 0 && (
            <span className="text-[9px] bg-red-500/15 text-red-300 rounded px-1.5 py-px font-mono">
              {issueCount} issue{issueCount !== 1 ? "s" : ""}
            </span>
          )}
          {ah.correction_note && (
            <span className="text-[9px] bg-amber-500/15 text-amber-400 rounded px-1.5 py-px font-mono">
              correction applied
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {layers.validator && (
            <span className={cn("text-[9px] px-1.5 py-px rounded font-mono",
              layerOk(layers.validator) ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
              {layerOk(layers.validator) ? "✓" : "✗"} val
            </span>
          )}
          {layers.tone && (
            <span className={cn("text-[9px] px-1.5 py-px rounded font-mono",
              layerOk(layers.tone) ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
              {layerOk(layers.tone) ? "✓" : "✗"} tone
            </span>
          )}
          {layers.hallucination && (
            <span className={cn("text-[9px] px-1.5 py-px rounded font-mono",
              layerOk(layers.hallucination) ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
              {layerOk(layers.hallucination) ? "✓" : "✗"} hal
            </span>
          )}
          <span className="text-[10px] text-ink-mute font-mono ml-1">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-line-soft">
          {/* Correction note (attempt 2+) */}
          {ah.correction_note && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-amber-400 mb-1.5">
                Correction Injected into Prompt
              </div>
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-200 font-mono leading-relaxed whitespace-pre-wrap break-words max-h-36 overflow-y-auto">
                {ah.correction_note}
              </div>
            </div>
          )}

          {/* Prompt preview */}
          {ah.prompt_preview && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-1.5">
                Prompt Sent to Claude (preview)
              </div>
              <div className="rounded border border-line-soft bg-surface-2 p-3 text-[11px] text-ink-2 font-mono leading-relaxed whitespace-pre-wrap break-words max-h-44 overflow-y-auto">
                {ah.prompt_preview}
              </div>
            </div>
          )}

          {/* Generated email */}
          {ah.email && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-1.5">
                Generated Email
              </div>
              <div className="rounded border border-line-soft bg-surface-2 p-3 space-y-2">
                {ah.email.subject && (
                  <div>
                    <span className="text-[9px] font-mono text-ink-mute uppercase tracking-wider">Subject: </span>
                    <span className="text-[11px] font-mono text-ink font-semibold">{ah.email.subject}</span>
                  </div>
                )}
                {ah.email.body && (
                  <div className="text-[11px] text-ink-2 leading-relaxed whitespace-pre-wrap break-words max-h-36 overflow-y-auto border-t border-line-soft pt-2">
                    {ah.email.body}
                  </div>
                )}
                {ah.email.reasoning && (
                  <div className="text-[10px] text-ink-mute italic border-t border-line-soft pt-1.5">
                    Reasoning: {ah.email.reasoning}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3 check panels */}
          {Object.keys(layers).length > 0 && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-2">
                Governance Checks
              </div>
              <div className="flex gap-2 flex-wrap">
                {layers.validator    && <CheckPanel name="Validator"    r={layers.validator} />}
                {layers.tone         && <CheckPanel name="Tone"         r={layers.tone} />}
                {layers.hallucination && <CheckPanel name="Hallucination" r={layers.hallucination} />}
                {Object.entries(layers)
                  .filter(([k]) => !["validator", "tone", "hallucination"].includes(k))
                  .map(([k, r]) => <CheckPanel key={k} name={k} r={r} />)
                }
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Run detail (right panel) ──────────────────────────────────────────────────

function RunDetail({ run }: { run: EngagementRun }) {
  const displayName = run.lead_name ?? (run.lead_id ? run.lead_id.slice(0, 12) + "…" : "Unknown Lead");

  return (
    <div>
      {/* Run header */}
      <div className="rounded-lg border border-line-soft bg-surface-2 px-5 py-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[16px] font-semibold text-ink">
              {displayName}
              {run.company_name && (
                <span className="text-ink-mute font-normal"> @ {run.company_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold", agentColor(run.agent))}>
                {agentLabel(run.agent)}
              </span>
              <span className="text-[10px] text-ink-mute font-mono">{run.prompt_version}</span>
              <span className="text-[10px] text-ink-mute font-mono">·</span>
              <span className="text-[10px] text-ink-mute font-mono">{fmtTs(run.ts)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={cn(
              "text-[11px] font-mono font-semibold px-2 py-0.5 rounded",
              run.final_passed ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            )}>
              {run.final_passed ? "✓ Passed" : "✗ Failed"}
            </span>
            <span className={cn(
              "text-[10px] font-mono px-2 py-0.5 rounded",
              attemptBadgeColor(run.total_attempts, run.final_passed)
            )}>
              {run.total_attempts} attempt{run.total_attempts !== 1 ? "s" : ""}
            </span>
            {run.final_risk_score != null && (
              <span className="text-[10px] font-mono text-ink-mute">
                risk {run.final_risk_score.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Attempt timeline */}
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute mb-3">
        Attempt Timeline — {run.total_attempts} attempt{run.total_attempts !== 1 ? "s" : ""}
      </div>
      {run.attempts.length > 0 ? (
        run.attempts.map((ah, i) => (
          <AttemptRow key={ah.attempt} ah={ah} index={i} />
        ))
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface-2 px-5 py-6 text-center">
          <div className="text-[12px] text-ink-mute">
            No per-attempt detail captured for this run.
          </div>
          <div className="text-[11px] text-ink-mute/60 mt-1">
            Re-run the pipeline to capture full attempt data.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PromptVersionsPage() {
  const navigate = useNavigate();
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["engagementRuns"],
    queryFn: api.devEngagementRuns,
    refetchInterval: 30_000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeRun = runs.find(r => r.run_id === selectedId) ?? runs[0] ?? null;

  return (
    <>
      <Topbar breadcrumb="Observability" title="Prompt Quality by Engagement" />

      <div className="p-8 pb-20">
        {/* Quidditch Prompt Lab link */}
        <div className="flex justify-end mb-5">
          <button
            onClick={() => navigate("/quidditch")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
          >
            🏟️ Open Quidditch Prompt Lab →
          </button>
        </div>

        {isLoading && (
          <div className="text-ink-mute text-sm text-center py-12">Loading engagement runs…</div>
        )}

        {!isLoading && runs.length === 0 && (
          <div className="text-center py-16">
            <div className="text-[14px] text-ink-mute mb-2">No engagement runs yet.</div>
            <div className="text-[12px] text-ink-mute/60">
              Run the outreach pipeline or e2e_test.py to generate governed outreach — each run will appear here with full per-attempt detail.
            </div>
          </div>
        )}

        {!isLoading && runs.length > 0 && (
          <div className="flex gap-6">
            {/* ── Left: engagement list ── */}
            <div className="w-64 shrink-0 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[9px] uppercase tracking-widest text-ink-mute">
                  Engagements
                </div>
                <div className="text-[9px] text-ink-mute font-mono">{runs.length} total</div>
              </div>
              {runs.map(r => (
                <EngagementCard
                  key={r.run_id}
                  run={r}
                  selected={r.run_id === (activeRun?.run_id ?? null)}
                  onClick={() => setSelectedId(r.run_id)}
                />
              ))}
            </div>

            {/* ── Right: run detail ── */}
            <div className="flex-1 min-w-0">
              {activeRun ? (
                <RunDetail run={activeRun} />
              ) : (
                <div className="text-ink-mute text-sm text-center py-12">
                  Select an engagement to view attempt details.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
