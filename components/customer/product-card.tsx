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
  return (
    <article className={`courista-product ${unavailable ? "is-unavailable" : ""}`}>
      <div className="courista-product-photo">
        <Image src={resolveImageUrl(item.image)} alt={item.name} fill sizes="(max-width: 480px) 88px, (max-width: 768px) 112px, 128px" className="object-cover" />
      </div>
      <div className="courista-product-info">
        <h3>{item.name}</h3>
        {item.description && <p className="courista-product-description">{item.description}</p>}
        <strong>{formatINR(item.price)}</strong>
        {unavailable && <span className="courista-unavailable">Unavailable</span>}
      </div>
      <div className="courista-product-controls">
        {quantity === 0 ? (
          <button type="button" className="courista-add" disabled={disabled || unavailable} onClick={() => onChange(1)} aria-label={`Add ${item.name}`}><Plus size={21} strokeWidth={2.5} /><span>Add</span></button>
        ) : (
          <div className="courista-stepper" aria-label={`${item.name}, ${quantity} in cart`}>
            <button type="button" disabled={disabled || unavailable} onClick={() => onChange(quantity - 1)} aria-label={`Remove one ${item.name}`}><Minus size={18} /></button>
            <span aria-live="polite">{quantity}</span>
            <button type="button" disabled={disabled || unavailable || quantity >= 10} onClick={() => onChange(quantity + 1)} aria-label={`Add one ${item.name}`}><Plus size={18} /></button>
          </div>
        )}
      </div>
    </article>
  );
}
