export type Lead = {
  id: string;
  name: string;
  title: string;
  company: string;
  seniority: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  _contact_masked?: boolean;
};

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem("lg_auth_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function handleStatus(res: Response, label: string): void {
  if (res.status === 401) {
    // Session expired or invalid — clear auth and force re-login
    localStorage.removeItem("lg_auth_token");
    localStorage.removeItem("lg_auth_user");
    localStorage.removeItem("lg_auth_role");
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`${label} → ${res.status}`);
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() });
  handleStatus(res, `GET ${path}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  handleStatus(res, `POST ${path}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  handleStatus(res, `DELETE ${path}`);
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  handleStatus(res, `PATCH ${path}`);
  return res.json();
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardStats = () => get<{
  prospects_discovered: { value: number; delta_pct: number };
  messages_sent: { value: number; delta_pct: number };
  reply_rate: { value: number; delta_pct: number };
  meetings_booked: { value: number; delta_abs: number };
  funnel: { label: string; count: number; pct: number }[];
  risk_distribution: { low: number; medium: number; high: number };
  blocked_patterns: { label: string; count: number }[];
}>("/dashboard/stats");

export type RawOutreachEvent = {
  event_id: string; lead_id: string; lead_name: string; company_name: string;
  risk_score: number; risk_level: string; status: string;
  tone_passed: number; hallucination_passed: number;
  tone_issues: string; hallucination_violations: string;
  total_attempts: number; timestamp: string;
};
export type RawConversationEvent = {
  id: number; lead_id: string; intent: string; confidence: number; timestamp: string;
};
export type RawAgentEvent = {
  id: number; agent: string; message: string; lead_id: string;
  latency_ms: number; success: number; timestamp: string;
};

export const dashboardStatsRaw = () => get<{
  outreach_events: RawOutreachEvent[];
  conversation_events: RawConversationEvent[];
  agent_events: RawAgentEvent[];
}>("/dashboard/stats/raw");

export type AgentFeedEvent = {
  timestamp: string;
  agent: "research" | "outreach" | "reply" | "gov" | "schedule";
  message: string;
};

export const agentFeedRecent = () => get<AgentFeedEvent[]>("/agent-feed/recent");

// Alias used by AgentFeedCard component
export const recentAgentEvents = agentFeedRecent;

// ── Pipeline ─────────────────────────────────────────────────────────────────

export type Signal = {
  strength: string;
  type: string;
  label: string;
};

export type PipelineStage = "new" | "researching" | "sent" | "engaged" | "pending_approval" | "meeting_booked" | "closed_no_reply";

export const pipeline = () => get<{
  lead_id: string;
  name: string;
  title: string;
  seniority: string | null;
  email: string | null;
  linkedin_url: string | null;
  company: { name: string };
  signals: Signal[];
  stage: PipelineStage;
  reply_probability: number;
}[]>("/pipeline");

// ── Lead Discovery ───────────────────────────────────────────────────────────

export const leadSearch = (params: {
  company_names?: string[];
  titles?: string[];
  seniorities?: string[];
  industries?: string[];
  locations?: string[];
  per_page?: number;
}) => post<Lead[]>("/leads/search", params);

export type RevealResult = {
  status?: "deferred" | "approved";
  request_id?: string;
  decision?: "APPROVE" | "DEFER" | "BLOCK";
  email?: string;
  phone?: string;
  linkedin_url?: string;
  checks?: Record<string, unknown>;
};

export const revealContact = async (leadId: string): Promise<RevealResult> => {
  const res = await fetch(`${BASE_URL}/contact/reveal/${leadId}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
  });
  const data = await res.json();
  if (res.status === 403) throw new Error(data.detail || "BLOCKED");
  return data as RevealResult;
};

export type ContactAuditStats = {
  total_reveals: number;
  approved: number;
  deferred: number;
  blocked: number;
  by_user: Record<string, number>;
  recent_events: Array<{
    request_id: string;
    tool: string;
    user_id: string;
    lead_id?: string;
    status: string;
    decision?: string;
    timestamp: string;
    block_reason?: string;
  }>;
};

export const contactAudit = (limit = 100) =>
  get<ContactAuditStats>(`/governance/contact-audit?limit=${limit}`);

// ── Approval Queue ───────────────────────────────────────────────────────────

export type ValidationCheckpoint = {
  ok: boolean;
  issues?: string[];
  violations?: string[];
  confidence?: number;
  explanation?: string;
};

export type ValidatorCheckpoints = {
  shape: ValidationCheckpoint;
  context: ValidationCheckpoint;
  policy: ValidationCheckpoint;
  hallucination?: ValidationCheckpoint;
};

export type CitationEntry2 = {
  value: string | string[] | number | null;
  source: string;
  field: string;
  url?: string;
};

export type FollowupDraft = {
  number: number;
  subject: string;
  body: string;
  reasoning?: string;
  followup_type?: string;
  kb_ids_used?: string[];
  delay_days: number;
};

export type ApprovalItem = {
  event_id: string;
  lead_id: string;
  lead_name: string;
  lead_title: string;
  company_name: string;
  lead_email?: string;
  risk_level: "high" | "medium" | "low";
  risk_score: number;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
  governance_passed: boolean;
  total_attempts: number;
  content_snippet: string;
  trigger: string;
  policy: string;
  confidence: number;
  email?: { subject: string; body: string; reasoning?: string };
  followup_sequence?: FollowupDraft[];
  status_updated_at?: string;
  checkpoints?: ValidatorCheckpoints;
  citations?: Record<string, CitationEntry2>;
  attempt_history?: {
    attempt: number;
    passed: boolean;
    correction_note?: string;
    prompt_preview?: string;
    layers?: Record<string, {
      consequence?: string;
      issues?: string[];
      violations?: string[];
      passed?: boolean;
      confidence?: number;
      explanation?: string;
    }>;
  }[];
};

export const approvalQueue = () => get<ApprovalItem[]>("/approval-queue");
export const sentEmails    = () => get<ApprovalItem[]>("/approval-queue/sent");
async function action<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

export const approveOutreach = async (eventId: string, followupSequence?: FollowupDraft[]) => {
  const body = followupSequence ? JSON.stringify({ followup_sequence: followupSequence }) : "{}";
  const r = await fetch(`${BASE_URL}/approval-queue/${eventId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!r.ok) throw new Error(`approve → ${r.status}`);
  return r.json();
};
export const rejectOutreach = (eventId: string) =>
  action<{ status: string; event_id: string }>(`/approval-queue/${eventId}/reject`);

export const saveFollowupSequence = (eventId: string, sequence: FollowupDraft[]) =>
  fetch(`${BASE_URL}/approval-queue/${eventId}/sequence`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followup_sequence: sequence }),
  }).then(r => { if (!r.ok) throw new Error(`sequence → ${r.status}`); return r.json(); });

export const editEmail = (eventId: string, subject: string, body: string) =>
  post<{ status: string; event_id: string }>(
    `/approval-queue/${eventId}/edit-email`,
    { subject, body },
  );

export const recheckHallucination = (eventId: string) =>
  action<{
    event_id: string;
    hallucination: { passed: boolean; violations: string[]; confidence: number; explanation: string };
    credits_remaining: number;
  }>(`/approval-queue/${eventId}/recheck-hallucination`);

export type Credits = { total: number; used: number; remaining: number };
export const getCredits = () => get<Credits>("/credits");

// ── Company ──────────────────────────────────────────────────────────────────

export const companyList = () => get<unknown[]>("/company/list");

export type CompanyResearch = {
  name?: string | null;
  domain?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  revenue?: string | null;
  founded_year?: number | null;
  funding_stage?: string | null;
  signals?: Signal[];
  headcount_growth_6m?: number | null;
  headcount_growth_12m?: number | null;
  technologies?: string[];
  description?: string | null;
  linkedin_url?: string | null;
};

export const companyResearch = (name: string) =>
  get<CompanyResearch>(`/company/research/${encodeURIComponent(name)}`);

// ── Audit ────────────────────────────────────────────────────────────────────

export const auditTrail = (leadId: string) =>
  get<unknown[]>(`/audit/${leadId}`);

// ── Conversation ─────────────────────────────────────────────────────────────

export const conversationReply = (leadId: string, reply: string, context: unknown, leadEmail?: string) =>
  post<{
    lead_id: string;
    intent: string;
    intent_confidence: number;
    response: string;
    conversation_length: number;
    email_sent?: boolean;
  }>("/conversation/reply", { lead_id: leadId, reply, context, lead_email: leadEmail });

// ── Outreach ─────────────────────────────────────────────────────────────────

export type OutreachResult = {
  lead: unknown;
  company: unknown;
  top_trends: unknown[];
  queued_event_id: string;
  email: { subject: string; body: string; reasoning: string };
  governance: {
    approved: boolean;
    risk_score: number;
    issues: string[];
    total_attempts: number;
    context_sufficient?: boolean;
    governance_attempt_history: {
      attempt: number;
      passed: boolean;
      layers: {
        validator: { consequence: string; issues: string[] };
        tone: { passed: boolean; issues: string[] };
        hallucination: { passed: boolean; violations: string[]; skipped?: boolean };
      };
    }[];
  };
};

export type OutreachSuggestion = {
  lead_name: string;
  lead_title: string;
  company_name: string;
  vertical: string;
  domain: string;
  vertical_options: string[];
  domain_options: string[];
  top_trends: { title: string; relevance_score: number }[];
};

export const suggestOutreachContext = (leadId: string, companyDomain: string) =>
  post<OutreachSuggestion>("/outreach/suggest", { lead_id: leadId, company_domain: companyDomain });

export const generateOutreach = (
  leadId: string,
  companyDomain: string,
  verticalOverride?: string,
  domainOverride?: string,
) =>
  post<OutreachResult>("/outreach/generate", {
    lead_id: leadId,
    company_domain: companyDomain,
    vertical_override: verticalOverride ?? null,
    domain_override: domainOverride ?? null,
  });

export type PipelineStageStatus = "pending" | "running" | "done" | "error";
export type PipelineStageEvent = {
  stage: string;
  label: string;
  status: PipelineStageStatus;
  result?: OutreachResult & { queued_event_id: string };
};

export const streamGenerateOutreach = async (
  leadId: string,
  companyDomain: string,
  onEvent: (event: PipelineStageEvent) => void,
  verticalOverride?: string,
  domainOverride?: string,
): Promise<void> => {
  const res = await fetch(`${BASE_URL}/outreach/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_id: leadId,
      company_domain: companyDomain,
      vertical_override: verticalOverride ?? null,
      domain_override: domainOverride ?? null,
    }),
  });

  if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as PipelineStageEvent;
          onEvent(event);
        } catch { /* skip malformed */ }
      }
    }
  }
};

export const sendOutreach = (params: {
  leadId: string;
  toEmail?: string | null;
  phone?: string;
  subject: string;
  body: string;
  reasoning?: string;
  context: unknown;
  eventId?: string | null;
}) =>
  post<{ sent: boolean; to: string; lead_id: string }>("/outreach/send", {
    lead_id: params.leadId,
    to_email: params.toEmail,
    phone: params.phone,
    subject: params.subject,
    body: params.body,
    reasoning: params.reasoning,
    context: params.context,
    event_id: params.eventId ?? null,
  });

// ── Health ───────────────────────────────────────────────────────────────────

// ── WhatsApp ──────────────────────────────────────────────────────────────────

export type WhatsAppMessage = {
  lead_id: string;
  channel: "whatsapp";
  direction: "inbound" | "outbound";
  message: string;
  timestamp: string;
};

export type WhatsAppConversation = {
  conversation_id: string;
  lead_id: string;
  lead_name: string;
  company_name: string;
  phone?: string;
  status: "awaiting_human" | "human_responded";
  unread: boolean;
  last_message: string;
  last_direction?: "inbound" | "outbound";
  updated_at?: string;
  messages: WhatsAppMessage[];
};

export type WhatsAppSyncResult = {
  remote_url?: string;
  fetched: number;
  imported: number;
  skipped: number;
  error?: string | null;
};

export const whatsappConversations = () =>
  get<{ unread_count: number; conversations: WhatsAppConversation[]; sync?: WhatsAppSyncResult }>("/whatsapp/conversations");

export const whatsappConversation = (conversationId: string) =>
  get<{ conversation: WhatsAppConversation }>(`/whatsapp/conversations/${encodeURIComponent(conversationId)}`);

export const openWhatsAppConversation = (conversationId: string) =>
  post<{ unread_count: number; conversation: WhatsAppConversation }>(
    `/whatsapp/conversations/${encodeURIComponent(conversationId)}/open`, {}
  );

export const sendWhatsAppReply = (conversationId: string, message: string) =>
  post<{ sent: boolean; lead_id: string; to: string; conversation: WhatsAppConversation }>(
    "/whatsapp/reply", { lead_id: conversationId, conversation_id: conversationId, message }
  );

export const deleteWhatsAppConversation = (conversationId: string) =>
  del<{ deleted: boolean; conversation_id: string; unread_count: number }>(
    `/whatsapp/conversations/${encodeURIComponent(conversationId)}`
  );

// ── Health ────────────────────────────────────────────────────────────────────

export const healthCheck = () => get<{ status: string; version: string }>("/health");

// ── Developer Observability ───────────────────────────────────────────────────

export type DiagnosticCategory = {
  count: number;
  label: string;
  description: string;
  recent_events: { ts: string; agent: string; lead_id: string | null; detail: string }[];
};

export type DiagnosticsSummary = {
  total_traces: number;
  by_category: Record<string, DiagnosticCategory>;
};

export const devDiagnostics = () => get<DiagnosticsSummary>("/dev/diagnostics");

export type AgentMetrics = {
  total_calls: number;
  success_rate: number;
  avg_latency_ms: number;
  avg_tokens: number;
  avg_confidence: number | null;
  validation: {
    total: number;
    allow: number;
    block: number;
    defer: number;
    pass_rate: number;
  };
};

export const devAgentMetrics = () => get<Record<string, AgentMetrics>>("/dev/agent-metrics");

export type TraceRecord = {
  ts: string;
  agent: string;
  lead_id: string | null;
  prompt_preview: string;
  response_preview: string;
  latency_ms: number;
  tokens_used: number;
  success: boolean;
  diagnostic_categories: string[];
  metadata: {
    context_score?: number;
    ambiguity_score?: number;
    retrieval_score?: number | null;
    confidence?: number | null;
    prompt_version?: string;
    context_fields_used?: Record<string, unknown>;
  };
};

export const devTraces = (limit = 50) =>
  get<TraceRecord[]>(`/dev/traces?limit=${limit}`);

export type ValidationRecord = {
  ts: string;
  agent: string;
  lead_id: string | null;
  shape_ok: boolean;
  context_ok: boolean;
  policy_ok: boolean;
  consequence: "allow" | "block" | "defer";
  issues: string[];
  output_preview: string;
};

export const devValidationLog = (limit = 50) =>
  get<ValidationRecord[]>(`/dev/validation-log?limit=${limit}`);

// ── Pipeline Stats (real funnel) ─────────────────────────────────────────────

export type PipelineStats = {
  leads_researched: number;
  outreach_sent: number;
  replies_received: number;
  interested: number;
  meetings_booked: number;
  reply_rate: number;
  total_ai_calls: number;
  governance: { approved: number; blocked: number; deferred: number };
  agent_call_counts: Record<string, number>;
};

export const pipelineStats = () => get<PipelineStats>("/pipeline/stats");

// ── Memory Governance ─────────────────────────────────────────────────────────

export type MemoryGovernanceStats = {
  write_policy:      { memories_created: number; memories_rejected: number; low_value_blocked: number };
  retrieval_policy:  { retrieved: number; accepted: number; rejected_below_threshold: number };
  decay_policy:      { expired_facts: number; reaffirmed_facts: number; stale_facts_detected: number };
  protection_policy: { cross_tenant_reads: number; blocked_access_attempts: number; namespace_violations: number };
  grounding_memory:  {
    writes: number;
    reads: number;
    cache_hits: number;
    cache_misses: number;
    leads_grounded: number;
    avg_facts_stored: number;
  };
  context_budget:    { current_task: number; research: number; memory: number; trends: number; other: number };
  total_memory_events: number;
};

export const memoryGovernance = () => get<MemoryGovernanceStats>("/memory/governance");

// ── Pipeline Lineage ──────────────────────────────────────────────────────────

export type LineageIndexItem = {
  lead_id: string;
  timestamp: string;
  decision: string;
  subject: string;
};

export type LineageStageValidation = {
  consequence: "allow" | "block" | "defer";
  shape_ok: boolean | null;
  context_ok: boolean | null;
  policy_ok: boolean | null;
  issues: string[];
  checkpoints?: {
    shape:   { ok: boolean; issues: string[] };
    context: { ok: boolean; issues: string[] };
    policy:  { ok: boolean; issues: string[] };
    hallucination?: {
      ok: boolean;
      violations: string[];
      confidence?: number;
      explanation?: string;
    };
  };
  attempts?: number;
  attempt_history?: {
    attempt: number;
    passed?: boolean;
    consequence?: string;
    issues?: string[];
    checkpoints?: Record<string, { ok: boolean; issues: string[] }>;
    layers?: Record<string, {
      passed?: boolean;
      consequence?: string;
      issues?: string[];
      violations?: string[];
      confidence?: number;
      explanation?: string;
    }>;
  }[];
};

export type LineageStage = {
  id: string;
  label: string;
  icon: string;
  module: string;
  status: "success" | "flagged" | "blocked" | "error" | "unknown";
  parent_stage: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  perf: { latency_ms: number | null; tokens: number | null; context_score: number | null };
  validation: LineageStageValidation | null;
};

export type PipelineLineage = {
  lead_id: string;
  has_data: boolean;
  final_status: string;
  risk_score: number | null;
  stages: LineageStage[];
  edges: { source: string; target: string }[];
};

export const lineageIndex = () => get<LineageIndexItem[]>("/pipeline/lineage");
export const pipelineLineage = (leadId: string) => get<PipelineLineage>(`/pipeline/lineage/${leadId}`);

// ── Deep Observability ─────────────────────────────────────────────────────

export type CitationEntry = {
  ts: string;
  agent: string;
  lead_id: string | null;
  retrieval_score: number | null;
  response_preview: string;
  citations: Record<string, unknown> | null;
};

export type RetrievalStats = {
  count: number;
  avg: number | null;
  below_threshold: number;
  histogram: { range: string; count: number }[];
};

export type InterpretationSummary = Record<string, {
  total_seen: number;
  drift_events: number;
  agent: string;
  recent_drift: { ts: string; angle: string; lead_id: string | null }[];
}>;

export type SelfEvalStats = Record<string, {
  count: number;
  avg_confidence: number;
  below_threshold: number;
}>;

export const devCitations = (limit = 50) => get<CitationEntry[]>(`/dev/citations?limit=${limit}`);
export const devRetrievalStats = () => get<RetrievalStats>("/dev/retrieval-stats");
export const devInterpretations = () => get<InterpretationSummary>("/dev/interpretations");
export const devSelfEvalStats = () => get<SelfEvalStats>("/dev/self-eval-stats");

// ── Prompt Version Performance ─────────────────────────────────────────────

export type PromptAttemptLayer = {
  passed?: boolean;
  consequence?: string;
  issues?: string[];
  violations?: string[];
  confidence?: number;
  explanation?: string;
  checkpoints?: Record<string, { ok: boolean; issues: string[] }>;
};

export type PromptAttempt = {
  attempt: number;
  passed: boolean;
  prompt_preview?: string;
  correction_note?: string;
  email?: { subject: string; body: string; reasoning: string } | null;
  layers: Record<string, PromptAttemptLayer>;
};

export type PromptVersionRun = {
  ts: string;
  agent: string;
  lead_id: string | null;
  prompt_preview: string;
  response_preview: string;
  attempt_number: number;
  attempt_history: PromptAttempt[];
  retrieval_score: number | null;
  self_eval_confidence: number | null;
  diagnostic_categories: string[];
  latency_ms: number | null;
  tokens_used: number | null;
};

export type PromptVersionStats = {
  total_runs: number;
  first_attempt_pass_rate: number;
  avg_attempts: number;
  attempt_distribution: Record<string, number>;
  avg_retrieval_score: number | null;
  avg_self_eval_confidence: number | null;
  agent: string;
  recent_runs: PromptVersionRun[];
};

export const devPromptVersions = () =>
  get<Record<string, PromptVersionStats>>("/dev/prompt-versions");

// ── AI FinOps ─────────────────────────────────────────────────────────────────

export type FinOpsAgentEntry = {
  calls: number;
  tokens: number;
  cost_usd: number;
  avg_cost_per_call: number;
  model: string;
  failures: number;
  success_calls: number;
  failure_calls: number;
  success_cost_usd: number;
  failure_cost_usd: number;
  first_attempt_calls: number;
  high_conf_calls: number;
};

export type FinOpsModelEntry = {
  calls: number;
  tokens: number;
  cost_usd: number;
  pct_calls: number;
  pct_cost: number;
};

export type FinOpsLeadEntry = {
  lead_id: string;
  tokens: number;
  cost_usd: number;
  agents: string[];
  timestamp?: string;
};

export type FinOpsPromptEntry = {
  date: string;
  prompt_version: string;
  calls: number;
  tokens: number;
  cost_usd: number;
  avg_tokens_per_call: number;
};

export type FinOpsCostToSuccess = {
  agent: string;
  success_criteria: string;
  calls: number;
  success_count: number;
  success_rate: number;
  cost_usd: number;
  cost_per_success: number;
  wasted_cost_usd: number;
  wasted_pct: number;
  efficiency_score: number;
  retry_calls: number;
  retry_success: number;
  retry_failure: number;
  retry_cost_usd: number;
  first_attempt_calls: number;
  raw_success_calls: number;
  // outreach-specific job-level fields
  jobs_total?: number;
  jobs_first_attempt_ok?: number;
  jobs_needed_retry?: number;
  jobs_retry_succeeded?: number;
  jobs_retry_failed?: number;
};

export type FinOpsDailyEntry = {
  agent: string;
  date: string;
  calls: number;
  tokens: number;
  cost_usd: number;
  avg_tokens: number;
  success_calls: number;
  retry_success: number;
  retry_calls?: number;
  retry_cost_usd?: number;
};

export type FinOpsSummary = {
  total_traces: number;
  total_tokens: number;
  total_cost_usd: number;
  success_cost_usd: number;
  wasted_cost_usd: number;
  cost_by_agent: Record<string, FinOpsAgentEntry>;
  cost_to_success: FinOpsCostToSuccess[];
  model_routing: Record<string, FinOpsModelEntry>;
  cost_by_lead: FinOpsLeadEntry[];
  retry_info: {
    retry_calls: number;
    failed_calls: number;
    retry_cost_usd: number;
    failure_cost_usd: number;
    failure_rate_pct: number;
  };
  governance_info: {
    hallucination_check_calls: number;
    governance_cost_usd: number;
  };
  prompt_savings: FinOpsPromptEntry[];
  agent_daily_series: FinOpsDailyEntry[];
  cost_per_outcome: {
    per_outreach_generated: number;
    per_approved_outreach: number;
    per_blocked_outreach: number;
    per_meeting_booked: number;
    total_approved_leads: number;
    total_blocked_leads: number;
    total_meeting_leads: number;
    total_outreach_leads: number;
  };
  validator_success: {
    tone_passed_total: number;
    tone_passed_replied: number;
    tone_success_rate: number;
    halluc_passed_total: number;
    halluc_passed_replied: number;
    halluc_success_rate: number;
    both_passed_total: number;
    both_passed_replied: number;
    both_success_rate: number;
    false_positives: number;
    false_positive_rate: number;
    replied_total: number;
  } | null;
};

export const devFinOps = () => get<FinOpsSummary>("/dev/finops");

// ── Dashboard Extended Stats ──────────────────────────────────────────────────

export type DashboardCompanyRow = {
  company: string;
  outreach_count: number;
  approved_count: number;
  blocked_count: number;
  avg_risk: number;
  reply_count: number;
};

export type DashboardExtendedStats = {
  company_breakdown: DashboardCompanyRow[];
  intent_distribution: { intent: string; count: number; pct: number }[];
  validation_stats: {
    total_checks: number;
    tone_pass_count: number; tone_fail_count: number; tone_pass_rate: number;
    halluc_pass_count: number; halluc_fail_count: number; halluc_pass_rate: number;
    both_passed: number; neither_passed: number;
    violation_types: { label: string; count: number }[];
    hallucination_categories: { label: string; count: number }[];
  };
  governance_summary: {
    total_outreach: number; approved: number; blocked: number; pending: number;
    avg_attempts: number; multi_attempt_count: number; multi_attempt_pct: number;
    attempts_distribution: { attempts: number; count: number }[];
  };
};

export const dashboardExtendedStats = () => get<DashboardExtendedStats>("/dashboard/extended-stats");

export type OutreachTrendPoint = { day: string; total: number; approved: number };
export const getOutreachTrend = (days = 30) =>
  get<OutreachTrendPoint[]>(`/dashboard/outreach-trend?days=${days}`);

export type PipelineRunPoint = {
  ts: string;
  lead_name: string;
  company_name: string;
  total_s: number;
  enriching_lead: number;
  enriching_company: number;
  detecting_signals: number;
  researching: number;
  building_context: number;
  fetching_trends: number;
  ranking_relevance: number;
  generating_email: number;
  queueing: number;
};
export const getPipelineLatency = (n = 30) =>
  get<PipelineRunPoint[]>(`/dashboard/pipeline-latency?n=${n}`);

// ── KB Insights ───────────────────────────────────────────────────────────────

export type KbClaimEntry = {
  id: string;
  vertical: string;
  domain: string;
  category: string;
  claim: string;
  metric: string;
  tone_use: string;
};

export type KbInsights = {
  kb_coverage: {
    total_claims: number;
    by_vertical: { vertical: string; count: number }[];
    by_domain:   { domain: string;   count: number }[];
  };
  top_claims: KbClaimEntry[];
  retrieval_context: {
    top_industries:       { label: string; count: number }[];
    top_pain_points:      { label: string; count: number }[];
    prompt_versions:      { label: string; count: number }[];
    avg_retrieval_score:  number;
    scored_calls:         number;
    below_threshold:      number;
  };
  industry_memory: {
    total: number;
    recent_patterns: {
      stream: string;
      subject: string;
      hook: string;
      outcome: string;
      tech_tags: string[];
    }[];
  };
};

export const dashboardKbInsights = () => get<KbInsights>("/dashboard/kb-insights");

// ── Engagement Runs (per-lead outreach/reply with per-attempt detail) ──────────

export type EngagementRun = {
  run_id: string;
  ts: string;
  lead_id: string | null;
  lead_name: string | null;
  company_name: string | null;
  agent: string;
  prompt_version: string;
  total_attempts: number;
  final_passed: boolean;
  final_risk_score: number | null;
  attempts: PromptAttempt[];
};

export const devEngagementRuns = () => get<EngagementRun[]>("/dev/engagement-runs");

// ── Quidditch — Prompt × Model Performance Lab ────────────────────────────────

export type QuidditchMetrics = {
  latency_s: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  tone_passed?: boolean;
  tone_issues?: string[];
  hallucination_passed?: boolean;
  hallucination_confidence?: number;
  hallucination_violations?: string[];
  hallucination_explanation?: string;
  self_eval_confidence?: number;
  self_eval_sufficient?: boolean;
  self_eval_explanation?: string;
  retrieval_score?: number;
  bleu1_gt?: number;
  semantic_sim_gt?: number;
};

export type QuidditchRun = {
  run_id: string;
  ts: string;
  model: string;
  model_display: string;
  prompt_name: string;
  prompt_template: string;
  ground_truth: string;
  generated_text: string;
  metrics: QuidditchMetrics;
  human_scores: Record<string, number>;
};

export const quidditchRun = (req: {
  prompt_template: string;
  model: string;
  ground_truth?: string;
  prompt_name?: string;
  mock_context?: Record<string, unknown>;
}) => post<QuidditchRun>("/quidditch/run", req);

export const quidditchHistory = () => get<QuidditchRun[]>("/quidditch/history");

export const quidditchSaveHumanScores = (runId: string, scores: Record<string, number>) =>
  patch<{ ok: boolean }>(`/quidditch/runs/${runId}/human-scores`, scores);

// ── Lead Network (Neo4j Knowledge Graph) ─────────────────────────────────────

export interface NetworkLead {
  lead_id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  linkedin_url: string;
  region: string;
  seniority: string;
  stored_at: string;
  engaged_via?: string;
  topics?: string[];
  score?: number;
  match_type?: "graph" | "semantic";
  matched_topics?: string[];
}

export interface NetworkGraphData {
  nodes: Array<{ id: string; label: string; type: "lead" | "company"; industry?: string; tech?: string[]; title?: string; linkedin_url?: string; seniority?: string }>;
  edges: Array<{ source: string; target: string; label: string; type?: string }>;
}

export interface NetworkQueryResult {
  query: string;
  intent: { topics?: string[]; region?: string | null; industry?: string | null };
  results: NetworkLead[];
  total: number;
}

export const networkQuery = (query: string, top_k = 10) =>
  post<NetworkQueryResult>("/network/query", { query, top_k });

export const networkLeads = (params?: { region?: string; industry?: string; topic?: string; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params?.region)   qs.set("region",   params.region);
  if (params?.industry) qs.set("industry", params.industry);
  if (params?.topic)    qs.set("topic",    params.topic);
  if (params?.limit)    qs.set("limit",    String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return get<{ leads: NetworkLead[]; total: number }>(`/network/leads${suffix}`);
};

export const networkGraph = (limit = 30) =>
  get<NetworkGraphData>(`/network/graph?limit=${limit}`);

export const networkTagLead = (lead_id: string, tags: string[]) =>
  post<{ tags_added: string[] }>(`/network/leads/${lead_id}/tags`, { tags });

export const api = {
  dashboardStats,
  agentFeedRecent,
  recentAgentEvents,
  pipeline,
  leadSearch,
  approvalQueue,
  sentEmails,
  approveOutreach,
  rejectOutreach,
  editEmail,
  recheckHallucination,
  getCredits,
  companyList,
  companyResearch,
  auditTrail,
  conversationReply,
  suggestOutreachContext,
  generateOutreach,
  streamGenerateOutreach,
  sendOutreach,
  whatsappConversations,
  whatsappConversation,
  openWhatsAppConversation,
  sendWhatsAppReply,
  deleteWhatsAppConversation,
  healthCheck,
  devDiagnostics,
  devAgentMetrics,
  devTraces,
  devValidationLog,
  pipelineStats,
  memoryGovernance,
  lineageIndex,
  pipelineLineage,
  devCitations,
  devRetrievalStats,
  devInterpretations,
  devSelfEvalStats,
  devPromptVersions,
  devEngagementRuns,
  dashboardStatsRaw,
  devFinOps,
  dashboardExtendedStats,
  dashboardKbInsights,
  getOutreachTrend,
  getPipelineLatency,
  quidditchRun,
  quidditchHistory,
  quidditchSaveHumanScores,
  revealContact,
  contactAudit,
  networkQuery,
  networkLeads,
  networkGraph,
  networkTagLead,
};

export default api;
