import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, TEST_PARAMS, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery', TEST_PARAMS);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterx', hash)).toBe(false);
  });

  it('salts every hash, so equal passwords produce different hashes', async () => {
    const a = await hashPassword('same password', TEST_PARAMS);
    const b = await hashPassword('same password', TEST_PARAMS);
    expect(a).not.toBe(b);
  });

  it('stores the parameters so they can be raised later', async () => {
    const hash = await hashPassword('password-123', TEST_PARAMS);
    expect(hash.startsWith(`scrypt$${TEST_PARAMS.N}$8$1$`)).toBe(true);
    expect(needsRehash(hash)).toBe(true);
  });

  it('rejects malformed or tampered hashes instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$999999999$8$1$AAAA$AAAA')).toBe(false);
  });

  it('uses the OWASP minimum scrypt parameters by default', async () => {
    const hash = await hashPassword('standard cost check');
    expect(hash.startsWith(`scrypt$${2 ** 17}$8$1$`)).toBe(true);
  });
});
