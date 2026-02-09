// ---- Redis data shapes ----

export interface CodeRecord {
  quotaTotal: number;
  used: number;
  status: 'active' | 'exhausted' | 'revoked';
  createdAt: string; // ISO
  boundDeviceHash: string | null;
  bindResetCount: number;
  bindResetAt: string | null; // ISO
  note: string | null;
}

export interface ReservationRecord {
  code: string;
  deviceHash: string;
  state: 'reserved' | 'committed' | 'canceled';
  createdAt: string; // ISO
  expiresAt: number; // unix ms
}

// ---- API request / response ----

export interface RedeemRequest {
  code: string;
  deviceId: string;
}

export interface RedeemResponse {
  ok: true;
  remaining: number;
  quotaTotal: number;
}

export interface StatusResponse {
  ok: true;
  remaining: number;
  quotaTotal: number;
  status: CodeRecord['status'];
}

export interface ReserveRequest {
  code: string;
  deviceId: string;
}

export interface ReserveResponse {
  ok: true;
  reservationId: string;
  remaining: number;
}

export interface CommitRequest {
  reservationId: string;
}

export interface CancelRequest {
  reservationId: string;
}

// ---- Admin ----

export interface CreateCodeRequest {
  quotaTotal: number;
  note?: string;
}

export interface CreateCodeResponse {
  code: string;
  quotaTotal: number;
  url: string;
}

export interface CodeSummary {
  code: string;       // masked e.g. ABCD-****
  codeFull: string;   // full code (admin only)
  remaining: number;
  quotaTotal: number;
  used: number;
  status: CodeRecord['status'];
  note: string | null;
  createdAt: string;
  boundDeviceHash: string | null;
  bindResetCount: number;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string; // machine-readable error code
}