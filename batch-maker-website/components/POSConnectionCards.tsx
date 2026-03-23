'use client';
/**
 * components/POSConnectionCards.tsx
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../lib/supabase';

interface POSConnection {
  id: string;
  provider: string;
  display_name: string;
  location_id: string;
  merchant_id: string;
  expires_at: string | null;
  updated_at: string;
}

interface ProviderMeta {
  key: string;
  label: string;
  logo: string;
  color: string;
  description: string;
  available: boolean;
  supportsMapping: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  {
    key: 'square',
    label: 'Square',
    logo: '⬛',
    color: 'bg-black',
    description: 'Pulls daily order & item sales from Square POS',
    available: true,
    supportsMapping: true,
  },
  {
    key: 'toast',
    label: 'Toast',
    logo: '🍞',
    color: 'bg-orange-600',
    description: 'Syncs item-level sales from Toast restaurant POS',
    available: true,
    supportsMapping: false,
  },
  {
    key: 'lightspeed',
    label: 'Lightspeed',
    logo: '⚡',
    color: 'bg-cyan-600',
    description: 'Imports retail & restaurant sales from Lightspeed',
    available: true,
    supportsMapping: true,
  },
  {
    key: 'clover',
    label: 'Clover',
    logo: '🍀',
    color: 'bg-green-600',
    description: 'Connects to your Clover merchant account',
    available: true,
    supportsMapping: false,
  },
];

async function getAuthToken(): Promise<string> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

export default function POSConnectionCards({ user }: { user: any }) {
  const router = useRouter();
  const [connections, setConnections] = useState<POSConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchConnections = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const r = await fetch('/api/pos/connections', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setConnections(data.connections || []);
    } catch (e) {
      console.error('Failed to fetch POS connections', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const pos = params.get('pos');
      const provider = params.get('provider');
      if (pos === 'connected' && provider) {
        showToast(`${provider.charAt(0).toUpperCase() + provider.slice(1)} connected successfully!`, 'success');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (pos === 'error') {
        const reason = params.get('reason') || 'Unknown error';
        showToast(`Connection failed: ${reason}`, 'error');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  async function handleDisconnect(provider: string) {
    if (!confirm(`Disconnect ${provider}? Synced sales history will be removed.`)) return;
    setDisconnecting(provider);
    try {
      const token = await getAuthToken();
      const r = await fetch('/api/pos/disconnect', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      });
      if (!r.ok) throw new Error(await r.text());
      showToast(`${provider} disconnected.`, 'success');
      await fetchConnections();
    } catch (e: any) {
      showToast(`Failed to disconnect: ${e.message}`, 'error');
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleConnect(provider: string) {
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/pos/connect?provider=${provider}`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'manual',
      });

      if (r.type === 'opaqueredirect' || r.status === 0) {
        window.location.href = `/api/pos/connect?provider=${provider}&_t=${token}`;
        return;
      }

      const data = await r.json().catch(() => null);
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        window.location.href = `/api/pos/connect?provider=${provider}&_t=${token}`;
      }
    } catch {
      window.location.href = `/api/pos/connect?provider=${provider}`;
    }
  }

  return (
    <div className="glass-card rounded-xl p-6 shadow-sm mb-6">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[9999] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-semibold text-gray-900">POS Integration</h2>
        <span className="text-xs px-2 py-1 bg-cyan-100 text-cyan-700 rounded-full font-medium">Beta</span>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Connect your point-of-sale system to pull daily sales data. BatchMaker uses this to suggest
        batch quantities and flag upcoming high-demand days on your calendar.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROVIDERS.map(provider => {
            const conn = connections.find(c => c.provider === provider.key);
            const isConnected = !!conn;
            const isDisconnecting = disconnecting === provider.key;

            return (
              <div
                key={provider.key}
                className={`p-4 rounded-xl border-2 transition-all ${
                  isConnected
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${provider.color} flex items-center justify-center text-white text-lg`}>
                      {provider.logo}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{provider.label}</div>
                      {isConnected && (
                        <div className="text-xs text-green-700 font-medium">
                          ✓ {conn.display_name || 'Connected'}
                        </div>
                      )}
                    </div>
                  </div>
                  {isConnected && (
                    <span className="text-[10px] px-2 py-0.5 bg-green-200 text-green-800 rounded-full font-semibold">
                      LIVE
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500 mb-3">{provider.description}</p>

                {isConnected && (
                  <div className="text-xs text-gray-400 mb-3 space-y-0.5">
                    <div>Last sync: {conn.updated_at ? new Date(conn.updated_at).toLocaleDateString() : '—'}</div>
                    {conn.merchant_id && <div>Merchant: {conn.merchant_id.slice(0, 12)}…</div>}
                  </div>
                )}

                {!provider.supportsMapping && isConnected && (
                  <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    Item mapping not supported for {provider.label}. Sales sync only.
                  </div>
                )}

                <div className="flex gap-2">
                  {isConnected ? (
                    <>
                      <button
                        onClick={() => router.push(`/pos-manage/${provider.key}`)}
                        className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                      >
                        Manage Connection
                      </button>
                      <button
                        onClick={() => handleDisconnect(provider.key)}
                        disabled={isDisconnecting}
                        className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {isDisconnecting ? '…' : 'Disconnect'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConnect(provider.key)}
                      disabled={!provider.available}
                      className="flex-1 px-3 py-2 text-sm bg-cyan-600 text-white rounded-lg font-medium hover:bg-cyan-700 transition-colors disabled:opacity-40"
                    >
                      {provider.available ? `Connect ${provider.label}` : 'Coming Soon'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Sales data is synced nightly at 2am UTC. Data is used only for predictive scheduling
        and analytics — never shared with third parties.
      </p>
    </div>
  );
}