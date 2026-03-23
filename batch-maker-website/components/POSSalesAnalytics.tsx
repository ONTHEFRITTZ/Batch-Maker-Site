/**
 * components/POSSalesAnalytics.tsx
 *
 * Drop this into DashboardAnalytics.tsx at the bottom of the component (before closing </>).
 *
 * Usage:
 *   import POSSalesAnalytics from './POSSalesAnalytics';
 *   // At bottom of Analytics component return, add:
 *   <POSSalesAnalytics userId={user?.id} locations={locations} selectedLocationId={selectedLocationId} />
 */

'use client';
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

interface PosSale {
  item_name: string;
  item_id_external: string;
  date: string;
  quantity_sold: number;
  revenue: number;
  provider: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function POSSalesAnalytics({
  userId,
  locations = [],
  selectedLocationId = 'all',
}: {
  userId?: string;
  locations?: any[];
  selectedLocationId?: string;
}) {
  const [sales, setSales] = useState<PosSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'top-sellers' | 'by-day' | 'slow-movers' | 'revenue'>('top-sellers');
  const [dateRange, setDateRange] = useState<7 | 14 | 28 | 90>(28);

  const selectedLocation = selectedLocationId !== 'all'
    ? locations.find((l: any) => l.id === selectedLocationId)
    : locations.find((l: any) => l.is_default) ?? locations[0];
  const currencySymbol = (selectedLocation as any)?.currency_symbol ?? '$';

  useEffect(() => {
    if (!userId) return;
    loadSales();
  }, [userId, dateRange]);

  async function loadSales() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - dateRange);
    const sinceStr = since.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('pos_sales')
      .select('item_name, item_id_external, date, quantity_sold, revenue, provider')
      .eq('owner_id', userId!)
      .gte('date', sinceStr)
      .order('date', { ascending: false });

    if (error) {
      setLoading(false);
      return;
    }

    setConnected(!!(data && data.length > 0));
    setSales(data || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          POS Sales Analytics
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
          POS Sales Analytics
        </h2>
        <div className="text-center py-10">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-gray-500 text-sm mb-2">No POS data yet.</p>
          <p className="text-gray-400 text-xs">
            Connect a POS system in{' '}
            <a href="/settings" className="text-cyan-600 hover:underline">Settings → POS Integration</a>
            {' '}to see sales analytics here.
          </p>
        </div>
      </div>
    );
  }

  // ── Compute aggregates ──────────────────────────────────────────────────
  const totalRevenue = sales.reduce((s, r) => s + r.revenue, 0);
  const totalQty = sales.reduce((s, r) => s + r.quantity_sold, 0);
  const uniqueItems = new Set(sales.map(s => s.item_id_external)).size;

  // Top sellers by quantity
  const byItem: Record<string, { name: string; qty: number; revenue: number; days: Set<string> }> = {};
  for (const s of sales) {
    if (!byItem[s.item_id_external]) byItem[s.item_id_external] = { name: s.item_name, qty: 0, revenue: 0, days: new Set() };
    byItem[s.item_id_external].qty += s.quantity_sold;
    byItem[s.item_id_external].revenue += s.revenue;
    byItem[s.item_id_external].days.add(s.date);
  }

  const topSellers = Object.values(byItem).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const slowMovers = Object.values(byItem)
    .filter(i => i.qty > 0)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 10);

  // Revenue by day
  const revenueByDay: Record<string, number> = {};
  for (const s of sales) {
    revenueByDay[s.date] = (revenueByDay[s.date] || 0) + s.revenue;
  }
  const revenueByDayArr = Object.entries(revenueByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14); // last 14 days max for display

  // Sales by day-of-week
  const byDOW: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const s of sales) {
    const dow = new Date(s.date + 'T00:00:00').getDay();
    byDOW[dow] += s.quantity_sold;
  }
  const maxDOWQty = Math.max(...Object.values(byDOW), 1);

  return (
    <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          POS Sales Analytics
        </h2>
        <select
          value={dateRange}
          onChange={e => setDateRange(Number(e.target.value) as any)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={28}>Last 28 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-1">Total Revenue</div>
          <div className="text-xl font-semibold text-gray-900">{currencySymbol}{totalRevenue.toFixed(2)}</div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-1">Units Sold</div>
          <div className="text-xl font-semibold text-gray-900">{Math.round(totalQty).toLocaleString()}</div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-1">Unique Items</div>
          <div className="text-xl font-semibold text-gray-900">{uniqueItems}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {(['top-sellers', 'by-day', 'slow-movers', 'revenue'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'top-sellers' ? '🔥 Top Sellers' : tab === 'by-day' ? '📅 By Day' : tab === 'slow-movers' ? '🐌 Slow Movers' : '💰 Revenue'}
          </button>
        ))}
      </div>

      {/* Top Sellers */}
      {activeTab === 'top-sellers' && (
        <div className="space-y-2">
          {topSellers.map((item, i) => {
            const pct = (item.qty / (topSellers[0]?.qty || 1)) * 100;
            return (
              <div key={item.name} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                    <span className="text-sm font-medium text-gray-900">{item.name}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>{Math.round(item.qty)} sold</span>
                    <span className="font-semibold text-gray-700">{currencySymbol}{item.revenue.toFixed(2)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* By Day of Week */}
      {activeTab === 'by-day' && (
        <div>
          <p className="text-xs text-gray-500 mb-4">Total units sold by day of week over selected period</p>
          <div className="flex items-end gap-2 h-40">
            {DAYS.map((day, dow) => {
              const qty = byDOW[dow];
              const heightPct = (qty / maxDOWQty) * 100;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500">{Math.round(qty)}</span>
                  <div className="w-full bg-gray-100 rounded-t overflow-hidden" style={{ height: '120px' }}>
                    <div
                      className="w-full bg-cyan-400 rounded-t transition-all"
                      style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-600">{day}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Slow Movers */}
      {activeTab === 'slow-movers' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-3">Items with lowest sales volume — consider reducing batch sizes or discontinuing.</p>
          {slowMovers.map((item, i) => (
            <div key={item.name} className="p-3 bg-orange-50 rounded-lg border border-orange-200 flex justify-between items-center">
              <span className="text-sm text-gray-900">{item.name}</span>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>{Math.round(item.qty)} sold</span>
                <span>{currencySymbol}{item.revenue.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revenue by Day */}
      {activeTab === 'revenue' && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 mb-3">Daily revenue (last {Math.min(revenueByDayArr.length, 14)} days)</p>
          {revenueByDayArr.map(([date, rev]) => {
            const maxRev = Math.max(...revenueByDayArr.map(([, r]) => r), 1);
            const pct = (rev / maxRev) * 100;
            return (
              <div key={date} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 flex-shrink-0">
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-green-400 rounded transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-medium text-gray-700 w-16 text-right flex-shrink-0">
                  {currencySymbol}{rev.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}