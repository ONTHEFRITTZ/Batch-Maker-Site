'use client';
/**
 * pages/pos-manage/[provider].tsx
 *
 * POS connection management page.
 * Tabs: Connection | Item Mapping (Square/Lightspeed only) | Settings
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { getSupabaseClient } from '../../lib/supabase';

const supabase = getSupabaseClient();

const SUPPORTS_MAPPING = ['square', 'lightspeed'];

interface POSItem {
  id: string;
  name: string;
}

interface Workflow {
  id: string;
  name: string;
  yield_amount?: number | null;
  yield_unit?: string | null;
}

interface Mapping {
  id: string;
  pos_item_id: string;
  pos_item_name: string;
  workflow_id: string;
}

interface Connection {
  id: string;
  provider: string;
  display_name: string;
  location_id: string;
  merchant_id: string;
  expires_at: string | null;
  updated_at: string;
  created_at: string;
}

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

export default function POSManagePage() {
  const router = useRouter();
  const { provider } = router.query as { provider: string };

  const [user, setUser] = useState<any>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'connection' | 'mapping' | 'settings'>('connection');

  // Item mapping state
  const [posItems, setPosItems] = useState<POSItem[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [pendingMappings, setPendingMappings] = useState<Record<string, string>>({});

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user && provider) {
      loadConnection();
    }
  }, [user, provider]);

  useEffect(() => {
    if (activeTab === 'mapping' && connection && SUPPORTS_MAPPING.includes(provider)) {
      loadMappingData();
    }
  }, [activeTab, connection]);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }
    setUser(session.user);
  }

  async function loadConnection() {
    const token = await getAuthToken();
    const r = await fetch('/api/pos/connections', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    const conn = (data.connections || []).find((c: Connection) => c.provider === provider);
    if (!conn) {
      router.push('/settings');
      return;
    }
    setConnection(conn);
    setLoading(false);
  }

  async function loadMappingData() {
    setMappingLoading(true);
    try {
      const token = await getAuthToken();

      // Load POS items, workflows, and existing mappings in parallel
      const [itemsRes, workflowsRes, mappingsRes] = await Promise.all([
        fetch(`/api/pos/items?provider=${provider}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        supabase
          .from('workflows')
          .select('id, name, yield_amount, yield_unit')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .is('archived_at', null)
          .order('name'),
        fetch(`/api/pos/item-mapping?provider=${provider}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const itemsData = await itemsRes.json();
      const mappingsData = await mappingsRes.json();

      setPosItems(itemsData.items || []);
      setWorkflows(workflowsRes.data || []);
      setMappings(mappingsData.mappings || []);

      // Pre-populate pending mappings from existing saved mappings
      const existing: Record<string, string> = {};
      for (const m of mappingsData.mappings || []) {
        existing[m.pos_item_id] = m.workflow_id;
      }
      setPendingMappings(existing);
    } catch (e) {
      console.error('Failed to load mapping data:', e);
      showToast('Failed to load mapping data', 'error');
    } finally {
      setMappingLoading(false);
    }
  }

  async function handleSaveMappings() {
    setSavingMapping(true);
    try {
      const token = await getAuthToken();
      const r = await fetch('/api/pos/item-mapping', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          mappings: Object.entries(pendingMappings)
            .filter(([, workflowId]) => workflowId)
            .map(([posItemId, workflowId]) => ({
              pos_item_id: posItemId,
              pos_item_name: posItems.find(i => i.id === posItemId)?.name || posItemId,
              workflow_id: workflowId,
            })),
        }),
      });

      if (!r.ok) throw new Error(await r.text());
      showToast('Mappings saved successfully', 'success');
      await loadMappingData();
    } catch (e: any) {
      showToast(`Failed to save: ${e.message}`, 'error');
    } finally {
      setSavingMapping(false);
    }
  }

  async function handleDeleteMapping(posItemId: string) {
    const token = await getAuthToken();
    const r = await fetch('/api/pos/item-mapping', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider, pos_item_id: posItemId }),
    });
    if (!r.ok) { showToast('Failed to remove mapping', 'error'); return; }
    const updated = { ...pendingMappings };
    delete updated[posItemId];
    setPendingMappings(updated);
    await loadMappingData();
    showToast('Mapping removed', 'success');
  }

  const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : '';
  const supportsMapping = SUPPORTS_MAPPING.includes(provider);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen dashboard-bg relative z-10">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[9999] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      <header className="glass-card border-b border-gray-200 py-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{providerLabel} Connection</h1>
            {connection?.display_name && (
              <p className="text-sm text-gray-500">{connection.display_name}</p>
            )}
          </div>
          <Link
            href="/settings"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Back to Settings
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('connection')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'connection' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Connection
          </button>
          {supportsMapping && (
            <button
              onClick={() => setActiveTab('mapping')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'mapping' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Item Mapping
            </button>
          )}
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'settings' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Settings
          </button>
        </div>

        {/* Connection tab */}
        {activeTab === 'connection' && connection && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Connection Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Status</span>
                <span className="text-sm font-medium text-green-600">Connected</span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Account</span>
                <span className="text-sm font-medium text-gray-900">{connection.display_name}</span>
              </div>
              {connection.merchant_id && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Merchant ID</span>
                  <span className="text-sm font-mono text-gray-700">{connection.merchant_id}</span>
                </div>
              )}
              {connection.location_id && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Location ID</span>
                  <span className="text-sm font-mono text-gray-700">{connection.location_id}</span>
                </div>
              )}
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Last Synced</span>
                <span className="text-sm text-gray-700">
                  {connection.updated_at ? new Date(connection.updated_at).toLocaleString() : '—'}
                </span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Connected Since</span>
                <span className="text-sm text-gray-700">
                  {connection.created_at ? new Date(connection.created_at).toLocaleDateString() : '—'}
                </span>
              </div>
              {connection.expires_at && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Token Expires</span>
                  <span className="text-sm text-gray-700">
                    {new Date(connection.expires_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            {!supportsMapping && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                Item mapping and production suggestions are not available for {providerLabel}. Sales data will still sync nightly for analytics.
              </div>
            )}
          </div>
        )}

        {/* Item Mapping tab */}
        {activeTab === 'mapping' && supportsMapping && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-lg font-semibold text-gray-900">Item Mapping</h2>
              <button
                onClick={handleSaveMappings}
                disabled={savingMapping}
                className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors"
              >
                {savingMapping ? 'Saving...' : 'Save Mappings'}
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Link your {providerLabel} menu items to Batch Maker workflows. This lets the system
              calculate how many batches to schedule based on sales history.
            </p>

            {mappingLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-cyan-500 rounded-full animate-spin" />
              </div>
            ) : posItems.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No menu items found. Make sure your {providerLabel} account has items and has synced recently.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 px-2 text-xs font-semibold text-gray-400 uppercase mb-2">
                  <span>{providerLabel} Item</span>
                  <span>Batch Maker Workflow</span>
                </div>
                {posItems.map(item => {
                  const selectedWorkflowId = pendingMappings[item.id] || '';
                  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
                  return (
                    <div key={item.id} className="grid grid-cols-2 gap-4 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{item.id.slice(0, 16)}…</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedWorkflowId}
                          onChange={e => setPendingMappings({ ...pendingMappings, [item.id]: e.target.value })}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-cyan-500"
                        >
                          <option value="">No mapping</option>
                          {workflows.map(w => (
                            <option key={w.id} value={w.id}>
                              {w.name}{w.yield_amount && w.yield_unit ? ` (${w.yield_amount} ${w.yield_unit})` : ''}
                            </option>
                          ))}
                        </select>
                        {selectedWorkflowId && (
                          <button
                            onClick={() => handleDeleteMapping(item.id)}
                            className="text-red-400 hover:text-red-600 text-sm px-2"
                            title="Remove mapping"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {workflows.some(w => !w.yield_amount) && (
              <div className="mt-4 p-3 bg-cyan-50 border border-cyan-200 rounded-lg text-xs text-cyan-700">
                Some workflows are missing yield data. Set yield amounts on your workflows to enable accurate batch calculations.{' '}
                <Link href="/dashboard" className="underline font-medium">Edit workflows</Link>
              </div>
            )}
          </div>
        )}

        {/* Settings tab */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sync Settings</h2>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm font-medium text-gray-900 mb-1">Sync Schedule</div>
                <div className="text-sm text-gray-500">Sales data syncs automatically every night at 2am UTC.</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm font-medium text-gray-900 mb-1">Data Retention</div>
                <div className="text-sm text-gray-500">90 days of sales history is retained for production suggestions.</div>
              </div>
              {supportsMapping && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-sm font-medium text-gray-900 mb-1">Production Suggestions</div>
                  <div className="text-sm text-gray-500">
                    Based on a rolling 4-week average, suggestions appear on your calendar for mapped items.
                    You can accept or dismiss each suggestion individually.
                  </div>
                </div>
              )}
              <div className="pt-4 border-t border-gray-200">
                <div className="text-sm font-medium text-red-600 mb-2">Danger Zone</div>
                <button
                  onClick={() => {
                    if (confirm(`Disconnect ${providerLabel}? All synced sales history will be removed.`)) {
                      router.push(`/settings?disconnect=${provider}`);
                    }
                  }}
                  className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                >
                  Disconnect {providerLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}