# LeadGenie-AI — Feature & Improvement Log

All notable changes are documented here in reverse-chronological order.
Each entry records **what changed**, **why**, and **where** (file paths).

---

## [final-round] — 2026-06-15

### 4-Layer Evaluation Pipeline
Added a structured pre-deploy evaluation suite gated into CI before every build.

| Layer | What it evaluates | File |
|---|---|---|
| Layer 0 | Prompt Quality Audit — 10 criteria from Anthropic best practices (clarity, XML structure, role, anti-hallucination guard, examples, etc.). Hybrid: regex + Claude Haiku judge. Warns if score < 0.6. | `backend/evals/layer0_prompt_audit.py` |
| Layer 1 | Model Output Evaluation — faithfulness, answer relevance, hallucination (via HallucinationChecker), coherence, BLEU-1, semantic similarity, tone. LLM-as-judge pattern. | `backend/evals/layer1_model_eval.py` |
| Layer 2 | Retrieval Evaluation — Precision@K, recall, chunk relevance, context utilization. No model calls. | `backend/evals/layer2_retrieval_eval.py` |
| Layer 3 | Trajectory Evaluation — LCS-based agent sequence validity, routing correctness, terminal state validation, retry efficiency. | `backend/evals/layer3_trajectory_eval.py` |

**CI gate**: eval job runs before Build & Push; deploy blocked if any layer fails.
**Local Docker**: `docker compose exec api bash /app/scripts/run_evals.sh`
**Cost-saving**: `NO_LLM_JUDGE=true` skips Haiku calls in CI.

Files: `backend/evals/`, `scripts/run_evals.sh`, `.github/workflows/deploy-v2.yml`

### Email Queue Visibility Fix (AWS)
**Problem**: Sent emails from Discover Leads page were not appearing in the Sent tab of the Outreach Queue on AWS.

**Root cause**: DynamoDB GSI has eventual consistency (~1-2s delay). The `/outreach/send` endpoint was scanning all pending items via GSI to find the right one to mark as approved — on AWS, this scan returned empty (item not yet visible in GSI), so the item stayed "pending" forever and never moved to the Sent tab.

**Fix**: `queued_event_id` now flows from pipeline result → frontend → `/outreach/send` request body → backend updates the DynamoDB item directly by primary key (no GSI scan needed).

Files: `backend/main.py` (SendOutreachRequest + /outreach/send), `frontend/src/lib/api.ts`, `frontend/src/components/research/ResearchPanel.tsx`

### Email Sender — Resend API Primary
**Problem**: Gmail SMTP (port 465) can be restricted in AWS ECS environments.

**Fix**: `EmailSender` now uses Resend API (HTTPS) as primary sender; falls back to Gmail SMTP when `RESEND_API_KEY` is not set (local development).

File: `backend/services/email_sender.py`

### Windows/Mac Teammate Setup
Merged `docker-compose.share.yml` from `windows-docker` branch into `final-round`. Teammates with Docker Desktop can run the full stack without Python/Node:
```bash
docker compose -f docker-compose.share.yml up
# App at http://localhost:3000
```
Pre-built images on Docker Hub: `amuni1234/leadgenie-{api,worker,frontend}:latest`

File: `docker-compose.share.yml`

---

## [aws/deploy-v2] — 2026-06-13

### NAT Gateway Elimination
**Problem**: NAT Gateway running 24/7 cost ~$1.08/day even when ECS had 0 tasks.

**Fix**: Set `nat_gateways=0` in VpcStack. ECS tasks moved to public subnets with `assign_public_ip=True` — ephemeral public IPs from AWS pool at no extra cost. Redis and EFS remain in private subnets; ECS can still reach them via VPC-internal traffic.

**Saving**: ~$1.51/day (~$45/month) eliminated.

Files: `infrastructure/cdk/stacks/vpc_stack.py`, `infrastructure/cdk/stacks/compute_stack.py`

---

## [aws/deploy-v2] — 2026-06-11

### Sleep Checker Inactivity Threshold
Configurable via `INACTIVITY_MINUTES` env var in the sleep-checker Lambda.
Default: **15 minutes** (scale ECS to 0 after 15 min of no activity).
Temporarily raised to 600 min for demo windows, then reverted.

File: `infrastructure/cdk/stacks/monitoring_stack.py`

---

## [aws/deploy-v2] — 2026-06-10

### Email Reply Routing Fix
**Problem**: Inbound conversation replies were routed to WhatsApp instead of being sent back via email.

**Fix**: Added `lead_email` field to `ConversationRequest` model. `/conversation/reply` now extracts `lead_email` from the request (with context fallback) and passes it to `conversation_agent.handle_reply`, which calls `_send_email` correctly.

Files: `backend/main.py`, `frontend/src/lib/api.ts`

### Pipeline Lineage — DynamoDB Persistence
**Problem**: Audit logs and diagnostic traces stored in the ECS container's ephemeral filesystem. Every CI deploy or container replacement wiped all lineage data — other users saw empty pipeline diagrams.

**Fix**: Dual-write to DynamoDB `activity_table` using prefix key pattern:
- `pk = AUDIT#lead_id#event_id` — governance decisions
- `pk = TRACE#lead_id#ts#agent` — diagnostic traces
- `pk = VALID#lead_id#ts#agent` — validation records

Scan with `begins_with` filter on prefix. Local JSONL fallback preserved for development.

Files: `backend/governance/audit_logger.py`, `backend/observability/diagnostic_store.py`, `backend/main.py`

---

## [aws/deploy-v2] — 2026-06-08

### Outreach Queue — DynamoDB Persistence
**Problem**: Outreach queue stored in local JSONL file on ECS container filesystem. Every deploy wiped the queue — pending emails lost.

**Fix**: `DynamoOutreachQueueStore` backed by `leadgenie-queue` DynamoDB table with a `status-index` GSI (pk: status, sk: timestamp). Survives container replacements and CI deployments.

File: `backend/services/dynamo_queue_store.py`, `backend/main.py`

### Quidditch — Prompt × Model Performance Lab
New evaluation UI for testing any prompt template against multiple models.

Metrics per run:
- Latency (ms), cost estimate, token usage
- BLEU-1, semantic similarity vs ground truth
- Tone validation, hallucination check, self-eval confidence
- Retrieval grounding score

Human scores patchable via `PATCH /quidditch/runs/{run_id}/human-scores`.

Files: `backend/quidditch/runner.py`, `backend/main.py` (`/quidditch/*` endpoints)

### EFS Shared Persistent Storage
Shared EFS volume mounted at `/app/backend/storage` on both API and worker containers so file-based stores (memory, diagnostics, stats) survive across task restarts within a deployment.

File: `infrastructure/cdk/stacks/data_stack.py` (EFS), `infrastructure/cdk/stacks/compute_stack.py` (volume mount)

### Dark Mode Toggle
Sidebar footer dark/light theme toggle with system preference detection.

File: `frontend/src/components/layout/Sidebar.tsx`

### FinOps Dashboard
Per-agent cost breakdown with Anthropic blended pricing, daily cost series, prompt-version savings analysis.

Files: `backend/storage/finops_store.py`, `frontend/src/pages/FinOpsDashboardPage.tsx`

### CloudFront → ALB Proxy Fix
All API paths (including `/health*`) proxied through CloudFront distribution to ALB. `VITE_API_URL` points to CloudFront URL — fixes mixed-content and CORS issues on the deployed site.

File: `infrastructure/cdk/stacks/frontend_stack.py`

### Auto-Sleep / Wake System
- **Sleep Lambda** (`leadgenie-sleep-checker`): EventBridge every 5 min, reads `pk="last_activity"` from DynamoDB, scales ECS to 0 if idle > `INACTIVITY_MINUTES`.
- **Wake Lambda** (`leadgenie-wake`): API Gateway `GET /` endpoint restarts ECS services and notifies via SNS.
- **Budget alert**: AWS Budgets at 50% and 90% of $30/month.

File: `infrastructure/cdk/stacks/monitoring_stack.py`, `infrastructure/lambdas/sleep_checker/handler.py`, `infrastructure/lambdas/wake/handler.py`

---

## Governance & Risk Engine (baseline on aws/deploy-v2)

Every generated email passes through a 3-check governance pipeline before sending:

| Check | How | Risk contribution |
|---|---|---|
| Tone Validator | Rule-based: 14 banned phrases, subject > 60 chars, body > 10 sentences, > 2 exclamation marks | +0.1 per issue |
| Hallucination Checker | Claude Haiku fact-checks against GroundingMemory + source_facts | +0.5 if failed |
| Confidence Penalty | `(1 - haiku_confidence) × 0.2` | partial risk even without violations |

**Threshold**: `risk_score < 0.4 AND tone passed AND hallucination passed` → auto-approved. Else → approval queue for human review.

Files: `backend/governance/risk_engine.py`, `backend/governance/tone_validator.py`, `backend/governance/hallucination_checker.py`

---

## Memory Architecture (baseline on aws/deploy-v2)

| Type | Storage | Purpose |
|---|---|---|
| EpisodicMemory | JSON files `storage/memory/episodic/` | Conversation history, sliding window of 10 |
| SemanticMemory | JSON files `storage/memory/semantic/` | Persistent facts with decay |
| EntityMemory | JSON files `storage/memory/entity/` | Structured lead profile |
| ShortTermMemory | In-memory dict | Session working context (lost on restart) |
| GroundingMemory | JSON files `storage/memory/grounding/` | Verified facts from Apollo + Research, 48h TTL |
| MemoryGovernance | JSONL `storage/memory_governance/events.jsonl` | Policy audit trail for all reads/writes |
| IndustryOutreachMemory | JSONL `storage/industry_memory/` | Few-shot outreach examples per vertical |
| SenderKnowledgeBase | JSONL `storage/knowledge_base/` | Curated company facts for citation |
| StatsStore | SQLite `storage/stats.db` | Dashboard analytics |
| DiagnosticStore | JSONL `storage/diagnostics/` + DynamoDB | Agent traces, validations, governance runs |

---

*Add new entries at the top under a new `[branch-name] — YYYY-MM-DD` heading.*
