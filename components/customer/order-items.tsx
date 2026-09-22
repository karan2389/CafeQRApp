import { formatINR } from "@/lib/format";
import type { MenuSection, OrderLine } from "@/types";

export interface OrderItemsProps {
  lines: OrderLine[];
  section: MenuSection;
}

export function OrderItems({ lines, section }: OrderItemsProps) {
  const filtered = lines.filter((line) => line.section === section);
  if (!filtered.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#8c7465]">
        {section === "MAIN" ? "Main Menu" : "Puffs · 18+"}
      </p>
      {filtered.map((line) => (
        <div key={line.menuItemId} className="flex items-start justify-between gap-4 text-sm">
          <p>
            <span className="mr-2 font-bold">{line.quantity}×</span>
            {line.name}
          </p>
          <p className="whitespace-nowrap font-semibold">{formatINR(line.lineTotal)}</p>
        </div>
      ))}
    </div>
  );
}
