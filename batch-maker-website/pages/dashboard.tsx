'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../lib/supabase';
import Link from 'next/link';
import Overview from '../components/DashboardOverview';
import Workflows from '../components/DashboardWorkflows';
import Inventory from '../components/DashboardInventory';
import Calendar from '../components/DashboardCalendar';
import Schedule from '../components/DashboardSchedule';
import Analytics from '../components/DashboardAnalytics';
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
  ScheduledBatch
} from '../lib/dashboard-types';

const supabase = getSupabaseClient();

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

  // FIX: useRef keeps fetch closures from capturing stale selectedLocationId.
  // All fetch functions read selectedLocationRef.current so they always use the latest value.
  const selectedLocationRef = useRef<string>('all');

  // Keep ref in sync with state
  useEffect(() => {
    selectedLocationRef.current = selectedLocationId;
  }, [selectedLocationId]);

  // Read activeView from URL params, default to 'overview'
  const activeView = (searchParams.get('view') as 'overview' | 'workflows' | 'inventory' | 'calendar' | 'schedule' | 'analytics') || 'overview';

  useEffect(() => {
    checkUser();
  }, []);

  // Refetch data when location selection changes
  useEffect(() => {
    if (user && !loading) {
      fetchWorkflows(user.id);
      fetchBatches(user.id);
      fetchBatchReports(user.id);
      fetchBatchTemplates(user.id);
      fetchInventoryItems(user.id);
      fetchInventoryTransactions(user.id);
      fetchShoppingList(user.id);
      fetchScheduledBatches(user.id);
    }
  }, [selectedLocationId]);

  useEffect(() => {
    if (!user) return;

    // Real-time subscriptions
    const inventoryChannel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `user_id=eq.${user.id}` },
        () => fetchInventoryItems(user.id))
      .subscribe();

    const scheduledChannel = supabase
      .channel('scheduled-batches-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_batches', filter: `user_id=eq.${user.id}` },
        () => fetchScheduledBatches(user.id))
      .subscribe();

    const workflowChannel = supabase
      .channel('workflow-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflows'
      }, (payload) => {
        console.log('Workflow changed:', payload);
        fetchWorkflows(user.id);
      })
     .subscribe();

    const batchChannel = supabase
      .channel('batch-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'batches',
        filter: `user_id=eq.${user.id}`
      }, () => fetchBatches(user.id))
      .subscribe();

    return () => {
      supabase.removeChannel(inventoryChannel);
      supabase.removeChannel(scheduledChannel);
      supabase.removeChannel(workflowChannel);
      supabase.removeChannel(batchChannel);
    };
  }, [user]);

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      window.location.href = '/login';
      return;
    }

    setUser(session.user);
    await fetchData(session.user.id);
  }

  async function fetchData(userId: string) {
    try {
      await fetchProfile(userId);
      
      // Check if user is premium after profile is loaded
      const profileData = await new Promise<any>((resolve) => {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
          .then(({ data }) => resolve(data));
      });

      const premium = profileData?.role === 'premium' || profileData?.role === 'admin';
      
      if (!premium) {
        // Redirect free users to account page
        window.location.href = '/account';
        return;
      }

      // Only fetch dashboard data for premium users
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
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLocations(userId: string) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('name');
    
    if (!error && data) {
      setLocations(data);
      // Set default location as selected if it exists
      const defaultLocation = data.find(loc => loc.is_default);
      if (defaultLocation) {
        setSelectedLocationId(defaultLocation.id);
        selectedLocationRef.current = defaultLocation.id;
      }
    }
  }

  async function fetchProfile(userId: string) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    setProfile(profileData);

    const isPremium = profileData?.role === 'premium' || profileData?.role === 'admin';
    if (isPremium) {
      // Try alternative query - fetch separately if join fails
      const { data: membersData, error: membersError } = await supabase
        .from('networks')
        .select('*')
        .eq('owner_id', userId);

      if (membersData && !membersError) {
        // Fetch profiles separately and merge
        const userIds = membersData.map((m: any) => m.user_id).filter(Boolean);
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, email, device_name')
            .in('id', userIds);

          // Merge profiles into members
          const membersWithProfiles = membersData.map((member: any) => ({
            ...member,
            profiles: profilesData?.find((p: any) => p.id === member.user_id)
          }));
          
          setNetworkMembers(membersWithProfiles || []);
        } else {
          setNetworkMembers(membersData || []);
        }
      }
    }
  }

  // FIX: All fetch functions now read from selectedLocationRef.current instead of
  // closing over the stale `selectedLocationId` state variable.
  async function fetchWorkflows(userId: string) {
    const locId = selectedLocationRef.current;
    let query = supabase
      .from('workflows')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);
    
    if (locId && locId !== 'all') {
      query = query.eq('location_id', locId);
    }
    
    const { data } = await query.order('created_at', { ascending: false });
    setWorkflows(data || []);
  }

  async function fetchBatches(userId: string) {
    const locId = selectedLocationRef.current;
    let query = supabase
      .from('batches')
      .select('*')
      .eq('user_id', userId);
    
    if (locId && locId !== 'all') {
      query = query.eq('location_id', locId);
    }
    
    const { data } = await query.order('created_at', { ascending: false });
    setBatches(data || []);
  }

  async function fetchBatchReports(userId: string) {
    const locId = selectedLocationRef.current;
    let query = supabase
      .from('batch_completion_reports')
      .select('*')
      .eq('user_id', userId);
    
    if (locId && locId !== 'all') {
      query = query.eq('location_id', locId);
    }
    
    const { data, error } = await query.order('timestamp', { ascending: false });
    
    if (error) {
      console.error('Error fetching batch reports:', error);
    }
    
    setBatchReports(data || []);
  }

  async function fetchBatchTemplates(userId: string) {
    const { data } = await supabase
      .from('batch_templates')
      .select('*')
      .eq('created_by', userId)
      .order('times_used', { ascending: false });
    setBatchTemplates(data || []);
  }

  async function fetchInventoryItems(userId: string) {
    const locId = selectedLocationRef.current;
    let query = supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', userId);
    
    if (locId && locId !== 'all') {
      query = query.eq('location_id', locId);
    }
    
    const { data, error } = await query.order('name');
    
    if (error) console.error('Error fetching inventory:', error);
    else setInventoryItems(data || []);
  }

  async function fetchInventoryTransactions(userId: string) {
    const locId = selectedLocationRef.current;
    let query = supabase
      .from('inventory_transactions')
      .select('*')
      .eq('user_id', userId);
    
    if (locId && locId !== 'all') {
      query = query.eq('location_id', locId);
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) console.error('Error fetching transactions:', error);
    else setInventoryTransactions(data || []);
  }

  async function fetchShoppingList(userId: string) {
    const locId = selectedLocationRef.current;
    let query = supabase
      .from('shopping_list')
      .select('*')
      .eq('user_id', userId);
    
    if (locId && locId !== 'all') {
      query = query.eq('location_id', locId);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) console.error('Error fetching shopping list:', error);
    else setShoppingList(data || []);
  }

  async function fetchScheduledBatches(userId: string) {
    const locId = selectedLocationRef.current;
    let query = supabase
      .from('scheduled_batches')
      .select('*')
      .eq('user_id', userId);
    
    if (locId && locId !== 'all') {
      query = query.eq('location_id', locId);
    }
    
    const { data, error } = await query.order('scheduled_date');
    
    if (error) console.error('Error fetching scheduled batches:', error);
    else setScheduledBatches(data || []);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  // Helper function to change view and update URL
  function changeView(view: 'overview' | 'workflows' | 'inventory' | 'calendar' | 'schedule' | 'analytics') {
    router.push(`/dashboard?view=${view}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading Dashboard...</div>
      </div>
    );
  }

  const isPremium = profile?.role === 'premium' || profile?.role === 'admin';

  // FIX: sharedProps fetch functions now call fetchXxx(user.id) directly.
  // Because fetchXxx reads from selectedLocationRef.current internally, these
  // closures are always correct regardless of when they were created.
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
    isPremium,
    fetchInventoryItems: () => fetchInventoryItems(user.id),
    fetchInventoryTransactions: () => fetchInventoryTransactions(user.id),
    fetchShoppingList: () => fetchShoppingList(user.id),
    fetchScheduledBatches: () => fetchScheduledBatches(user.id),
    fetchWorkflows: () => fetchWorkflows(user.id),
    fetchBatches: () => fetchBatches(user.id),
  };

  const navItems = [
    {
      key: 'overview',
      label: 'Overview',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
    {
      key: 'workflows',
      label: 'Workflows',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      ),
    },
    {
      key: 'inventory',
      label: 'Inventory',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      ),
    },
    {
      key: 'calendar',
      label: 'Calendar',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
    },
    {
      key: 'schedule',
      label: 'Schedule',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
    {
      key: 'analytics',
      label: 'Analytics',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen dashboard-bg">
      {/* Header - z-50 */}
      <header className="glass-card border-b border-gray-200 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img
              src="/assets/images/batch-maker-logo.png"
              alt="Batch Maker"
              className="h-10 w-10 object-contain"
            />
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
              {isPremium && <p className="text-sm text-gray-500 mt-1">Premium Account</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Location Selector */}
            {locations.length > 0 && (
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  selectedLocationRef.current = e.target.value;
                  setSelectedLocationId(e.target.value);
                }}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Locations</option>
                {locations.map((location: any) => (
                  <option key={location.id} value={location.id}>
                    {location.name}{location.is_default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Hamburger menu (Account / Settings / Sign Out) */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <Link
                    href="/account"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Account
                  </Link>
                  <Link
                    href="/settings"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </Link>
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tab Bar - z-40, sticky below header */}
      <div className="glass-card border-b border-gray-200 sticky top-[72px] z-40">
        <div className="flex justify-center items-end">
          {navItems.map(({ key, label, icon }) => {
            if (key === 'schedule' && !isPremium) return null;
            return (
              <button
                key={key}
                onClick={() => changeView(key as any)}
                className={`flex flex-col items-center justify-center gap-1 px-8 py-3 text-xs font-medium transition-colors relative whitespace-nowrap ${
                  activeView === key
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {icon}
                {label}
                {activeView === key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        {activeView === 'overview' && <Overview {...sharedProps} />}
        {activeView === 'workflows' && <Workflows {...sharedProps} />}
        {activeView === 'inventory' && <Inventory {...sharedProps} />}
        {activeView === 'calendar' && <Calendar {...sharedProps} />}
        {activeView === 'schedule' && <Schedule {...sharedProps} />}
        {activeView === 'analytics' && <Analytics {...sharedProps} />}
      </main>
    </div>
  );
}