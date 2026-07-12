import json
import os
import re
from difflib import SequenceMatcher, get_close_matches

from openai import OpenAI


SURFACE_TERMS = {
    "metal": ["metal", "iron", "steel", "gate", "grill", "railing", "machinery", "machine"],
    "wood": ["wood", "wooden", "timber", "furniture", "door", "window", "cabinet", "deck"],
    "wall": ["wall", "walls", "bedroom", "living", "room", "facade", "compound", "damp"],
    "concrete": ["concrete", "floor", "garage", "warehouse"],
}

USAGE_TERMS = {
    "outdoor": ["outdoor", "outside", "exterior", "external", "rain", "sun", "weather", "monsoon"],
    "indoor": ["indoor", "inside", "interior", "bedroom", "living", "office", "cabinet"],
}

INTENT_TERMS = {
    "replacement": ["replace", "replacement", "alternative", "instead", "substitute", "unavailable"],
    "problem_solution": ["rust", "damp", "leak", "peel", "stain", "weather", "washable", "protection"],
    "comparison": ["compare", "best", "better", "top", "recommend"],
    "availability": ["available", "availability", "in stock", "stock"],
    "finish_change": ["another finish", "different finish", "other finish", "show another finish"],
}

FINISH_TERMS = ["matte", "gloss", "satin", "sheen", "clear"]
AFFIRMATION_TERMS = {"yes", "yeah", "yep", "okay", "ok", "fine", "confirm", "proceed", "sure"}
GRATITUDE_TERMS = {
    "thanks",
    "thank",
    "thankyou",
    "thankyouso much",
    "thank you",
    "thanks a lot",
    "many thanks",
}
OPTION_TERMS = {
    0: {"first", "1", "1st", "one", "former", "top"},
    1: {"second", "2", "2nd", "two", "latter", "last"},
}
ALL_SELECTION_TERMS = {"both", "all", "everything"}
NON_PERSISTENT_INTENTS = {
    "add_to_cart",
    "product_details",
    "show_alternatives",
    "availability",
    "finish_change",
    "replacement",
    "comparison",
}
FRESH_SEARCH_TERMS = {
    "paint",
    "paints",
    "coating",
    "coatings",
    "primer",
    "primers",
    "polish",
    "finish",
    "stain",
}


def _tokens(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def _match_from_terms(words, term_map):
    matched = []
    for canonical, synonyms in term_map.items():
        if any(term in words for term in synonyms):
            matched.append(canonical)
            continue

        for word in words:
            close = get_close_matches(word, synonyms, n=1, cutoff=0.82)
            if close:
                matched.append(canonical)
                break
    return matched


def _product_name_score(query_words, product_name):
    product_words = _tokens(product_name)
    if not query_words or not product_words:
        return 0

    score = 0.0
    for word in query_words:
        if word in product_words:
            score += 1
            continue

        close = get_close_matches(word, product_words, n=1, cutoff=0.84)
        if close:
            score += 0.8

    return score / len(product_words)


def _detect_exact_product(query, catalog):
    lowered_query = query.lower().strip()
    query_words = _tokens(lowered_query)
    query_word_set = set(query_words)
    compact_query = "".join(ch for ch in lowered_query if ch.isalnum())

    best_sku = None
    best_score = 0.0

    for product in catalog:
        product_name = product["name"].lower()
        product_sku = product["sku"].lower()
        compact_name = "".join(ch for ch in product_name if ch.isalnum())
        compact_sku = "".join(ch for ch in product_sku if ch.isalnum())

        if (
            product_name in lowered_query
            or product_sku in query_word_set
            or compact_sku in compact_query
            or compact_name == compact_query
        ):
            return product["sku"]

        phrase_ratio = SequenceMatcher(None, lowered_query, product_name).ratio()
        word_score = _product_name_score(query_words, product_name)

        if len(query_words) >= 2 and phrase_ratio >= 0.72 and word_score >= 0.58:
            combined_score = (phrase_ratio * 0.6) + (word_score * 0.4)
            if combined_score > best_score:
                best_score = combined_score
                best_sku = product["sku"]

    return best_sku if best_score >= 0.72 else None


def _normalize_sku(value):
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


def _extract_sku_candidate(query):
    candidates = re.findall(r"\b[a-z0-9]+(?:-[a-z0-9]+)+\b", query.lower())
    if not candidates:
        return None

    akzo_candidates = [candidate for candidate in candidates if any(ch.isdigit() for ch in candidate)]
    if not akzo_candidates:
        return None

    preferred = [candidate for candidate in akzo_candidates if candidate.startswith("akz")]
    return (preferred or akzo_candidates)[0].upper()


def _suggest_sku_candidate(raw_sku, catalog):
    if not raw_sku:
        return None

    normalized_input = _normalize_sku(raw_sku)
    if not normalized_input:
        return None

    best_sku = None
    best_score = 0.0

    for product in catalog:
        product_sku = product["sku"]
        normalized_product_sku = _normalize_sku(product_sku)
        if normalized_input == normalized_product_sku:
            return product_sku

        score = SequenceMatcher(None, normalized_input, normalized_product_sku).ratio()
        if normalized_input[:3] == normalized_product_sku[:3]:
            score += 0.04
        if normalized_input[-3:] == normalized_product_sku[-3:]:
            score += 0.08

        if score > best_score:
            best_score = score
            best_sku = product_sku

    return best_sku if best_score >= 0.8 else None


def _detect_option_index(query):
    words = set(_tokens(query))
    for index, terms in OPTION_TERMS.items():
        if words & terms:
            return index
    return None


def _detect_select_all(query):
    words = set(_tokens(query))
    return bool(words & ALL_SELECTION_TERMS)


def _has_gratitude_intent(normalized, words):
    compact = normalized.replace(" ", "")
    if normalized in GRATITUDE_TERMS or compact in GRATITUDE_TERMS:
        return True
    return any(
        phrase in normalized
        for phrase in ["thank you", "thanks", "thanks a lot", "many thanks"]
    )


def _has_cart_intent(normalized, words):
    word_set = set(words)
    if "cart" not in word_set:
        return False
    if {"add", "cart"} <= word_set:
        return True
    if {"put", "cart"} <= word_set:
        return True
    if {"buy", "cart"} <= word_set:
        return True
    return any(
        phrase in normalized
        for phrase in [
            "add to cart",
            "add into cart",
            "put in cart",
            "put this in cart",
            "buy this",
            "purchase this",
        ]
    )


def _rule_intent_agent(query):
    normalized = query.lower().strip()
    words = _tokens(normalized)
    is_greeting = normalized in ["hi", "hello", "hey", "good morning", "good evening"]

    surfaces = _match_from_terms(words, SURFACE_TERMS)
    usages = _match_from_terms(words, USAGE_TERMS)
    intents = _match_from_terms(words, INTENT_TERMS)
    if _has_cart_intent(normalized, words):
        intents.append("add_to_cart")
    if _has_gratitude_intent(normalized, words):
        intents.append("gratitude")
    if any(phrase in normalized for phrase in ["more details", "more detail", "details", "price", "application", "apply it", "instructions"]):
        intents.append("product_details")
    if any(phrase in normalized for phrase in ["alternatives", "alternative", "other option", "other options"]):
        intents.append("show_alternatives")
    if "finish" in words and any(term in words for term in ["another", "different", "other"]):
        intents.append("finish_change")
    finishes = [finish for finish in FINISH_TERMS if finish in words]
    selected_option = _detect_option_index(query)
    select_all = _detect_select_all(query)

    missing_slots = []
    if not surfaces:
        missing_slots.append("surface")
    if not usages:
        missing_slots.append("usage")

    return {
        "raw_query": query,
        "query": normalized,
        "tokens": words,
        "surfaces": surfaces,
        "usage": usages[0] if usages else None,
        "finish": finishes[0] if finishes else None,
        "intents": ["greeting"] if is_greeting else list(dict.fromkeys(intents)) or ["product_search"],
        "missing_slots": missing_slots,
        "is_greeting": is_greeting,
        "selected_option": selected_option,
        "select_all": select_all,
    }


def _ai_intent_agent(query, catalog):
    if not os.getenv("OPENAI_API_KEY"):
        return None

    catalog_hints = [
        {
            "sku": product["sku"],
            "name": product["name"],
            "surface": product["surface"],
            "usage": product["usage"],
            "finish": product["finish"],
        }
        for product in catalog[:12]
    ]

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        completion = client.chat.completions.create(
            model=os.getenv("OPENAI_INTENT_MODEL", os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1-mini")),
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract shopping intent for an Akzo paint and coatings assistant. "
                        "Return strict JSON with keys: surfaces, usage, finish, intents, is_greeting. "
                        "Allowed surfaces: metal, wood, wall, concrete. "
                        "Allowed usage: indoor, outdoor, null. "
                        "Allowed finish: matte, gloss, satin, sheen, clear, null. "
                        "Allowed intents: greeting, product_search, replacement, problem_solution, "
                        "comparison, availability, finish_change, add_to_cart, product_details, show_alternatives, gratitude. "
                        "Use greeting only when the user is actually greeting. "
                        "Use gratitude when the user is simply thanking or closing the conversation. "
                        "Use availability for exact product availability or stock questions. "
                        "Use add_to_cart when the user wants to add a product to cart. "
                        "Do not invent products beyond the provided catalog hints."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "query": query,
                            "catalog_hints": catalog_hints,
                        }
                    ),
                },
            ],
        )
        content = completion.choices[0].message.content or "{}"
        parsed = json.loads(content)

        allowed_surfaces = set(SURFACE_TERMS.keys())
        allowed_intents = {
            "greeting",
            "product_search",
            "replacement",
            "problem_solution",
            "comparison",
            "availability",
            "finish_change",
            "add_to_cart",
            "product_details",
            "show_alternatives",
            "gratitude",
        }

        surfaces = [item for item in parsed.get("surfaces", []) if item in allowed_surfaces]
        usage = parsed.get("usage") if parsed.get("usage") in {"indoor", "outdoor"} else None
        finish = parsed.get("finish") if parsed.get("finish") in FINISH_TERMS else None
        intents = [item for item in parsed.get("intents", []) if item in allowed_intents]

        return {
            "surfaces": surfaces,
            "usage": usage,
            "finish": finish,
            "intents": intents or ["product_search"],
            "is_greeting": bool(parsed.get("is_greeting")),
        }
    except Exception:
        return None


def intent_agent(query, catalog=None):
    rule_data = _rule_intent_agent(query)
    ai_data = _ai_intent_agent(query, catalog or [])

    if not ai_data:
        return rule_data

    surfaces = ai_data.get("surfaces") or rule_data.get("surfaces", [])
    usage = ai_data.get("usage") or rule_data.get("usage")
    finish = ai_data.get("finish") or rule_data.get("finish")
    is_greeting = ai_data.get("is_greeting") or rule_data.get("is_greeting")

    merged_intents = []
    for intent in ai_data.get("intents", []) + rule_data.get("intents", []):
        if intent == "greeting" and not is_greeting:
            continue
        if intent not in merged_intents:
            merged_intents.append(intent)

    missing_slots = []
    if not surfaces:
        missing_slots.append("surface")
    if not usage:
        missing_slots.append("usage")

    return {
        **rule_data,
        "surfaces": surfaces,
        "usage": usage,
        "finish": finish,
        "intents": ["greeting"] if is_greeting else merged_intents or ["product_search"],
        "missing_slots": missing_slots,
        "is_greeting": is_greeting,
    }


def _is_fresh_search(latest_query):
    intents = set(latest_query.get("intents", []))
    tokens = set(latest_query.get("tokens", []))

    blocking_intents = {
        "availability",
        "add_to_cart",
        "product_details",
        "show_alternatives",
        "finish_change",
        "comparison",
        "replacement",
        "gratitude",
    }
    if intents & blocking_intents:
        return False
    if latest_query.get("selected_option") is not None or latest_query.get("select_all"):
        return False
    if latest_query.get("is_greeting"):
        return False
    if not (tokens & FRESH_SEARCH_TERMS):
        return False
    return True


def conversation_intent(history, query, catalog):
    user_messages = [msg.get("text", "") for msg in history if msg.get("type") == "user"]
    ordered_messages = [text for text in user_messages if text] + [query]

    merged_surface = None
    merged_usage = None
    merged_finish = None
    merged_intents = []

    for text in ordered_messages[:-1]:
        partial = intent_agent(text, catalog)
        if partial.get("surfaces"):
            merged_surface = partial["surfaces"][-1]
        if partial.get("usage"):
            merged_usage = partial["usage"]
        if partial.get("finish"):
            merged_finish = partial["finish"]
        for intent in partial.get("intents", []):
            if (
                intent not in merged_intents
                and intent != "greeting"
                and intent not in NON_PERSISTENT_INTENTS
            ):
                merged_intents.append(intent)

    latest_query = intent_agent(query, catalog)
    if _is_fresh_search(latest_query):
        merged_surface = None
        merged_usage = None
        merged_finish = None
        merged_intents = []

    if latest_query.get("surfaces"):
        merged_surface = latest_query["surfaces"][-1]
    if latest_query.get("usage"):
        merged_usage = latest_query["usage"]
    if latest_query.get("finish"):
        merged_finish = latest_query["finish"]
    for intent in latest_query.get("intents", []):
        if intent not in merged_intents and intent != "greeting":
            merged_intents.append(intent)

    normalized_query = " ".join(text.strip() for text in ordered_messages if text.strip())
    tokens = _tokens(normalized_query)
    current_tokens = set(_tokens(query))
    raw_sku_candidate = _extract_sku_candidate(query)
    exact_product = _detect_exact_product(query, catalog)
    suggested_product_sku = None
    if raw_sku_candidate and not exact_product:
        suggested_product_sku = _suggest_sku_candidate(raw_sku_candidate, catalog)

    is_confirmation = bool(current_tokens & AFFIRMATION_TERMS) and "finish_change" not in merged_intents and any(
        msg.get("type") == "bot" and msg.get("products") for msg in history
    )

    missing_slots = []
    if not merged_surface:
        missing_slots.append("surface")
    if not merged_usage and "availability" not in merged_intents:
        missing_slots.append("usage")

    if latest_query.get("is_greeting", False):
        merged_intents = ["greeting"]
    elif not merged_intents:
        merged_intents = ["product_search"]

    return {
        "raw_query": query,
        "query": normalized_query.lower(),
        "tokens": tokens,
        "surfaces": [merged_surface] if merged_surface else [],
        "usage": merged_usage,
        "finish": merged_finish,
        "intents": merged_intents,
        "missing_slots": missing_slots,
        "is_greeting": latest_query.get("is_greeting", False),
        "exact_product_sku": exact_product,
        "raw_mentioned_sku": raw_sku_candidate,
        "suggested_product_sku": suggested_product_sku,
        "is_confirmation": is_confirmation,
        "selected_option": latest_query.get("selected_option"),
        "select_all": latest_query.get("select_all", False),
    }
