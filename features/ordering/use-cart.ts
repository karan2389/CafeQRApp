"use client";

import { useEffect, useMemo, useState } from "react";
import { CART_STORAGE_PREFIX, LIMITS } from "@/lib/constants";
import type { MenuItem, OrderLine } from "@/types";

export type CartMap = Record<string, number>;

export interface UseCartReturn {
  cart: CartMap;
  cartReady: boolean;
  cartLines: OrderLine[];
  cartQuantity: number;
  cartTotal: number;
  setQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
}

export function useCart(slug: string, menuItems: MenuItem[]): UseCartReturn {
  const [cart, setCart] = useState<CartMap>({});
  const [cartReady, setCartReady] = useState(false);
  const cartKey = `${CART_STORAGE_PREFIX}${slug}`;

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(cartKey);
        setCart(stored ? (JSON.parse(stored) as CartMap) : {});
      } catch {
        setCart({});
      }
      setCartReady(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [cartKey]);

  useEffect(() => {
    if (cartReady) {
      window.localStorage.setItem(cartKey, JSON.stringify(cart));
    }
  }, [cart, cartKey, cartReady]);

  const cartLines = useMemo(() => {
    return menuItems.flatMap((item) => {
      const quantity = cart[item.id] ?? 0;
      if (quantity <= 0) return [];
      const lineTotal = Math.round(item.price * quantity * 100) / 100;
      return [
        {
          menuItemId: item.id,
          section: item.section,
          name: item.name,
          unitPrice: item.price,
          quantity,
          lineTotal,
          unitPricePaise: item.price * 100,
          lineTotalPaise: lineTotal * 100,
        },
      ];
    });
  }, [cart, menuItems]);

  const cartQuantity = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.quantity, 0),
    [cartLines]
  );

  const cartTotal = useMemo(
    () => Math.round(cartLines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100,
    [cartLines]
  );

  const setQuantity = (id: string, quantity: number) => {
    const boundedQuantity = Math.max(0, Math.min(LIMITS.MAX_ITEM_QUANTITY, quantity));
    setCart((current) => {
      const next = { ...current };
      if (boundedQuantity === 0) {
        delete next[id];
      } else {
        next[id] = boundedQuantity;
      }
      return next;
    });
  };

  const clearCart = () => {
    setCart({});
    try {
      window.localStorage.removeItem(cartKey);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  return {
    cart,
    cartReady,
    cartLines,
    cartQuantity,
    cartTotal,
    setQuantity,
    clearCart,
  };
}
