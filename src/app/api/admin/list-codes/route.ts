import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { getRedis } from '@/lib/redis';
import { getCodeRecord } from '@/lib/quota';
import { checkRateLimits } from '@/lib/rateLimit';
import { CodeSummary } from '@/lib/types';

function maskCode(code: string): string {
  // ABCD-EFGH -> ABCD-****
  const parts = code.split('-');
  if (parts.length === 2) {
    return `${parts[0]}-****`;
  }
  return code.slice(0, 4) + '****';
}

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

    const redis = getRedis();
    const allCodes = await redis.smembers('codes:all');

    const summaries: CodeSummary[] = [];
    for (const code of allCodes) {
      const record = await getCodeRecord(code as string);
      if (record) {
        summaries.push({
          code: maskCode(code as string),
          codeFull: code as string,
          remaining: record.quotaTotal - record.used,
          quotaTotal: record.quotaTotal,
          used: record.used,
          status: record.status,
          note: record.note,
          createdAt: record.createdAt,
          boundDeviceHash: record.boundDeviceHash,
          bindResetCount: record.bindResetCount,
        });
      }
    }

    // Sort newest first
    summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ ok: true, codes: summaries });
  } catch (err) {
    console.error('[/api/admin/list-codes] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}