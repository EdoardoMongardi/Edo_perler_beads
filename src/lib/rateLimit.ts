import { getRedis } from './redis';

const CODE_LIMIT_PER_MINUTE = 20;
const IP_LIMIT_PER_MINUTE = 60;

/**
 * Fixed-window rate limiter using Redis INCR + TTL.
 * Returns { allowed: boolean, retryAfter?: number }.
 */
async function checkLimit(
  key: string,
  limit: number,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) {
    // First request in this window – set TTL
    await redis.expire(key, windowSeconds);
  }
  if (count > limit) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
  }
  return { allowed: true };
}

/**
 * Rate-limit by code: max CODE_LIMIT_PER_MINUTE per minute.
 */
export async function rateLimitByCode(code: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const bucket = Math.floor(Date.now() / 60000);
  return checkLimit(`ratelimit:code:${code}:${bucket}`, CODE_LIMIT_PER_MINUTE);
}

/**
 * Rate-limit by IP: max IP_LIMIT_PER_MINUTE per minute.
 */
export async function rateLimitByIp(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const bucket = Math.floor(Date.now() / 60000);
  return checkLimit(`ratelimit:ip:${ip}:${bucket}`, IP_LIMIT_PER_MINUTE);
}

/**
 * Combined rate limit check. Returns error response or null if allowed.
 */
export async function checkRateLimits(
  ip: string,
  code?: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const ipCheck = await rateLimitByIp(ip);
  if (!ipCheck.allowed) return ipCheck;
  if (code) {
    const codeCheck = await rateLimitByCode(code);
    if (!codeCheck.allowed) return codeCheck;
  }
  return { allowed: true };
}