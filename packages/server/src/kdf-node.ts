import { scrypt } from 'node:crypto';
import type { Kdf } from './security';

/** Native scrypt: fast enough for a busy server at a cost that stays expensive for attackers. */
export const nodeKdf: Kdf = {
  cost: { N: 2 ** 15, r: 8, p: 1 },
  derive: (password, salt, params, length) =>
    new Promise((resolve, reject) => {
      scrypt(password, salt, length, { ...params, maxmem: 128 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(new Uint8Array(key))));
    }),
};
