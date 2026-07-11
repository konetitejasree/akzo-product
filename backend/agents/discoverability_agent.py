from collections import Counter, defaultdict

from agents.content_agent import enrich_product_content
from agents.knowledge_graph_agent import knowledge_graph_snapshot, product_problem_signals


def _safe_rate(numerator, denominator):
    if not denominator:
        return 0.0
    return round((numerator / denominator) * 100, 2)


def catalog_governance_report(catalog):
    enriched = [enrich_product_content(product) for product in catalog]
    content_gaps = []
    assortment_signals = []

    for product in enriched:
        missing = []
        if len(product.get("reviews", [])) < 2:
            missing.append("low_review_coverage")
        if not product.get("summary"):
            missing.append("missing_summary")
        if len(product.get("qa", [])) < 3:
            missing.append("thin_qa")
        if product.get("stock", 0) <= 5:
            assortment_signals.append(
                {
                    "sku": product["sku"],
                    "name": product["name"],
                    "signal": "low_stock",
                    "detail": f"Only {product.get('stock', 0)} units left.",
                }
            )
        if missing:
            content_gaps.append(
                {
                    "sku": product["sku"],
                    "name": product["name"],
                    "issues": missing,
                }
            )

    return {
        "overview": {
            "catalog_size": len(catalog),
            "products_with_generated_summary": sum(1 for item in enriched if item.get("summary")),
            "products_with_generated_qa": sum(1 for item in enriched if item.get("qa")),
            "products_with_problem_signals": sum(1 for item in enriched if product_problem_signals(item)),
        },
        "content_gaps": content_gaps,
        "assortment_signals": assortment_signals,
        "knowledge_graph": knowledge_graph_snapshot(catalog),
    }


def discoverability_report(catalog, events):
    search_events = [event for event in events if event.get("event_type") in {"search", "no_result"}]
    no_result_events = [event for event in events if event.get("event_type") == "no_result"]
    selection_events = [event for event in events if event.get("event_type") in {"select", "add_to_cart"}]
    top_queries = Counter(event.get("query") for event in search_events if event.get("query"))
    failed_queries = Counter(event.get("query") for event in no_result_events if event.get("query"))
    sku_selected = Counter(event.get("sku") for event in selection_events if event.get("sku"))
    sku_views = Counter(
        event.get("sku")
        for event in events
        if event.get("event_type") in {"view", "select", "add_to_cart"} and event.get("sku")
    )

    products_by_surface = defaultdict(list)
    for product in catalog:
        products_by_surface[product["surface"]].append(product)

    low_findability = []
    for product in catalog:
        interactions = sku_views.get(product["sku"], 0)
        if interactions == 0:
            low_findability.append(
                {
                    "sku": product["sku"],
                    "name": product["name"],
                    "surface": product["surface"],
                    "usage": product["usage"],
                    "issue": "No recorded engagement yet",
                    "action": "Boost with alternate phrasing, more review keywords, and guided prompts.",
                }
            )

    remediation_playbooks = []
    for query, count in failed_queries.most_common(5):
        query_lower = (query or "").lower()
        if any(term in query_lower for term in ["rust", "metal", "gate"]):
            action = "Add more rust-protection synonyms and surface hints to metal products."
        elif any(term in query_lower for term in ["bedroom", "wall", "washable"]):
            action = "Expand interior-wall descriptive content and washable benefit cues."
        elif any(term in query_lower for term in ["deck", "wood", "outdoor"]):
            action = "Add stronger outdoor-wood and stain phrasing for wood coatings."
        else:
            action = "Review missed query wording and add synonyms, Q&A coverage, and guided prompts."
        remediation_playbooks.append({"query": query, "count": count, "action": action})

    discovery_score = max(
        0,
        round(
            100
            - (_safe_rate(len(no_result_events), len(search_events) or 1) * 0.6)
            - (len(low_findability) * 1.5),
            2,
        ),
    )

    conversion_rate = _safe_rate(len(selection_events), len(search_events) or 1)

    return {
        "overview": {
            "discovery_score": discovery_score,
            "search_count": len(search_events),
            "no_result_rate": _safe_rate(len(no_result_events), len(search_events) or 1),
            "selection_rate": conversion_rate,
        },
        "top_queries": [{"query": query, "count": count} for query, count in top_queries.most_common(8)],
        "failed_queries": [{"query": query, "count": count} for query, count in failed_queries.most_common(8)],
        "low_findability_products": low_findability[:8],
        "top_selected_products": [{"sku": sku, "count": count} for sku, count in sku_selected.most_common(8)],
        "surface_coverage": {
            surface: {
                "product_count": len(products),
                "available_count": sum(
                    1 for product in products if product.get("available", True) and product.get("stock", 0) > 0
                ),
            }
            for surface, products in products_by_surface.items()
        },
        "remediation_playbooks": remediation_playbooks,
    }


def usecase_status_report():
    return [
        {
            "use_case_item": "Semantic search with embeddings",
            "status": "implemented",
            "detail": "OpenAI embeddings with cached index and fuzzy fallback are active.",
        },
        {
            "use_case_item": "Guided selling",
            "status": "implemented",
            "detail": "Intent extraction, clarification, and product guidance are wired into chat flow.",
        },
        {
            "use_case_item": "Knowledge-graph guided selling",
            "status": "implemented",
            "detail": "Catalog graph and guided product paths are available for recommendations and admin review.",
        },
        {
            "use_case_item": "Alternatives and replacements",
            "status": "implemented",
            "detail": "Recommendation agent returns compatible alternatives and replacements for unavailable items.",
        },
        {
            "use_case_item": "Bundles / cross-sell",
            "status": "implemented",
            "detail": "Bundle recommendations now pair prep coats and companion products for matching projects.",
        },
        {
            "use_case_item": "Review summarization and generated Q&A",
            "status": "implemented",
            "detail": "Summaries, review highlights, social proof, and generated Q&A are available per SKU.",
        },
        {
            "use_case_item": "Behavior learning",
            "status": "implemented",
            "detail": "Views, selects, feedback, and cart actions influence ranking and analytics.",
        },
        {
            "use_case_item": "AI discoverability monitoring",
            "status": "implemented",
            "detail": "Admin reports now expose discovery score, failed queries, low-findability SKUs, and playbooks.",
        },
        {
            "use_case_item": "Content governance / assortment feedback",
            "status": "implemented",
            "detail": "Catalog governance report highlights gaps, low stock, and assortment signals.",
        },
        {
            "use_case_item": "Social signal amplification",
            "status": "implemented",
            "detail": "Synthetic social proof is derived from review language and engagement signals.",
        },
    ]
