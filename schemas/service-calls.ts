import { z } from "zod";

export const staffCallStatusSchema = z.enum(["PENDING", "ACKNOWLEDGED"]);

export const createStaffCallSchema = z.object({
  tableId: z.string().min(1, "Table ID is required"),
});

export const acknowledgeStaffCallSchema = z.object({
  callId: z.string().min(1, "Call ID is required"),
  tableId: z.string().min(1, "Table ID is required"),
});
