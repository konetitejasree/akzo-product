QUESTION_BY_SLOT = {
    "surface": "Which surface are you working on: metal, wood, wall, or concrete?",
    "usage": "Will this be used indoor or outdoor?",
}


def _format_product_choice(product):
    parts = [product["name"]]
    finish = product.get("finish")
    color = product.get("color")
    details = [item for item in [finish, color] if item]
    if details:
        parts.append(f"({', '.join(details)})")
    return " ".join(parts)


def clarification_agent(intent_data, products):
    missing = intent_data.get("missing_slots", [])
    intents = set(intent_data.get("intents", []))
    exact_product = intent_data.get("exact_product_sku")

    if intent_data.get("is_greeting"):
        return "What are you painting today: wall, wood, metal, or concrete?"

    if intent_data.get("is_confirmation"):
        return None

    if missing and (exact_product or "availability" in intents):
        return None

    if missing:
        return QUESTION_BY_SLOT[missing[0]]

    if products:
        top = products[0]
        if "availability" in intents and len(products) == 1:
            if top.get("status") == "unavailable":
                return f"{top['name']} is unavailable. Would you like me to show replacements or similar available options?"
            return f"Would you like more details on {top['name']}, should I add it to cart, or would you like to see alternatives?"
        if exact_product and len(products) == 1 and top.get("sku") == exact_product:
            if top.get("status") == "unavailable":
                return f"{top['name']} is unavailable. Would you like me to show replacements or similar available options?"
            return f"Would you like more details on {top['name']}, should I add it to cart, or would you like to see alternatives?"
        if len(products) > 1:
            choices = [_format_product_choice(product) for product in products[:2]]
            return f"Which option would you like to go with: {choices[0]} or {choices[1]}?"
        if top.get("status") == "available":
            return f"Would you like to go with {top['name']}?"
        return "This item is not available right now. Should I show the closest replacement?"

    return "Can you share the surface and whether it is indoor or outdoor?"
