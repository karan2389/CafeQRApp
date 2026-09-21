import { z } from "zod";

export const tableStatusSchema = z.enum(["ACTIVE", "CLOSED"]);

export const tableParamSchema = z.object({
  slug: z.string().min(1, "Table slug is required"),
});

export const closeTableSchema = z.object({
  tableId: z.string().min(1, "Table ID is required"),
});
