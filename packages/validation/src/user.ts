import { z } from "zod";

export const userRoleSchema = z.enum(["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"]);

export const createUserSchema = z
  .object({
    name: z.string().min(2).max(120).trim(),
    email: z.string().email().max(254).toLowerCase().trim(),
    password: z.string().min(12).max(1024),
    role: userRoleSchema,
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({ name: z.string().min(2).max(120).trim(), role: userRoleSchema })
  .partial()
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
