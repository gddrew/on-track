import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Required'),
});

const newPassword = z.string().min(8, 'Minimum 8 characters required');

const passwordsMatch = {
  message: "Passwords don't match",
  path: ['confirmPassword'],
};

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Required'),
    email: z.email(),
    password: newPassword,
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((data) => data.password === data.confirmPassword, passwordsMatch);

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((data) => data.password === data.confirmPassword, passwordsMatch);
