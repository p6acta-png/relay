/**
 * The session cookie name, shared by the proxy (optimistic redirect) and src/server/session.ts.
 * Kept free of server-only imports so the proxy stays lightweight.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-relay_session' : 'relay_session';
