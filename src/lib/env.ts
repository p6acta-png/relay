import 'server-only';
import { z } from 'zod';

/**
 * Environment variables are an external input like any other, so they are validated once at
 * startup. A missing or malformed value fails fast with a clear message instead of surfacing
 * later as a confusing runtime error.
 */
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_URL: z.url(),
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  TRUST_PROXY_HEADERS: flag.default(false),
  DEMO_MODE: flag.default(false),
  // Only the providers that actually exist in this build are accepted.
  AI_PROVIDER: z.enum(['mock']).default('mock'),
  EMAIL_PROVIDER: z.enum(['demo']).default('demo'),
  CHALLENGE_PROVIDER: z.enum(['demo']).default('demo'),
  /** Lower cost for password hashing in automated tests only. */
  PASSWORD_HASH_COST: z.enum(['standard', 'test']).default('standard'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }
  if (result.data.NODE_ENV === 'production' && result.data.PASSWORD_HASH_COST === 'test') {
    throw new Error('PASSWORD_HASH_COST=test is not allowed in production.');
  }
  return result.data;
}

export const env = parseEnv();
