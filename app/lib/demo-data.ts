import type { DemoOrder, DemoState, MenuItem, OrderLine } from "./types";

export const menuItems: MenuItem[] = [
  { id: "M001", section: "MAIN", category: "Coffee", name: "Cortado", description: "Double espresso softened with warm textured milk.", price: 190, image: "/menu/cortado.svg", available: true },
  { id: "M002", section: "MAIN", category: "Coffee", name: "Sea Salt Mocha", description: "Dark cocoa, espresso and a delicate sea-salt cream.", price: 260, image: "/menu/mocha.svg", available: true },
  { id: "M003", section: "MAIN", category: "Cold", name: "Citrus Cold Brew", description: "Slow-steeped coffee lifted with orange and tonic.", price: 240, image: "/menu/cold-brew.svg", available: true },
  { id: "M004", section: "MAIN", category: "Breakfast", name: "Forest Toast", description: "Sourdough, whipped feta, mushrooms and herbs.", price: 320, image: "/menu/toast.svg", available: true },
  { id: "M005", section: "MAIN", category: "Bowls", name: "Harvest Grain Bowl", description: "Millets, roasted vegetables, greens and sesame dressing.", price: 360, image: "/menu/bowl.svg", available: true },
  { id: "M006", section: "MAIN", category: "Bakes", name: "Burnt Honey Croissant", description: "Flaky butter pastry glazed with toasted wildflower honey.", price: 220, image: "/menu/croissant.svg", available: false },
  { id: "P001", section: "PUFFS", category: "Puffs", name: "Cool Mint", description: "A crisp, cool profile with a clean finish.", price: 650, image: "/menu/puffs.svg", available: true },
  { id: "P002", section: "PUFFS", category: "Puffs", name: "Berry Ice", description: "Bright berry notes with a chilled finish.", price: 680, image: "/menu/puffs.svg", available: true },
  { id: "P003", section: "PUFFS", category: "Puffs", name: "Citrus Rush", description: "Fresh citrus with a light cooling edge.", price: 680, image: "/menu/puffs.svg", available: true },
  { id: "P004", section: "PUFFS", category: "Puffs", name: "Classic Gold", description: "A mellow, rounded classic profile.", price: 720, image: "/menu/puffs.svg", available: false },
];

const line = (id: string, quantity: number): OrderLine => {
  const item = menuItems.find((entry) => entry.id === id)!;
  const lineTotal = item.price * quantity;
  return {
    menuItemId: item.id,
    section: item.section,
    name: item.name,
    unitPrice: item.price,
    quantity,
    lineTotal,
    unitPricePaise: item.price * 100,
    lineTotalPaise: lineTotal * 100,
  };
};

function seedOrder(
  id: string,
  tableId: string,
  name: string,
  status: DemoOrder["status"],
  minutesAgo: number,
  itemIds: Array<[string, number]>,
  note = ""
): DemoOrder {
  const items = itemIds.map(([itemId, quantity]) => line(itemId, quantity));
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const time = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id,
    orderNumber: `#${id.slice(-4)}`,
    idempotencyKey: `seed-${id}`,
    tableId,
    customerName: name,
    kitchenNote: note,
    items,
    subtotal: total,
    total,
    subtotalPaise: total * 100,
    totalPaise: total * 100,
    status,
    createdAt: time,
    updatedAt: time,
  };
}

export function createInitialState(): DemoState {
  return {
    version: 2,
    tables: [
      { id: "table-1", slug: "table-1", label: "Table 1", status: "ACTIVE" },
      { id: "table-2", slug: "table-2", label: "Table 2", status: "ACTIVE" },
      { id: "table-3", slug: "table-3", label: "Table 3", status: "ACTIVE" },
      { id: "table-4", slug: "table-4", label: "Table 4", status: "ACTIVE" },
      { id: "table-5", slug: "table-5", label: "Table 5", status: "CLOSED" },
      { id: "table-6", slug: "table-6", label: "Table 6", status: "ACTIVE" },
    ],
    orders: [
      seedOrder("order-2402", "table-2", "Mira", "NEW", 4, [["M001", 2], ["M004", 1]], "One coffee without sugar."),
      seedOrder("order-2403", "table-3", "Kabir", "PREPARING", 11, [["M003", 1], ["P001", 1]]),
      seedOrder("order-2404", "table-4", "Riya", "DELIVERED", 24, [["M005", 2]]),
    ],
    staffCalls: [{ id: "call-seed-6", tableId: "table-6", status: "PENDING", createdAt: new Date(Date.now() - 2 * 60_000).toISOString() }],
  };
}
