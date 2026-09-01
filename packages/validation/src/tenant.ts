import { z } from "zod";

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    timezone: z.string().trim().min(3).max(64),
  })
  .partial()
  .strict();
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
