import io
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

from agents.clarification_agent import clarification_agent
from agents.content_agent import enrich_product_content
from agents.discoverability_agent import (
    catalog_governance_report,
    discoverability_report,
    usecase_status_report,
)
from agents.embedding_agent import DEFAULT_MODEL
from agents.feedback_agent import analytics_summary, apply_behavior_boost, load_events, log_event, log_query
from agents.intent_agent import conversation_intent
from agents.knowledge_graph_agent import knowledge_graph_snapshot
from agents.recommendation_agent import recommendation_agent
from agents.response_agent import response_agent
from agents.search_agent import load_products, search_agent


app = FastAPI(title="Akzo AI Product Search", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _catalog_map(catalog):
    return {product["sku"]: product for product in catalog}


def _resolve_catalog_product(catalog_by_sku, product_like):
    if not product_like:
        return None
    sku = product_like.get("sku")
    if sku and sku in catalog_by_sku:
        return enrich_product_content(catalog_by_sku[sku])
    return product_like


def _last_products_from_history(history):
    return next(
        (msg.get("products", []) for msg in reversed(history) if msg.get("type") == "bot" and msg.get("products")),
        [],
    )


def _selected_product_from_history(history, catalog_by_sku):
    for msg in reversed(history):
        if msg.get("type") != "bot":
            continue
        intent = msg.get("intent") or {}
        selected = intent.get("selected_product") or msg.get("selected_product")
        if selected:
            return _resolve_catalog_product(catalog_by_sku, selected)
        products = msg.get("products") or []
        if len(products) == 1:
            return _resolve_catalog_product(catalog_by_sku, products[0])
    return None


def _selected_product_from_options(last_products, intent_data, catalog_by_sku):
    selected_option = intent_data.get("selected_option")
    if selected_option is not None and 0 <= selected_option < len(last_products):
        return _resolve_catalog_product(catalog_by_sku, last_products[selected_option])

    exact_product_sku = intent_data.get("exact_product_sku")
    if exact_product_sku:
        for product in last_products:
            if product.get("sku") == exact_product_sku:
                return _resolve_catalog_product(catalog_by_sku, product)

    raw_query = (intent_data.get("raw_query") or "").strip().lower()
    if raw_query:
        compact_query = "".join(ch for ch in raw_query if ch.isalnum())
        helper_words = {
            "please", "add", "into", "to", "cart", "show", "details", "detail", "about",
            "the", "product", "want", "me", "would", "like", "more", "info", "information",
            "need", "put", "in", "for", "now",
        }
        candidate_words = [
            token for token in (intent_data.get("tokens") or []) if token not in helper_words
        ]
        candidate_compact = "".join(candidate_words)
        for product in last_products:
            product_name = product.get("name", "").lower()
            product_compact = "".join(ch for ch in product_name if ch.isalnum())
            if product_name == raw_query:
                return _resolve_catalog_product(catalog_by_sku, product)
            if candidate_compact and (
                candidate_compact in product_compact or product_compact.startswith(candidate_compact)
            ):
                return _resolve_catalog_product(catalog_by_sku, product)
            if compact_query and product_compact in compact_query:
                return _resolve_catalog_product(catalog_by_sku, product)

    return None


def _single_turn_response(response, intent, products=None, next_question=None):
    return {
        "response": response,
        "products": products or [],
        "intent": intent,
        "history_count": 0,
        "steps": [],
        "reason": None,
        "next_question": next_question,
    }


def _is_available_product(product):
    return bool(product and product.get("available", True) and product.get("stock", 0) > 0)


def _collapse_repeated_phrases(text: str) -> str:
    parts = [part.strip() for part in re.split(r"[.!?]+", text) if part.strip()]
    if not parts:
        return text.strip()

    collapsed = []
    previous = None
    for part in parts:
        normalized = " ".join(part.lower().split())
        if normalized != previous:
            collapsed.append(part)
            previous = normalized

    return ". ".join(collapsed).strip()


class Query(BaseModel):
    query: str
    history: Optional[List[Dict[str, Any]]] = []


class Feedback(BaseModel):
    event_type: str
    query: Optional[str] = None
    sku: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "akzo-ai-product-search",
        "embedding_model": DEFAULT_MODEL,
    }


@app.get("/products")
def products():
    return {"products": [enrich_product_content(product) for product in load_products()]}


@app.get("/products/{sku}/qa")
def product_qa(sku: str):
    product = next((item for item in load_products() if item["sku"] == sku), None)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    enriched = enrich_product_content(product)
    return {"sku": sku, "summary": enriched["summary"], "qa": enriched["qa"]}


@app.get("/admin/analytics")
def admin_analytics():
    return analytics_summary()


@app.get("/admin/discoverability")
def admin_discoverability():
    return discoverability_report(load_products(), load_events())


@app.get("/admin/governance")
def admin_governance():
    return catalog_governance_report(load_products())


@app.get("/admin/knowledge-graph")
def admin_knowledge_graph():
    return knowledge_graph_snapshot(load_products())


@app.get("/admin/usecase-status")
def admin_usecase_status():
    return {"items": usecase_status_report()}


@app.post("/feedback")
def feedback(data: Feedback):
    event = log_event(
        event_type=data.event_type,
        query=data.query,
        sku=data.sku,
        metadata=data.metadata,
    )
    return {"status": "recorded", "event": event}


@app.post("/voice-search")
async def voice_search(audio: UploadFile = File(...)):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="OpenAI API key is not configured")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    buffer = io.BytesIO(audio_bytes)
    buffer.name = audio.filename or "voice.webm"
    catalog = load_products()
    product_hint = ", ".join(
        f"{item['name']} ({item['sku']})" for item in catalog[:8]
    )

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        transcript = client.audio.transcriptions.create(
            model=os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"),
            file=buffer,
            prompt=(
                "This is a paint and coatings shopping assistant. "
                "Important product and brand terms include: "
                f"{product_hint}. "
                "Common surfaces include metal, wood, wall, and concrete. "
                "Common usage terms include indoor and outdoor."
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Voice transcription failed: {exc}") from exc

    text = _collapse_repeated_phrases((getattr(transcript, "text", "") or "").strip())
    return {"text": text}


@app.post("/search")
def search(data: Query):
    user_query = data.query.strip()
    history = data.history or []

    if not user_query:
        return {
            "response": "Please enter what product you are looking for.",
            "products": [],
            "intent": {},
            "steps": [],
            "reason": None,
            "next_question": "Which surface are you working on?",
        }

    catalog = load_products()
    catalog_by_sku = _catalog_map(catalog)
    intent_data = conversation_intent(history, user_query, catalog)
    intent_set = set(intent_data.get("intents", []))
    last_products = _last_products_from_history(history)
    selected_product = _selected_product_from_history(history, catalog_by_sku)
    selected_from_options = _selected_product_from_options(last_products, intent_data, catalog_by_sku)

    if "gratitude" in intent_set:
        return {
            "response": "You're welcome. Let me know if you want help finding another product.",
            "products": [],
            "cart_item": None,
            "cart_items": [],
            "intent": intent_data,
            "history_count": len(history),
            "steps": [],
            "reason": None,
            "next_question": None,
        }

    if intent_data.get("is_greeting"):
        return {
            "response": "Hi, I can help you find the right paint or coating.",
            "products": [],
            "cart_item": None,
            "cart_items": [],
            "intent": intent_data,
            "history_count": len(history),
            "steps": [],
            "reason": None,
            "next_question": "What are you painting today: wall, wood, metal, or concrete?",
        }

    if intent_data.get("exact_product_sku"):
        selected_product = _resolve_catalog_product(catalog_by_sku, {"sku": intent_data["exact_product_sku"]})
    elif selected_from_options:
        selected_product = selected_from_options

    if (
        "availability" in intent_set
        and intent_data.get("exact_product_sku")
        and selected_product
    ):
        exact_unavailable_product = selected_product
        if not _is_available_product(selected_product):
            exact_candidates = recommendation_agent(
                [dict(selected_product, match_score=999.0)],
                catalog,
                intent_data,
            )
            if exact_candidates:
                exact_unavailable_product = enrich_product_content(exact_candidates[0])

        intent_data["selected_product"] = selected_product
        if _is_available_product(selected_product):
            response_text = (
                f"Yes, {selected_product['name']} (SKU {selected_product['sku']}) is available. "
                f"It is priced at Rs. {selected_product['price']} with {selected_product['stock']} units in stock."
            )
            next_question = (
                f"Would you like more details on {selected_product['name']} "
                f"or should I add it to your cart?"
            )
            return {
                "response": response_text,
                "products": [selected_product],
                "cart_item": None,
                "cart_items": [],
                "intent": intent_data,
                "history_count": len(history),
                "steps": [],
                "reason": None,
                "next_question": next_question,
            }
        response_text = (
            f"No, {selected_product['name']} (SKU {selected_product['sku']}) is currently unavailable."
        )
        next_question = (
            f"Would you like me to show replacements or similar available options for {selected_product['name']}?"
        )
        return {
            "response": response_text,
            "products": [exact_unavailable_product],
            "cart_item": None,
            "cart_items": [],
            "intent": intent_data,
            "history_count": len(history),
            "steps": [],
            "reason": None,
            "next_question": next_question,
        }

    if "add_to_cart" in intent_set:
        if intent_data.get("select_all") and last_products:
            cart_items = [
                _resolve_catalog_product(catalog_by_sku, product)
                for product in last_products
            ]
            for item in cart_items:
                if not item:
                    continue
                log_event(
                    event_type="add_to_cart",
                    query=user_query,
                    sku=item.get("sku"),
                    metadata={"product_name": item.get("name"), "source": "chat"},
                )
            names = ", ".join(item["name"] for item in cart_items if item)
            return {
                "response": f"Done. I added {names} to your cart.",
                "products": [],
                "cart_item": None,
                "cart_items": cart_items,
                "intent": intent_data,
                "history_count": len(history),
                "steps": [],
                "reason": None,
                "next_question": None,
            }

        if selected_product:
            intent_data["selected_product"] = selected_product
            log_event(
                event_type="add_to_cart",
                query=user_query,
                sku=selected_product.get("sku"),
                metadata={"product_name": selected_product.get("name"), "source": "chat"},
            )
            return {
                "response": f"Done. {selected_product['name']} has been added to your cart.",
                "products": [],
                "cart_item": selected_product,
                "cart_items": [selected_product],
                "intent": intent_data,
                "history_count": len(history),
                "steps": [],
                "reason": None,
                "next_question": None,
            }

        if len(last_products) > 1:
            names = " or ".join(product["name"] for product in last_products[:2])
            return {
                "response": "I can add one of those to your cart.",
                "products": [],
                "cart_item": None,
                "cart_items": [],
                "intent": intent_data,
                "history_count": len(history),
                "steps": [],
                "reason": None,
                "next_question": f"Which one should I add to your cart: {names}?",
            }

    if "product_details" in intent_set and selected_product:
        intent_data["selected_product"] = selected_product
        return {
            "response": f"{selected_product['summary']}",
            "products": [selected_product],
            "cart_item": None,
            "cart_items": [],
            "intent": intent_data,
            "history_count": len(history),
            "steps": [],
            "reason": None,
            "next_question": f"Would you like me to add {selected_product['name']} to your cart or show alternatives?",
        }

    if selected_from_options and len(last_products) > 1:
        intent_data["selected_product"] = selected_from_options
        next_question = clarification_agent(
            {**intent_data, "exact_product_sku": selected_from_options.get("sku")},
            [selected_from_options],
        )
        result = response_agent(
            [selected_from_options],
            {**intent_data, "exact_product_sku": selected_from_options.get("sku")},
            history,
            next_question,
        )
        return {
            "response": result["response"],
            "products": [selected_from_options],
            "cart_item": None,
            "cart_items": [],
            "intent": {**intent_data, "selected_product": selected_from_options},
            "history_count": len(history),
            "steps": result.get("steps", []),
            "reason": result.get("reason"),
            "next_question": result.get("next_question"),
        }

    if intent_data.get("is_confirmation"):
        if len(last_products) > 1 and not selected_product:
            names = " or ".join(product["name"] for product in last_products[:2])
            return {
                "response": "Please choose one product so I can continue.",
                "products": [],
                "cart_item": None,
                "cart_items": [],
                "intent": intent_data,
                "history_count": len(history),
                "steps": [],
                "reason": None,
                "next_question": f"Which one would you like: {names}?",
            }

        selected = selected_product or (last_products[0] if last_products else None)
        selected = _resolve_catalog_product(catalog_by_sku, selected)
        intent_data["selected_product"] = selected
        return {
            "response": f"Got it. {selected['name']} is selected." if selected else "Got it. That option is selected.",
            "products": [],
            "cart_item": None,
            "cart_items": [],
            "intent": intent_data,
            "history_count": len(history),
            "steps": [],
            "reason": None,
            "next_question": None,
        }

    if "finish_change" in intent_data.get("intents", []) and last_products:
        top_product = last_products[0]
        alt_skus = [alt.get("sku") for alt in top_product.get("alternatives", []) if alt.get("sku")]
        alternative_products = [
            enrich_product_content(product)
            for product in catalog
            if product["sku"] in alt_skus
        ]
        if alternative_products:
            for index, product in enumerate(alternative_products):
                product["best"] = index == 0
                product["status"] = "available" if product.get("available", True) and product.get("stock", 0) > 0 else "unavailable"
                product["insight"] = (
                    f"Suitable for {product['surface']} surfaces, {product['usage']} use, "
                    f"with a {product['finish']} finish."
                )
            next_question = clarification_agent(intent_data, alternative_products)
            result = response_agent(alternative_products, intent_data, history, next_question)
            return {
                "response": result["response"],
                "products": alternative_products,
                "cart_item": None,
                "cart_items": [],
                "intent": intent_data,
                "history_count": len(history),
                "steps": result.get("steps", []),
                "reason": result.get("reason"),
                "next_question": result.get("next_question"),
            }

    should_search = (
        not intent_data.get("missing_slots")
        or "replacement" in intent_data.get("intents", [])
        or "availability" in intent_set
        or bool(intent_data.get("exact_product_sku"))
    )

    if should_search:
        search_results = search_agent(intent_data, catalog)
        boosted_results = apply_behavior_boost(search_results)
        recommendations = recommendation_agent(boosted_results, catalog, intent_data)
        enriched_products = [enrich_product_content(product) for product in recommendations]
    else:
        enriched_products = []

    next_question = clarification_agent(intent_data, enriched_products)
    result = response_agent(enriched_products, intent_data, history, next_question)

    log_query(user_query, enriched_products)

    return {
        "response": result["response"],
        "products": enriched_products,
        "cart_item": None,
        "cart_items": [],
        "intent": intent_data,
        "history_count": len(history),
        "steps": result.get("steps", []),
        "reason": result.get("reason"),
        "next_question": result.get("next_question"),
    }
