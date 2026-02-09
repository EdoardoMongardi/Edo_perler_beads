import { NextRequest, NextResponse } from 'next/server';
import { normalizeCode } from '@/lib/codeGenerator';
import { redeemCode } from '@/lib/quota';
import { checkRateLimits } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const body = await req.json();
    const { code: rawCode, deviceId } = body;

    if (!rawCode || typeof rawCode !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing or invalid code' }, { status: 400 });
    }
    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing or invalid deviceId' }, { status: 400 });
    }

    const code = normalizeCode(rawCode);

    // Rate limit
    const rl = await checkRateLimits(ip, code);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded. Please wait.', retryAfter: rl.retryAfter },
        { status: 429 }
      );
    }

    const result = await redeemCode(code, deviceId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/redeem] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}