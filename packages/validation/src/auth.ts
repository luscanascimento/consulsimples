import { z } from "zod";

// Mínimo 12 caracteres. Comprimento vence composição obrigatória de caracteres especiais.
const password = z.string().min(12).max(1024);
const email = z.string().trim().toLowerCase().email().max(254);

export const signupSchema = z
  .object({
    restaurantName: z.string().trim().min(2).max(120),
    ownerName: z.string().trim().min(2).max(120),
    email,
    password,
  })
  .strict();
export type SignupInput = z.infer<typeof signupSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(200) }).strict();
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1).max(1024) }).strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(200) }).strict();
export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({ email }).strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ token: z.string().min(10).max(200), password })
  .strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
