import 'server-only';
import { prisma } from '@/lib/db';
import { generateToken, hashToken } from '@/lib/tokens';

/**
 * Database-backed sessions.
 *
 * - The browser holds a random 256-bit token in an HttpOnly cookie (see src/server/session.ts).
 * - The database stores only SHA-256(token) as the session id.
 * - Sessions have an absolute lifetime; logging out deletes the row, so a stolen cookie
 *   stops working immediately — something a stateless JWT cannot do without extra machinery.
 */
export const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface ValidSession {
  id: string;
  expiresAt: Date;
  activeOrganizationId: string | null;
  user: SessionUser;
}

// #region learn:session-create
export async function createSession(userId: string, activeOrganizationId: string | null = null) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await prisma.session.create({
    data: { id: hashToken(token), userId, activeOrganizationId, expiresAt },
  });
  return { token, expiresAt };
}
// #endregion learn:session-create

export async function validateSessionToken(token: string): Promise<ValidSession | null> {
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      activeOrganizationId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function invalidateAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function setActiveOrganization(sessionId: string, organizationId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { activeOrganizationId: organizationId } });
}

export async function deleteExpiredSessions(now = new Date()): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}
