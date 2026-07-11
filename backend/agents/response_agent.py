import json
import os

from openai import OpenAI


def _fallback_response(products, intent_data, next_question):
    if intent_data.get("is_confirmation"):
        selected = intent_data.get("selected_product")
        if selected:
            response_text = f"Great. {selected['name']} is selected."
        else:
            response_text = "Great. That option is selected."
        return {
            "response": response_text,
            "steps": [],
            "reason": None,
            "next_question": None,
        }

    if intent_data.get("is_greeting"):
        return {
            "response": "Hi, I can help you find the right paint or coating.",
            "steps": [],
            "reason": None,
            "next_question": next_question,
        }

    if not products:
        return {
            "response": "Sure, I can help with that.",
            "steps": [],
            "reason": None,
            "next_question": next_question,
        }

    best = products[0]
    response_parts = []

    if best.get("status") == "unavailable" and best.get("replacement"):
        replacement = best["replacement"]
        response_parts.append(
            f"{best['name']} is currently unavailable, so I recommend {replacement['name']} "
            f"as the closest replacement."
        )
    else:
        response_parts.append(
            f"My best match is {best['name']} for {best['surface']} {best['usage']} use."
        )

    if best.get("summary"):
        response_parts.append(best["summary"])

    if len(products) > 1:
        names = ", ".join(product["name"] for product in products[1:3])
        response_parts.append(f"I also found alternatives: {names}.")

    return {
        "response": " ".join(response_parts),
        "steps": [],
        "reason": None,
        "next_question": next_question,
    }


def response_agent(products, intent_data, history, fallback_question=None):
    if not os.getenv("OPENAI_API_KEY"):
        return _fallback_response(products, intent_data, fallback_question)

    simplified_history = [
        {"type": msg.get("type"), "text": msg.get("text")}
        for msg in history[-6:]
    ]

    selected = intent_data.get("selected_product")
    prompt_payload = {
        "history": simplified_history,
        "intent": intent_data,
        "products": [
            {
                "sku": product.get("sku"),
                "name": product.get("name"),
                "summary": product.get("summary"),
                "status": product.get("status"),
                "surface": product.get("surface"),
                "usage": product.get("usage"),
                "finish": product.get("finish"),
                "price": product.get("price"),
                "stock": product.get("stock"),
                "alternatives": product.get("alternatives", []),
                "replacement": product.get("replacement"),
            }
            for product in products
        ],
        "selected_product": {
            "sku": selected.get("sku"),
            "name": selected.get("name"),
            "finish": selected.get("finish"),
        }
        if selected
        else None,
        "fallback_question": fallback_question,
    }

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        completion = client.chat.completions.create(
            model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1-mini"),
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are the customer-facing assistant for Akzo Product Assistant. "
                        "Generate natural shopping replies in JSON with keys response and next_question. "
                        "Rules: never mention internal agents, intent extraction, embeddings, scores, or backend logic. "
                        "If this is a greeting, keep it brief, warm, and natural. "
                        "Use a short greeting and then ask the first useful shopping question. "
                        "Do not sound stiff, formal, or repetitive. "
                        "If required details are missing, ask only one clear next question based on missing_slots. "
                        "If products are provided, recommend only those products and do not invent more. "
                        "If there is one available product, keep the response focused on that one product. "
                        "If multiple products are already shown, do not ask to show another finish again. "
                        "Instead ask the user to choose between the shown options or ask whether they want details on one of them. "
                        "When you ask the next question about shown products, use the full product names and any relevant finish details, not shorthand labels like satin or matte by themselves. "
                        "Only mention alternatives when the user asked for alternatives or replacement, or when the product is unavailable. "
                        "If there is one exact available product, keep the reply focused on that product and use a simple next question such as asking whether the user wants more details, add to cart, or alternatives. "
                        "For exact product availability questions, answer the availability directly and do not ask discovery questions about surface, usage, or project context. "
                        "For an available exact product, do not bring up alternatives unless the user explicitly asked for alternatives. "
                        "If this is a confirmation, acknowledge the selected option briefly and do not ask another discovery question. "
                        "Do not claim an order is confirmed, purchased, or added to cart unless the user explicitly asked for that action. "
                        "Keep the response concise and helpful."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(prompt_payload),
                },
            ],
        )

        content = completion.choices[0].message.content or "{}"
        parsed = json.loads(content)
        response_text = (parsed.get("response") or "").strip()
        next_question = parsed.get("next_question")
        next_question = next_question.strip() if isinstance(next_question, str) and next_question.strip() else None

        if intent_data.get("is_confirmation"):
            next_question = None

        if next_question and response_text:
            lowered_response = response_text.lower()
            lowered_question = next_question.lower()
            if lowered_response.endswith(lowered_question):
                response_text = response_text[: -len(next_question)].rstrip(" .:?")
            elif lowered_question in lowered_response:
                response_text = response_text.replace(next_question, "").strip(" .:?")

        if not response_text:
            return _fallback_response(products, intent_data, fallback_question)

        return {
            "response": response_text,
            "steps": [],
            "reason": None,
            "next_question": next_question,
        }
    except Exception:
        return _fallback_response(products, intent_data, fallback_question)
