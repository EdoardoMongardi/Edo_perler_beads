import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { normalizeCode } from '@/lib/codeGenerator';
import { getCodeRecord } from '@/lib/quota';
import { checkRateLimits } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const rawCode = searchParams.get('code');
    if (!rawCode) {
      return NextResponse.json({ ok: false, error: 'Missing code parameter' }, { status: 400 });
    }

    const code = normalizeCode(rawCode);
    const record = await getCodeRecord(code);

    if (!record) {
      return NextResponse.json({ ok: false, error: 'Code not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      code,
      ...record,
      remaining: record.quotaTotal - record.used,
    });
  } catch (err) {
    console.error('[/api/admin/get-code] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}