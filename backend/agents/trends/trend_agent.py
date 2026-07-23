import json
import os
import feedparser
from datetime import datetime
from pathlib import Path

TREND_STORE_PATH = Path(__file__).parent / "trend_store.json"

# Hand-curated, cited quarterly funding data (Crunchbase News, Tracxn, etc.) —
# real published figures, refreshed manually as new reports come out. See
# storage/market_data/funding_trends.jsonl for the source list.
FUNDING_TRENDS_PATH = Path(__file__).parent.parent.parent / "storage" / "market_data" / "funding_trends.jsonl"

RSS_FEEDS = [
    "https://feeds.feedburner.com/venturebeat/SZYF",
    "https://techcrunch.com/feed/",
]

CURATED_TRENDS = [
    {
        "id": "t001",
        "title": "AI Governance Concerns Increasing",
        "category": "regulatory",
        "relevance_tags": ["ai", "governance", "compliance", "risk"],
        "source": "curated",
        "date": "2026-05-01",
    },
    {
        "id": "t002",
        "title": "AI Agents Adoption Growing Rapidly",
        "category": "technology",
        "relevance_tags": ["ai", "agents", "automation", "llm"],
        "source": "curated",
        "date": "2026-05-10",
    },
    {
        "id": "t003",
        "title": "Snowflake AI Usage Accelerating",
        "category": "technology",
        "relevance_tags": ["snowflake", "data", "ai", "analytics"],
        "source": "curated",
        "date": "2026-05-12",
    },
    {
        "id": "t004",
        "title": "Cost Optimization Trend in Enterprise Tech",
        "category": "business",
        "relevance_tags": ["cost", "efficiency", "enterprise", "saas"],
        "source": "curated",
        "date": "2026-05-15",
    },
    {
        "id": "t005",
        "title": "Funding Activity Picking Up in AI Infrastructure",
        "category": "funding",
        "relevance_tags": ["funding", "investment", "ai", "infrastructure"],
        "source": "curated",
        "date": "2026-05-20",
    },
]


def _load_funding_trends() -> list[dict]:
    """Load hand-curated, cited quarterly funding trends from disk."""
    if not FUNDING_TRENDS_PATH.exists():
        return []
    trends = []
    with open(FUNDING_TRENDS_PATH) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                trends.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return trends


class TrendAgent:
    """Manages ingestion and retrieval of market trend intelligence."""

    def ingest_trends(self) -> list[dict]:
        """Pull trends from RSS feeds, merge with curated list + cited funding data."""
        trends = list(CURATED_TRENDS) + _load_funding_trends()
        for url in RSS_FEEDS:
            try:
                feed = feedparser.parse(url)
                for entry in feed.entries[:5]:
                    trends.append({
                        "id": entry.get("id", entry.get("link")),
                        "title": entry.get("title"),
                        "category": "news",
                        "relevance_tags": [],
                        "source": url,
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "summary": entry.get("summary", ""),
                    })
            except Exception:
                pass

        self._save(trends)
        return trends

    def get_current_trends(self) -> list[dict]:
        """Return stored trends, refreshing if store is empty."""
        if TREND_STORE_PATH.exists():
            with open(TREND_STORE_PATH) as f:
                trends = json.load(f)
            if trends:
                return trends
        return self.ingest_trends()

    def _save(self, trends: list[dict]) -> None:
        with open(TREND_STORE_PATH, "w") as f:
            json.dump(trends, f, indent=2)
