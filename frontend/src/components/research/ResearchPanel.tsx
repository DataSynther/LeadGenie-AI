import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  X, ExternalLink, TrendingUp, TrendingDown, Minus,
  Building2, Users, DollarSign, Calendar, Zap, Cpu, RefreshCw, Send, MessageCircle,
  CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { api } from "../../lib/api";
import type { Lead, OutreachResult, OutreachSuggestion, PipelineStageEvent } from "../../lib/api";
import { usePipeline } from "../../context/PipelineContext";
import { cn } from "../../lib/utils";

interface ResearchPanelProps {
  lead: Lead | null;
  onClose: () => void;
  autoGenerate?: boolean;
  defaultChannel?: "email" | "whatsapp";
}

const SIGNAL_STYLES: Record<string, string> = {
  hot: "bg-danger-tint text-danger border-danger/20",
  med: "bg-gold-tint text-gold-dark border-gold/20",
  low: "bg-surface-2 text-ink-2 border-line",
  ai:  "bg-brand-soft text-brand border-brand/20",
};

const TECH_AI_KEYWORDS = ["AI", "Anthropic Claude", "machine learning", "TensorFlow", "PyTorch", "OpenAI"];
const WHATSAPP_SENDER_INTRO = "I am Prasant from Ganit.";

function leadFirstName(name?: string | null) {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

function stripOpeningGreeting(body: string) {
  return body.trimStart().replace(/^Hi\s+[^,\n]+,\s*/i, "");
}

function buildInitialWhatsAppBody(body: string, leadName?: string | null) {
  const intro = `Hi ${leadFirstName(leadName)}, ${WHATSAPP_SENDER_INTRO}`;
  const content = stripOpeningGreeting(body);
  return content ? `${intro}\n\n${content}` : intro;
}

function stripInitialWhatsAppIntro(body: string, leadName?: string | null) {
  const intro = `Hi ${leadFirstName(leadName)}, ${WHATSAPP_SENDER_INTRO}`;
  const trimmed = body.trimStart();
  if (!trimmed.startsWith(intro)) return body;
  return trimmed.slice(intro.length).replace(/^\s+/, "");
}

// ── Result notification banner ─────────────────────────────────────────────

function OutreachResultBanner({
  result,
  onDismiss,
  onRetry,
  retrying,
}: {
  result: OutreachResult;
  onDismiss: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const navigate = useNavigate();
  const gov = result.governance;
  const lastAttempt = gov.governance_attempt_history?.[gov.governance_attempt_history.length - 1];
  const hallucLayers = lastAttempt?.layers?.hallucination;
  const hasHallucination = hallucLayers && !hallucLayers.passed && !hallucLayers.skipped && (hallucLayers.violations?.length ?? 0) > 0;
  const governancePassed = lastAttempt?.passed ?? true;
  const totalAttempts = gov.total_attempts ?? 1;

  return (
    <div className={cn(
      "mx-4 mb-3 rounded-lg border p-3 text-[11px]",
      governancePassed && !hasHallucination
        ? "bg-emerald-500/8 border-emerald-500/25"
        : "bg-amber-500/8 border-amber-500/25"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 font-semibold">
          {governancePassed && !hasHallucination ? (
            <span className="text-emerald-400">✓ Email queued for review</span>
          ) : (
            <span className="text-amber-400">⚠ Queued — review required</span>
          )}
        </div>
        <button onClick={onDismiss} className="text-ink-mute hover:text-ink">
          <X size={12} />
        </button>
      </div>

      {/* Check status grid */}
      <div className="grid grid-cols-2 gap-1 mb-2.5 font-mono text-[10px]">
        <div className={cn("flex items-center gap-1", governancePassed ? "text-emerald-400" : "text-red-400")}>
          {governancePassed ? "✓" : "✗"} Governance
        </div>
        <div className={cn("flex items-center gap-1", !hasHallucination ? "text-emerald-400" : "text-amber-400")}>
          {!hasHallucination ? "✓" : "⚠"} Hallucination
        </div>
        <div className="text-ink-mute col-span-2">
          {totalAttempts > 1
            ? `${totalAttempts} generation attempt${totalAttempts > 1 ? "s" : ""}`
            : "1 generation attempt"}
        </div>
      </div>

      {/* Hallucination violations */}
      {hasHallucination && hallucLayers?.violations && (
        <div className="mb-2.5 bg-amber-500/10 rounded px-2 py-1.5 text-[10px] text-amber-300 font-mono space-y-0.5">
          {hallucLayers.violations.slice(0, 2).map((v, i) => (
            <div key={i}>⚠ {v.length > 80 ? v.slice(0, 80) + "…" : v}</div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => navigate("/approval")}
          className="px-2.5 py-1 rounded text-[10px] font-medium bg-brand text-white hover:bg-brand/80 transition-colors"
        >
          View in Queue →
        </button>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="px-2.5 py-1 rounded text-[10px] font-medium bg-surface-2 text-ink border border-line hover:bg-surface transition-colors disabled:opacity-50"
        >
          {retrying ? <><RefreshCw size={9} className="inline animate-spin mr-1" />Retrying…</> : "↺ Retry"}
        </button>
        <button
          onClick={() => navigate(`/approval`)}
          className="px-2.5 py-1 rounded text-[10px] font-medium bg-surface-2 text-ink border border-line hover:bg-surface transition-colors"
        >
          ↗ Citations
        </button>
      </div>
    </div>
  );
}

// ── Pipeline stage labels (display order) ─────────────────────────────────

const STAGE_META: Record<string, string> = {
  enriching_lead:    "Fetching lead data",
  enriching_company: "Enriching company profile",
  detecting_signals: "Detecting hiring signals",
  researching:       "AI company research",
  building_context:  "Building lead context",
  fetching_trends:   "Fetching market trends",
  ranking_relevance: "Ranking by relevance",
  generating_email:  "Generating email",
  governance:        "Governance checks",
  queueing:          "Adding to queue",
};

function PipelineProgress({ stages }: { stages: PipelineStageEvent[] }) {
  const stageMap = Object.fromEntries(stages.map(s => [s.stage, s]));

  return (
    <div className="p-6 flex flex-col gap-2.5">
      <div className="label-mono text-ink mb-2">Pipeline running…</div>
      {Object.entries(STAGE_META).map(([id, defaultLabel]) => {
        const s = stageMap[id];
        const status = s?.status ?? "pending";
        const label = s?.label ?? defaultLabel;
        return (
          <div key={id} className="flex items-center gap-3">
            <span className="shrink-0 w-4 h-4 flex items-center justify-center">
              {status === "running" && <Loader2 size={14} className="animate-spin text-brand" />}
              {status === "done"    && <CheckCircle2 size={14} className="text-emerald-500" />}
              {status === "error"   && <AlertCircle size={14} className="text-danger" />}
              {status === "pending" && <span className="w-2 h-2 rounded-full bg-line-soft mx-auto" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "text-[12px] font-mono truncate",
                status === "running" ? "text-brand font-semibold" :
                status === "done"    ? "text-ink" :
                status === "error"   ? "text-danger" :
                "text-ink-mute"
              )}>
                {label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function ResearchPanel({ lead, onClose, autoGenerate = false, defaultChannel = "email" }: ResearchPanelProps) {
  const navigate = useNavigate();
  const [outreachResult, setOutreachResult] = useState<OutreachResult | null>(null);
  const [channel, setChannel] = useState<"email" | "whatsapp">(defaultChannel);
  const [editableEmail, setEditableEmail] = useState<{ subject: string; body: string; reasoning?: string } | null>(null);
  const [suggestion, setSuggestion] = useState<OutreachSuggestion | null>(null);
  const [selectedVertical, setSelectedVertical] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const { run: pipelineRun, startPipeline } = usePipeline();
  const isStreaming = pipelineRun.isStreaming;
  const pipelineStages = pipelineRun.stages;

  // When the global pipeline finishes, pull the result into this panel
  useEffect(() => {
    if (pipelineRun.result && !outreachResult) {
      const r = pipelineRun.result;
      setOutreachResult(r);
      setEditableEmail(r.email ? { subject: r.email.subject, body: r.email.body, reasoning: r.email.reasoning } : null);
    }
  }, [pipelineRun.result]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: company, isLoading, error } = useQuery({
    queryKey: ["companyResearch", lead?.company],
    queryFn: () => api.companyResearch(lead!.company),
    enabled: !!lead?.company,
  });

  // Derive company domain: prefer company.domain, fall back to email domain, then name heuristic
  const companyDomain = (() => {
    if (company?.domain) return company.domain;
    if (lead?.email?.includes("@")) return lead.email.split("@")[1];
    return (lead?.company ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
  })();

  const suggestMutation = useMutation({
    mutationFn: () => api.suggestOutreachContext(lead!.id, companyDomain),
    onSuccess: (data) => {
      setSuggestion(data);
      setSelectedVertical(data.vertical);
      setSelectedDomain(data.domain);
    },
  });


  const sendMutation = useMutation({
    mutationFn: () => api.sendOutreach({
      leadId: lead!.id,
      toEmail: lead!.email,
      phone: (lead as any).phone,
      subject: editableEmail!.subject,
      body: channel === "whatsapp"
        ? buildInitialWhatsAppBody(editableEmail!.body, lead?.name)
        : editableEmail!.body,
      reasoning: editableEmail?.reasoning,
      context: outreachResult,
    }),
  });

  const handleGenerate = () => {
    setOutreachResult(null);
    setEditableEmail(null);
    setSuggestion(null);
    sendMutation.reset();
    suggestMutation.mutate();
  };

  const handleConfirmGenerate = () => {
    setSuggestion(null);
    setOutreachResult(null);
    setEditableEmail(null);
    startPipeline({
      leadId: lead!.id,
      leadName: lead?.name ?? "",
      companyName: lead?.company ?? "",
      companyDomain,
      vertical: selectedVertical ?? undefined,
      domain: selectedDomain ?? undefined,
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[440px] bg-surface border-l border-line-soft z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-6 py-5 border-b border-line-soft flex items-start justify-between shrink-0">
          <div>
            <div className="font-serif text-[20px] text-ink leading-tight">{lead?.name}</div>
            <div className="font-mono text-[11px] text-ink mt-0.5">{lead?.title}</div>
            <div className="font-mono text-[11px] text-brand mt-0.5 font-medium">{lead?.company}</div>
            {/* Channel switcher */}
            <div className="flex gap-1.5 mt-2.5">
              <button
                onClick={() => setChannel("email")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium border transition-colors",
                  channel === "email" ? "bg-brand text-white border-brand" : "bg-surface text-ink-2 border-line hover:border-brand hover:text-brand"
                )}
              >
                <Zap size={9} /> Email
              </button>
              <button
                onClick={() => setChannel("whatsapp")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium border transition-colors",
                  channel === "whatsapp" ? "bg-emerald-600 text-white border-emerald-600" : "bg-surface text-ink-2 border-line hover:border-emerald-500 hover:text-emerald-500"
                )}
              >
                <MessageCircle size={9} /> WhatsApp
              </button>
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

          {/* Outreach result notification */}
          {outreachResult && (
            <div className="pt-3">
              <OutreachResultBanner
                result={outreachResult}
                onDismiss={() => setOutreachResult(null)}
                onRetry={handleGenerate}
                retrying={isStreaming}
              />
            </div>
          )}

          {/* Live pipeline progress */}
          {isStreaming && pipelineStages.length > 0 && (
            <PipelineProgress stages={pipelineStages} />
          )}
          {isStreaming && pipelineStages.length === 0 && (
            <div className="py-10 text-center text-ink-mute text-sm font-mono flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Starting pipeline…
            </div>
          )}

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
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-brand font-semibold">Funding</span>
                    <span className="text-[12px] text-brand font-medium">{company.funding_stage}</span>
                  </div>
                )}
              </section>

              {/* Hiring signals */}
              {(company.signals ?? []).length > 0 && (
                <section>
                  <div className="label-mono text-ink mb-3">Hiring Signals</div>
                  <div className="flex flex-col gap-2">
                    {(company.signals ?? []).map((sig, i) => (
                      <div key={i} className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-md border text-[12px] font-medium",
                        SIGNAL_STYLES[sig.strength] ?? SIGNAL_STYLES.low
                      )}>
                        <SignalIcon type={sig.type} strength={sig.strength} />
                        {sig.label}
                      </div>
                    ))}
                  </div>
                  <HeadcountBar growth6m={company.headcount_growth_6m ?? null} growth12m={company.headcount_growth_12m ?? null} />
                </section>
              )}

              {/* Tech stack */}
              {(company.technologies ?? []).length > 0 && (
                <section>
                  <div className="label-mono text-ink mb-3 flex items-center gap-2">
                    <Cpu size={12} />
                    Tech Stack
                    <span className="font-mono text-[10px] text-ink-2">{(company.technologies ?? []).length} tools</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(company.technologies ?? []).map((tech) => {
                      const isAI = TECH_AI_KEYWORDS.some(k => tech.toLowerCase().includes(k.toLowerCase()));
                      return (
                        <span key={tech} className={cn(
                          "px-2 py-0.5 rounded text-[11px] font-mono border",
                          isAI
                            ? "bg-brand-soft text-brand border-brand/20 font-semibold"
                            : "bg-surface-2 text-ink border-line"
                        )}>
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
                  <p className="text-[12px] text-ink leading-relaxed">{company.description}</p>
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

        {/* Editable email preview + send (shown after generation) */}
        {editableEmail && !sendMutation.data?.sent && (
          <div className="border-t border-line-soft bg-surface px-6 py-4 shrink-0 max-h-[44vh] overflow-y-auto">
            <div className="label-mono text-brand mb-3">
              {channel === "whatsapp" ? "WhatsApp Message" : "Generated Email"}
            </div>
            <label className="block">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2 mb-1">Subject</div>
              <input
                value={editableEmail.subject}
                onChange={(e) => setEditableEmail((cur) => cur ? { ...cur, subject: e.target.value } : cur)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft"
              />
            </label>
            <label className="block mt-2.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2 mb-1">Body</div>
              <textarea
                value={channel === "whatsapp" ? buildInitialWhatsAppBody(editableEmail.body, lead?.name) : editableEmail.body}
                onChange={(e) => setEditableEmail((cur) => cur ? {
                  ...cur,
                  body: channel === "whatsapp"
                    ? stripInitialWhatsAppIntro(e.target.value, lead?.name)
                    : e.target.value,
                } : cur)}
                rows={7}
                className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2.5 text-[12px] leading-relaxed text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft"
              />
            </label>
            {editableEmail.reasoning && (
              <div className="rounded-md border border-line-soft bg-surface-2 p-3 mt-2.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2 mb-1">Reasoning</div>
                <p className="text-[11px] leading-relaxed text-ink-2">{editableEmail.reasoning}</p>
              </div>
            )}
            {sendMutation.isError && (
              <div className="rounded-md border border-danger/20 bg-danger-tint p-3 mt-2.5">
                <div className="text-danger text-sm font-medium">Send failed</div>
                <div className="text-danger text-xs font-mono mt-1">{(sendMutation.error as Error).message}</div>
              </div>
            )}
            <button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || !lead?.email || !editableEmail.subject.trim() || !editableEmail.body.trim()}
              className={cn(
                "mt-3 flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
                channel === "whatsapp"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "btn-primary"
              )}
            >
              {channel === "whatsapp" ? <MessageCircle size={13} /> : <Send size={13} />}
              {sendMutation.isPending ? "Sending…" : channel === "whatsapp" ? "Send via WhatsApp" : "Send Email"}
            </button>
            {!lead?.email && channel === "email" && (
              <div className="text-danger text-xs font-mono mt-2">This lead has no email address.</div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={handleGenerate} disabled={isStreaming} className="btn-ghost disabled:opacity-60">
                {isStreaming ? "Regenerating…" : "↺ Regenerate"}
              </button>
              <button onClick={() => { setEditableEmail(null); setOutreachResult(null); sendMutation.reset(); }} className="btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sent confirmation */}
        {sendMutation.data?.sent && (
          <div className="border-t border-line-soft bg-surface px-6 py-4 shrink-0">
            <div className="rounded-md border border-brand/20 bg-brand-soft p-3">
              <div className="text-brand text-sm font-medium">Sent to {sendMutation.data.to}</div>
              <div className="text-brand text-xs font-mono mt-1">
                {channel === "whatsapp"
                  ? "WhatsApp message delivered."
                  : "Reply context saved. WhatsApp fallback scheduled if no email reply arrives."}
              </div>
            </div>
          </div>
        )}

        {/* Footer CTAs */}
        {company && !sendMutation.data?.sent && (
          <div className="px-6 py-4 border-t border-line-soft flex flex-col gap-2 shrink-0 bg-surface">
            {suggestMutation.isError && (
              <div className="text-[10px] text-red-400 font-mono px-1">
                ✗ {(suggestMutation.error as Error)?.message || "Failed — check backend"}
              </div>
            )}

            {/* Suggestion chips — shown after /outreach/suggest returns */}
            {suggestion && !isStreaming && (
              <div className="bg-surface-2 border border-line rounded-md px-3 py-2.5 flex flex-col gap-2">
                <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-2">Detected Context — confirm or change</div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[9px] text-ink-2 w-12 shrink-0">Vertical</span>
                    {suggestion.vertical_options.map(v => (
                      <button
                        key={v}
                        onClick={() => setSelectedVertical(v)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                          selectedVertical === v
                            ? "bg-brand text-white border-brand"
                            : "bg-surface text-ink-2 border-line hover:border-brand hover:text-brand"
                        }`}
                      >
                        {v.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[9px] text-ink-2 w-12 shrink-0">Domain</span>
                    {suggestion.domain_options.map(d => (
                      <button
                        key={d}
                        onClick={() => setSelectedDomain(d)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                          selectedDomain === d
                            ? "bg-brand text-white border-brand"
                            : "bg-surface text-ink-2 border-line hover:border-brand hover:text-brand"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                {suggestion.top_trends[0] && (
                  <div className="text-[9px] text-ink-2 font-mono truncate">
                    Trend: {suggestion.top_trends[0].title}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2.5">
              {/* Phase 1: suggest not yet loaded → show "Generate Outreach" */}
              {!suggestion && (
                <button
                  onClick={handleGenerate}
                  disabled={suggestMutation.isPending || !company}
                  className="btn-primary flex items-center gap-2 flex-1 justify-center disabled:opacity-60"
                >
                  {suggestMutation.isPending ? (
                    <><RefreshCw size={13} className="animate-spin" /> Detecting context…</>
                  ) : (
                    <><Zap size={13} /> Generate Outreach</>
                  )}
                </button>
              )}

              {/* Phase 2: suggestion loaded → show "Confirm & Generate" */}
              {suggestion && (
                <>
                  <button
                    onClick={handleConfirmGenerate}
                    disabled={isStreaming}
                    className="btn-primary flex items-center gap-2 flex-1 justify-center disabled:opacity-60"
                  >
                    {isStreaming ? (
                      <><RefreshCw size={13} className="animate-spin" /> Generating…</>
                    ) : (
                      <><Zap size={13} /> Confirm & Generate</>
                    )}
                  </button>
                  <button
                    onClick={() => setSuggestion(null)}
                    disabled={isStreaming}
                    className="px-3 py-2 rounded-md text-[11px] font-medium bg-surface-2 text-ink-2 border border-line hover:border-line-soft transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </>
              )}

              {!suggestion && (
                <button
                  onClick={() => navigate("/approval")}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium bg-surface-2 text-ink border border-line hover:border-brand hover:text-brand transition-colors"
                >
                  View Queue
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
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

function HeadcountBar({ growth6m, growth12m }: { growth6m: number | null; growth12m: number | null }) {
  if (growth6m == null && growth12m == null) return null;
  const fmt = (v: number | null) => v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
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

function GrowthStat({ label, value, fmt }: { label: string; value: number | null; fmt: (v: number | null) => string }) {
  const positive = (value ?? 0) > 0;
  const negative = (value ?? 0) < 0;
  return (
    <div>
      <div className="font-mono text-[9px] text-ink-2 uppercase tracking-[0.08em]">{label}</div>
      <div className={cn(
        "font-mono text-[16px] font-semibold mt-0.5",
        positive ? "text-brand" : negative ? "text-danger" : "text-ink-2"
      )}>
        {fmt(value)}
      </div>
    </div>
  );
}
