import { sha256 } from '@noble/hashes/sha2.js';
import { HttpError } from './errors';

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** The password hashing primitive. Node uses its native scrypt; the browser demo uses a pure JavaScript one. */
export interface Kdf {
  cost: ScryptParams;
  derive(password: string, salt: Uint8Array, params: ScryptParams, length: number): Promise<Uint8Array>;
}

let kdf: Kdf | null = null;

export function configureKdf(next: Kdf) {
  kdf = next;
}

function requireKdf(): Kdf {
  if (!kdf) throw new Error('Password hashing is not configured. Call configureKdf() at start-up.');
  return kdf;
}

const KEY_LENGTH = 64;

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Compares in time that doesn't depend on where the first difference is. */
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!;
  return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const { cost, derive } = requireKdf();
  const salt = randomBytes(16);
  const key = await derive(password, salt, cost, KEY_LENGTH);
  return `scrypt$${cost.N}$${cost.r}$${cost.p}$${toBase64Url(salt)}$${toBase64Url(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !N || !r || !p || !salt || !key) return false;
  const expected = fromBase64Url(key);
  const actual = await requireKdf().derive(password, fromBase64Url(salt), { N: Number(N), r: Number(r), p: Number(p) }, expected.length);
  return safeEqual(actual, expected);
}

/** Checked when an email has no account, so response time doesn't reveal which emails are registered. */
let decoyHash: Promise<string> | undefined;
export async function verifyAgainstDecoy(password: string) {
  decoyHash ??= hashPassword(toBase64Url(randomBytes(16)));
  await verifyPassword(password, await decoyHash);
}

export const newToken = (bytes = 32) => toBase64Url(randomBytes(bytes));
export const hashToken = (token: string) => toHex(sha256(new TextEncoder().encode(token)));

interface Window {
  count: number;
  resetAt: number;
}

/** Fixed-window limiter held in memory. Good for one server; move it to Redis when running several. */
export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(private now: () => number = Date.now) {}

  hit(key: string, limit: number, windowMs: number) {
    const now = this.now();
    if (this.windows.size > 50_000) this.sweep(now);
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    window.count += 1;
    if (window.count > limit) {
      const minutes = Math.max(1, Math.ceil((window.resetAt - now) / 60_000));
      throw new HttpError(429, 'too_many_requests', `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
  }

  private sweep(now: number) {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}
