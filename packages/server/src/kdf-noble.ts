import { scryptAsync } from '@noble/hashes/scrypt.js';
import type { Kdf } from './security';

/**
 * Pure JavaScript scrypt for places without Node's crypto, such as the browser demo.
 * Hashes carry their own cost, so passwords made at one cost still verify at another.
 */
export function nobleKdf(cost = { N: 2 ** 12, r: 8, p: 1 }): Kdf {
  return {
    cost,
    derive: (password, salt, params, length) => scryptAsync(password, salt, { ...params, dkLen: length }),
  };
}
