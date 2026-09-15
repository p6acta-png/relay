import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';

/**
 * Runs before every page request.
 *
 * 1. Content-Security-Policy with a fresh nonce: the browser only runs scripts that carry this
 *    request's nonce, so injected <script> tags are refused even if an XSS bug slipped through.
 * 2. An *optimistic* redirect for the dashboard when there is no session cookie at all.
 *    This is a convenience, not security: every dashboard page and server action verifies the
 *    session again on the server (src/server/context.ts). Never rely on the proxy alone.
 */
// #region learn:proxy
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? ` 'unsafe-eval'` : ''}`,
    // Inline style attributes (e.g. chart bar widths) are allowed; styles cannot run code.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/app') && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
// #endregion learn:proxy

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
