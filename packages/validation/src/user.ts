import { z } from "zod";

export const userRoleSchema = z.enum(["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"]);

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(1024),
    role: userRoleSchema,
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({ name: z.string().trim().min(2).max(120), role: userRoleSchema })
  .partial()
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
