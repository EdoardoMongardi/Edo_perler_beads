import { NextRequest, NextResponse } from 'next/server';

/**
 * Validate admin secret from x-admin-secret header.
 * Returns null if authorized, or a 401 NextResponse if not.
 */
export function verifyAdmin(req: NextRequest): NextResponse | null {
  const secret = req.headers.get('x-admin-secret');
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'ADMIN_SECRET not configured on server' },
      { status: 500 }
    );
  }
  if (!secret || secret !== expected) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  return null; // authorized
}