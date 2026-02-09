import { NextRequest, NextResponse } from 'next/server';
import { normalizeCode } from '@/lib/codeGenerator';
import { getStatus } from '@/lib/quota';
import { checkRateLimits } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { searchParams } = new URL(req.url);
    const rawCode = searchParams.get('code');
    const deviceId = searchParams.get('deviceId');

    if (!rawCode) {
      return NextResponse.json({ ok: false, error: 'Missing code parameter' }, { status: 400 });
    }
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: 'Missing deviceId parameter' }, { status: 400 });
    }

    const code = normalizeCode(rawCode);

    const rl = await checkRateLimits(ip, code);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded', retryAfter: rl.retryAfter },
        { status: 429 }
      );
    }

    const result = await getStatus(code, deviceId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/status] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}