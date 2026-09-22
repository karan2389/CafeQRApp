import Image from "next/image";
import { Minus, Plus } from "lucide-react";
import { formatINR } from "@/lib/format";
import { resolveImageUrl } from "@/lib/r2";
import type { MenuItem } from "@/types";

export interface ProductCardProps {
  item: MenuItem;
  quantity: number;
  disabled: boolean;
  onChange: (next: number) => void;
}

export function ProductCard({ item, quantity, disabled, onChange }: ProductCardProps) {
  const unavailable = !item.available;
  const imageSrc = resolveImageUrl(item.image);

  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-[#e4d9ca] bg-[#fffdf8] shadow-[0_14px_36px_rgba(66,42,27,.07)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#e9dfd1]">
        <Image
          className="object-cover transition-transform duration-500 hover:scale-[1.03]"
          src={imageSrc}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 420px"
        />
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${
            unavailable ? "bg-[#2f2723]/85 text-white" : "bg-white/90 text-[#496443]"
          }`}
        >
          {unavailable ? "Unavailable" : "Available"}
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9b6d50]">{item.category}</p>
            <h3 className="font-display mt-1 text-[1.35rem] font-semibold leading-tight">{item.name}</h3>
          </div>
          <p className="whitespace-nowrap font-bold">{formatINR(item.price)}</p>
        </div>
        <p className="mt-2 min-h-12 text-sm leading-6 text-[var(--muted-ink)]">{item.description}</p>
        <div className="mt-4 flex items-center justify-end">
          <div
            className={`flex h-12 items-center rounded-full border p-1 ${
              unavailable ? "border-[#e5ddd2] bg-[#f0ebe3]" : "border-[#d8c9b9] bg-white"
            }`}
          >
            <button
              aria-label={`Remove one ${item.name}`}
              disabled={disabled || unavailable || quantity === 0}
              onClick={() => onChange(Math.max(0, quantity - 1))}
              className="grid h-10 w-10 place-items-center rounded-full text-[#4a211a] disabled:opacity-25"
            >
              <Minus size={17} />
            </button>
            <span className="w-9 text-center text-sm font-extrabold" aria-live="polite">
              {quantity}
            </span>
            <button
              aria-label={`Add one ${item.name}`}
              disabled={disabled || unavailable || quantity >= 10}
              onClick={() => onChange(quantity + 1)}
              className="grid h-10 w-10 place-items-center rounded-full bg-[#4a211a] text-white shadow-sm disabled:bg-[#bcb2a8]"
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
