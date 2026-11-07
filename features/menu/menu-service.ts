import { menuItems as fallbackMenuItems } from "@/app/lib/demo-data";
import type { MenuItem, MenuCategory, MenuSection } from "@/types";
import type { DbMenuItem } from "@/types/database";

export interface MenuFetchResult {
  items: MenuItem[];
  categories: MenuCategory[];
  isFallback: boolean;
  dataSource: "fallback";
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

function deriveCategoriesFromItems(items: MenuItem[]): MenuCategory[] {
  const uniqueCategoryNames = Array.from(new Set(items.map((item) => item.category)));

  return uniqueCategoryNames.map((name, index) => {
    const isPuff = name.toLowerCase() === "puffs";
    return {
      id: `cat-fallback-${index + 1}`,
      name,
      section: isPuff ? "PUFFS" : "MAIN",
      sortOrder: index + 1,
      isActive: true,
    };
  });
}

/**
 * Fallback menu data provider for testing and unconfigured environments.
 * Active production application uses Convex `api.menu.getPublicMenu`.
 */
export async function fetchMenuData(): Promise<MenuFetchResult> {
  return {
    items: fallbackMenuItems,
    categories: deriveCategoriesFromItems(fallbackMenuItems),
    isFallback: true,
    dataSource: "fallback",
  };
}
