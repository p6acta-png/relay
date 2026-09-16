import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt from Node's standard library — no custom cryptography.
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet minimum for scrypt:
 * N = 2^17 (CPU/memory cost), r = 8 (block size), p = 1 (parallelism).
 * The parameters are stored inside each hash, so they can be raised later and old
 * hashes still verify.
 *
 * Stored format: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 */

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export const STANDARD_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };
/** Only for automated tests, where hundreds of hashes would otherwise take minutes. */
export const TEST_PARAMS: ScryptParams = { N: 2 ** 12, r: 8, p: 1 };

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = {
    N: params.N,
    r: params.r,
    p: params.p,
    // scrypt needs ~128 * N * r bytes; Node's default 32 MiB limit is too small for N = 2^17.
    maxmem: 256 * 1024 * 1024,
  };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(
  password: string,
  params: ScryptParams = STANDARD_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, params);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

// #region learn:verify-password
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(params.N) || params.N < 2 ** 10 || params.N > 2 ** 20) return false;

  const expected = Buffer.from(hashB64, 'base64');
  const actual = await derive(password, Buffer.from(saltB64, 'base64'), params);
  // Constant-time comparison: how long this takes must not reveal how many bytes matched.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
// #endregion learn:verify-password

/** True when a stored hash uses weaker parameters than the current standard (rehash on login). */
export function needsRehash(stored: string, params: ScryptParams = STANDARD_PARAMS): boolean {
  const [, n, r, p] = stored.split('$');
  return Number(n) < params.N || Number(r) < params.r || Number(p) < params.p;
}
