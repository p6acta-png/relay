import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/tokens';
import { authenticate, registerUser } from '@/modules/auth/accounts';
import { createSession, invalidateSession, validateSessionToken } from '@/modules/auth/sessions';
import { consumeRateLimit } from '@/modules/protection/rate-limit';
import { resetDatabase } from '../support/database';
import { createUser } from '../support/factories';

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('registration', () => {
  it('creates an account with a hashed password and a lower-cased email', async () => {
    const user = await registerUser({
      name: 'Kari Nordmann',
      email: 'Kari@Example.com',
      password: 'fjord-and-mountains',
    });
    expect(user.email).toBe('kari@example.com');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain('fjord-and-mountains');
  });

  it('rejects a second account with the same email', async () => {
    await registerUser({ name: 'Ola', email: 'ola@example.com', password: 'a-good-long-password' });
    await expect(
      registerUser({ name: 'Ola Again', email: 'OLA@example.com', password: 'another-long-password' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects short, common and email-based passwords with field errors', async () => {
    await expect(
      registerUser({ name: 'A B', email: 'short@example.com', password: 'short' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { password: expect.stringContaining('10') },
    });
    await expect(
      registerUser({ name: 'A B', email: 'common@example.com', password: 'Password123' }),
    ).rejects.toMatchObject({
      fieldErrors: { password: expect.stringContaining('common') },
    });
    await expect(
      registerUser({ name: 'A B', email: 'ingrid@example.com', password: 'ingrid-is-great' }),
    ).rejects.toMatchObject({ fieldErrors: { password: expect.stringContaining('email') } });
  });
});

describe('login', () => {
  it('returns the user for correct credentials', async () => {
    const user = await createUser({ password: 'correct-password-1' });
    await expect(authenticate({ email: user.email, password: 'correct-password-1' })).resolves.toMatchObject({
      id: user.id,
    });
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const user = await createUser({ password: 'correct-password-2' });
    const wrongPassword = await authenticate({ email: user.email, password: 'nope-nope-nope' }).catch(
      (e) => e,
    );
    const unknownEmail = await authenticate({
      email: 'nobody@example.com',
      password: 'nope-nope-nope',
    }).catch((e) => e);
    expect(wrongPassword.code).toBe('UNAUTHENTICATED');
    expect(unknownEmail.message).toBe(wrongPassword.message);
  });
});

describe('sessions', () => {
  it('stores only a hash of the token and resolves the user from the raw token', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    expect(await prisma.session.findUnique({ where: { id: token } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: hashToken(token) } })).not.toBeNull();
    await expect(validateSessionToken(token)).resolves.toMatchObject({ user: { id: user.id } });
  });

  it('stops working immediately after logout', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await invalidateSession(hashToken(token));
    await expect(validateSessionToken(token)).resolves.toBeNull();
  });

  it('rejects and deletes expired sessions', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await prisma.session.update({
      where: { id: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(validateSessionToken(token)).resolves.toBeNull();
    expect(await prisma.session.count({ where: { id: hashToken(token) } })).toBe(0);
  });

  it('ignores garbage tokens', async () => {
    await expect(validateSessionToken('x'.repeat(500))).resolves.toBeNull();
    await expect(validateSessionToken('not-a-session')).resolves.toBeNull();
  });
});

describe('rate limiting', () => {
  const rule = { name: 'test-rule', limit: 3, windowSeconds: 60 };

  it('allows up to the limit within a window, then blocks', async () => {
    const now = new Date('2026-09-15T10:00:10Z');
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(rule, 'subject-a', now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts subjects separately and resets in the next window', async () => {
    const now = new Date('2026-09-15T11:00:10Z');
    for (let i = 0; i < 3; i++) await consumeRateLimit(rule, 'subject-b', now);
    expect((await consumeRateLimit(rule, 'subject-c', now)).allowed).toBe(true);
    const nextWindow = new Date('2026-09-15T11:01:10Z');
    expect((await consumeRateLimit(rule, 'subject-b', nextWindow)).allowed).toBe(true);
  });

  it('stays correct under concurrent requests', async () => {
    const now = new Date('2026-09-15T12:00:10Z');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit(rule, 'subject-d', now)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });
});
