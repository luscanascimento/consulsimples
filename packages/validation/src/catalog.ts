import { z } from "zod";

const uuid = z.string().uuid();

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().strict();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    categoryId: uuid,
    // Centavos inteiros. `.int()` rejeita 23.5 antes de virar dinheiro quebrado no banco.
    priceCents: z.number().int().min(0).max(100_000_000),
    available: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().strict();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
