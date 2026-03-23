'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient, isPremiumProfile } from '../lib/supabase';
import Link from 'next/link';
import Overview from '../components/DashboardOverview';
import Workflows from '../components/DashboardWorkflows';
import Inventory from '../components/DashboardInventory';
import Calendar from '../components/DashboardCalendar';
import Catering from '../components/DashboardCatering';
import Customers from '../components/DashboardCustomers';
import Upcoming from '../components/DashboardUpcoming';
import Schedule from '../components/DashboardSchedule';
import Analytics from '../components/DashboardAnalytics';
import StickyNotes from '../components/StickyNotes';
import type {
  Profile,
  Workflow,
  Batch,
  BatchCompletionReport,
  BatchTemplate,
  NetworkMember,
  InventoryItem,
  InventoryTransaction,
  ShoppingListItem,
  ScheduledBatch,
  ClockedInMember,
} from '../lib/dashboard-types';

const supabase = getSupabaseClient();

const SUB_TABS: Record<string, { value: string; label: string }[]> = {
  overview:   [],
  workflows:  [],
  calendar: [
    { value: 'production', label: 'Production' },
    { value: 'upcoming',   label: 'Upcoming'   },
    { value: 'catering',   label: 'Catering'   },
    { value: 'customers',  label: 'Customers'  },
  ],
  inventory: [
    { value: 'items',     label: 'Items'     },
    { value: 'orders',    label: 'Orders'    },
    { value: 'suppliers', label: 'Suppliers' },
    { value: 'transfers', label: 'Transfers' },
  ],
  schedule: [
    { value: 'calendar', label: 'Calendar'      },
    { value: 'shifts',   label: 'All Shifts'    },
    { value: 'labour',   label: 'Labour Report' },
    { value: 'requests', label: 'Time Off'      },
  ],
  analytics: [
    { value: 'batch',     label: 'Batch'     },
    { value: 'waste',     label: 'Waste'     },
    { value: 'inventory', label: 'Inventory' },
    { value: 'reports',   label: 'Reports'   },
    { value: 'pos',       label: 'POS'       },
  ],
};

const DEFAULT_SUB_TAB: Record<string, string> = {
  inventory: 'items',
  calendar:  'production',
  schedule:  'calendar',
  analytics: 'batch',
};

export default function EnhancedDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchReports, setBatchReports] = useState<BatchCompletionReport[]>([]);
  const [batchTemplates, setBatchTemplates] = useState<BatchTemplate[]>([]);
  const [networkMembers, setNetworkMembers] = useState<NetworkMember[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryTransactions, setInventoryTransactions] = useState<InventoryTransaction[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [scheduledBatches, setScheduledBatches] = useState<ScheduledBatch[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clockedInMembers, setClockedInMembers] = useState<ClockedInMember[]>([]);

  const locationRef = useRef<string>('all');
  const userIdRef = useRef<string | null>(null);

  useEffect(() => { locationRef.current = selectedLocationId; }, [selectedLocationId]);

  const activeView = (
    searchParams.get('view') as
      | 'overview' | 'workflows' | 'inventory'
      | 'calendar' | 'schedule' | 'analytics'
  ) || 'overview';

  const rawTab = searchParams.get('tab') || '';
  const validSubTabs = SUB_TABS[activeView] ?? [];
  const activeSubTab = validSubTabs.find(t => t.value === rawTab)?.value
    ?? DEFAULT_SUB_TAB[activeView]
    ?? '';

  function changeView(view: string) {
    const defaultTab = DEFAULT_SUB_TAB[view];
    const params = defaultTab ? `?view=${view}&tab=${defaultTab}` : `?view=${view}`;
    router.push(`/dashboard${params}`);
  }

  function changeSubTab(tab: string) {
    router.push(`/dashboard?view=${activeView}&tab=${tab}`);
  }

  useEffect(() => { checkUser(); }, []);

  useEffect(() => {
    const uid = userIdRef.current;
    if (!uid || loading) return;
    fetchAllData(uid);
  }, [selectedLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const uid = user.id;

    const inventoryChannel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `user_id=eq.${uid}` },
        () => fetchInventoryItems(uid))
      .subscribe();

    const scheduledChannel = supabase
      .channel('scheduled-batches-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_batches', filter: `user_id=eq.${uid}` },
        () => fetchScheduledBatches(uid))
      .subscribe();

    const workflowChannel = supabase
      .channel('workflow-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflows' },
        () => fetchWorkflows(uid))
      .subscribe();

    const batchChannel = supabase
      .channel('batch-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches', filter: `user_id=eq.${uid}` },
        () => fetchBatches(uid))
      .subscribe();

    fetchClockedInMembers(uid);
    const clockInterval = setInterval(() => fetchClockedInMembers(uid), 30_000);

    return () => {
      supabase.removeChannel(inventoryChannel);
      supabase.removeChannel(scheduledChannel);
      supabase.removeChannel(workflowChannel);
      supabase.removeChannel(batchChannel);
      clearInterval(clockInterval);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = '/login'; return; }
    setUser(session.user);
    userIdRef.current = session.user.id;
    await fetchData(session.user.id);
  }

  async function fetchData(userId: string) {
    try {
      const profileData = await fetchProfile(userId);
      if (!isPremiumProfile(profileData)) {
        window.location.href = '/account';
        return;
      }
      await Promise.all([
        fetchLocations(userId),
        fetchWorkflows(userId),
        fetchBatches(userId),
        fetchBatchReports(userId),
        fetchBatchTemplates(userId),
        fetchInventoryItems(userId),
        fetchInventoryTransactions(userId),
        fetchShoppingList(userId),
        fetchScheduledBatches(userId),
        fetchClockedInMembers(userId),
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllData(userId: string) {
    await Promise.all([
      fetchWorkflows(userId),
      fetchBatches(userId),
      fetchBatchReports(userId),
      fetchInventoryItems(userId),
      fetchInventoryTransactions(userId),
      fetchShoppingList(userId),
      fetchScheduledBatches(userId),
    ]);
  }

  async function fetchProfile(userId: string) {
    const { data: profileData } = await supabase
      .from('profiles').select('*').eq('id', userId).single();
    if (!profileData) return null;
    setProfile(profileData);

    if (isPremiumProfile(profileData)) {
      const { data: rolesData } = await supabase
        .from('network_member_roles')
        .select('*')
        .eq('owner_id', userId);

      if (rolesData?.length) {
        const memberUserIds = rolesData.map((r: any) => r.user_id);
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, email, device_name')
          .in('id', memberUserIds);

        const merged = rolesData.map((r: any) => ({
          ...r,
          profiles: profilesData?.find((p: any) => p.id === r.user_id) ?? null,
        }));
        setNetworkMembers(merged);
      }
    }
    return profileData;
  }

  async function fetchLocations(userId: string) {
    const { data, error } = await supabase
      .from('locations').select('*').eq('user_id', userId)
      .order('is_default', { ascending: false }).order('name');
    if (!error && data) {
      setLocations(data);
      if (!locationRef.current || locationRef.current === 'all') {
        const def = data.find((l: any) => l.is_default);
        if (def) {
          setSelectedLocationId(def.id);
          locationRef.current = def.id;
        }
      }
    }
  }

  async function fetchWorkflows(userId: string) {
    const { data } = await supabase
      .from('workflows').select('*').eq('user_id', userId)
      .is('deleted_at', null).order('created_at', { ascending: false });
    setWorkflows(data || []);
  }

  async function fetchBatches(userId: string) {
    const loc = locationRef.current;
    let query = supabase.from('batches').select('*').eq('user_id', userId);
    if (loc && loc !== 'all') query = query.eq('location_id', loc);
    const { data } = await query.order('created_at', { ascending: false });
    setBatches(data || []);
  }

  async function fetchBatchReports(userId: string) {
    const loc = locationRef.current;
    let query = supabase.from('batch_completion_reports').select('*').eq('user_id', userId);
    if (loc && loc !== 'all') query = query.eq('location_id', loc);
    const { data } = await query.order('timestamp', { ascending: false });
    setBatchReports(data || []);
  }

  async function fetchBatchTemplates(userId: string) {
    const { data } = await supabase
      .from('batch_templates').select('*').eq('created_by', userId)
      .order('times_used', { ascending: false });
    setBatchTemplates(data || []);
  }

  async function fetchInventoryItems(userId: string) {
    const loc = locationRef.current;
    let query = supabase.from('inventory_items').select('*').eq('owner_id', userId);
    if (loc && loc !== 'all') query = query.eq('location_id', loc);
    const { data, error } = await query.order('name');
    if (error) console.error('Error fetching inventory:', error);
    else setInventoryItems(data || []);
  }

  async function fetchInventoryTransactions(userId: string) {
    const loc = locationRef.current;
    let query = supabase.from('inventory_transactions').select('*').eq('user_id', userId);
    if (loc && loc !== 'all') query = query.eq('location_id', loc);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) console.error('Error fetching transactions:', error);
    else setInventoryTransactions(data || []);
  }

  async function fetchShoppingList(userId: string) {
    const loc = locationRef.current;
    let query = supabase.from('shopping_list').select('*').eq('user_id', userId);
    if (loc && loc !== 'all') query = query.eq('location_id', loc);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) console.error('Error fetching shopping list:', error);
    else setShoppingList(data || []);
  }

  async function fetchScheduledBatches(userId: string) {
    const loc = locationRef.current;
    let query = supabase.from('scheduled_batches').select('*').eq('user_id', userId);
    if (loc && loc !== 'all') query = query.eq('location_id', loc);
    const { data, error } = await query.order('scheduled_date');
    if (error) console.error('Error fetching scheduled batches:', error);
    else setScheduledBatches(data || []);
  }

  async function fetchClockedInMembers(ownerId: string) {
    const loc = locationRef.current;
    let query = supabase
      .from('time_entries')
      .select('user_id, clock_in')
      .eq('owner_id', ownerId)
      .is('clock_out', null);
    if (loc && loc !== 'all') query = (query as any).eq('location_id', loc);

    const { data: entries } = await query;
    if (!entries?.length) { setClockedInMembers([]); return; }

    const userIds = entries.map((e: any) => e.user_id);

    const [{ data: profiles }, { data: activeBatches }] = await Promise.all([
      supabase.from('profiles').select('id, device_name, email').in('id', userIds),
      supabase.from('batches').select('id, workflow_id, current_step_index, claimed_by').in('claimed_by', userIds).is('completed_at', null),
    ]);

    const workflowIds = [...new Set((activeBatches || []).map((b: any) => b.workflow_id).filter(Boolean))];
    const { data: activeWorkflows } = workflowIds.length
      ? await supabase.from('workflows').select('id, name').in('id', workflowIds)
      : { data: [] as any[] };

    setClockedInMembers(entries.map((entry: any) => {
      const profile = profiles?.find((p: any) => p.id === entry.user_id);
      const batch = activeBatches?.find((b: any) => b.claimed_by === entry.user_id);
      const workflow = activeWorkflows?.find((w: any) => w.id === batch?.workflow_id);
      return {
        user_id: entry.user_id,
        device_name: profile?.device_name || profile?.email || 'Unknown',
        clock_in: entry.clock_in,
        current_workflow_name: workflow?.name,
        current_batch_id: batch?.id,
        current_step: batch?.current_step_index,
      };
    }));
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading Dashboard...</div>
      </div>
    );
  }

  const premiumUser = isPremiumProfile(profile);
  const uid = user?.id;

  const mainNavItems: [string, string][] = [
    ['overview',  'Overview'],
    ['workflows', 'Workflows'],
    ['inventory', 'Inventory'],
    ['calendar',  'Calendar'],
    ...(premiumUser ? [['schedule', 'Schedule']] as [string, string][] : []),
    ['analytics', 'Analytics'],
  ];

  const sharedProps = {
    user,
    profile,
    workflows,
    batches,
    batchReports,
    batchTemplates,
    networkMembers,
    inventoryItems,
    inventoryTransactions,
    shoppingList,
    scheduledBatches,
    locations,
    selectedLocationId,
    isPremium: premiumUser,
    clockedInMembers,
    activeSubTab,
    onSubTabChange: changeSubTab,
    fetchInventoryItems:        () => fetchInventoryItems(uid),
    fetchInventoryTransactions: () => fetchInventoryTransactions(uid),
    fetchShoppingList:          () => fetchShoppingList(uid),
    fetchScheduledBatches:      () => fetchScheduledBatches(uid),
    fetchWorkflows:             () => fetchWorkflows(uid),
    fetchBatches:               () => fetchBatches(uid),
    fetchBatchReports:          () => fetchBatchReports(uid),
  };

  const currentSubTabs = SUB_TABS[activeView] ?? [];
  // Header is 56px. Sub-nav bar adds ~44px. Notes must align with content area top.
  const notesTopOffset = currentSubTabs.length > 0 ? 'top-[113px]' : 'top-[57px]';

  return (
    <div className="min-h-screen dashboard-bg">

      <header className="glass-card border-b border-gray-200 sticky top-0 z-50">
        <div className="w-full px-6 flex items-center gap-2 h-14">

          <Link href="/dashboard" className="flex items-center gap-2 mr-4 flex-shrink-0">
            <img
              src="/assets/images/batch-maker-logo.png"
              alt="Batch Maker"
              className="h-8 w-8 object-contain"
            />
            <span className="text-base font-semibold text-gray-900 hidden sm:block">
              Batch Maker
            </span>
          </Link>

          <nav className="flex items-center gap-1 flex-1 overflow-x-auto nav-tabs">
            {mainNavItems.map(([view, label]) => (
              <button
                key={view}
                onClick={() => changeView(view)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap flex-shrink-0 transition-colors ${
                  activeView === view
                    ? 'border border-cyan-600 text-cyan-700 bg-cyan-50'
                    : 'text-gray-500 border border-transparent hover:text-gray-800 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 flex-shrink-0 ml-2">
            {locations.length > 0 && (
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  const v = e.target.value;
                  locationRef.current = v;
                  setSelectedLocationId(v);
                }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              >
                <option value="all">All Locations</option>
                {locations.map((loc: any) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}{loc.is_default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            )}

            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <Link href="/account"     className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setMenuOpen(false)}>Account</Link>
                  <Link href="/settings"    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setMenuOpen(false)}>Settings</Link>
                  <Link href="/directory"   className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setMenuOpen(false)}>Team Directory</Link>
                  <Link href="/connections" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setMenuOpen(false)}>Connections</Link>
                  {premiumUser && (
                    <div className="px-4 py-2 text-xs text-cyan-700 font-medium border-t border-gray-100">
                      Premium Account
                    </div>
                  )}
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 border-t border-gray-100"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {currentSubTabs.length > 0 && (
          <div className="border-t border-gray-200">
            <div className="w-full px-6">
              <div className="flex gap-0 nav-tabs overflow-x-auto">
                {currentSubTabs.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => changeSubTab(value)}
                    className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeSubTab === value
                        ? 'border-amber-500 text-amber-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-8 relative z-10 flex gap-6 items-start">

        <div className="flex-1 min-w-0">
          {activeView === 'overview'                                  && <Overview   {...sharedProps} />}
          {activeView === 'workflows'                                 && <Workflows  {...sharedProps} />}
          {activeView === 'inventory'                                 && <Inventory  {...sharedProps} />}
          {activeView === 'calendar' && activeSubTab === 'production' && <Calendar   {...sharedProps} />}
          {activeView === 'calendar' && activeSubTab === 'upcoming'   && <Upcoming   {...sharedProps} />}
          {activeView === 'calendar' && activeSubTab === 'catering'   && <Catering   {...sharedProps} />}
          {activeView === 'calendar' && activeSubTab === 'customers'  && <Customers  {...sharedProps} />}
          {activeView === 'schedule'                                  && <Schedule   {...sharedProps} />}
          {activeView === 'analytics'                                 && <Analytics  {...sharedProps} />}
        </div>

        {user && (
          <div className={`hidden xl:block sticky ${notesTopOffset} self-start`}>
            <StickyNotes userId={user.id} />
          </div>
        )}

      </div>
    </div>
  );
}