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

export const agentFeedRecent = () => get<{
  timestamp: string;
  agent: string;
  message: string;
}[]>("/agent-feed/recent");

// Alias used by AgentFeedCard component
export const recentAgentEvents = agentFeedRecent;

export type AgentFeedEvent = {
  timestamp: string;
  agent: "research" | "outreach" | "reply" | "gov" | "schedule";
  message: string;
};

// ── Pipeline ─────────────────────────────────────────────────────────────────

export const pipeline = () => get<{
  lead_id: string;
  name: string;
  title: string;
  seniority: string | null;
  email: string | null;
  linkedin_url: string | null;
  company: { name: string };
  signals: unknown[];
  stage: string;
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

export const approvalQueue = () => get<{
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
}[]>("/approval-queue");

// ── Company ──────────────────────────────────────────────────────────────────

export const companyList = () => get<unknown[]>("/company/list");

export const companyResearch = (name: string) =>
  get<Record<string, unknown>>(`/company/research/${encodeURIComponent(name)}`);

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
};

export default api;
