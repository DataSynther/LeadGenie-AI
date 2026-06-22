import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatRelativeTime } from "../../lib/utils";
import { api } from "../../lib/api";
import type { ApprovalItem as ApprovalItemType, ValidatorCheckpoints, CitationEntry2 } from "../../lib/api";

interface ApprovalItemProps {
  item: ApprovalItemType;
  initialExpanded?: boolean;
  initialTab?: Tab;
  highlight?: string;
}

type Tab = "email" | "validation" | "citations";

/** Render text with query matches highlighted */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-brand/30 text-ink rounded-sm px-0.5 not-italic">{p}</mark>
          : p
      )}
    </>
  );
}

// ── Source colour helpers ──────────────────────────────────────────────────

const SOURCE_TAG: Record<string, string> = {
  "Apollo People API":   "bg-blue-500/10 text-blue-300",
  "Apollo Company API":  "bg-blue-500/10 text-blue-300",
  "Apollo Signals API":  "bg-blue-500/10 text-blue-300",
  "Research Agent":      "bg-purple-500/10 text-purple-300",
  "Trend Agent":         "bg-cyan-500/10 text-cyan-300",
  "LeadGenie product capability": "bg-brand/10 text-brand",
};

function sourceClass(source: string) {
  return SOURCE_TAG[source] ?? (
    source.toLowerCase().includes("unknown") ||
    source.toLowerCase().includes("hallucinated") ||
    source.toLowerCase().includes("unverified")
      ? "bg-red-500/10 text-red-300"
      : "bg-surface-2 text-ink-mute"
  );
}

// ── Email Tab ──────────────────────────────────────────────────────────────

function EmailTab({
  email,
  eventId,
  onSaved,
  highlight,
}: {
  email?: { subject: string; body: string; reasoning?: string };
  eventId: string;
  onSaved: (subject: string, body: string) => void;
  highlight?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(email?.subject ?? "");
  const [body, setBody]       = useState(email?.body ?? "");

  const saveMutation = useMutation({
    mutationFn: () => api.editEmail(eventId, subject, body),
    onSuccess: () => {
      onSaved(subject, body);
      setEditing(false);
    },
  });

  if (!email) return <p className="text-sm text-ink-mute py-4 text-center">No email data available.</p>;

  if (editing) {
    return (
      <div className="space-y-3">
        <div>
          <div className="label-mono mb-1">Subject</div>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full text-[13px] font-medium text-ink bg-surface-2 rounded px-3 py-2 border border-brand/50 focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <div className="label-mono mb-1">Body</div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            className="w-full text-[12px] text-ink-2 leading-relaxed bg-surface-2 rounded px-3 py-2.5 border border-brand/50 focus:outline-none focus:border-brand resize-none font-mono"
          />
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 rounded text-[11px] font-medium bg-brand text-white disabled:opacity-50 hover:bg-brand/80 transition-colors"
          >
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </button>
          <button
            onClick={() => { setSubject(email.subject); setBody(email.body ?? ""); setEditing(false); }}
            className="px-3 py-1.5 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          {saveMutation.isError && (
            <span className="text-[10px] text-red-400 font-mono">
              ✗ {(saveMutation.error as Error).message}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="label-mono mb-1">Subject</div>
        <div className="text-[13px] font-medium text-ink bg-surface-2 rounded px-3 py-2 border border-line-soft">
          {email.subject}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="label-mono">Body</div>
          {highlight && (
            <span className="text-[9px] font-mono text-brand/70 italic">
              KB term highlighted
            </span>
          )}
        </div>
        <div className="text-[12px] text-ink-2 leading-relaxed bg-surface-2 rounded px-3 py-2.5 border border-line-soft whitespace-pre-wrap">
          {highlight ? <HighlightedText text={email.body} query={highlight} /> : email.body}
        </div>
      </div>
      {email.reasoning && (
        <div>
          <div className="label-mono mb-1">Agent reasoning</div>
          <div className="text-[11px] text-ink-mute italic leading-relaxed bg-surface-2 rounded px-3 py-2 border border-line-soft">
            {email.reasoning}
          </div>
        </div>
      )}
      <button
        onClick={() => setEditing(true)}
        className="text-[10px] font-mono text-ink-mute hover:text-ink border border-line rounded px-2.5 py-1 transition-colors"
      >
        ✎ Edit email
      </button>
    </div>
  );
}

// ── Validation Tab ─────────────────────────────────────────────────────────

function CheckRow({ label, ok, issues = [], violations = [], confidence, explanation }: {
  label: string; ok: boolean; issues?: string[]; violations?: string[];
  confidence?: number | null; explanation?: string;
}) {
  const all = [...issues, ...violations];
  return (
    <div className="py-1.5 border-b border-line-soft last:border-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className={cn(
          "inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded",
          ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        )}>
          {ok ? "✓" : "✗"} {label}
        </span>
        {confidence != null && (
          <span className="text-[10px] text-ink-mute font-mono">conf {Math.round(confidence * 100)}%</span>
        )}
      </div>
      {all.length > 0 && (
        <div className="mt-1 space-y-0.5 pl-2">
          {all.map((iss, i) => (
            <div key={i} className="text-[10px] text-red-300 font-mono leading-snug">⚠ {iss}</div>
          ))}
        </div>
      )}
      {explanation && (
        <div className="mt-0.5 pl-2 text-[10px] text-ink-mute leading-snug italic">{explanation}</div>
      )}
    </div>
  );
}

function ValidationTab({
  checkpoints,
  attemptHistory,
  governancePassed,
  totalAttempts,
  eventId,
  onRecheckDone,
}: {
  checkpoints?: ValidatorCheckpoints;
  attemptHistory?: ApprovalItemType["attempt_history"];
  governancePassed: boolean;
  totalAttempts: number;
  eventId: string;
  onRecheckDone: (hallucination: { passed: boolean; violations: string[]; confidence: number; explanation: string }, creditsRemaining: number) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);

  const { data: credits } = useQuery({
    queryKey: ["credits"],
    queryFn: api.getCredits,
    staleTime: 10_000,
  });

  const recheckMutation = useMutation({
    mutationFn: () => api.recheckHallucination(eventId),
    onSuccess: (data) => onRecheckDone(data.hallucination, data.credits_remaining),
  });

  const hallucinationCp = checkpoints?.hallucination;
  const hasViolations   = hallucinationCp && !hallucinationCp.ok;

  return (
    <div className="space-y-3">
      {/* Final status banner */}
      <div className={cn(
        "rounded px-3 py-2 flex items-center gap-2 text-[11px] font-mono",
        governancePassed
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-red-500/10 text-red-400 border border-red-500/20"
      )}>
        {governancePassed ? "✓" : "✗"}
        {governancePassed
          ? `Passed all governance checks${totalAttempts > 1 ? ` (required ${totalAttempts} attempts)` : ""}`
          : `Failed governance after ${totalAttempts} attempt${totalAttempts > 1 ? "s" : ""} — human review required`}
      </div>

      {/* Final checkpoints */}
      {checkpoints && (
        <div className="rounded border border-line-soft bg-surface-2 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-line-soft bg-surface">
            <span className="font-mono text-[9px] uppercase tracking-widest text-ink-mute">
              Final Checkpoint Results
            </span>
          </div>
          <div className="px-3 py-1">
            <CheckRow label="Shape"   ok={checkpoints.shape.ok}   issues={checkpoints.shape.issues} />
            <CheckRow label="Context" ok={checkpoints.context.ok} issues={checkpoints.context.issues} />
            <CheckRow label="Policy"  ok={checkpoints.policy.ok}  issues={checkpoints.policy.issues} />
            {checkpoints.hallucination && (
              <CheckRow
                label="Hallucination"
                ok={checkpoints.hallucination.ok}
                violations={(checkpoints.hallucination as any).violations}
                confidence={checkpoints.hallucination.confidence}
                explanation={checkpoints.hallucination.explanation}
              />
            )}
          </div>
        </div>
      )}

      {/* Hallucination re-check panel */}
      <div className={cn(
        "rounded border px-3 py-2.5",
        hasViolations
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-line-soft bg-surface-2"
      )}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {hasViolations ? (
              <span className="text-[10px] font-mono text-amber-400 font-semibold">
                ⚠ Hallucination issues detected — edit the email then re-check
              </span>
            ) : (
              <span className="text-[10px] font-mono text-ink-mute">
                Re-run hallucination check after editing
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {credits && (
              <span className="text-[9px] font-mono text-ink-mute">
                {credits.remaining} credit{credits.remaining !== 1 ? "s" : ""} remaining
              </span>
            )}
            <button
              onClick={() => recheckMutation.mutate()}
              disabled={recheckMutation.isPending || (credits?.remaining ?? 1) < 1}
              className={cn(
                "px-2.5 py-1 rounded text-[10px] font-mono font-medium border transition-colors",
                (credits?.remaining ?? 1) < 1
                  ? "border-line text-ink-mute opacity-50 cursor-not-allowed"
                  : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
              )}
            >
              {recheckMutation.isPending ? "Checking…" : "Re-check (1 credit)"}
            </button>
          </div>
        </div>
        {recheckMutation.isError && (
          <div className="mt-1.5 text-[10px] text-red-400 font-mono">
            ✗ {(recheckMutation.error as Error).message}
          </div>
        )}
        {recheckMutation.isSuccess && (
          <div className="mt-1.5 text-[10px] text-emerald-400 font-mono">
            ✓ Re-check complete — see results above
          </div>
        )}
      </div>

      {/* Retry history */}
      {attemptHistory && attemptHistory.length > 1 && (
        <div>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-[10px] font-mono text-ink-mute hover:text-ink flex items-center gap-1 mb-2"
          >
            {showHistory ? "▲" : "▼"} {showHistory ? "Hide" : "Show"} retry history ({attemptHistory.length} attempts)
          </button>
          {showHistory && (
            <div className="space-y-2">
              {attemptHistory.map((att) => (
                <div key={att.attempt} className={cn(
                  "rounded border px-3 py-2",
                  att.passed ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
                )}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn(
                      "text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded",
                      att.passed ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                    )}>
                      Attempt {att.attempt}
                    </span>
                    <span className="text-[10px] text-ink-mute font-mono">
                      {att.passed ? "passed" : "failed"}
                    </span>
                  </div>

                  {att.correction_note && (
                    <div className="mb-1.5 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 font-mono leading-snug whitespace-pre-wrap">
                      {att.correction_note}
                    </div>
                  )}

                  {att.layers && (
                    <div className="space-y-1">
                      {Object.entries(att.layers).map(([layer, result]) => {
                        const issues = [...(result.issues ?? []), ...(result.violations ?? [])];
                        if (issues.length === 0 && (result.passed !== false && result.consequence !== "block")) return null;
                        return (
                          <div key={layer} className="text-[10px] font-mono text-red-300">
                            <span className="text-ink-mute">{layer}:</span>{" "}
                            {issues.length > 0 ? issues.join(" · ") : result.consequence ?? "failed"}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Citations Tab ──────────────────────────────────────────────────────────

const SOURCE_GROUP_ORDER = [
  "Apollo People API",
  "Apollo Company API",
  "Apollo Signals API",
  "Research Agent",
  "Trend Agent",
  "LeadGenie product capability",
];

function CitationsTab({ citations, leadId }: { citations?: Record<string, CitationEntry2>; leadId: string }) {
  const navigate = useNavigate();

  if (!citations || Object.keys(citations).length === 0) {
    return <p className="text-sm text-ink-mute py-4 text-center">No citations available.</p>;
  }

  const grouped: Record<string, [string, CitationEntry2][]> = {};
  for (const [key, cit] of Object.entries(citations)) {
    const src = cit.source;
    if (!grouped[src]) grouped[src] = [];
    grouped[src].push([key, cit]);
  }

  const orderedSources = [
    ...SOURCE_GROUP_ORDER.filter(s => grouped[s]),
    ...Object.keys(grouped).filter(s => !SOURCE_GROUP_ORDER.includes(s)),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-mute">
          Facts used by the AI agent, with their verified source.
        </p>
        <button
          onClick={() => navigate(`/audit/${leadId}`)}
          className="text-[10px] font-mono text-brand hover:underline flex items-center gap-1"
        >
          ↗ Full audit trail
        </button>
      </div>

      {orderedSources.map(src => {
        const groupItems = grouped[src];
        const groupUrl = groupItems[0]?.[1].url && groupItems.every(([, c]) => c.url === groupItems[0][1].url)
          ? groupItems[0][1].url
          : undefined;
        return (
          <div key={src} className="rounded border border-line-soft bg-surface-2 overflow-hidden">
            <div className={cn(
              "px-3 py-1.5 border-b border-line-soft flex items-center gap-2",
              sourceClass(src).includes("red") ? "bg-red-500/5" : "bg-surface"
            )}>
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold", sourceClass(src))}>
                {src}
              </span>
              <span className="text-[9px] text-ink-mute font-mono">{groupItems.length} field{groupItems.length > 1 ? "s" : ""}</span>
              {groupUrl && (
                <a
                  href={groupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-[9px] font-mono text-brand hover:underline flex items-center gap-0.5"
                >
                  ↗ open source
                </a>
              )}
            </div>
            <div className="divide-y divide-line-soft">
              {grouped[src].map(([key, cit]) => (
                <div key={key} className="px-3 py-1.5 flex items-start gap-2.5">
                  <span className="font-mono text-[10px] text-ink-mute w-32 shrink-0 truncate pt-0.5">{key}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-ink-2 leading-snug">
                      {Array.isArray(cit.value)
                        ? (cit.value as string[]).slice(0, 4).join(", ") + ((cit.value as string[]).length > 4 ? ` +${(cit.value as string[]).length - 4}` : "")
                        : String(cit.value ?? "—")}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[9px] text-ink-mute font-mono">{cit.field}</span>
                      {cit.url && (
                        <a
                          href={cit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] font-mono text-brand hover:underline flex items-center gap-0.5"
                        >
                          ↗ source
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ApprovalItem({ item, initialExpanded = false, initialTab, highlight }: ApprovalItemProps) {
  const queryClient = useQueryClient();
  const isHigh = item.risk_level === "high";
  const governanceFailed = !item.governance_passed;
  const isFollowup = item.message_type === "followup";

  const [tab, setTab]         = useState<Tab>(initialTab ?? (governanceFailed ? "validation" : "email"));
  const [expanded, setExpanded] = useState(initialExpanded);
  const [maxFollowups, setMaxFollowups] = useState(1);

  // Local overrides for email content and hallucination status after in-page edits
  const [localEmail, setLocalEmail] = useState(item.email);
  const [localCheckpoints, setLocalCheckpoints] = useState(item.checkpoints);

  const removeFromCache = () =>
    queryClient.setQueryData(["approvalQueue"], (old: ApprovalItemType[] = []) =>
      old.filter(i => i.event_id !== item.event_id)
    );

  const approveMutation = useMutation({
    mutationFn: () => api.approveOutreach(item.event_id, isFollowup ? undefined : maxFollowups),
    onSuccess: removeFromCache,
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.rejectOutreach(item.event_id),
    onSuccess: removeFromCache,
  });

  const acting = approveMutation.isPending || rejectMutation.isPending;
  const actionError = approveMutation.error || rejectMutation.error;
  if (approveMutation.isSuccess || rejectMutation.isSuccess) return null;

  const failedCheckpointCount = localCheckpoints
    ? Object.values(localCheckpoints).filter(cp => cp && !cp.ok).length
    : 0;

  const hasHallucinationViolations = localCheckpoints?.hallucination && !localCheckpoints.hallucination.ok;

  const tabs: { id: Tab; label: string; badge?: string | number }[] = [
    { id: "email", label: "Email" },
    {
      id: "validation",
      label: "Validation",
      badge: governanceFailed
        ? (item.total_attempts > 1 ? `${item.total_attempts} retries` : "failed")
        : (failedCheckpointCount > 0 ? `${failedCheckpointCount} issues` : undefined),
    },
    { id: "citations", label: "Citations" },
  ];

  const handleEmailSaved = (subject: string, body: string) => {
    setLocalEmail(prev => prev ? { ...prev, subject, body } : { subject, body });
  };

  const handleRecheckDone = (
    hallucination: { passed: boolean; violations: string[]; confidence: number; explanation: string },
    _creditsRemaining: number,
  ) => {
    queryClient.invalidateQueries({ queryKey: ["credits"] });
    setLocalCheckpoints(prev => prev ? {
      ...prev,
      hallucination: {
        ok:          hallucination.passed,
        violations:  hallucination.violations,
        confidence:  hallucination.confidence,
        explanation: hallucination.explanation,
      },
    } : prev);
  };

  return (
    <div className={cn(
      "bg-surface rounded-md border border-line-soft border-l-[3px] mb-2.5",
      isHigh ? "border-l-danger" : item.risk_level === "medium" ? "border-l-gold" : "border-l-emerald-500"
    )}>
      {/* Header row */}
      <div className="flex justify-between items-start px-4 pt-3.5 pb-2.5">
        <div className="flex gap-2 items-center flex-wrap">
          <span className={cn(
            "font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded font-semibold",
            isHigh ? "bg-danger-tint text-danger"
              : item.risk_level === "medium" ? "bg-gold-tint text-gold-dark"
              : "bg-emerald-500/10 text-emerald-400"
          )}>
            {item.risk_level} risk
          </span>
          {governanceFailed && (
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-semibold">
              governance failed
            </span>
          )}
          {!governanceFailed && (
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
              passed
            </span>
          )}
          {hasHallucinationViolations && (
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold">
              ⚠ hallucination
            </span>
          )}
          {isFollowup && item.followup_number && (
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-semibold">
              Follow-up #{item.followup_number}
            </span>
          )}
          <span className="text-[13px] font-medium text-ink">{item.lead_name}</span>
          <span className="text-[11px] text-ink-2 font-mono">· {item.lead_title} @ {item.company_name}</span>
        </div>
        <span className="label-mono shrink-0 ml-2">{formatRelativeTime(item.timestamp)}</span>
      </div>

      {/* Email snippet */}
      <div className="mx-4 mb-2.5 text-xs text-ink-2 leading-relaxed p-2.5 bg-surface-2 rounded border border-line-soft">
        "{item.content_snippet}"
      </div>

      {/* Meta row */}
      <div className="px-4 mb-2.5 text-[11px] text-ink-mute font-mono flex items-center gap-1.5 flex-wrap">
        <span className="text-ink-2">risk {Math.round(item.risk_score * 100)}%</span>
        {item.total_attempts > 1 && (
          <span>· <span className="text-amber-400">{item.total_attempts} AI attempts</span></span>
        )}
        {governanceFailed && (
          <span>· <span className="text-red-400">needs review</span></span>
        )}
        {hasHallucinationViolations && (
          <span>· <span className="text-amber-400">edit + re-check recommended</span></span>
        )}
      </div>

      {/* Expandable detail */}
      <div className="px-4 mb-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[10px] font-mono text-brand hover:text-brand/80 flex items-center gap-1"
        >
          {expanded ? "▲ Hide" : "▼ Show"} details
          {governanceFailed && !expanded && (
            <span className="ml-1 text-red-400">— {failedCheckpointCount} check{failedCheckpointCount !== 1 ? "s" : ""} failed</span>
          )}
        </button>

        {expanded && (
          <div className="mt-3">
            {/* Tab bar */}
            <div className="flex gap-0 border-b border-line-soft mb-3">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-3 py-1.5 text-[11px] font-mono flex items-center gap-1.5 border-b-2 -mb-px transition-colors",
                    tab === t.id
                      ? "border-brand text-brand"
                      : "border-transparent text-ink-mute hover:text-ink"
                  )}
                >
                  {t.label}
                  {t.badge && (
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded font-mono",
                      t.id === "validation" && governanceFailed
                        ? "bg-red-500/15 text-red-400"
                        : "bg-surface-2 text-ink-mute"
                    )}>
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "email" && (
              <EmailTab
                email={localEmail}
                eventId={item.event_id}
                onSaved={handleEmailSaved}
                highlight={highlight}
              />
            )}
            {tab === "validation" && (
              <ValidationTab
                checkpoints={localCheckpoints}
                attemptHistory={item.attempt_history}
                governancePassed={item.governance_passed}
                totalAttempts={item.total_attempts}
                eventId={item.event_id}
                onRecheckDone={handleRecheckDone}
              />
            )}
            {tab === "citations" && <CitationsTab citations={item.citations} leadId={item.lead_id} />}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-3.5">
        <div className="flex gap-2 flex-wrap">
          {!isFollowup && (
            <label className="flex items-center gap-1.5 text-[10px] font-mono text-ink-mute border border-line rounded px-2 py-1 bg-surface-2">
              Max Follow-ups
              <select
                value={maxFollowups}
                onChange={e => setMaxFollowups(Number(e.target.value))}
                disabled={acting}
                className="bg-surface text-ink border border-line-soft rounded px-1 py-0.5 text-[10px] focus:outline-none focus:border-brand/50"
              >
                {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <button
            onClick={() => approveMutation.mutate()}
            disabled={acting}
            className="px-3 py-1.5 rounded text-[11px] font-medium bg-brand text-white disabled:opacity-50 hover:bg-brand/80 transition-colors"
          >
            {approveMutation.isPending ? "Approving…" : "Approve & Send"}
          </button>
          <button
            onClick={() => rejectMutation.mutate()}
            disabled={acting}
            className="px-2.5 py-1.5 rounded text-[11px] font-medium text-danger border border-line bg-transparent disabled:opacity-50 hover:bg-danger/5 transition-colors"
          >
            {rejectMutation.isPending ? "Rejecting…" : "Reject"}
          </button>
          <button
            onClick={() => { setExpanded(true); setTab("validation"); }}
            className="px-2.5 py-1.5 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line hover:bg-surface transition-colors"
          >
            Explain
          </button>
          <button
            onClick={() => { setExpanded(true); setTab("citations"); }}
            className="px-2.5 py-1.5 rounded text-[11px] font-medium bg-surface-2 text-ink border border-line hover:bg-surface transition-colors"
          >
            ↗ Citations
          </button>
          {hasHallucinationViolations && (
            <button
              onClick={() => { setExpanded(true); setTab("email"); }}
              className="px-2.5 py-1.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/15 transition-colors"
            >
              ✎ Fix hallucination
            </button>
          )}
        </div>
        {actionError && (
          <div className="mt-2 text-[10px] text-red-400 font-mono">
            ✗ {(actionError as Error).message || "Action failed — check network"}
          </div>
        )}
      </div>
    </div>
  );
}
