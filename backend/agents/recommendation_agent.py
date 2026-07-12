from agents.knowledge_graph_agent import bundle_recommendations, guided_selling_path


def _available(product):
    return product.get("available", True) and product.get("stock", 0) > 0


def _usage_compatible(base_usage, candidate_usage):
    if not base_usage or not candidate_usage:
        return True
    if base_usage == candidate_usage:
        return True
    return "indoor/outdoor" in {base_usage, candidate_usage}


def recommendation_agent(products, catalog, intent_data=None):
    catalog_by_sku = {product["sku"]: product for product in catalog}
    recommendations = []
    requested_usage = (intent_data or {}).get("usage")
    requested_surface = ((intent_data or {}).get("surfaces") or [None])[0]
    requested_finish = (intent_data or {}).get("finish")

    for index, product in enumerate(products):
        item = dict(product)
        item["best"] = index == 0 and _available(product)
        item["status"] = "available" if _available(product) else "unavailable"
        item["insight"] = (
            f"Suitable for {product['surface']} surfaces, {product['usage']} use, "
            f"with a {product['finish']} finish."
        )
        item["guided_path"] = guided_selling_path(product, intent_data)
        item["bundles"] = bundle_recommendations(product, catalog, intent_data)

        alternatives = []
        for sku in product.get("alternatives", []):
            alternative = catalog_by_sku.get(sku)
            if not alternative or not _available(alternative):
                continue
            if requested_surface and alternative["surface"] != requested_surface:
                continue
            base_usage = requested_usage or product["usage"]
            if base_usage and not _usage_compatible(base_usage, alternative["usage"]):
                continue
            if alternative["surface"] != product["surface"]:
                continue
            if not _usage_compatible(product["usage"], alternative["usage"]):
                continue
            if alternative["sku"] == product["sku"]:
                continue
            if alternative and _available(alternative):
                alternatives.append(
                    {
                        "sku": alternative["sku"],
                        "name": alternative["name"],
                        "reason": (
                            f"Available replacement for {product['surface']} "
                            f"{product['usage']} requirements."
                        ),
                        "price": alternative["price"],
                        "stock": alternative["stock"],
                    }
                )

        if not _available(product) and alternatives:
            item["replacement"] = alternatives[0]

        item["alternatives"] = alternatives[:2]
        recommendations.append(item)

    if recommendations and not any(item.get("best") for item in recommendations):
        for item in recommendations:
            if item["status"] == "available":
                item["best"] = True
                break

    if not recommendations:
        return []

    intents = set((intent_data or {}).get("intents", []))
    exact_product = (intent_data or {}).get("exact_product_sku")

    if exact_product:
        for item in recommendations:
            if item["sku"] == exact_product:
                exact_item = dict(item)
                if "availability" in intents and exact_item["status"] == "available":
                    exact_item["alternatives"] = []
                    exact_item.pop("replacement", None)
                return [exact_item]

    if intents & {"replacement", "comparison"}:
        return recommendations[:2]

    if requested_surface and requested_usage and requested_finish:
        finish_compatible = [
            item
            for item in recommendations
            if item["surface"] == requested_surface
            and _usage_compatible(requested_usage, item["usage"])
            and item["status"] == "available"
            and item.get("finish") == requested_finish
        ]
        if finish_compatible:
            return finish_compatible[:3]

    if requested_surface and requested_usage:
        compatible = [
            item
            for item in recommendations
            if item["surface"] == requested_surface
            and _usage_compatible(requested_usage, item["usage"])
            and item["status"] == "available"
        ]
        if compatible:
            return compatible[:3]

    top = recommendations[0]
    if top["status"] == "available":
        return [top]

    return recommendations[:2]
