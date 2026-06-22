"""
Lead Network Store — Neo4j Aura knowledge graph.

Schema
------
(:Lead   {lead_id, name, title, company_name, industry, seniority,
          linkedin_url, region, embedding, stored_at})
(:Company {domain, name, industry, size, tech_stack})
(:Topic  {name})
(:Region {name})

Relationships
(:Lead)-[:WORKS_AT]->(:Company)
(:Lead)-[:TAGGED_WITH]->(:Topic)
(:Lead)-[:LOCATED_IN]->(:Region)
(:Company)-[:USES_TECH]->(:Topic)
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)

_NEO4J_URI  = os.getenv("NEO4J_URI", "")
_NEO4J_USER = os.getenv("NEO4J_USERNAME", "")
_NEO4J_PASS = os.getenv("NEO4J_PASSWORD", "")


def _driver():
    from neo4j import GraphDatabase
    return GraphDatabase.driver(_NEO4J_URI, auth=(_NEO4J_USER, _NEO4J_PASS))


def _run(query: str, params: dict | None = None) -> list[dict]:
    with _driver() as driver:
        with driver.session() as session:
            result = session.run(query, params or {})
            return [dict(r) for r in result]


# ── Schema bootstrap (idempotent) ─────────────────────────────────────────────

def init_schema() -> None:
    constraints = [
        "CREATE CONSTRAINT lead_id IF NOT EXISTS FOR (l:Lead)    REQUIRE l.lead_id IS UNIQUE",
        "CREATE CONSTRAINT company_domain IF NOT EXISTS FOR (c:Company) REQUIRE c.domain IS UNIQUE",
        "CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (t:Topic)   REQUIRE t.name IS UNIQUE",
        "CREATE CONSTRAINT region_name IF NOT EXISTS FOR (r:Region)  REQUIRE r.name IS UNIQUE",
    ]
    for cql in constraints:
        try:
            _run(cql)
        except Exception as e:
            log.debug("Constraint already exists or minor error: %s", e)

    # Vector index for semantic search (Neo4j 5.x)
    try:
        _run("""
            CREATE VECTOR INDEX lead_embedding IF NOT EXISTS
            FOR (l:Lead) ON (l.embedding)
            OPTIONS {indexConfig: {
                `vector.dimensions`: 1024,
                `vector.similarity_function`: 'cosine'
            }}
        """)
    except Exception as e:
        log.debug("Vector index: %s", e)

    log.info("Neo4j schema initialised")


# ── Store a lead ──────────────────────────────────────────────────────────────

def store_lead(
    lead: dict,
    embedding: list[float],
    topics: list[str],
    engaged_via: str = "outreach",
    employment_history: list[dict] | None = None,
) -> dict:
    """
    Merge Lead + Company nodes and create relationships.
    Returns the stored lead dict.
    """
    lead_id      = lead.get("id") or lead.get("lead_id") or lead.get("email", "unknown")
    name         = lead.get("name", "Unknown")
    title        = lead.get("title", "")
    company_name = lead.get("company", "") or lead.get("organization_name", "")
    industry     = lead.get("industry", "")
    seniority    = lead.get("seniority", "")
    linkedin_url = lead.get("linkedin_url", "")
    region       = lead.get("region", lead.get("location", ""))
    domain       = lead.get("domain", "") or _domain_from_email(lead.get("email", ""))
    stored_at    = datetime.now(timezone.utc).isoformat()

    # Merge Lead node
    _run("""
        MERGE (l:Lead {lead_id: $lead_id})
        SET l.name         = $name,
            l.title        = $title,
            l.company_name = $company_name,
            l.industry     = $industry,
            l.seniority    = $seniority,
            l.linkedin_url = $linkedin_url,
            l.region       = $region,
            l.embedding    = $embedding,
            l.engaged_via  = $engaged_via,
            l.stored_at    = $stored_at
    """, {
        "lead_id": lead_id, "name": name, "title": title,
        "company_name": company_name, "industry": industry,
        "seniority": seniority, "linkedin_url": linkedin_url,
        "region": region, "embedding": embedding,
        "engaged_via": engaged_via, "stored_at": stored_at,
    })

    # Merge Company node + relationship
    if company_name:
        _run("""
            MERGE (c:Company {domain: $domain})
            SET c.name     = $company_name,
                c.industry = $industry
            WITH c
            MATCH (l:Lead {lead_id: $lead_id})
            MERGE (l)-[:WORKS_AT]->(c)
        """, {"domain": domain or company_name.lower().replace(" ", "."),
              "company_name": company_name, "industry": industry,
              "lead_id": lead_id})

    # Merge Region node + relationship
    if region:
        _run("""
            MERGE (r:Region {name: $region})
            WITH r
            MATCH (l:Lead {lead_id: $lead_id})
            MERGE (l)-[:LOCATED_IN]->(r)
        """, {"region": region, "lead_id": lead_id})

    # Merge Topic nodes + relationships
    for topic in topics:
        t = topic.strip().lower()
        if not t:
            continue
        _run("""
            MERGE (t:Topic {name: $topic})
            WITH t
            MATCH (l:Lead {lead_id: $lead_id})
            MERGE (l)-[:TAGGED_WITH]->(t)
        """, {"topic": t, "lead_id": lead_id})

        # Also tag the company with this topic
        if company_name:
            _run("""
                MATCH (c:Company {name: $company_name})
                MERGE (t:Topic {name: $topic})
                MERGE (c)-[:USES_TECH]->(t)
            """, {"company_name": company_name, "topic": t})

    # Merge past employer nodes + PREVIOUSLY_AT relationships
    for job in (employment_history or []):
        past_company = (job.get("company") or "").strip()
        past_title   = (job.get("title") or "").strip()
        if not past_company or job.get("current"):
            continue
        past_domain = past_company.lower().replace(" ", ".")
        _run("""
            MERGE (c:Company {domain: $domain})
            SET c.name = $company_name
            WITH c
            MATCH (l:Lead {lead_id: $lead_id})
            MERGE (l)-[r:PREVIOUSLY_AT]->(c)
            SET r.title = $title
        """, {"domain": past_domain, "company_name": past_company,
              "lead_id": lead_id, "title": past_title})

    log.info("Stored lead %s (%s) to network graph with %d topics, %d past orgs",
             name, lead_id, len(topics), len([j for j in (employment_history or []) if not j.get("current")]))
    return {"lead_id": lead_id, "name": name, "topics": topics, "stored_at": stored_at}


# ── Semantic vector search ────────────────────────────────────────────────────

def semantic_search(query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """Vector similarity search over Lead embeddings."""
    try:
        rows = _run("""
            CALL db.index.vector.queryNodes('lead_embedding', $top_k, $embedding)
            YIELD node AS l, score
            RETURN l.lead_id AS lead_id, l.name AS name, l.title AS title,
                   l.company_name AS company, l.industry AS industry,
                   l.linkedin_url AS linkedin_url, l.region AS region,
                   l.seniority AS seniority, l.stored_at AS stored_at,
                   score
            ORDER BY score DESC
        """, {"top_k": top_k, "embedding": query_embedding})
        return rows
    except Exception as e:
        log.warning("Vector search failed, falling back to full scan: %s", e)
        return _fallback_search(query_embedding, top_k)


def _fallback_search(query_embedding: list[float], top_k: int) -> list[dict]:
    """Cosine similarity scan when vector index unavailable."""
    import numpy as np
    rows = _run("""
        MATCH (l:Lead)
        WHERE l.embedding IS NOT NULL
        RETURN l.lead_id AS lead_id, l.name AS name, l.title AS title,
               l.company_name AS company, l.industry AS industry,
               l.linkedin_url AS linkedin_url, l.region AS region,
               l.seniority AS seniority, l.stored_at AS stored_at,
               l.embedding AS embedding
    """)
    q = np.array(query_embedding)
    q_norm = np.linalg.norm(q) or 1.0
    scored = []
    for r in rows:
        emb = r.pop("embedding", None)
        if not emb:
            continue
        v = np.array(emb)
        score = float(np.dot(q, v) / (q_norm * (np.linalg.norm(v) or 1.0)))
        scored.append({**r, "score": score})
    return sorted(scored, key=lambda x: x["score"], reverse=True)[:top_k]


# ── Graph traversal queries ───────────────────────────────────────────────────

def query_by_topics(topics: list[str], region: str | None = None, limit: int = 20) -> list[dict]:
    """Return leads matching ANY of the given topics, optionally filtered by region."""
    region_clause = "AND (l)-[:LOCATED_IN]->(:Region {name: $region})" if region else ""
    rows = _run(f"""
        MATCH (l:Lead)-[:TAGGED_WITH]->(t:Topic)
        WHERE t.name IN $topics
        {region_clause}
        WITH l, collect(t.name) AS matched_topics, count(t) AS overlap
        OPTIONAL MATCH (l)-[:WORKS_AT]->(c:Company)
        RETURN l.lead_id AS lead_id, l.name AS name, l.title AS title,
               l.company_name AS company, l.industry AS industry,
               l.linkedin_url AS linkedin_url, l.region AS region,
               l.seniority AS seniority, l.stored_at AS stored_at,
               matched_topics, overlap
        ORDER BY overlap DESC
        LIMIT $limit
    """, {"topics": [t.lower() for t in topics], "region": region, "limit": limit})
    return rows


def get_graph_data(limit_companies: int = 30) -> dict:
    """Return nodes + edges for frontend force-directed graph."""
    rows = _run("""
        MATCH (l:Lead)-[:WORKS_AT]->(c:Company)
        WITH c, collect({id: l.lead_id, name: l.name, title: l.title,
                         linkedin_url: l.linkedin_url, seniority: l.seniority}) AS leads
        LIMIT $limit
        OPTIONAL MATCH (c)-[:USES_TECH]->(t:Topic)
        WITH c, leads, collect(t.name) AS tech_topics
        RETURN c.name AS company, c.domain AS domain,
               c.industry AS industry, leads, tech_topics
    """, {"limit": limit_companies})

    nodes: list[dict] = []
    edges: list[dict] = []
    seen_companies: set[str] = set()
    seen_leads: set[str] = set()

    for row in rows:
        co = row["company"] or row["domain"] or "Unknown"
        if co not in seen_companies:
            nodes.append({"id": f"co:{co}", "label": co,
                          "type": "company", "industry": row["industry"],
                          "tech": row["tech_topics"]})
            seen_companies.add(co)

        for lead in (row["leads"] or []):
            lid = lead["id"]
            if lid not in seen_leads:
                nodes.append({"id": f"lead:{lid}", "label": lead["name"],
                              "type": "lead", "title": lead["title"],
                              "linkedin_url": lead["linkedin_url"],
                              "seniority": lead["seniority"]})
                seen_leads.add(lid)
            edges.append({"source": f"lead:{lid}", "target": f"co:{co}",
                          "label": "WORKS_AT"})

    # PREVIOUSLY_AT edges — past employers
    past_rows = _run("""
        MATCH (l:Lead)-[r:PREVIOUSLY_AT]->(c:Company)
        RETURN l.lead_id AS lead_id, c.name AS company, c.domain AS domain,
               r.title AS title
        LIMIT 100
    """)
    for row in past_rows:
        co = row["company"] or row["domain"] or "Unknown"
        if co not in seen_companies:
            nodes.append({"id": f"co:{co}", "label": co, "type": "company", "past": True})
            seen_companies.add(co)
        if f"lead:{row['lead_id']}" in {n["id"] for n in nodes}:
            edges.append({"source": f"lead:{row['lead_id']}", "target": f"co:{co}",
                          "label": "PREVIOUSLY_AT", "title": row["title"], "type": "past"})

    # Topic edges between companies sharing topics
    topic_rows = _run("""
        MATCH (c1:Company)-[:USES_TECH]->(t:Topic)<-[:USES_TECH]-(c2:Company)
        WHERE c1.name < c2.name
        RETURN c1.name AS a, c2.name AS b, t.name AS topic
        LIMIT 50
    """)
    for row in topic_rows:
        if row["a"] in seen_companies and row["b"] in seen_companies:
            edges.append({"source": f"co:{row['a']}", "target": f"co:{row['b']}",
                          "label": row["topic"], "type": "shared_topic"})

    return {"nodes": nodes, "edges": edges}


def find_by_past_org(org_name: str, limit: int = 20) -> list[dict]:
    """Find leads who previously worked at a given organisation (fuzzy name match)."""
    rows = _run("""
        MATCH (l:Lead)-[r:PREVIOUSLY_AT]->(c:Company)
        WHERE toLower(c.name) CONTAINS toLower($org)
        OPTIONAL MATCH (l)-[:TAGGED_WITH]->(t:Topic)
        WITH l, r, c, collect(t.name) AS topics
        RETURN l.lead_id AS lead_id, l.name AS name, l.title AS title,
               l.company_name AS company, l.region AS region,
               l.linkedin_url AS linkedin_url, l.seniority AS seniority,
               r.title AS past_title, c.name AS past_company, topics
        ORDER BY l.stored_at DESC
        LIMIT $limit
    """, {"org": org_name, "limit": limit})
    return rows


def list_leads(region: str | None = None, industry: str | None = None,
               topic: str | None = None, limit: int = 50) -> list[dict]:
    """Paginated lead list with optional filters."""
    clauses = []
    params: dict[str, Any] = {"limit": limit}
    if region:
        clauses.append("(l)-[:LOCATED_IN]->(:Region {name: $region})")
        params["region"] = region
    if industry:
        clauses.append("l.industry = $industry")
        params["industry"] = industry
    if topic:
        clauses.append("(l)-[:TAGGED_WITH]->(:Topic {name: $topic})")
        params["topic"] = topic.lower()

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = _run(f"""
        MATCH (l:Lead)
        {where}
        OPTIONAL MATCH (l)-[:TAGGED_WITH]->(t:Topic)
        WITH l, collect(t.name) AS topics
        RETURN l.lead_id AS lead_id, l.name AS name, l.title AS title,
               l.company_name AS company, l.industry AS industry,
               l.linkedin_url AS linkedin_url, l.region AS region,
               l.seniority AS seniority, l.stored_at AS stored_at,
               l.engaged_via AS engaged_via, topics
        ORDER BY l.stored_at DESC
        LIMIT $limit
    """, params)
    return rows


def add_tags(lead_id: str, tags: list[str]) -> dict:
    """Manually add topic tags to a lead."""
    added = []
    for tag in tags:
        t = tag.strip().lower()
        if not t:
            continue
        _run("""
            MATCH (l:Lead {lead_id: $lead_id})
            MERGE (tp:Topic {name: $tag})
            MERGE (l)-[:TAGGED_WITH]->(tp)
        """, {"lead_id": lead_id, "tag": t})
        added.append(t)
    return {"lead_id": lead_id, "tags_added": added}


def get_lead(lead_id: str) -> dict | None:
    rows = _run("""
        MATCH (l:Lead {lead_id: $lead_id})
        OPTIONAL MATCH (l)-[:TAGGED_WITH]->(t:Topic)
        OPTIONAL MATCH (l)-[:WORKS_AT]->(c:Company)
        OPTIONAL MATCH (l)-[:LOCATED_IN]->(r:Region)
        WITH l, collect(t.name) AS topics, c, r
        RETURN l.lead_id AS lead_id, l.name AS name, l.title AS title,
               l.company_name AS company, l.industry AS industry,
               l.linkedin_url AS linkedin_url, l.region AS region,
               l.seniority AS seniority, l.stored_at AS stored_at,
               l.engaged_via AS engaged_via, topics
    """, {"lead_id": lead_id})
    return rows[0] if rows else None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _domain_from_email(email: str) -> str:
    if "@" in email:
        return email.split("@", 1)[1].lower()
    return ""
