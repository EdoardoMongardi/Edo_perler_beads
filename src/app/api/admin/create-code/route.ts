import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { getRedis } from '@/lib/redis';
import { generateUniqueCode } from '@/lib/codeGenerator';
import { checkRateLimits } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
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
    const { quotaTotal, note } = body;

    if (!quotaTotal || typeof quotaTotal !== 'number' || quotaTotal < 1 || quotaTotal > 9999) {
      return NextResponse.json({ ok: false, error: 'quotaTotal must be a number between 1 and 9999' }, { status: 400 });
    }

    const code = await generateUniqueCode();
    const redis = getRedis();

    await redis.hset(`code:${code}`, {
      quotaTotal: String(quotaTotal),
      used: '0',
      status: 'active',
      createdAt: new Date().toISOString(),
      boundDeviceHash: '',
      bindResetCount: '0',
      bindResetAt: '',
      note: note || '',
    });

    // Add code to the global set for listing
    await redis.sadd('codes:all', code);

    const baseUrl = process.env.BASE_URL || 'https://your-site.vercel.app';
    const url = `${baseUrl}/redeem?code=${code}`;

    return NextResponse.json({ ok: true, code, quotaTotal, url });
  } catch (err) {
    console.error('[/api/admin/create-code] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}