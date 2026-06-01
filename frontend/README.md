# Frontend

React + TypeScript + Vite UI for LeadGenie AI.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
```

Set `VITE_API_URL` to point at the backend (defaults to `http://localhost:8000` if not set):
```bash
# .env.local (inside frontend/)
VITE_API_URL=http://localhost:8000
```

---

## Structure

```
frontend/src/
├── lib/
│   └── api.ts              # All backend API calls — single source of truth
│
├── pages/                  # One file per route
│   ├── DashboardPage.tsx        → GET /dashboard/stats, GET /agent-feed/recent
│   ├── PipelinePage.tsx         → GET /pipeline
│   ├── LeadDiscoveryPage.tsx    → POST /leads/search
│   ├── ApprovalQueuePage.tsx    → GET /approval-queue
│   ├── ConversationsPage.tsx    → POST /conversation/reply
│   ├── AuditTrailPage.tsx       → GET /audit/:lead_id
│   └── CampaignsPage.tsx        → (in progress)
│
├── components/             # Reusable UI components, grouped by domain
│   ├── dashboard/          # KpiCard, FunnelCard, AgentFeedCard, RiskDistributionCard
│   ├── pipeline/           # SignalPill, StageChip
│   ├── approval/           # ApprovalItem, GovStatCard
│   ├── conversations/      # ConvListItem, ConvThread
│   ├── research/           # ResearchPanel
│   └── layout/             # AppShell, Sidebar, Topbar
│
├── context/
│   ├── ThemeContext.tsx     # Light/dark mode
│   └── SidebarContext.tsx  # Sidebar open/close state
│
└── data/
    └── conversations.ts    # Static mock data (used until API is wired)
```

---

## API layer — `src/lib/api.ts`

All backend calls go through `src/lib/api.ts`. Never call `fetch()` directly in a page or component — add a function here and import it.

```typescript
import { api } from "../lib/api"
import type { Lead } from "../lib/api"

// Examples
const stats = await api.dashboardStats()
const leads = await api.leadSearch({ titles: ["CTO"], per_page: 10 })
const queue = await api.approvalQueue()
```

**Available functions:**

| Function | Method | Endpoint |
|---|---|---|
| `api.healthCheck()` | GET | `/health` |
| `api.dashboardStats()` | GET | `/dashboard/stats` |
| `api.agentFeedRecent()` | GET | `/agent-feed/recent` |
| `api.pipeline()` | GET | `/pipeline` |
| `api.leadSearch(params)` | POST | `/leads/search` |
| `api.approvalQueue()` | GET | `/approval-queue` |
| `api.companyList()` | GET | `/company/list` |
| `api.companyResearch(name)` | GET | `/company/research/:name` |
| `api.auditTrail(leadId)` | GET | `/audit/:lead_id` |
| `api.conversationReply(leadId, reply, context)` | POST | `/conversation/reply` |
| `api.generateOutreach(leadId, companyDomain)` | POST | `/outreach/generate` |

---

## Pages and what they show

**DashboardPage** — Overview. KPI cards (prospects discovered, messages sent, reply rate, meetings booked), sales funnel chart, risk distribution, agent activity feed, approval queue preview.

**PipelinePage** — All leads in the pipeline with their stage (new / sent / engaged / meeting booked) and reply probability score.

**LeadDiscoveryPage** — Search leads by title, seniority, and company. Results come live from Apollo via the backend.

**ApprovalQueuePage** — Emails held for human review (risk ≥ 0.4). Shows risk level, score, trigger reason, policy violated, and the flagged content snippet.

**ConversationsPage** — Multi-turn conversation threads per lead. Shows the AI's detected intent and generated responses.

**AuditTrailPage** — Full immutable decision log for any lead. Shows every governance decision, what was sent, and why.

**CampaignsPage** — Campaign management view (in progress).
