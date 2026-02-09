import { getRedis } from './redis';
import { hashDeviceId } from './deviceHash';
import { CodeRecord, ReservationRecord } from './types';

const RESERVATION_TTL_MS = 2 * 60 * 1000; // 2 minutes
const RESERVATION_TTL_S = 120;

// ---- helpers ----

export async function getCodeRecord(code: string): Promise<CodeRecord | null> {
  const redis = getRedis();
  const data = await redis.hgetall(`code:${code}`);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    quotaTotal: Number(data.quotaTotal),
    used: Number(data.used),
    status: data.status as CodeRecord['status'],
    createdAt: data.createdAt as string,
    boundDeviceHash: (data.boundDeviceHash as string) || null,
    bindResetCount: Number(data.bindResetCount || 0),
    bindResetAt: (data.bindResetAt as string) || null,
    note: (data.note as string) || null,
  };
}

export async function getReservation(rid: string): Promise<ReservationRecord | null> {
  const redis = getRedis();
  const data = await redis.hgetall(`resv:${rid}`);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    code: data.code as string,
    deviceHash: data.deviceHash as string,
    state: data.state as ReservationRecord['state'],
    createdAt: data.createdAt as string,
    expiresAt: Number(data.expiresAt),
  };
}

// ---- Lazy cleanup of expired pending reservations ----

/**
 * Clean up any expired reservations for a code.
 * For each expired reservation still in "reserved" state, atomically
 * decrement `used` and remove from pending set.
 * This is called lazily before reserve/status operations.
 */
export async function cleanupExpiredReservations(code: string): Promise<void> {
  const redis = getRedis();
  const pendingKey = `code:${code}:pending`;
  const members = await redis.smembers(pendingKey);
  if (!members || members.length === 0) return;

  const now = Date.now();
  for (const rid of members) {
    const resv = await getReservation(rid as string);
    // If the reservation key has expired (TTL), or state is not "reserved", clean up
    if (!resv) {
      // Reservation key expired – need to rollback used count
      // Use Lua script to atomically decrement used and remove from pending set
      await redis.eval(
        `
        local removed = redis.call('srem', KEYS[1], ARGV[1])
        if removed == 1 then
          local used = tonumber(redis.call('hget', KEYS[2], 'used') or '0')
          if used > 0 then
            redis.call('hincrby', KEYS[2], 'used', -1)
            -- If status was exhausted, reactivate
            local status = redis.call('hget', KEYS[2], 'status')
            if status == 'exhausted' then
              redis.call('hset', KEYS[2], 'status', 'active')
            end
          end
        end
        return removed
        `,
        [pendingKey, `code:${code}`],
        [rid as string]
      );
    } else if (resv.state === 'reserved' && resv.expiresAt <= now) {
      // Reservation exists but expired – cancel it atomically
      await cancelReservationAtomic(rid as string, code);
    }
    // If committed or canceled, just remove from pending set
    if (resv && resv.state !== 'reserved') {
      await redis.srem(pendingKey, rid as string);
    }
  }
}

// ---- Redeem ----

export async function redeemCode(
  code: string,
  deviceId: string
): Promise<{ ok: true; remaining: number; quotaTotal: number } | { ok: false; error: string; status: number }> {
  const redis = getRedis();
  const deviceHash = await hashDeviceId(deviceId);
  const record = await getCodeRecord(code);

  if (!record) {
    return { ok: false, error: 'Code not found', status: 404 };
  }
  if (record.status === 'revoked') {
    return { ok: false, error: 'Code has been revoked', status: 409 };
  }
  if (record.status === 'exhausted') {
    return { ok: false, error: 'Code is exhausted', status: 409 };
  }

  // Device binding
  if (record.boundDeviceHash && record.boundDeviceHash !== deviceHash) {
    return { ok: false, error: 'This code is already bound to another device', status: 403 };
  }

  if (!record.boundDeviceHash) {
    // Bind device atomically
    // Use Lua to check-and-set to prevent race condition
    const result = await redis.eval(
      `
      local current = redis.call('hget', KEYS[1], 'boundDeviceHash')
      if current and current ~= '' and current ~= false then
        if current ~= ARGV[1] then
          return 'BOUND_OTHER'
        end
        return 'OK'
      end
      redis.call('hset', KEYS[1], 'boundDeviceHash', ARGV[1])
      return 'OK'
      `,
      [`code:${code}`],
      [deviceHash]
    );
    if (result === 'BOUND_OTHER') {
      return { ok: false, error: 'This code is already bound to another device', status: 403 };
    }
  }

  await cleanupExpiredReservations(code);
  const remaining = record.quotaTotal - record.used;
  return { ok: true, remaining, quotaTotal: record.quotaTotal };
}

// ---- Status ----

export async function getStatus(
  code: string,
  deviceId: string
): Promise<{ ok: true; remaining: number; quotaTotal: number; status: CodeRecord['status'] } | { ok: false; error: string; status: number }> {
  const record = await getCodeRecord(code);
  if (!record) {
    return { ok: false, error: 'Code not found', status: 404 };
  }

  const deviceHash = await hashDeviceId(deviceId);
  if (record.boundDeviceHash && record.boundDeviceHash !== deviceHash) {
    return { ok: false, error: 'This code is bound to another device', status: 403 };
  }

  await cleanupExpiredReservations(code);
  // Re-fetch after cleanup
  const updated = await getCodeRecord(code);
  if (!updated) {
    return { ok: false, error: 'Code not found', status: 404 };
  }
  const remaining = updated.quotaTotal - updated.used;
  return { ok: true, remaining, quotaTotal: updated.quotaTotal, status: updated.status };
}

// ---- Reserve ----

export async function reserveGeneration(
  code: string,
  deviceId: string
): Promise<{ ok: true; reservationId: string; remaining: number } | { ok: false; error: string; status: number }> {
  const redis = getRedis();
  const deviceHash = await hashDeviceId(deviceId);
  const record = await getCodeRecord(code);

  if (!record) {
    return { ok: false, error: 'Code not found', status: 404 };
  }
  if (record.status === 'revoked') {
    return { ok: false, error: 'Code has been revoked', status: 409 };
  }
  if (record.boundDeviceHash !== deviceHash) {
    return { ok: false, error: 'Device mismatch – this code is bound to another device', status: 403 };
  }

  // Lazy cleanup first
  await cleanupExpiredReservations(code);

  // Generate reservation ID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const rid = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  const now = Date.now();
  const expiresAt = now + RESERVATION_TTL_MS;

  // Atomic reserve: increment used if remaining > 0
  const result = await redis.eval(
    `
    local quotaTotal = tonumber(redis.call('hget', KEYS[1], 'quotaTotal'))
    local used = tonumber(redis.call('hget', KEYS[1], 'used'))
    local status = redis.call('hget', KEYS[1], 'status')
    if status ~= 'active' then
      return 'NOT_ACTIVE'
    end
    if used >= quotaTotal then
      redis.call('hset', KEYS[1], 'status', 'exhausted')
      return 'EXHAUSTED'
    end
    redis.call('hincrby', KEYS[1], 'used', 1)
    local newUsed = used + 1
    if newUsed >= quotaTotal then
      redis.call('hset', KEYS[1], 'status', 'exhausted')
    end
    return tostring(quotaTotal - newUsed)
    `,
    [`code:${code}`],
    []
  );

  if (result === 'NOT_ACTIVE') {
    return { ok: false, error: 'Code is not active', status: 409 };
  }
  if (result === 'EXHAUSTED') {
    return { ok: false, error: 'Quota exhausted – no remaining generations', status: 409 };
  }

  const remaining = Number(result);

  // Create reservation record with TTL
  const resvKey = `resv:${rid}`;
  await redis.hset(resvKey, {
    code,
    deviceHash,
    state: 'reserved',
    createdAt: new Date(now).toISOString(),
    expiresAt: String(expiresAt),
  });
  await redis.expire(resvKey, RESERVATION_TTL_S);

  // Add to pending set for lazy cleanup
  await redis.sadd(`code:${code}:pending`, rid);

  return { ok: true, reservationId: rid, remaining };
}

// ---- Commit ----

export async function commitReservation(
  rid: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const redis = getRedis();
  const resv = await getReservation(rid);

  if (!resv) {
    // Key may have expired – but commit is idempotent
    return { ok: true };
  }

  if (resv.state === 'committed') {
    // Idempotent
    return { ok: true };
  }

  if (resv.state === 'canceled') {
    return { ok: false, error: 'Reservation was already canceled', status: 409 };
  }

  // Atomically set state to committed
  const result = await redis.eval(
    `
    local state = redis.call('hget', KEYS[1], 'state')
    if state == 'committed' then
      return 'ALREADY_COMMITTED'
    end
    if state == 'canceled' then
      return 'ALREADY_CANCELED'
    end
    if state ~= 'reserved' then
      return 'INVALID_STATE'
    end
    redis.call('hset', KEYS[1], 'state', 'committed')
    -- Remove from pending set
    redis.call('srem', KEYS[2], ARGV[1])
    return 'OK'
    `,
    [`resv:${rid}`, `code:${resv.code}:pending`],
    [rid]
  );

  if (result === 'ALREADY_COMMITTED') return { ok: true };
  if (result === 'ALREADY_CANCELED') {
    return { ok: false, error: 'Reservation was already canceled', status: 409 };
  }

  // Write generation log
  await redis.lpush(`log:${resv.code}`, JSON.stringify({
    reservationId: rid,
    deviceHash: resv.deviceHash,
    code: resv.code,
    status: 'committed',
    time: new Date().toISOString(),
  }));

  return { ok: true };
}

// ---- Cancel ----

async function cancelReservationAtomic(rid: string, code: string): Promise<void> {
  const redis = getRedis();
  // Atomically: if state is still "reserved", set to "canceled" and decrement used
  await redis.eval(
    `
    local state = redis.call('hget', KEYS[1], 'state')
    if state ~= 'reserved' then
      -- Already committed or canceled; just clean up pending
      redis.call('srem', KEYS[3], ARGV[1])
      return 0
    end
    redis.call('hset', KEYS[1], 'state', 'canceled')
    redis.call('srem', KEYS[3], ARGV[1])
    local used = tonumber(redis.call('hget', KEYS[2], 'used') or '0')
    if used > 0 then
      redis.call('hincrby', KEYS[2], 'used', -1)
      local status = redis.call('hget', KEYS[2], 'status')
      if status == 'exhausted' then
        redis.call('hset', KEYS[2], 'status', 'active')
      end
    end
    return 1
    `,
    [`resv:${rid}`, `code:${code}`, `code:${code}:pending`],
    [rid]
  );
}

export async function cancelReservation(
  rid: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const redis = getRedis();
  const resv = await getReservation(rid);

  if (!resv) {
    // Key expired – the lazy cleanup will handle rollback.
    // Treat as already canceled (idempotent).
    return { ok: true };
  }

  if (resv.state === 'canceled') {
    return { ok: true }; // idempotent
  }
  if (resv.state === 'committed') {
    return { ok: false, error: 'Reservation was already committed – cannot cancel', status: 409 };
  }

  await cancelReservationAtomic(rid, resv.code);

  // Write log
  await redis.lpush(`log:${resv.code}`, JSON.stringify({
    reservationId: rid,
    deviceHash: resv.deviceHash,
    code: resv.code,
    status: 'canceled',
    time: new Date().toISOString(),
  }));

  return { ok: true };
}