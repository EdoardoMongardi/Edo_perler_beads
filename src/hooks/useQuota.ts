'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('pb_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('pb_device_id', id);
  }
  return id;
}

function getSavedCode(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('pb_redeem_code') || '';
}

interface QuotaState {
  code: string;
  deviceId: string;
  remaining: number | null;
  quotaTotal: number | null;
  status: string | null;
  isRedeemed: boolean;
  loading: boolean;
  error: string | null;
}

export function useQuota() {
  const [state, setState] = useState<QuotaState>({
    code: '',
    deviceId: '',
    remaining: null,
    quotaTotal: null,
    status: null,
    isRedeemed: false,
    loading: true,
    error: null,
  });

  const currentReservationId = useRef<string | null>(null);

  // Initialize from localStorage
  useEffect(() => {
    const code = getSavedCode();
    const deviceId = getOrCreateDeviceId();
    setState((s) => ({ ...s, code, deviceId }));

    if (code && deviceId) {
      // Fetch status
      fetch(`/api/status?code=${encodeURIComponent(code)}&deviceId=${encodeURIComponent(deviceId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setState((s) => ({
              ...s,
              remaining: data.remaining,
              quotaTotal: data.quotaTotal,
              status: data.status,
              isRedeemed: true,
              loading: false,
              error: null,
            }));
          } else {
            setState((s) => ({
              ...s,
              loading: false,
              isRedeemed: false,
              error: data.error,
            }));
          }
        })
        .catch(() => {
          setState((s) => ({ ...s, loading: false }));
        });
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const redeem = useCallback(async (inputCode: string) => {
    const deviceId = getOrCreateDeviceId();
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inputCode, deviceId }),
      });
      const data = await res.json();

      if (data.ok) {
        const normalized = inputCode.trim().toUpperCase();
        localStorage.setItem('pb_redeem_code', normalized);
        setState((s) => ({
          ...s,
          code: normalized,
          deviceId,
          remaining: data.remaining,
          quotaTotal: data.quotaTotal,
          isRedeemed: true,
          loading: false,
          error: null,
        }));
        return { ok: true as const };
      } else {
        setState((s) => ({ ...s, loading: false, error: data.error }));
        return { ok: false as const, error: data.error };
      }
    } catch {
      const err = 'Network error';
      setState((s) => ({ ...s, loading: false, error: err }));
      return { ok: false as const, error: err };
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const code = getSavedCode();
    const deviceId = getOrCreateDeviceId();
    if (!code || !deviceId) return;

    try {
      const res = await fetch(`/api/status?code=${encodeURIComponent(code)}&deviceId=${encodeURIComponent(deviceId)}`);
      const data = await res.json();
      if (data.ok) {
        setState((s) => ({
          ...s,
          remaining: data.remaining,
          quotaTotal: data.quotaTotal,
          status: data.status,
          error: null,
        }));
      }
    } catch {
      // Silently fail
    }
  }, []);

  /**
   * Reserve a generation slot. Returns reservationId if successful.
   * Call commit() after generation succeeds, or cancel() if it fails.
   */
  const reserve = useCallback(async (): Promise<{ ok: true; reservationId: string; remaining: number } | { ok: false; error: string }> => {
    const code = getSavedCode();
    const deviceId = getOrCreateDeviceId();

    if (!code || !deviceId) {
      return { ok: false, error: 'No redemption code found. Please redeem a code first.' };
    }

    try {
      const res = await fetch('/api/generate/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, deviceId }),
      });
      const data = await res.json();

      if (data.ok) {
        currentReservationId.current = data.reservationId;
        setState((s) => ({ ...s, remaining: data.remaining, error: null }));
        return { ok: true, reservationId: data.reservationId, remaining: data.remaining };
      } else {
        setState((s) => ({ ...s, error: data.error }));
        return { ok: false, error: data.error };
      }
    } catch {
      return { ok: false, error: 'Network error during reservation' };
    }
  }, []);

  const commit = useCallback(async (reservationId?: string): Promise<boolean> => {
    const rid = reservationId || currentReservationId.current;
    if (!rid) return false;

    try {
      const res = await fetch('/api/generate/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: rid }),
      });
      const data = await res.json();
      currentReservationId.current = null;
      if (data.ok) {
        // Check if exhausted
        await refreshStatus();
      }
      return data.ok;
    } catch {
      return false;
    }
  }, [refreshStatus]);

  const cancel = useCallback(async (reservationId?: string): Promise<boolean> => {
    const rid = reservationId || currentReservationId.current;
    if (!rid) return false;

    try {
      const res = await fetch('/api/generate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: rid }),
      });
      const data = await res.json();
      currentReservationId.current = null;
      if (data.ok) {
        await refreshStatus();
      }
      return data.ok;
    } catch {
      return false;
    }
  }, [refreshStatus]);

  const maskedCode = state.code
    ? `${state.code.split('-')[0] || state.code.slice(0, 4)}-****`
    : '';

  const logout = useCallback(() => {
    localStorage.removeItem('pb_redeem_code');
    setState((s) => ({
      ...s,
      code: '',
      remaining: null,
      quotaTotal: null,
      status: null,
      isRedeemed: false,
      error: null,
    }));
  }, []);

  return {
    ...state,
    maskedCode,
    redeem,
    reserve,
    commit,
    cancel,
    refreshStatus,
    logout,
  };
}