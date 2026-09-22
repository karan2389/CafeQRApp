import { getSupabaseClient } from "@/lib/supabase/client";
import { menuItems as fallbackMenuItems } from "@/app/lib/demo-data";
import type { MenuItem, MenuCategory, MenuSection } from "@/types";
import type { DbMenuItem, DbMenuCategory } from "@/types/database";

export interface MenuFetchResult {
  items: MenuItem[];
  categories: MenuCategory[];
  isFallback: boolean;
  dataSource: "supabase" | "fallback";
  error?: string;
}

/**
 * Converts a database menu item row and its category name into the domain MenuItem model.
 * Note: Database price is stored in numeric(10, 2) Rupees and mapped directly to rupees (number).
 * No paise conversion occurs at this boundary.
 */
export function mapDbMenuItemToDomain(
  item: DbMenuItem,
  categoryName: string,
  categorySlug?: string
): MenuItem {
  // Puffs require age confirmation or belong to the puffs category
  const isPuff =
    item.requires_age_confirmation ||
    categorySlug === "puffs" ||
    categoryName.toLowerCase() === "puffs";
  const section: MenuSection = isPuff ? "PUFFS" : "MAIN";

  // Directly parse the rupee numeric value
  const priceRupees = Number(item.price);

  return {
    id: item.id,
    section,
    category: categoryName,
    name: item.name,
    description: item.description ?? "",
    price: Number.isFinite(priceRupees) ? priceRupees : 0,
    image: item.image_url ?? "/menu/cortado.svg",
    available: item.is_available,
  };
}

/**
 * Fetches active menu categories and items from Supabase in a read-only manner.
 * Scoped to the active branch to prevent cross-branch data exposure.
 *
 * If Supabase is unconfigured, unreachable, or returns 0 records, it safely falls back
 * to the local demo menu dataset and logs a controlled development warning.
 */
export async function fetchMenuData(branchSlug: string = "ember-and-oak"): Promise<MenuFetchResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      items: fallbackMenuItems,
      categories: deriveCategoriesFromItems(fallbackMenuItems),
      isFallback: true,
      dataSource: "fallback",
    };
  }

  try {
    // 1. Resolve Branch ID to ensure queries do not expose data from other branches
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id")
      .eq("slug", branchSlug)
      .maybeSingle();

    if (branchError || !branch) {
      console.warn(
        `[MenuService] Branch '${branchSlug}' not found or unreachable, using demo fallback.`,
        branchError?.message
      );
      return {
        items: fallbackMenuItems,
        categories: deriveCategoriesFromItems(fallbackMenuItems),
        isFallback: true,
        dataSource: "fallback",
        error: branchError?.message ?? "Branch not found",
      };
    }

    // 2. Fetch active menu categories for this branch ordered by display_order
    const { data: categoriesData, error: categoriesError } = await supabase
      .from("menu_categories")
      .select("*")
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (categoriesError) {
      console.warn(
        "[MenuService] Failed to fetch menu categories from Supabase, using demo fallback:",
        categoriesError.message
      );
      return {
        items: fallbackMenuItems,
        categories: deriveCategoriesFromItems(fallbackMenuItems),
        isFallback: true,
        dataSource: "fallback",
        error: categoriesError.message,
      };
    }

    const categoryIds = (categoriesData || []).map((c) => c.id);
    if (categoryIds.length === 0) {
      console.warn("[MenuService] No active categories found for branch. Using demo fallback data.");
      return {
        items: fallbackMenuItems,
        categories: deriveCategoriesFromItems(fallbackMenuItems),
        isFallback: true,
        dataSource: "fallback",
      };
    }

    // 3. Fetch menu items for these active categories ordered by display_order
    const { data: itemsData, error: itemsError } = await supabase
      .from("menu_items")
      .select("*")
      .in("category_id", categoryIds)
      .order("display_order", { ascending: true });

    if (itemsError) {
      console.warn(
        "[MenuService] Failed to fetch menu items from Supabase, using demo fallback:",
        itemsError.message
      );
      return {
        items: fallbackMenuItems,
        categories: deriveCategoriesFromItems(fallbackMenuItems),
        isFallback: true,
        dataSource: "fallback",
        error: itemsError.message,
      };
    }

    if (!itemsData || itemsData.length === 0) {
      console.warn(
        "[MenuService] Supabase returned empty menu items table. Using demo fallback data."
      );
      return {
        items: fallbackMenuItems,
        categories: deriveCategoriesFromItems(fallbackMenuItems),
        isFallback: true,
        dataSource: "fallback",
      };
    }

    // 4. Map categories and associate with items
    const categoriesMap = new Map<string, DbMenuCategory>();
    const mappedCategories: MenuCategory[] = (categoriesData || []).map((cat) => {
      categoriesMap.set(cat.id, cat);
      return {
        id: cat.id,
        name: cat.name,
        section: cat.slug === "puffs" ? "PUFFS" : "MAIN",
        sortOrder: cat.display_order,
        isActive: cat.is_active,
      };
    });

    // 5. Map items and preserve ordering
    const mappedItems: MenuItem[] = itemsData.map((dbItem) => {
      const category = categoriesMap.get(dbItem.category_id);
      const categoryName = category?.name ?? "Special";
      const categorySlug = category?.slug;
      return mapDbMenuItemToDomain(dbItem, categoryName, categorySlug);
    });

    return {
      items: mappedItems,
      categories: mappedCategories,
      isFallback: false,
      dataSource: "supabase",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      "[MenuService] Unexpected exception fetching menu from Supabase, using demo fallback:",
      message
    );
    return {
      items: fallbackMenuItems,
      categories: deriveCategoriesFromItems(fallbackMenuItems),
      isFallback: true,
      dataSource: "fallback",
      error: message,
    };
  }
}

function deriveCategoriesFromItems(items: MenuItem[]): MenuCategory[] {
  const categoryNames = Array.from(new Set(items.map((i) => i.category)));
  return categoryNames.map((name, index) => ({
    id: `cat-${index + 1}`,
    name,
    section: name.toLowerCase() === "puffs" ? "PUFFS" : "MAIN",
    sortOrder: index + 1,
    isActive: true,
  }));
}
