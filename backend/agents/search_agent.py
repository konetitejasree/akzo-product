import json
from difflib import SequenceMatcher
from pathlib import Path

from agents.embedding_agent import semantic_scores


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "products.json"


def load_products():
    with DATA_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _text_blob(product):
    parts = [
        product["sku"],
        product["name"],
        product["category"],
        product["description"],
        product["surface"],
        product["usage"],
        product["finish"],
        product["color"],
        " ".join(product.get("features", [])),
        " ".join(product.get("use_cases", [])),
        " ".join(product.get("reviews", [])),
    ]
    return " ".join(parts).lower()


def _fuzzy_score(query, blob):
    query_terms = [term for term in query.split() if len(term) > 2]
    if not query_terms:
        return 0

    score = 0
    blob_terms = blob.split()
    for query_term in query_terms:
        if query_term in blob:
            score += 1.5
            continue

        best = max(
            (SequenceMatcher(None, query_term, blob_term).ratio() for blob_term in blob_terms),
            default=0,
        )
        if best >= 0.82:
            score += 1

    return score


def search_agent(intent_data, products=None, limit=4):
    catalog = products or load_products()

    if intent_data.get("is_greeting"):
        return []

    query = intent_data["query"]
    semantic_by_sku, search_mode = semantic_scores(query, catalog)
    scored_products = []
    intents = set(intent_data.get("intents", []))

    for product in catalog:
        score = 0.0
        reasons = []
        blob = _text_blob(product)

        fuzzy = _fuzzy_score(query, blob)
        if fuzzy:
            score += fuzzy
            reasons.append("text match")

        semantic_score = semantic_by_sku.get(product["sku"], 0)
        if semantic_score:
            score += semantic_score * 6
            reasons.append(f"semantic similarity: {semantic_score:.2f}")

        if product["surface"] in intent_data.get("surfaces", []):
            score += 4
            reasons.append(f"surface: {product['surface']}")
        elif intent_data.get("surfaces"):
            score -= 2

        usage = intent_data.get("usage")
        if usage and (product["usage"] == usage or product["usage"] == "indoor/outdoor"):
            score += 3
            reasons.append(f"usage: {usage}")
        elif usage:
            score -= 2.5

        finish = intent_data.get("finish")
        if finish and product["finish"] == finish:
            score += 1
            reasons.append(f"finish: {finish}")

        if product.get("stock", 0) > 0 and product.get("available", True):
            score += 0.75
        else:
            score -= 2
            reasons.append("currently unavailable")

        if score > 0:
            enriched = dict(product)
            enriched["match_score"] = round(score, 2)
            enriched["match_reasons"] = reasons
            enriched["search_mode"] = search_mode
            enriched["semantic_score"] = round(semantic_score, 4)
            scored_products.append(enriched)

    scored_products.sort(
        key=lambda p: (p["stock"] > 0 and p.get("available", True), p["match_score"], p["rating"]),
        reverse=True,
    )

    requested_surface = ((intent_data.get("surfaces") or [None])[0])
    requested_usage = intent_data.get("usage")
    if requested_surface and requested_usage:
        existing_skus = {product["sku"] for product in scored_products}
        for product in catalog:
            if product["sku"] in existing_skus:
                continue
            if product["surface"] != requested_surface:
                continue
            if product["usage"] not in {requested_usage, "indoor/outdoor"}:
                continue

            supplemental = dict(product)
            supplemental["match_score"] = 0.5
            supplemental["match_reasons"] = ["catalog constraint match"]
            supplemental["search_mode"] = search_mode
            supplemental["semantic_score"] = round(semantic_by_sku.get(product["sku"], 0), 4)
            scored_products.append(supplemental)

        scored_products.sort(
            key=lambda p: (p["stock"] > 0 and p.get("available", True), p["match_score"], p["rating"]),
            reverse=True,
        )

    if intents & {"availability"} and intent_data.get("exact_product_sku"):
        exact = [p for p in scored_products if p["sku"] == intent_data["exact_product_sku"]]
        if exact:
            return exact

    return scored_products[:limit]
