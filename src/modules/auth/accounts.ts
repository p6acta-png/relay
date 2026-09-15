import 'server-only';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { loginSchema, signupSchema, type SignupInput } from './schemas';
import { hashPassword, needsRehash, STANDARD_PARAMS, TEST_PARAMS, verifyPassword } from './password';

export { emailSchema, passwordSchema } from './schemas';
export type { SignupInput } from './schemas';

const hashParams = () => (env.PASSWORD_HASH_COST === 'test' ? TEST_PARAMS : STANDARD_PARAMS);

export async function registerUser(input: SignupInput) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues));
  }
  const { name, email, password } = parsed.data;
  const localPart = email.split('@')[0] ?? '';
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    throw new AppError('VALIDATION', 'Check the highlighted fields.', {
      password: 'Your password should not contain your email name.',
    });
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new AppError('CONFLICT', 'An account with this email already exists. Log in instead.', {
      email: 'An account with this email already exists.',
    });
  }

  return prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password, hashParams()) },
    select: { id: true, name: true, email: true },
  });
}

let dummyHash: Promise<string> | undefined;

// #region learn:authenticate
export async function authenticate(input: { email: string; password: string }) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect.');
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, passwordHash: true },
  });

  // Always run the (deliberately slow) hash check, even for unknown emails, so response time
  // does not reveal which email addresses have accounts.
  dummyHash ??= hashPassword('not-a-real-password', hashParams());
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid) throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect.');

  // Upgrade hashes created with older, weaker parameters on successful login.
  if (needsRehash(user.passwordHash, hashParams())) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password, hashParams()) },
    });
  }
  return { id: user.id, name: user.name, email: user.email };
}
// #endregion learn:authenticate
