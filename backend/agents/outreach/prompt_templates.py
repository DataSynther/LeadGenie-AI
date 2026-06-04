INITIAL_EMAIL_TEMPLATE = """
You are a world-class B2B sales development representative.

Write a highly personalized, concise cold outreach email for the following lead.
The email must feel human, reference specific company context, and tie in a relevant market trend.

Lead:
- Name: {name}
- Title: {title}
- Headline: {headline}
- Company: {company}
- Industry: {industry}
- Location: {location}
- Recent roles: {recent_roles}

Company Signals:
- Revenue: {revenue}
- Headcount growth (12m): {headcount_growth}
- Tech stack: {tech_stack}
- Keywords: {keywords}

Company Context:
{company_summary}

Relevant Market Trend:
{top_trend}

Key Pain Points:
{pain_points}

Instructions:
- Subject line: compelling, under 8 words
- Body: 3-4 sentences max
- Open with a specific, personalised hook — reference their headline, a past role, growth signal, or a tech they use
- Tie in the market trend or a company-specific signal naturally
- One clear CTA (suggest a 20-min call)
- Do not use buzzwords like "synergy", "revolutionary", "game-changer"
- Tone: professional but conversational
- If location is available, you may reference it naturally (e.g. "your team in San Francisco")

Respond as JSON with keys: subject, body, reasoning (why this angle works).
"""

# ── Per-stream scaffold templates ─────────────────────────────────────────────

_SCAFFOLD_BASE = """You are a world-class B2B sales development representative.

Write a highly personalized cold outreach email for the following lead.
The email must feel human, reference specific company context, and tie in a relevant market trend.

Lead:
- Name: {name}
- Title: {title}
- Headline: {headline}
- Company: {company}
- Industry: {industry}
- Location: {location}
- Recent roles: {recent_roles}

Company Signals:
- Revenue: {revenue}
- Headcount growth (12m): {headcount_growth}
- Tech stack: {tech_stack}
- Keywords: {keywords}

Company Context:
{company_summary}

Relevant Market Trend:
{top_trend}

Stream Focus ({stream_label} | {domain_label}):
{stream_context}
{few_shot_section}
Sender Proof Points (Domain B — cite these claim IDs exactly in social_proof; do not invent metrics):
{kb_section}

Instructions:
- Do NOT use buzzwords like "synergy", "revolutionary", "game-changer"
- Tone: professional but conversational
- Reference location naturally if available (e.g. "your team in {location}")
- In social_proof, use one of the Sender Proof Points above verbatim (include the metric). Cite it naturally — no need to mention the ID in the email text.

Respond as JSON with these exact keys:
{{
  "subject": "compelling subject line, under 8 words",
  "opening_hook": "1-2 sentences — specific personalised hook referencing their headline, growth signal, or tech",
  "value_prop": "1-2 sentences — one concrete business outcome (cost/velocity/risk reduction)",
  "social_proof": "1 sentence — quantified claim or peer-company reference from Sender Proof Points",
  "cta": "1 sentence — suggest a specific 20-min call",
  "reasoning": "why this angle works for this lead",
  "stream": "{stream_label}",
  "domain": "{domain_label}",
  "kb_ids_used": ["list of claim IDs from Sender Proof Points that were used"]
}}"""

_STREAM_CONTEXTS: dict[str, str] = {
    "data_science": (
        "Focus: model deployment velocity, ML infra cost, experiment tracking at scale, "
        "feature store management, GPU/compute spend.\n"
        "Angle: reference their ML/AI tools or research direction; tie in AI adoption trends.\n"
        "Key pain points: model retraining bottlenecks, reproducibility, MLOps maturity gaps."
    ),
    "data_engineering": (
        "Focus: pipeline reliability, data freshness SLAs, warehouse cost under growth, "
        "dbt transformation speed, streaming vs batch architecture.\n"
        "Angle: reference specific data tools (Kafka, Spark, Snowflake, Databricks, dbt); "
        "tie headcount growth to data volume pressure.\n"
        "Key pain points: data quality incidents, pipeline toil, engineer-to-data ratio creep."
    ),
    "product": (
        "Focus: experimentation velocity, feature adoption, data-driven roadmap prioritization, "
        "A/B testing infrastructure, real-time customer signals.\n"
        "Angle: tie in growth signal or product expansion; reference their market position.\n"
        "Key pain points: slow feedback loops, lack of real-time analytics, roadmap misalignment."
    ),
    "devops": (
        "Focus: infrastructure cost reduction, MTTR, deployment frequency, observability gaps, "
        "Kubernetes cost optimization, cloud spend management.\n"
        "Angle: reference specific DevOps tools they use; tie in scaling/hiring signal.\n"
        "Key pain points: alert fatigue, incident response toil, multi-cloud complexity."
    ),
    "generic": (
        "Focus: operational efficiency, scaling challenges, tech modernization.\n"
        "Angle: reference company growth signals and research pain points.\n"
        "Key pain points: derived from company research brief above."
    ),
}


def build_scaffold_template(stream: str, few_shot_section: str = "", kb_section: str = "") -> str:
    """Return the scaffold template with stream context, few-shot section, and KB claims injected.

    Uses replace() before format() so that curly braces in injected content are
    escaped and won't be misinterpreted as format() placeholders.
    """
    ctx = _STREAM_CONTEXTS.get(stream, _STREAM_CONTEXTS["generic"])
    safe_ctx = ctx.replace("{", "{{").replace("}", "}}")
    safe_few_shot = few_shot_section.replace("{", "{{").replace("}", "}}")
    safe_kb = (kb_section or "(none available)").replace("{", "{{").replace("}", "}}")
    return (
        _SCAFFOLD_BASE
        .replace("{stream_context}", safe_ctx)
        .replace("{few_shot_section}", safe_few_shot)
        .replace("{kb_section}", safe_kb)
    )

FOLLOW_UP_TEMPLATE = """
You are continuing a B2B sales conversation.

Previous exchange summary:
{conversation_summary}

Lead Profile:
- Name: {name}
- Title: {title}
- Company: {company}

Write a natural, non-pushy follow-up email.
- Reference the previous message briefly
- Add new value (a stat, insight, or relevant trend)
- One soft CTA

Respond as JSON with keys: subject, body.
"""

OBJECTION_RESPONSE_TEMPLATE = """
You are an expert SDR handling a sales objection.

Lead: {name}, {title} at {company}
Objection received: "{objection}"

Context:
{company_summary}

Write a brief, empathetic, and persuasive response that:
- Acknowledges their concern
- Reframes with a specific insight
- Keeps the conversation alive without being pushy

Respond as JSON with keys: response_text, approach_used.
"""
