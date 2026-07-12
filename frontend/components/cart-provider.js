"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-provider";

const STORAGE_KEY_PREFIX = "akzo-product-cart";
const CartContext = createContext(null);

function normalizeProduct(product) {
  if (!product) return null;
  return {
    sku: product.sku,
    name: product.name,
    price: Number(product.price || 0),
    uom: product.uom || "Unit",
    finish: product.finish || "",
    color: product.color || "",
    surface: product.surface || "",
    usage: product.usage || "",
    stock: Number(product.stock || 0),
    quantity: 1,
  };
}

export function CartProvider({ children }) {
  const { user, hydrated: authHydrated } = useAuth();
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const storageKey = user?.email
    ? `${STORAGE_KEY_PREFIX}-${user.role}-${user.email}`
    : null;

  useEffect(() => {
    if (!authHydrated) return;

    if (!storageKey) {
      setItems([]);
      setHydrated(true);
      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        setItems(JSON.parse(stored));
      } else {
        setItems([]);
      }
    } catch {}
    setHydrated(true);
  }, [authHydrated, storageKey]);

  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {}
  }, [items, hydrated, storageKey]);

  const addItem = (product) => {
    const nextProduct = normalizeProduct(product);
    if (!nextProduct?.sku) return;

    setItems((current) => {
      const existing = current.find((item) => item.sku === nextProduct.sku);
      if (existing) {
        return current.map((item) =>
          item.sku === nextProduct.sku
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...current, nextProduct];
    });
  };

  const removeItem = (sku) => {
    setItems((current) => current.filter((item) => item.sku !== sku));
  };

  const updateQuantity = (sku, quantity) => {
    if (quantity <= 0) {
      removeItem(sku);
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.sku === sku ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const value = useMemo(() => {
    const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const cartTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return {
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      cartCount,
      cartTotal,
      hydrated,
    };
  }, [items, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
