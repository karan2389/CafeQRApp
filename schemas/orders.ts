import { z } from "zod";

export const menuSectionSchema = z.enum(["MAIN", "PUFFS"]);

export const orderStatusSchema = z.enum(["NEW", "PREPARING", "DELIVERED"]);

export const orderLineSchema = z.object({
  menuItemId: z.string().min(1, "Menu item ID is required"),
  section: menuSectionSchema,
  name: z.string().min(1, "Item name is required"),
  unitPricePaise: z.number().int().nonnegative("Unit price must be non-negative"),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(10, "Quantity cannot exceed 10"),
  lineTotalPaise: z.number().int().nonnegative("Line total must be non-negative"),
});

export const createOrderSchema = z.object({
  tableId: z.string().min(1, "Table ID is required"),
  customerName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must not exceed 50 characters"),
  kitchenNote: z
    .string()
    .trim()
    .max(160, "Kitchen note must not exceed 160 characters")
    .optional()
    .default(""),
  items: z.array(orderLineSchema).min(1, "At least one item is required to place an order"),
  idempotencyKey: z.string().min(1, "Idempotency key is required"),
});

export type OrderLineInput = z.infer<typeof orderLineSchema>;
export type CreateOrderSchemaInput = z.infer<typeof createOrderSchema>;
