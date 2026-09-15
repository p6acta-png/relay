import { z } from 'zod';

/** Validation for account forms. Pure (no database access), so it can be shared anywhere. */

// A short list of passwords that pass a length check but are guessed first by attackers.
const COMMON_PASSWORDS = new Set([
  'password123',
  'password1234',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'qwerty12345',
  'iloveyou123',
  'passord123',
  'sommer2026',
  'vinter2026',
  'admin12345',
  'letmein123',
]);

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email('Enter a valid email address.'))
  .transform((email) => email.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.')
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), 'This password is too common. Choose another.');

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(128),
});

export type SignupInput = z.input<typeof signupSchema>;
