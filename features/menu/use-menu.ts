"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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

function deriveCategories(items: MenuItem[]): MenuCategory[] {
  const names = Array.from(new Set(items.map((i) => i.category)));
  return names.map((name, index) => ({
    id: `cat-${index + 1}`,
    name,
    section: name.toLowerCase() === "puffs" ? "PUFFS" : "MAIN",
    sortOrder: index + 1,
    isActive: true,
  }));
}

export function useMenu(): UseMenuReturn {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  // If Convex URL is set, subscribe reactively to public menu catalog
  const convexMenu = useQuery(api.menu.getPublicMenu, convexUrl ? {} : "skip");

  const { items, categories, loading, isFallback } = useMemo(() => {
    // 1. If Convex is unconfigured, fallback immediately
    if (!convexUrl) {
      return {
        items: fallbackMenuItems,
        categories: deriveCategories(fallbackMenuItems),
        loading: false,
        isFallback: true,
      };
    }

    // 2. If Convex is querying and data hasn't arrived yet
    if (convexMenu === undefined) {
      return {
        items: fallbackMenuItems,
        categories: deriveCategories(fallbackMenuItems),
        loading: true,
        isFallback: false,
      };
    }

    // 3. If Convex returned active categories
    if (Array.isArray(convexMenu) && convexMenu.length > 0) {
      const mappedItems: MenuItem[] = convexMenu.flatMap((cat) =>
        cat.items.map((item) => {
          const isPuff =
            Boolean(item.requiresAgeConfirmation) ||
            cat.slug === "puffs" ||
            cat.name.toLowerCase() === "puffs";

          return {
            id: item._id,
            section: isPuff ? "PUFFS" : "MAIN",
            category: cat.name,
            name: item.name,
            description: item.description ?? "",
            price: item.pricePaise / 100, // Displayed in rupees
            image: item.imageUrl ?? "/menu/cortado.svg",
            available: true,
          };
        })
      );

      const mappedCategories: MenuCategory[] = convexMenu.map((cat) => ({
        id: cat._id,
        name: cat.name,
        section:
          cat.slug === "puffs" || cat.name.toLowerCase() === "puffs" ? "PUFFS" : "MAIN",
        sortOrder: cat.displayOrder,
        isActive: true,
      }));

      return {
        items: mappedItems.length > 0 ? mappedItems : fallbackMenuItems,
        categories: mappedCategories.length > 0 ? mappedCategories : deriveCategories(fallbackMenuItems),
        loading: false,
        isFallback: mappedItems.length === 0,
      };
    }

    // 4. If Convex returned empty menu list
    return {
      items: fallbackMenuItems,
      categories: deriveCategories(fallbackMenuItems),
      loading: false,
      isFallback: true,
    };
  }, [convexUrl, convexMenu]);

  return {
    items,
    categories,
    loading,
    isFallback,
    refetch: async () => {},
  };
}
