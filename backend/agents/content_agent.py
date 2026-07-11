def _review_highlights(product):
    reviews = product.get("reviews", [])
    if not reviews:
        return "Customers mention reliable performance."
    return " ".join(reviews[:2])


def review_summary(product):
    reviews = product.get("reviews", [])
    if not reviews:
        return "No customer review highlights are available yet."
    return f"Review summary: {_review_highlights(product)}"


def social_signal_summary(product):
    proof_points = []
    for feature in product.get("features", [])[:2]:
        proof_points.append(feature)
    for review in product.get("reviews", [])[:1]:
        proof_points.append(review.rstrip("."))
    if not proof_points:
        return "Social proof is still building for this SKU."
    return "Trusted signals: " + "; ".join(proof_points[:3]) + "."


def product_summary(product):
    features = ", ".join(product.get("features", [])[:3])
    return (
        f"{product['name']} is a {product['category'].lower()} for {product['surface']} "
        f"surfaces and {product['usage']} use. It offers {features} and has a "
        f"{product['rating']} star rating. {_review_highlights(product)}"
    )


def product_qa(product):
    return [
        {
            "question": f"Can I use {product['name']} for {product['surface']}?",
            "answer": (
                f"Yes. It is designed for {product['surface']} surfaces and is best suited "
                f"for {product['usage']} use."
            ),
        },
        {
            "question": "What finish does it provide?",
            "answer": f"It provides a {product['finish']} finish in {product['color']}.",
        },
        {
            "question": "Is it currently available?",
            "answer": (
                f"Yes, {product['stock']} units are in stock."
                if product.get("stock", 0) > 0 and product.get("available", True)
                else "It is currently unavailable, so the assistant should suggest a replacement."
            ),
        },
    ]


def enrich_product_content(product):
    enriched = dict(product)
    enriched["summary"] = product_summary(product)
    enriched["qa"] = product_qa(product)
    enriched["review_summary"] = review_summary(product)
    enriched["social_signal_summary"] = social_signal_summary(product)
    return enriched
