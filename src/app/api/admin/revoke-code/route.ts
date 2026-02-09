import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { normalizeCode } from '@/lib/codeGenerator';
import { getCodeRecord } from '@/lib/quota';
import { getRedis } from '@/lib/redis';
import { checkRateLimits } from '@/lib/rateLimit';

export async function PATCH(req: NextRequest) {
  try {
    const authError = verifyAdmin(req);
    if (authError) return authError;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = await checkRateLimits(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded', retryAfter: rl.retryAfter },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { code: rawCode } = body;
    if (!rawCode || typeof rawCode !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing or invalid code' }, { status: 400 });
    }

    const code = normalizeCode(rawCode);
    const record = await getCodeRecord(code);
    if (!record) {
      return NextResponse.json({ ok: false, error: 'Code not found' }, { status: 404 });
    }

    const redis = getRedis();
    await redis.hset(`code:${code}`, { status: 'revoked' });

    return NextResponse.json({ ok: true, message: `Code ${code} has been revoked` });
  } catch (err) {
    console.error('[/api/admin/revoke-code] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}