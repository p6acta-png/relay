import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Secret tokens (sessions, invites, chat access, manage-booking links).
 *
 * The raw token is handed to its owner once (cookie, link) and only its SHA-256 hash is stored.
 * Anyone who reads the database therefore cannot use what they find. A plain hash is enough
 * here because the token is 256 random bits — unlike passwords, it cannot be guessed.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Keyed hash for identifiers we need to count but should not store, such as IP addresses
 * in rate-limit keys. Without the secret, the stored value cannot be reversed by trying all IPs.
 */
export function hmacIdentifier(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url').slice(0, 32);
}

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // no 0/O, 1/I/L, U

/** Short human-friendly booking reference, e.g. "EK-7KQ3M". */
export function generateReference(prefix: string, length = 5): string {
  const bytes = randomBytes(length);
  let code = '';
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `${prefix}-${code}`;
}
