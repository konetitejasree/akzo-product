import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "behavior_events.jsonl"

EVENT_WEIGHTS = {
    "view": 0.1,
    "select": 0.5,
    "add_to_cart": 0.9,
    "positive": 0.7,
    "negative": -0.6,
    "no_result": -0.2,
}


def log_event(event_type, query=None, sku=None, metadata=None):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "query": query,
        "sku": sku,
        "metadata": metadata or {},
    }
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")
    return event


def log_query(query, products):
    event_type = "search" if products else "no_result"
    return log_event(
        event_type,
        query=query,
        metadata={
            "result_count": len(products),
            "skus": [p["sku"] for p in products],
            "has_replacement": any(bool(p.get("replacement")) for p in products),
            "has_alternatives": any(bool(p.get("alternatives")) for p in products),
        },
    )


def _load_events():
    if not LOG_PATH.exists():
        return []

    events = []
    with LOG_PATH.open(encoding="utf-8") as f:
        for line in f:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def load_events():
    return _load_events()


def behavior_boosts():
    boosts = {}
    for event in _load_events():
        sku = event.get("sku")
        if not sku:
            continue
        boosts[sku] = boosts.get(sku, 0) + EVENT_WEIGHTS.get(event.get("event_type"), 0)
    return boosts


def apply_behavior_boost(products):
    boosts = behavior_boosts()
    enriched = []
    for product in products:
        item = dict(product)
        boost = round(boosts.get(item["sku"], 0), 2)
        item["behavior_boost"] = boost
        item["match_score"] = round(item.get("match_score", 0) + boost, 2)
        enriched.append(item)
    enriched.sort(key=lambda p: (p["stock"] > 0, p["match_score"], p["rating"]), reverse=True)
    return enriched


def analytics_summary():
    events = _load_events()
    search_events = [event for event in events if event.get("event_type") in {"search", "no_result"}]
    query_counter = Counter(event.get("query") for event in search_events if event.get("query"))
    no_result_counter = Counter(
        event.get("query") for event in events if event.get("event_type") == "no_result" and event.get("query")
    )
    feedback_counter = Counter(event.get("event_type") for event in events)
    sku_selects = Counter(
        event.get("sku")
        for event in events
        if event.get("event_type") in {"select", "add_to_cart"} and event.get("sku")
    )

    daily_activity = defaultdict(lambda: {"searches": 0, "no_results": 0, "selects": 0})
    replacement_searches = 0
    alternative_searches = 0

    for event in events:
        timestamp = event.get("timestamp", "")
        day = timestamp[:10] if timestamp else "unknown"

        if event.get("event_type") in {"search", "no_result"}:
            daily_activity[day]["searches"] += 1
        if event.get("event_type") == "no_result":
            daily_activity[day]["no_results"] += 1
        if event.get("event_type") in {"select", "add_to_cart"}:
            daily_activity[day]["selects"] += 1

        metadata = event.get("metadata") or {}
        if metadata.get("has_replacement"):
            replacement_searches += 1
        if metadata.get("has_alternatives"):
            alternative_searches += 1

    top_queries = [{"query": query, "count": count} for query, count in query_counter.most_common(8)]
    failed_queries = [{"query": query, "count": count} for query, count in no_result_counter.most_common(8)]
    top_selected_products = [{"sku": sku, "count": count} for sku, count in sku_selects.most_common(8)]
    daily = [
        {"date": day, **values}
        for day, values in sorted(daily_activity.items())[-7:]
    ]

    return {
        "overview": {
            "total_events": len(events),
            "total_searches": len(search_events),
            "no_result_searches": sum(1 for event in events if event.get("event_type") == "no_result"),
            "replacement_searches": replacement_searches,
            "alternative_searches": alternative_searches,
        },
        "top_queries": top_queries,
        "failed_queries": failed_queries,
        "feedback_breakdown": dict(feedback_counter),
        "top_selected_products": top_selected_products,
        "daily_activity": daily,
        "replacement_effectiveness": {
            "replacement_suggestions_shown": replacement_searches,
            "alternative_suggestions_shown": alternative_searches,
            "product_selects": sum(sku_selects.values()),
        },
    }
