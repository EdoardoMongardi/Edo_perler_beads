import { NextRequest, NextResponse } from 'next/server';
import { cancelReservation } from '@/lib/quota';
import { checkRateLimits } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const body = await req.json();
    const { reservationId } = body;

    if (!reservationId || typeof reservationId !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing or invalid reservationId' }, { status: 400 });
    }

    const rl = await checkRateLimits(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded', retryAfter: rl.retryAfter },
        { status: 429 }
      );
    }

    const result = await cancelReservation(reservationId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/generate/cancel] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}