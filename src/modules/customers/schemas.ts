import { z } from 'zod';
import { emailSchema } from '@/modules/auth/schemas';

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, ''))
  .pipe(z.string().regex(/^\+?\d{8,15}$/, 'Enter a phone number with 8–15 digits, e.g. +47 912 34 567.'));

export const customerDetailsSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: emailSchema,
  phone: z.union([z.literal(''), phoneSchema]).optional(),
});

export type CustomerDetails = z.infer<typeof customerDetailsSchema>;
