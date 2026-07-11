import hashlib
import json
import math
import os
from pathlib import Path

from openai import OpenAI


INDEX_PATH = Path(__file__).resolve().parents[1] / "data" / "embedding_index.json"
DEFAULT_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")


def product_embedding_text(product):
    return " | ".join(
        [
            product["sku"],
            product["name"],
            product["category"],
            product["description"],
            f"surface: {product['surface']}",
            f"usage: {product['usage']}",
            f"finish: {product['finish']}",
            f"color: {product['color']}",
            "features: " + ", ".join(product.get("features", [])),
            "use cases: " + ", ".join(product.get("use_cases", [])),
            "reviews: " + " ".join(product.get("reviews", [])),
            "replaces: " + ", ".join(product.get("replaces", [])),
        ]
    )


def _catalog_hash(products):
    payload = json.dumps(products, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cosine_similarity(left, right):
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0
    return dot / (left_norm * right_norm)


def _load_cached_index(products, model):
    if not INDEX_PATH.exists():
        return None

    try:
        with INDEX_PATH.open(encoding="utf-8") as f:
            index = json.load(f)
    except json.JSONDecodeError:
        return None

    if index.get("catalog_hash") != _catalog_hash(products):
        return None
    if index.get("model") != model:
        return None
    return index


def _save_index(index):
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with INDEX_PATH.open("w", encoding="utf-8") as f:
        json.dump(index, f)


def _create_embeddings(texts, model):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.embeddings.create(model=model, input=texts, encoding_format="float")
    return [item.embedding for item in response.data]


def build_or_load_embedding_index(products):
    model = DEFAULT_MODEL
    cached = _load_cached_index(products, model)
    if cached:
        cached["source"] = "cache"
        return cached

    texts = [product_embedding_text(product) for product in products]
    embeddings = _create_embeddings(texts, model)
    index = {
        "model": model,
        "catalog_hash": _catalog_hash(products),
        "source": "openai",
        "items": [
            {"sku": product["sku"], "text": text, "embedding": embedding}
            for product, text, embedding in zip(products, texts, embeddings)
        ],
    }
    _save_index(index)
    return index


def semantic_scores(query, products):
    if not os.getenv("OPENAI_API_KEY"):
        return {}, "fallback_no_api_key"

    try:
        index = build_or_load_embedding_index(products)
        query_embedding = _create_embeddings([query], index["model"])[0]
    except Exception:
        return {}, "fallback_embedding_error"

    scores = {}
    for item in index["items"]:
        scores[item["sku"]] = _cosine_similarity(query_embedding, item["embedding"])

    return scores, f"openai_embeddings_{index.get('source', 'live')}"
