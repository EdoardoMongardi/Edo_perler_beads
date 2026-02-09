import { getRedis } from './redis';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

/**
 * Generate a random 8-char code formatted as XXXX-XXXX.
 * Checks Redis to guarantee uniqueness.
 */
export async function generateUniqueCode(): Promise<string> {
  const redis = getRedis();
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const raw = Array.from(bytes)
      .map((b) => CHARS[b % CHARS.length])
      .join('');
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    const exists = await redis.exists(`code:${code}`);
    if (!exists) return code;
  }
  throw new Error('Failed to generate unique code after 10 attempts');
}

/**
 * Normalize a user-provided code: uppercase, strip spaces,
 * ensure XXXX-XXXX format if 8 contiguous chars given.
 */
export function normalizeCode(input: string): string {
  let s = input.trim().toUpperCase().replace(/\s+/g, '');
  // If user pasted without dash and it's 8 chars, insert dash
  if (s.length === 8 && !s.includes('-')) {
    s = `${s.slice(0, 4)}-${s.slice(4)}`;
  }
  return s;
}