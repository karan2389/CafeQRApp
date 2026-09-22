"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchMenuData } from "./menu-service";
import { menuItems as fallbackMenuItems } from "@/app/lib/demo-data";
import type { MenuItem, MenuCategory } from "@/types";

export interface UseMenuReturn {
  items: MenuItem[];
  categories: MenuCategory[];
  loading: boolean;
  isFallback: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

export function useMenu(): UseMenuReturn {
  const [items, setItems] = useState<MenuItem[]>(fallbackMenuItems);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMenuData();
      setItems(result.items);
      setCategories(result.categories);
      setIsFallback(result.isFallback);
      setError(result.error);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const timer = window.setTimeout(() => {
      void fetchMenuData().then(
        (result) => {
          if (!isMounted) return;
          setItems(result.items);
          setCategories(result.categories);
          setIsFallback(result.isFallback);
          setError(result.error);
          setLoading(false);
        },
        (err: unknown) => {
          if (!isMounted) return;
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          setIsFallback(true);
          setLoading(false);
        }
      );
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, []);

  return {
    items,
    categories,
    loading,
    isFallback,
    error,
    refetch,
  };
}
