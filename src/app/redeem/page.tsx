'use client';

import React, { useState, useEffect } from 'react';

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('pb_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('pb_device_id', id);
  }
  return id;
}

export default function RedeemPage() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [quotaTotal, setQuotaTotal] = useState<number | null>(null);

  useEffect(() => {
    // Auto-fill code from URL params
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode) {
      setCode(urlCode.toUpperCase().trim());
      // Clean URL to prevent code leakage
      window.history.replaceState({}, '', '/redeem');
    }
  }, []);

  const handleRedeem = async () => {
    if (!code.trim()) {
      setMessage('Please enter a redemption code');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const deviceId = getOrCreateDeviceId();
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), deviceId }),
      });

      const data = await res.json();

      if (data.ok) {
        // Save code to localStorage
        localStorage.setItem('pb_redeem_code', code.trim().toUpperCase());
        setRemaining(data.remaining);
        setQuotaTotal(data.quotaTotal);
        setStatus('success');
        setMessage('Redemption successful! You can now generate images.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Redemption failed');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  const goToGenerator = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-pink-100 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-500 rounded-2xl mb-4 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Redeem Code</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your code to unlock generations</p>
          </div>

          {status === 'success' ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-2">
                <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-600 font-medium">{message}</p>
              <div className="bg-pink-50 rounded-xl p-4 border border-pink-100">
                <p className="text-sm text-gray-600">
                  Remaining: <span className="font-bold text-pink-600 text-lg">{remaining}</span> / {quotaTotal}
                </p>
              </div>
              <button
                onClick={goToGenerator}
                className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
              >
                Start Creating
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Redemption Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCD-EFGH"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all placeholder:text-gray-300"
                  maxLength={9}
                  onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
                />
              </div>

              {status === 'error' && message && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 text-center">
                  {message}
                </div>
              )}

              <button
                onClick={handleRedeem}
                disabled={status === 'loading'}
                className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Redeeming...
                  </span>
                ) : (
                  'Redeem'
                )}
              </button>

              <p className="text-xs text-gray-400 text-center mt-4">
                This code will be bound to your current device. Each code can only be used on one device.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          PerlerBeads Generator &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}