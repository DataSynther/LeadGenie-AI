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
