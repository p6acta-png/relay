import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';

// Fonts are downloaded at build time and served from our own domain — no requests to Google.
const grotesk = Schibsted_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-grotesk',
  display: 'swap',
});
const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-newsreader',
  style: ['normal', 'italic'],
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Relay', template: '%s · Relay' },
  description:
    'Relay turns repetitive customer conversations into bookings, leads and tasks for small businesses.',
};

export const viewport: Viewport = {
  themeColor: '#f4f1ea',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request: the Content-Security-Policy nonce (src/proxy.ts) is unique per response,
  // and Next.js can only attach it to scripts when the page is rendered at request time.
  await connection();
  return (
    <html lang="en" className={`${grotesk.variable} ${newsreader.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
