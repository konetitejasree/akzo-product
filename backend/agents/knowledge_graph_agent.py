from collections import Counter, defaultdict


PROBLEM_KEYWORDS = {
    "rust": ["rust", "anti-rust", "red oxide"],
    "weather": ["weather", "rain", "uv", "sun", "monsoon", "outdoor"],
    "damp": ["damp", "patch", "leak", "water"],
    "washable": ["washable", "clean", "low odor"],
    "traffic": ["traffic", "abrasion", "chemical", "garage", "warehouse"],
}


def _usage_compatible(requested_usage, candidate_usage):
    if not requested_usage or not candidate_usage:
        return True
    return requested_usage == candidate_usage or "indoor/outdoor" in {requested_usage, candidate_usage}


def _combined_text(product):
    parts = [
        product.get("description", ""),
        " ".join(product.get("features", [])),
        " ".join(product.get("use_cases", [])),
        " ".join(product.get("reviews", [])),
        product.get("category", ""),
        product.get("surface", ""),
        product.get("usage", ""),
    ]
    return " ".join(parts).lower()


def product_problem_signals(product):
    text = _combined_text(product)
    matched = []
    for problem, keywords in PROBLEM_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            matched.append(problem)
    return matched


def guided_selling_path(product, intent_data=None):
    intent_data = intent_data or {}
    path = []

    requested_surface = ((intent_data.get("surfaces") or [None])[0])
    requested_usage = intent_data.get("usage")
    requested_finish = intent_data.get("finish")

    surface = requested_surface if requested_surface == product.get("surface") else product.get("surface")
    usage = (
        requested_usage
        if requested_usage in {product.get("usage"), "indoor/outdoor"} or product.get("usage") == "indoor/outdoor"
        else product.get("usage")
    )
    finish = requested_finish if requested_finish == product.get("finish") else product.get("finish")
    problems = product_problem_signals(product)

    if surface:
        path.append({"step": "surface", "value": surface})
    if usage:
        path.append({"step": "usage", "value": usage})
    if problems:
        path.append({"step": "problem", "value": problems[0]})
    if finish:
        path.append({"step": "finish", "value": finish})
    path.append({"step": "product", "value": product.get("name")})
    return path


def _bundle_candidates(product, catalog, intent_data=None):
    intent_data = intent_data or {}
    candidates = []

    for candidate in catalog:
        if candidate["sku"] == product["sku"]:
            continue
        if not candidate.get("available", True) or candidate.get("stock", 0) <= 0:
            continue
        if candidate["surface"] != product["surface"]:
            continue
        if not _usage_compatible(intent_data.get("usage") or product.get("usage"), candidate["usage"]):
            continue

        current_category = product.get("category", "").lower()
        candidate_category = candidate.get("category", "").lower()

        score = 0
        reason = None
        if "primer" in candidate_category and "primer" not in current_category:
            score += 5
            reason = f"Prep coat for {product['name']} on {product['surface']} surfaces."
        elif "primer" in current_category and "primer" not in candidate_category:
            score += 5
            reason = f"Top coat to use after {product['name']}."
        elif candidate["usage"] == product["usage"]:
            score += 2
            reason = f"Companion option for the same {product['surface']} {product['usage']} project."

        if score > 0:
            candidates.append(
                {
                    "sku": candidate["sku"],
                    "name": candidate["name"],
                    "price": candidate["price"],
                    "reason": reason,
                    "score": score,
                }
            )

    candidates.sort(key=lambda item: (item["score"], -item["price"]), reverse=True)
    return candidates


def bundle_recommendations(product, catalog, intent_data=None, limit=2):
    return _bundle_candidates(product, catalog, intent_data)[:limit]


def knowledge_graph_snapshot(catalog):
    node_counts = Counter()
    edge_counts = Counter()
    problems = Counter()
    adjacency = defaultdict(set)

    for product in catalog:
        sku = product["sku"]
        surface = product["surface"]
        usage = product["usage"]
        finish = product["finish"]
        category = product["category"]

        node_counts.update(["product", "surface", "usage", "finish", "category"])
        edge_counts.update(
            [
                "product-surface",
                "product-usage",
                "product-finish",
                "product-category",
            ]
        )

        adjacency[sku].update({surface, usage, finish, category})

        for problem in product_problem_signals(product):
            problems[problem] += 1
            adjacency[sku].add(problem)
            edge_counts["product-problem"] += 1

        for alt in product.get("alternatives", []):
            adjacency[sku].add(alt)
            edge_counts["product-alternative"] += 1

    return {
        "node_counts": dict(node_counts),
        "edge_counts": dict(edge_counts),
        "problem_signals": dict(problems),
        "graph_density_hint": sum(edge_counts.values()) / max(len(catalog), 1),
        "sample_paths": [
            {
                "sku": product["sku"],
                "path": guided_selling_path(product),
            }
            for product in catalog[:5]
        ],
    }
