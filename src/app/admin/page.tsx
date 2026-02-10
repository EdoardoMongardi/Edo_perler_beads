'use client';

import React, { useState, useCallback } from 'react';
import { CodeSummary } from '@/lib/types';

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  const [codes, setCodes] = useState<CodeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create code form
  const [quotaTotal, setQuotaTotal] = useState(10);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-secret': secret,
  }), [secret]);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/list-codes', { headers: headers() });
      const data = await res.json();
      if (data.ok) {
        setCodes(data.codes);
        setAuthenticated(true);
      } else {
        setError(data.error || 'Failed to fetch codes');
        if (res.status === 401) setAuthenticated(false);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const handleLogin = async () => {
    if (!secret.trim()) {
      setError('Please enter the admin secret');
      return;
    }
    await fetchCodes();
  };

  const handleCreateCode = async () => {
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/create-code', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ quotaTotal, note: note || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(`Code created: ${data.code} (${data.quotaTotal} uses) — URL: ${data.url}`);
        setNote('');
        await fetchCodes();
      } else {
        setError(data.error || 'Failed to create code');
      }
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (code: string) => {
    if (!confirm(`Revoke code ${code}? This cannot be undone.`)) return;
    setError('');
    try {
      const res = await fetch('/api/admin/revoke-code', {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchCodes();
      } else {
        setError(data.error || 'Failed to revoke');
      }
    } catch {
      setError('Network error');
    }
  };

  const handleResetBinding = async (code: string) => {
    if (!confirm(`Reset device binding for ${code}?`)) return;
    setError('');
    try {
      const res = await fetch('/api/admin/reset-binding', {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(`Binding reset for ${code} (reset #${data.bindResetCount})`);
        await fetchCodes();
      } else {
        setError(data.error || 'Failed to reset binding');
      }
    } catch {
      setError('Network error');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-pink-100 p-8">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-400 text-center mb-6">Admin Access</h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter admin secret"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 mb-4"
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-rose-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-400">PerlerBeads Admin</h1>
          <button
            onClick={() => { setAuthenticated(false); setSecret(''); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-600">
            {success}
            <button onClick={() => setSuccess('')} className="ml-2 text-green-400 hover:text-green-600">&times;</button>
          </div>
        )}

        {/* Create code */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Create Redemption Code</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quota</label>
              <div className="flex gap-2">
                {[3, 10, 50].map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuotaTotal(n)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      quotaTotal === n
                        ? 'bg-pink-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  value={quotaTotal}
                  onChange={(e) => setQuotaTotal(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-pink-300"
                  min={1}
                  max={9999}
                />
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Order #, platform, customer..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
            </div>
            <button
              onClick={handleCreateCode}
              disabled={creating}
              className="px-5 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold rounded-lg shadow hover:shadow-md transition-all disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>

        {/* Code list */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-700">
              All Codes ({codes.length})
            </h2>
            <button
              onClick={fetchCodes}
              disabled={loading}
              className="text-sm text-pink-500 hover:text-pink-700 font-medium"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {codes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No codes yet. Create one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Code</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium">Remaining</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Note</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium">Device</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Created</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.codeFull} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-2 font-mono text-xs">
                        <span className="text-gray-700">{c.codeFull}</span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className={`font-bold ${c.remaining > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {c.remaining}
                        </span>
                        <span className="text-gray-400">/{c.quotaTotal}</span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status === 'active' ? 'bg-green-100 text-green-700' :
                          c.status === 'exhausted' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500 max-w-[120px] truncate">
                        {c.note || '-'}
                      </td>
                      <td className="py-2 px-2 text-center text-xs">
                        {c.boundDeviceHash ? (
                          <span className="text-pink-500" title={c.boundDeviceHash}>Bound</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                        {c.bindResetCount > 0 && (
                          <span className="ml-1 text-orange-400">(R{c.bindResetCount})</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-400">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyToClipboard(`${window.location.origin}/redeem?code=${c.codeFull}`)}
                            className="p-1 text-gray-400 hover:text-pink-500 transition-colors"
                            title="Copy redeem link"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </button>
                          {c.boundDeviceHash && c.status !== 'revoked' && (
                            <button
                              onClick={() => handleResetBinding(c.codeFull)}
                              className="p-1 text-gray-400 hover:text-orange-500 transition-colors"
                              title="Reset device binding"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          )}
                          {c.status === 'active' && (
                            <button
                              onClick={() => handleRevoke(c.codeFull)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Revoke code"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}