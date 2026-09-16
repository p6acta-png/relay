import { expect, test } from '@playwright/test';
import { logIn } from './helpers';

test('sends a nonce-based Content-Security-Policy and hardening headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  const csp = headers['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('uses a fresh CSP nonce on every request', async ({ request }) => {
  const nonce = async () =>
    /'nonce-([^']+)'/.exec((await request.get('/login')).headers()['content-security-policy'] ?? '')?.[1];
  expect(await nonce()).not.toBe(await nonce());
});

test('sets the session cookie as HttpOnly, SameSite=Lax, Secure with the __Host- prefix', async ({
  page,
  context,
}) => {
  await logIn(page, 'amina@eikogkant.example');
  const session = (await context.cookies()).find((c) => c.name.includes('relay_session'));
  expect(session).toMatchObject({
    name: '__Host-relay_session',
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    path: '/',
  });
});

test('rejects chat requests from another site', async ({ request }) => {
  const response = await request.post('/api/public/eik-og-kant/chat', {
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    data: { conversationId: null, input: { kind: 'text', text: 'hello' } },
  });
  expect(response.status()).toBe(403);
});
