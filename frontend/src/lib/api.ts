export type Lead = {
  id: string;
  name: string;
  title: string;
  company: string;
  seniority: string;
  email: string;
};

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
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
  per_page?: number;
}) => post<{
  id: string;
  name: string;
  title: string;
  company: string;
  seniority: string;
  email: string;
}[]>("/leads/search", params);

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

export type ApprovalItem = {
  event_id: string;
  lead_id: string;
  lead_name: string;
  lead_title: string;
  company_name: string;
  risk_level: "high" | "medium" | "low";
  risk_score: number;
  timestamp: string;
  content_snippet: string;
  trigger: string;
  policy: string;
  confidence: number;
  checkpoints?: ValidatorCheckpoints;
  citations?: Record<string, CitationEntry2>;
};

export const approvalQueue = () => get<ApprovalItem[]>("/approval-queue");

// ── Company ──────────────────────────────────────────────────────────────────

export const companyList = () => get<unknown[]>("/company/list");

export type CompanyResearch = {
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

export const conversationReply = (leadId: string, reply: string, context: unknown) =>
  post<{
    lead_id: string;
    intent: string;
    intent_confidence: number;
    response: string;
    conversation_length: number;
    email_sent?: boolean;
  }>("/conversation/reply", { lead_id: leadId, reply, context });

// ── Outreach ─────────────────────────────────────────────────────────────────

export const generateOutreach = (leadId: string, companyDomain: string) =>
  post<{
    lead: unknown;
    company: unknown;
    top_trends: unknown[];
    email: { subject: string; body: string; reasoning: string };
    governance: { approved: boolean; risk_score: number; issues: string[] };
  }>("/outreach/generate", { lead_id: leadId, company_domain: companyDomain });

// ── Health ───────────────────────────────────────────────────────────────────

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
    consequence: string;
    issues: string[];
    checkpoints?: Record<string, { ok: boolean; issues: string[] }>;
  }[];
};

export type LineageStage = {
  id: string;
  label: string;
  icon: string;
  module: string;
  status: "success" | "flagged" | "blocked" | "error" | "unknown";
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

export type PromptVersionRun = {
  ts: string;
  agent: string;
  lead_id: string | null;
  prompt_preview: string;
  response_preview: string;
  attempt_number: number;
  attempt_history: {
    attempt: number;
    passed: boolean;
    layers: Record<string, {
      passed?: boolean;
      consequence?: string;
      issues?: string[];
      violations?: string[];
      confidence?: number;
    }>;
  }[];
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

export const api = {
  dashboardStats,
  agentFeedRecent,
  recentAgentEvents,
  pipeline,
  leadSearch,
  approvalQueue,
  companyList,
  companyResearch,
  auditTrail,
  conversationReply,
  generateOutreach,
  healthCheck,
  devDiagnostics,
  devAgentMetrics,
  devTraces,
  devValidationLog,
  lineageIndex,
  pipelineLineage,
  devCitations,
  devRetrievalStats,
  devInterpretations,
  devSelfEvalStats,
  devPromptVersions,
};

export default api;
