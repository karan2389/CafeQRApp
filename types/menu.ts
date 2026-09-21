export type MenuSection = "MAIN" | "PUFFS";

export interface MenuItem {
  id: string;
  section: MenuSection;
  category: string;
  name: string;
  description: string;
  pricePaise: number;
  image: string;
  available: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  section: MenuSection;
  description?: string;
  sortOrder?: number;
  isActive: boolean;
}
