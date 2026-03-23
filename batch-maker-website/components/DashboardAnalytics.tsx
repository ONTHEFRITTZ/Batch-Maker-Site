'use client';

import { useState, useEffect } from 'react';
import type { DashboardProps } from '../lib/dashboard-types';
import { getSupabaseClient } from '../lib/supabase';
import POSSalesAnalytics from './POSSalesAnalytics';

const supabase = getSupabaseClient();

// ─── Types ────────────────────────────────────────────────────────────────────
interface CategorySpend {
  category: string;
  totalInvoiced: number;
  totalPaid: number;
  lineItemCount: number;
}

interface SupplierSpend {
  supplierId: string;
  supplierName: string;
  totalInvoiced: number;
  totalPaid: number;
  orderCount: number;
  unpaidBalance: number;
}

interface PriceTrendItem {
  itemName: string;
  points: { date: string; unitPrice: number }[];
  latestPrice: number;
  previousPrice: number | null;
  priceChange: number | null;
}

interface InventoryOverviewItem {
  id: string;
  name: string;
  ingredient: string | null;
  category: string | null;
  unit: string | null;
  par_level: number | null;
  supplier_name: string | null;
  location_name: string | null;
  total_quantity: number;
  below_par: boolean;
}

interface LabourEntry {
  userId: string;
  name: string;
  email: string;
  jobTitle: string | null;
  hourlyRate: number;
  totalHours: number;
  labourCost: number;
  shiftCount: number;
  locationName: string | null;
}

interface LabourDay {
  date: string;
  totalHours: number;
  totalCost: number;
  entries: LabourEntry[];
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({
  points,
  width = 120,
  height = 36,
  flagged = false,
}: {
  points: { date: string; unitPrice: number }[];
  width?: number;
  height?: number;
  flagged?: boolean;
}) {
  if (points.length < 2) return <span className="text-xs text-gray-400 italic">No trend</span>;
  const prices = points.map(p => p.unitPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const padX = 4; const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * innerW;
    const y = padY + (1 - (p.unitPrice - min) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = flagged ? '#ef4444' : '#0891B2';
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {(() => {
        const last = coords[coords.length - 1].split(',');
        return <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />;
      })()}
    </svg>
  );
}

// ─── Bar row ──────────────────────────────────────────────────────────────────
function BarRow({ label, invoiced, paid, maxValue, sym }: {
  label: string; invoiced: number; paid: number; maxValue: number; sym: string;
}) {
  const invoicedPct = maxValue > 0 ? (invoiced / maxValue) * 100 : 0;
  const paidPct = maxValue > 0 ? (paid / maxValue) * 100 : 0;
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-medium text-gray-800 truncate pr-4">{label}</span>
        <div className="flex gap-3 text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
          <span className="text-gray-700 font-medium">{sym}{invoiced.toFixed(2)} invoiced</span>
          <span className="text-green-600 font-medium">{sym}{paid.toFixed(2)} paid</span>
        </div>
      </div>
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
        <div className="absolute top-0 left-0 h-full bg-cyan-100 rounded-full transition-all" style={{ width: `${invoicedPct}%` }} />
        <div className="absolute top-0 left-0 h-full bg-green-400 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
      </div>
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) =>
    typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, "'")}"` : String(v);
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/90 rounded-xl p-6 mb-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Analytics({
  user,
  batchReports,
  batchTemplates,
  inventoryTransactions,
  scheduledBatches,
  locations = [],
  selectedLocationId = 'all',
  activeSubTab,
  onSubTabChange,
  fetchBatchReports,
}: DashboardProps) {

  const VALID_TABS = ['batch', 'waste', 'inventory', 'reports', 'labour', 'pos'] as const;
  type AnalyticsTab = typeof VALID_TABS[number];
  const resolvedTab: AnalyticsTab =
    VALID_TABS.includes(activeSubTab as AnalyticsTab)
      ? (activeSubTab as AnalyticsTab)
      : 'batch';

  const selectedLocation = selectedLocationId !== 'all'
    ? locations.find((l: any) => l.id === selectedLocationId)
    : locations.find((l: any) => l.is_default) ?? locations[0];
  const sym = (selectedLocation as any)?.currency_symbol ?? '$';

  // ── Inventory analytics state ──────────────────────────────────────────
  const [invDateFrom, setInvDateFrom] = useState('');
  const [invDateTo, setInvDateTo] = useState('');
  const [categorySpend, setCategorySpend] = useState<CategorySpend[]>([]);
  const [supplierSpend, setSupplierSpend] = useState<SupplierSpend[]>([]);
  const [priceTrends, setPriceTrends] = useState<PriceTrendItem[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);

  // ── Inventory overview state (new schema) ──────────────────────────────
  const [overviewItems, setOverviewItems] = useState<InventoryOverviewItem[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // ── Labour state ───────────────────────────────────────────────────────
  const [labourDateFrom, setLabourDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [labourDateTo, setLabourDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [labourEntries, setLabourEntries] = useState<LabourEntry[]>([]);
  const [labourDays, setLabourDays] = useState<LabourDay[]>([]);
  const [labourLoading, setLabourLoading] = useState(false);
  const [labourError, setLabourError] = useState<string | null>(null);
  const [labourGroupBy, setLabourGroupBy] = useState<'employee' | 'day'>('employee');

  // ── Batch reports state ────────────────────────────────────────────────
  const [reportSearch, setReportSearch] = useState('');
  const [reportFilterWorkflow, setReportFilterWorkflow] = useState('all');
  const [reportFilterStatus, setReportFilterStatus] = useState<'all' | 'completed' | 'wasted'>('all');
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch triggers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (resolvedTab === 'inventory') {
      fetchInventoryOverview();
      fetchInventoryAnalytics();
    }
  }, [resolvedTab, selectedLocationId, invDateFrom, invDateTo]); // eslint-disable-line

  useEffect(() => {
    if (resolvedTab === 'labour') fetchLabourData();
  }, [resolvedTab, selectedLocationId, labourDateFrom, labourDateTo]); // eslint-disable-line

  // ── Inventory overview fetch (new schema) ──────────────────────────────
  async function fetchInventoryOverview() {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      let query = supabase
        .from('inventory_items')
        .select(`
          id, name, ingredient, category, unit, par_level, supplier_id, location_id,
          location_inventory(location_id, quantity)
        `)
        .eq('owner_id', user.id);

      if (selectedLocationId !== 'all') {
        query = query.eq('location_id', selectedLocationId);
      }

      const { data: items, error: itemsErr } = await query.order('name');
      if (itemsErr) throw itemsErr;
      if (!items?.length) { setOverviewItems([]); return; }

      const supplierIds = [...new Set(items.map((i: any) => i.supplier_id).filter(Boolean))];
      const { data: suppliersData } = supplierIds.length
        ? await supabase.from('suppliers').select('id, name').in('id', supplierIds)
        : { data: [] as any[] };
      const supplierMap: Record<string, string> = {};
      (suppliersData ?? []).forEach((s: any) => { supplierMap[s.id] = s.name; });

      const locationMap: Record<string, string> = {};
      locations.forEach((l: any) => { locationMap[l.id] = l.name; });

      const mapped: InventoryOverviewItem[] = items.map((item: any) => {
        const locInv: any[] = item.location_inventory ?? [];
        const totalQty = selectedLocationId !== 'all'
          ? (locInv.find((li: any) => li.location_id === selectedLocationId)?.quantity ?? 0)
          : locInv.reduce((s: number, li: any) => s + (li.quantity ?? 0), 0);
        const belowPar = item.par_level != null && totalQty < item.par_level;
        return {
          id: item.id,
          name: item.name,
          ingredient: item.ingredient ?? null,
          category: item.category ?? null,
          unit: item.unit ?? null,
          par_level: item.par_level ?? null,
          supplier_name: item.supplier_id ? (supplierMap[item.supplier_id] ?? null) : null,
          location_name: item.location_id ? (locationMap[item.location_id] ?? null) : 'All Locations',
          total_quantity: totalQty,
          below_par: belowPar,
        };
      });

      setOverviewItems(mapped);
    } catch (err: any) {
      console.error('Error fetching inventory overview:', err);
      setOverviewError('Failed to load inventory overview.');
    } finally {
      setOverviewLoading(false);
    }
  }

  // ── Inventory analytics fetch (orders/spend) ───────────────────────────
  async function fetchInventoryAnalytics() {
    setInvLoading(true);
    setInvError(null);
    try {
      let orderQuery = supabase
        .from('orders')
        .select('id, supplier_id, status, total, order_date')
        .eq('owner_id', user.id);
      if (selectedLocationId !== 'all') orderQuery = orderQuery.eq('location_id', selectedLocationId);
      if (invDateFrom) orderQuery = orderQuery.gte('order_date', invDateFrom);
      if (invDateTo) orderQuery = orderQuery.lte('order_date', invDateTo);

      const { data: orders, error: invErr } = await orderQuery;
      if (invErr) throw invErr;

      const supplierIds = [...new Set((orders || []).map((o: any) => o.supplier_id).filter(Boolean))];
      const { data: suppliersData } = supplierIds.length
        ? await supabase.from('suppliers').select('id, name').in('id', supplierIds)
        : { data: [] as any[] };
      const supplierMap: Record<string, string> = {};
      (suppliersData || []).forEach((s: any) => { supplierMap[s.id] = s.name; });

      if (!orders || orders.length === 0) {
        setCategorySpend([]); setSupplierSpend([]); setPriceTrends([]);
        setInvLoading(false); return;
      }

      const orderIds = orders.map((i: any) => i.id);
      const { data: lineItems, error: liErr } = await supabase
        .from('order_line_items')
        .select('id, order_id, name, category, quantity, unit_price, extended_price, quantity_received')
        .in('order_id', orderIds);
      if (liErr) throw liErr;

      // Category spend
      const catMap: Record<string, CategorySpend> = {};
      (lineItems || []).forEach((li: any) => {
        const inv = orders.find((i: any) => i.id === li.order_id);
        if (!inv) return;
        const cat = li.category || 'Uncategorized';
        if (!catMap[cat]) catMap[cat] = { category: cat, totalInvoiced: 0, totalPaid: 0, lineItemCount: 0 };
        const amount = li.extended_price ?? 0;
        catMap[cat].totalInvoiced += amount;
        if (inv.status === 'paid') catMap[cat].totalPaid += amount;
        catMap[cat].lineItemCount++;
      });
      setCategorySpend(Object.values(catMap).sort((a, b) => b.totalInvoiced - a.totalInvoiced));

      // Supplier spend
      const supMap: Record<string, SupplierSpend> = {};
      orders.forEach((inv: any) => {
        const supId = inv.supplier_id ?? 'unknown';
        const supName = supplierMap[inv.supplier_id] ?? 'Unknown Supplier';
        if (!supMap[supId]) supMap[supId] = { supplierId: supId, supplierName: supName, totalInvoiced: 0, totalPaid: 0, orderCount: 0, unpaidBalance: 0 };
        const total = inv.total ?? 0;
        supMap[supId].totalInvoiced += total;
        supMap[supId].orderCount++;
        if (inv.status === 'paid') supMap[supId].totalPaid += total;
        else supMap[supId].unpaidBalance += total;
      });
      setSupplierSpend(Object.values(supMap).sort((a, b) => b.totalInvoiced - a.totalInvoiced));

      // Price trends
      const itemMap: Record<string, { date: string; unitPrice: number }[]> = {};
      (lineItems || []).forEach((li: any) => {
        if (li.unit_price == null) return;
        const inv = orders.find((i: any) => i.id === li.order_id);
        if (!inv?.order_date) return;
        const key = li.name.trim().toLowerCase();
        if (!itemMap[key]) itemMap[key] = [];
        itemMap[key].push({ date: inv.order_date, unitPrice: li.unit_price });
      });

      const trendsFinal: PriceTrendItem[] = Object.entries(itemMap).map(([key, pts]) => {
        const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
        const latest = sorted[sorted.length - 1].unitPrice;
        const previous = sorted.length >= 2 ? sorted[sorted.length - 2].unitPrice : null;
        const change = previous != null && previous > 0 ? ((latest - previous) / previous) * 100 : null;
        const rawLi = (lineItems || []).find((li: any) => li.name.trim().toLowerCase() === key);
        return { itemName: rawLi?.name ?? key, points: sorted, latestPrice: latest, previousPrice: previous, priceChange: change };
      }).filter(t => t.points.length > 0)
        .sort((a, b) => {
          const aF = (a.priceChange ?? 0) > 10;
          const bF = (b.priceChange ?? 0) > 10;
          if (aF && !bF) return -1;
          if (!aF && bF) return 1;
          return b.points[b.points.length - 1].date.localeCompare(a.points[a.points.length - 1].date);
        });

      setPriceTrends(trendsFinal);
    } catch (err: any) {
      console.error('Error fetching inventory analytics:', err);
      setInvError('Failed to load inventory analytics. Please try again.');
    } finally {
      setInvLoading(false);
    }
  }

  // ── Labour fetch ───────────────────────────────────────────────────────
  async function fetchLabourData() {
    setLabourLoading(true);
    setLabourError(null);
    try {
      const dayStart = `${labourDateFrom}T00:00:00.000Z`;
      const dayEnd = `${labourDateTo}T23:59:59.999Z`;

      let timeQuery = supabase
        .from('time_entries')
        .select('user_id, clock_in, clock_out, total_hours, location_id')
        .eq('owner_id', user.id)
        .gte('clock_in', dayStart)
        .lte('clock_in', dayEnd)
        .not('clock_out', 'is', null); // only completed shifts

      if (selectedLocationId !== 'all') {
        timeQuery = timeQuery.eq('location_id', selectedLocationId);
      }

      const { data: entries, error: entriesErr } = await timeQuery;
      if (entriesErr) throw entriesErr;

      if (!entries?.length) {
        setLabourEntries([]);
        setLabourDays([]);
        setLabourLoading(false);
        return;
      }

      const userIds = [...new Set(entries.map((e: any) => e.user_id))];

      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from('network_member_roles').select('user_id, hourly_rate, job_title').eq('owner_id', user.id).in('user_id', userIds),
        supabase.from('profiles').select('id, email, device_name').in('id', userIds),
      ]);

      const rateMap: Record<string, { rate: number; jobTitle: string | null }> = {};
      (roles ?? []).forEach((r: any) => { rateMap[r.user_id] = { rate: r.hourly_rate ?? 0, jobTitle: r.job_title ?? null }; });

      const nameMap: Record<string, string> = {};
      const emailMap: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => {
        nameMap[p.id] = p.device_name || p.email || 'Unknown';
        emailMap[p.id] = p.email || '';
      });

      const locationMap: Record<string, string> = {};
      locations.forEach((l: any) => { locationMap[l.id] = l.name; });

      // Aggregate per employee
      const empMap: Record<string, LabourEntry> = {};
      entries.forEach((e: any) => {
        const uid = e.user_id;
        const hours = e.total_hours ?? 0;
        const rate = rateMap[uid]?.rate ?? 0;
        if (!empMap[uid]) {
          empMap[uid] = {
            userId: uid,
            name: nameMap[uid] ?? 'Unknown',
            email: emailMap[uid] ?? '',
            jobTitle: rateMap[uid]?.jobTitle ?? null,
            hourlyRate: rate,
            totalHours: 0,
            labourCost: 0,
            shiftCount: 0,
            locationName: e.location_id ? (locationMap[e.location_id] ?? null) : null,
          };
        }
        empMap[uid].totalHours += hours;
        empMap[uid].labourCost += hours * rate;
        empMap[uid].shiftCount++;
      });
      const empList = Object.values(empMap).sort((a, b) => b.totalHours - a.totalHours);
      setLabourEntries(empList);

      // Aggregate per day
      const dayMap: Record<string, LabourDay> = {};
      entries.forEach((e: any) => {
        const date = e.clock_in.split('T')[0];
        if (!dayMap[date]) dayMap[date] = { date, totalHours: 0, totalCost: 0, entries: [] };
        const hours = e.total_hours ?? 0;
        const rate = rateMap[e.user_id]?.rate ?? 0;
        dayMap[date].totalHours += hours;
        dayMap[date].totalCost += hours * rate;
      });
      setLabourDays(Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date)));

    } catch (err: any) {
      console.error('Error fetching labour data:', err);
      setLabourError('Failed to load labour data. Please try again.');
    } finally {
      setLabourLoading(false);
    }
  }

  // ── Batch computed values ──────────────────────────────────────────────
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);
  const recentReports = batchReports.filter(r => new Date(r.timestamp) >= last30Days);
  const totalCost30d = recentReports.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const wastedReports = batchReports.filter(r => r.wasted);
  const recentWasted = recentReports.filter(r => r.wasted);
  const wasteRate30d = recentReports.length > 0 ? (recentWasted.length / recentReports.length) * 100 : 0;
  const wasteCost30d = recentWasted.reduce((sum, r) => sum + (r.total_cost || 0), 0);

  const wasteByWorkflow = wastedReports.reduce((acc, r) => {
    const key = r.workflow_name || 'Unknown';
    if (!acc[key]) acc[key] = { wasted: 0, cost: 0 };
    acc[key].wasted++;
    acc[key].cost += r.total_cost || 0;
    return acc;
  }, {} as Record<string, { wasted: number; cost: number }>);

  const topWastedWorkflows = Object.entries(wasteByWorkflow).map(([name, s]) => {
    const total = batchReports.filter(r => r.workflow_name === name).length;
    return { name, wasted: s.wasted, total, cost: s.cost, rate: total > 0 ? (s.wasted / total) * 100 : 0 };
  }).sort((a, b) => b.wasted - a.wasted).slice(0, 5);

  const wasteStepCounts = wastedReports.reduce((acc, r) => {
    const step = r.wasted_at_step_name || (r.wasted_at_step != null ? `Step ${r.wasted_at_step + 1}` : 'Unknown');
    acc[step] = (acc[step] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topWasteSteps = Object.entries(wasteStepCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const workflowStats = batchReports.reduce((acc, r) => {
    if (!acc[r.workflow_name]) acc[r.workflow_name] = { count: 0, totalDuration: 0, totalCost: 0 };
    acc[r.workflow_name].count++;
    acc[r.workflow_name].totalDuration += r.actual_duration || 0;
    acc[r.workflow_name].totalCost += r.total_cost || 0;
    return acc;
  }, {} as Record<string, { count: number; totalDuration: number; totalCost: number }>);

  const topWorkflows = Object.entries(workflowStats).map(([name, stats]) => ({
    name, count: stats.count,
    avgDuration: stats.totalDuration / stats.count / 60,
    avgCost: stats.totalCost / stats.count,
  })).sort((a, b) => b.count - a.count).slice(0, 5);

  // ── Report filters ─────────────────────────────────────────────────────
  const uniqueWorkflowNames = Array.from(new Set(batchReports.map(r => r.workflow_name))).sort();
  const filteredReports = batchReports.filter(r => {
    if (reportFilterStatus === 'completed' && r.wasted) return false;
    if (reportFilterStatus === 'wasted' && !r.wasted) return false;
    if (reportFilterWorkflow !== 'all' && r.workflow_name !== reportFilterWorkflow) return false;
    if (reportSearch && !r.batch_name.toLowerCase().includes(reportSearch.toLowerCase())) return false;
    if (reportDateFrom && r.date < reportDateFrom) return false;
    if (reportDateTo && r.date > reportDateTo) return false;
    return true;
  }).sort((a, b) => b.timestamp - a.timestamp);

  const filteredWasteCount = filteredReports.filter(r => r.wasted).length;
  const filteredTotalCost = filteredReports.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const filteredWithDuration = filteredReports.filter(r => r.actual_duration);
  const filteredAvgDuration = filteredWithDuration.length > 0
    ? Math.round(filteredWithDuration.reduce((sum, r) => sum + (r.actual_duration || 0), 0) / filteredWithDuration.length / 60)
    : 0;
  const hasActiveFilters = reportSearch || reportFilterWorkflow !== 'all' || reportFilterStatus !== 'all' || reportDateFrom || reportDateTo;

  // ── Labour computed values ─────────────────────────────────────────────
  const totalLabourHours = labourEntries.reduce((s, e) => s + e.totalHours, 0);
  const totalLabourCost = labourEntries.reduce((s, e) => s + e.labourCost, 0);
  const avgHourlyRate = labourEntries.length > 0
    ? labourEntries.reduce((s, e) => s + e.hourlyRate, 0) / labourEntries.length
    : 0;

  // ── Delete report ──────────────────────────────────────────────────────
  async function handleDeleteReport(reportId: string) {
    if (!confirm('Delete this batch report? This cannot be undone.')) return;
    setDeletingId(reportId);
    try {
      const { error } = await supabase.from('batch_completion_reports').delete().eq('id', reportId);
      if (error) throw error;
      if (expandedReportId === reportId) setExpandedReportId(null);
      if (fetchBatchReports) fetchBatchReports();
    } catch (err) {
      console.error('Error deleting report:', err);
      alert('Failed to delete report');
    } finally {
      setDeletingId(null);
    }
  }

  // ── CSV exports ────────────────────────────────────────────────────────
  function exportBatchReportsCSV() {
    const headers = ['Date', 'Time', 'Batch Name', 'Workflow', 'Batch Size', 'Duration (min)', 'Cost', 'Yield', 'Status', 'Waste Step', 'Waste Notes', 'Notes'];
    const rows = filteredReports.map(r => [
      r.date, r.time, r.batch_name, r.workflow_name, `${r.batch_size_multiplier}x`,
      r.actual_duration ? Math.round(r.actual_duration / 60) : '',
      r.total_cost != null ? r.total_cost.toFixed(2) : '',
      r.yield_amount != null ? `${r.yield_amount}${r.yield_unit ? ' ' + r.yield_unit : ''}` : '',
      r.wasted ? 'Wasted' : 'Completed',
      r.wasted_at_step_name || (r.wasted_at_step != null ? `Step ${r.wasted_at_step + 1}` : ''),
      r.waste_notes || '', r.notes || '',
    ]);
    downloadCSV(`batch-reports-${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  }

  function exportSingleReportCSV(report: typeof batchReports[number]) {
    const headers = ['Field', 'Value'];
    const rows: [string, string | number][] = [
      ['Batch Name', report.batch_name], ['Workflow', report.workflow_name],
      ['Date', report.date], ['Time', report.time],
      ['Completed By', report.completed_by || ''],
      ['Batch Size', `${report.batch_size_multiplier}x`],
      ['Duration (min)', report.actual_duration ? Math.round(report.actual_duration / 60) : ''],
      ['Total Cost', report.total_cost != null ? report.total_cost.toFixed(2) : ''],
      ['Yield', report.yield_amount != null ? `${report.yield_amount}${report.yield_unit ? ' ' + report.yield_unit : ''}` : ''],
      ['Status', report.wasted ? 'Wasted' : 'Completed'],
      ['Waste Step', report.wasted_at_step_name || (report.wasted_at_step != null ? `Step ${report.wasted_at_step + 1}` : '')],
      ['Waste Notes', report.waste_notes || ''], ['Notes', report.notes || ''],
    ];
    if (report.ingredients_used?.length) {
      rows.push(['', ''], ['Ingredients Used', '']);
      report.ingredients_used.forEach((ing: any) => {
        rows.push([ing.name, `${ing.amount} ${ing.unit}${ing.cost != null ? ` (${sym}${Number(ing.cost).toFixed(2)})` : ''}`]);
      });
    }
    downloadCSV(`batch-report-${report.batch_name.replace(/\s+/g, '-')}-${report.date}.csv`, headers, rows);
  }

  function exportCategoryCSV() {
    downloadCSV(`category-spend-${new Date().toISOString().split('T')[0]}.csv`,
      ['Category', 'Total Invoiced', 'Total Paid', 'Line Items'],
      categorySpend.map(c => [c.category, c.totalInvoiced.toFixed(2), c.totalPaid.toFixed(2), c.lineItemCount]));
  }

  function exportSupplierCSV() {
    downloadCSV(`supplier-spend-${new Date().toISOString().split('T')[0]}.csv`,
      ['Supplier', 'Total Invoiced', 'Total Paid', 'Unpaid Balance', 'Invoice Count'],
      supplierSpend.map(s => [s.supplierName, s.totalInvoiced.toFixed(2), s.totalPaid.toFixed(2), s.unpaidBalance.toFixed(2), s.orderCount]));
  }

  function exportPriceTrendsCSV() {
    const rows: (string | number)[][] = [];
    priceTrends.forEach(t => t.points.forEach(p => rows.push([t.itemName, p.date, p.unitPrice.toFixed(2)])));
    downloadCSV(`price-trends-${new Date().toISOString().split('T')[0]}.csv`, ['Item', 'Date', 'Unit Price'], rows);
  }

  function exportLabourCSV() {
    downloadCSV(`labour-${labourDateFrom}-to-${labourDateTo}.csv`,
      ['Employee', 'Email', 'Job Title', 'Hourly Rate', 'Total Hours', 'Labour Cost', 'Shifts'],
      labourEntries.map(e => [
        e.name, e.email, e.jobTitle ?? '', `${sym}${e.hourlyRate.toFixed(2)}`,
        e.totalHours.toFixed(2), `${sym}${e.labourCost.toFixed(2)}`, e.shiftCount,
      ]));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── BATCH TAB ── */}
      {resolvedTab === 'batch' && (
        <>
          <Section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Production Trends</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ['Batches This Week', batchReports.filter(r => {
                  const w = new Date(); w.setDate(w.getDate() - w.getDay());
                  return new Date(r.timestamp) >= w;
                }).length],
                ['Batches This Month', batchReports.filter(r => {
                  const d = new Date(r.timestamp); const n = new Date();
                  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
                }).length],
                ['Avg Duration (30d)', recentReports.length > 0
                  ? `${Math.round(recentReports.reduce((s, r) => s + (r.actual_duration || 0), 0) / recentReports.length / 60)} min`
                  : '0 min'],
                ['Scheduled Ahead', scheduledBatches.filter(b => b.status === 'scheduled').length],
              ].map(([label, val]) => (
                <div key={label as string} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase mb-2">{label}</div>
                  <div className="text-xl font-semibold text-gray-900">{val}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Production Costs (30 days)</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  Revenue tracking requires selling prices to be set on batch templates. Cost data comes from ingredient records on each batch.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 uppercase mb-2">Total Production Cost (30d)</div>
                <div className="text-xl font-semibold text-gray-900">{sym}{totalCost30d.toFixed(2)}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 uppercase mb-2">All-Time Production Cost</div>
                <div className="text-xl font-semibold text-gray-900">
                  {sym}{batchReports.reduce((s, r) => s + (r.total_cost || 0), 0).toFixed(2)}
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 uppercase mb-2">Avg Cost Per Batch (30d)</div>
                <div className="text-xl font-semibold text-gray-900">
                  {recentReports.length > 0 ? `${sym}${(totalCost30d / recentReports.length).toFixed(2)}` : '—'}
                </div>
              </div>
            </div>
          </Section>

          <Section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Workflows by Completion</h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-4 bg-gray-50 p-3 font-semibold text-sm text-gray-700 border-b border-gray-200">
                <div className="px-2">Workflow</div>
                <div className="px-2">Completions</div>
                <div className="px-2">Avg Duration</div>
                <div className="px-2">Avg Cost</div>
              </div>
              {topWorkflows.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No completed batches yet</div>
              ) : topWorkflows.map(wf => (
                <div key={wf.name} className="grid grid-cols-4 p-3 text-sm border-b border-gray-200 last:border-b-0">
                  <div className="px-2 font-medium truncate">{wf.name}</div>
                  <div className="px-2">{wf.count}</div>
                  <div className="px-2">{Math.round(wf.avgDuration)} min</div>
                  <div className="px-2">{sym}{wf.avgCost.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {/* ── WASTE TAB ── */}
      {resolvedTab === 'waste' && (
        <Section>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Waste Analytics</h2>
          <p className="text-sm text-gray-500 mb-5">Last 30 days + all-time breakdown</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Waste Rate (30d)', val: `${wasteRate30d.toFixed(1)}%`, sub: `${recentWasted.length} of ${recentReports.length} batches`, color: wasteRate30d > 10 ? 'text-red-600' : wasteRate30d > 5 ? 'text-yellow-600' : 'text-green-600', border: 'border-red-100' },
              { label: 'Cost of Waste (30d)', val: `${sym}${wasteCost30d.toFixed(2)}`, sub: 'ingredients lost', color: 'text-red-600', border: 'border-red-100' },
              { label: 'All-Time Wasted', val: wastedReports.length, sub: `of ${batchReports.length} total batches`, color: 'text-gray-800', border: 'border-gray-100' },
              { label: 'All-Time Waste Cost', val: `${sym}${wastedReports.reduce((s, r) => s + (r.total_cost || 0), 0).toFixed(2)}`, sub: 'total ingredients lost', color: 'text-gray-800', border: 'border-gray-100' },
            ].map(({ label, val, sub, color, border }) => (
              <div key={label} className={`p-4 bg-white rounded-lg border ${border}`}>
                <div className="text-xs text-gray-500 uppercase font-semibold mb-1">{label}</div>
                <div className={`text-2xl font-bold ${color}`}>{val}</div>
                <div className="text-xs text-gray-500 mt-1">{sub}</div>
              </div>
            ))}
          </div>

          {topWastedWorkflows.length > 0 ? (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Most Wasted Workflows</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-4 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                  <div>Workflow</div><div>Wasted / Total</div><div>Rate</div><div>Cost Lost</div>
                </div>
                {topWastedWorkflows.map(wf => (
                  <div key={wf.name} className="grid grid-cols-4 px-4 py-3 text-sm border-b border-gray-100 last:border-0 hover:bg-red-50">
                    <div className="font-medium text-gray-900 truncate pr-2">{wf.name}</div>
                    <div className="text-gray-600">{wf.wasted} / {wf.total}</div>
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${wf.rate > 20 ? 'bg-red-100 text-red-700' : wf.rate > 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {wf.rate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-red-600 font-medium">{sym}{wf.cost.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-100 text-center">
              <p className="text-green-700 font-medium">No waste recorded yet</p>
              <p className="text-sm text-green-600 mt-1">Waste will appear here once batches are marked as wasted in the app.</p>
            </div>
          )}

          {topWasteSteps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Where Batches Fail Most</h3>
              <div className="space-y-2">
                {topWasteSteps.map(([step, count], i) => {
                  const maxCount = topWasteSteps[0][1];
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div className="w-4 text-xs text-gray-400 text-right">{i + 1}</div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-gray-800 font-medium">{step}</span>
                          <span className="text-xs text-red-600 font-semibold">{count}x</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── INVENTORY TAB ── */}
      {resolvedTab === 'inventory' && (
        <>
          {/* Inventory overview — new schema */}
          <Section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Inventory Overview</h2>
            {overviewLoading && <div className="text-center text-gray-400 text-sm py-8">Loading inventory...</div>}
            {overviewError && <div className="text-red-600 text-sm py-4">{overviewError}</div>}
            {!overviewLoading && !overviewError && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 uppercase mb-2">Total Items</div>
                    <div className="text-xl font-semibold text-gray-900">{overviewItems.length}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 uppercase mb-2">Below Par</div>
                    <div className="text-xl font-semibold text-red-500">{overviewItems.filter(i => i.below_par).length}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 uppercase mb-2">Categories</div>
                    <div className="text-xl font-semibold text-gray-900">{new Set(overviewItems.map(i => i.category).filter(Boolean)).size}</div>
                  </div>
                </div>

                {overviewItems.filter(i => i.below_par).length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-red-600 mb-3">Below Par</h3>
                    <div className="border border-red-100 rounded-lg overflow-hidden">
                      <div className="grid grid-cols-5 bg-red-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-red-100">
                        <div className="col-span-2">Item</div>
                        <div>Category</div>
                        <div className="text-right">Qty / Par</div>
                        <div>Supplier</div>
                      </div>
                      {overviewItems.filter(i => i.below_par).map(item => (
                        <div key={item.id} className="grid grid-cols-5 px-4 py-2.5 text-sm border-b border-red-50 last:border-0 bg-white hover:bg-red-50">
                          <div className="col-span-2 font-medium text-gray-900">{item.ingredient ?? item.name}</div>
                          <div className="text-gray-500">{item.category ?? '—'}</div>
                          <div className="text-right text-red-600 font-semibold">
                            {item.total_quantity}/{item.par_level} {item.unit}
                          </div>
                          <div className="text-gray-500 truncate">{item.supplier_name ?? '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <h3 className="text-sm font-semibold text-gray-700 mb-3">By Category</h3>
                <div className="space-y-2">
                  {Object.entries(overviewItems.reduce((acc, item) => {
                    const cat = item.category || 'Uncategorized';
                    if (!acc[cat]) acc[cat] = { count: 0, belowPar: 0 };
                    acc[cat].count++;
                    if (item.below_par) acc[cat].belowPar++;
                    return acc;
                  }, {} as Record<string, { count: number; belowPar: number }>)).map(([cat, data]) => (
                    <div key={cat} className="p-3 bg-gray-50 rounded-md border border-gray-200 flex justify-between items-center">
                      <div className="font-medium text-gray-900">{cat}</div>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>{data.count} items</span>
                        {data.belowPar > 0 && (
                          <span className="text-red-500 font-semibold">{data.belowPar} below par</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {overviewItems.length === 0 && (
                    <p className="text-sm text-gray-400 italic text-center py-4">No inventory items yet.</p>
                  )}
                </div>
              </>
            )}
          </Section>

          {/* Date range filter */}
          <div className="bg-white/90 rounded-xl px-5 py-4 mb-6 shadow-sm border border-cyan-100 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-cyan-700">Filter order data by date:</span>
            <input type="date" value={invDateFrom} onChange={e => setInvDateFrom(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={invDateTo} onChange={e => setInvDateTo(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent" />
            {(invDateFrom || invDateTo) && (
              <button onClick={() => { setInvDateFrom(''); setInvDateTo(''); }} className="text-xs text-cyan-600 hover:text-cyan-800 underline">Clear</button>
            )}
          </div>

          {invLoading && <div className="bg-white/90 rounded-xl p-10 text-center text-gray-400 text-sm mb-6 shadow-sm">Loading order data...</div>}
          {invError && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{invError}</div>}

          {!invLoading && !invError && categorySpend.length === 0 && (
            <div className="bg-white/90 rounded-xl p-10 text-center text-gray-400 shadow-sm mb-6">
              <p className="font-medium text-gray-600 mb-1">No invoice data found</p>
              <p className="text-sm">Invoice analytics will populate once orders have been scanned in the app.</p>
            </div>
          )}

          {!invLoading && !invError && categorySpend.length > 0 && (
            <>
              <Section>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Spend by Category</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Green bar = paid · Cyan bar = total invoiced</p>
                  </div>
                  <button onClick={exportCategoryCSV} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Export CSV</button>
                </div>
                {(() => {
                  const maxVal = Math.max(...categorySpend.map(c => c.totalInvoiced), 1);
                  return categorySpend.map(cat => <BarRow key={cat.category} label={cat.category} invoiced={cat.totalInvoiced} paid={cat.totalPaid} maxValue={maxVal} sym={sym} />);
                })()}
              </Section>

              <Section>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Spend by Supplier</h2>
                  <button onClick={exportSupplierCSV} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Export CSV</button>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-5 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                    <div className="col-span-2">Supplier</div>
                    <div className="text-right">Total Invoiced</div>
                    <div className="text-right">Total Paid</div>
                    <div className="text-right">Unpaid</div>
                  </div>
                  {supplierSpend.map(s => (
                    <div key={s.supplierId} className="grid grid-cols-5 px-4 py-3 text-sm border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <div className="col-span-2">
                        <div className="font-medium text-gray-900">{s.supplierName}</div>
                        <div className="text-xs text-gray-400">{s.orderCount} invoice{s.orderCount !== 1 ? 's' : ''}</div>
                      </div>
                      <div className="text-right text-gray-700">{sym}{s.totalInvoiced.toFixed(2)}</div>
                      <div className="text-right text-green-600">{sym}{s.totalPaid.toFixed(2)}</div>
                      <div className={`text-right font-medium ${s.unpaidBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {s.unpaidBalance > 0 ? `${sym}${s.unpaidBalance.toFixed(2)}` : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Price Trends per Item</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Items with a price increase over 10% are flagged in red</p>
                  </div>
                  <button onClick={exportPriceTrendsCSV} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Export CSV</button>
                </div>
                {priceTrends.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-6">No price data available for the selected date range.</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-12 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                      <div className="col-span-4">Item</div>
                      <div className="col-span-2 text-right">Latest</div>
                      <div className="col-span-2 text-right">Previous</div>
                      <div className="col-span-2 text-right">Change</div>
                      <div className="col-span-2 text-center">Trend</div>
                    </div>
                    {priceTrends.map(item => {
                      const flagged = (item.priceChange ?? 0) > 10;
                      return (
                        <div key={item.itemName} className={`grid grid-cols-12 px-4 py-3 text-sm border-b border-gray-100 last:border-0 items-center ${flagged ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                          <div className="col-span-4 font-medium text-gray-900 truncate pr-2">
                            {item.itemName}
                            {flagged && <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">+{item.priceChange!.toFixed(0)}%</span>}
                          </div>
                          <div className={`col-span-2 text-right font-medium ${flagged ? 'text-red-600' : 'text-gray-800'}`}>{sym}{item.latestPrice.toFixed(2)}</div>
                          <div className="col-span-2 text-right text-gray-500">{item.previousPrice != null ? `${sym}${item.previousPrice.toFixed(2)}` : <span className="italic text-gray-300">—</span>}</div>
                          <div className="col-span-2 text-right">
                            {item.priceChange != null ? (
                              <span className={`text-xs font-semibold ${item.priceChange > 10 ? 'text-red-600' : item.priceChange > 0 ? 'text-yellow-600' : item.priceChange < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                {item.priceChange > 0 ? '+' : ''}{item.priceChange.toFixed(1)}%
                              </span>
                            ) : <span className="text-xs text-gray-300 italic">No change</span>}
                          </div>
                          <div className="col-span-2 flex justify-center"><Sparkline points={item.points} flagged={flagged} /></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </>
      )}

      {/* ── REPORTS TAB ── */}
      {resolvedTab === 'reports' && (
        <Section>
          <div className="flex flex-wrap justify-between items-center gap-4 mb-5">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Batch Reports</h2>
              <p className="text-sm text-gray-500 mt-0.5">Browse, filter, and export individual batch records</p>
            </div>
            <button onClick={exportBatchReportsCSV} disabled={filteredReports.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Export All ({filteredReports.length})
            </button>
          </div>

          <div className="grid grid-cols-9 gap-3 mb-4">
            <div className="col-span-2">
              <input type="text" placeholder="Search batch name..." value={reportSearch} onChange={e => setReportSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <select value={reportFilterWorkflow} onChange={e => setReportFilterWorkflow(e.target.value)}
              className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50">
              <option value="all">All Workflows</option>
              {uniqueWorkflowNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={reportFilterStatus} onChange={e => setReportFilterStatus(e.target.value as any)}
              className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50">
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="wasted">Wasted</option>
            </select>
            <div className="col-span-3 flex gap-2 items-center">
              <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)} className="flex-1 min-w-0 px-2 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50" />
              <span className="text-gray-400 text-xs flex-shrink-0">to</span>
              <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)} className="flex-1 min-w-0 px-2 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50" />
            </div>
          </div>

          {hasActiveFilters && (
            <button onClick={() => { setReportSearch(''); setReportFilterWorkflow('all'); setReportFilterStatus('all'); setReportDateFrom(''); setReportDateTo(''); }}
              className="mb-4 text-xs text-cyan-600 hover:text-cyan-800 underline">Clear all filters</button>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Showing', val: filteredReports.length, sub: 'batches', bg: 'bg-cyan-50 border-cyan-100', color: 'text-cyan-700' },
              { label: 'Total Cost', val: `${sym}${filteredTotalCost.toFixed(2)}`, sub: 'filtered set', bg: 'bg-gray-50 border-gray-200', color: 'text-gray-800' },
              { label: 'Avg Duration', val: `${filteredAvgDuration} min`, sub: 'per batch', bg: 'bg-gray-50 border-gray-200', color: 'text-gray-800' },
              { label: 'Wasted', val: filteredWasteCount, sub: 'in filtered set', bg: 'bg-red-50 border-red-100', color: 'text-red-600' },
            ].map(({ label, val, sub, bg, color }) => (
              <div key={label} className={`p-3 rounded-lg border ${bg}`}>
                <div className="text-xs text-gray-500 uppercase font-semibold mb-0.5">{label}</div>
                <div className={`text-xl font-bold ${color}`}>{val}</div>
                <div className="text-xs text-gray-500">{sub}</div>
              </div>
            ))}
          </div>

          {filteredReports.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="font-medium">No reports match your filters</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="hidden md:grid md:grid-cols-8 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                <div className="col-span-2">Batch / Workflow</div>
                <div>Date</div><div>Size</div><div>Duration</div><div>Cost</div><div>Yield</div><div>Status</div>
              </div>
              {filteredReports.map(report => {
                const isExpanded = expandedReportId === report.id;
                const isDeleting = deletingId === report.id;
                return (
                  <div key={report.id} className="border-b border-gray-100 last:border-0">
                    <div className="flex items-stretch">
                      <button onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                        className="flex-1 text-left px-4 py-3 hover:bg-gray-50">
                        <div className="md:grid md:grid-cols-8 md:items-center flex flex-wrap gap-2">
                          <div className="col-span-2 min-w-0">
                            <div className="font-medium text-gray-900 text-sm truncate">{report.batch_name}</div>
                            <div className="text-xs text-gray-500 truncate">{report.workflow_name}</div>
                          </div>
                          <div className="text-xs text-gray-600"><div>{report.date}</div><div className="text-gray-400">{report.time}</div></div>
                          <div className="text-sm text-gray-700">{report.batch_size_multiplier}x</div>
                          <div className="text-sm text-gray-700">{report.actual_duration ? `${Math.round(report.actual_duration / 60)} min` : <span className="text-gray-300">—</span>}</div>
                          <div className="text-sm text-gray-700">{report.total_cost != null ? `${sym}${report.total_cost.toFixed(2)}` : <span className="text-gray-300">—</span>}</div>
                          <div className="text-sm text-gray-700">{report.yield_amount != null ? `${report.yield_amount}${report.yield_unit ? ' ' + report.yield_unit : ''}` : <span className="text-gray-300">—</span>}</div>
                          <div className="flex items-center justify-between gap-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${report.wasted ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {report.wasted ? 'Wasted' : 'Completed'}
                            </span>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </button>
                      <button onClick={() => exportSingleReportCSV(report)}
                        className="flex-shrink-0 px-3 flex items-center justify-center text-gray-300 hover:text-cyan-500 hover:bg-cyan-50 border-l border-gray-100" title="Export this report">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      </button>
                      <button onClick={() => handleDeleteReport(report.id)} disabled={isDeleting}
                        className="flex-shrink-0 px-3 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 border-l border-gray-100 disabled:opacity-40" title="Delete report">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-5 pt-1 bg-gray-50 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-3">
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Details</h4>
                            <div className="space-y-2 text-sm">
                              {[
                                ['Completed by', report.completed_by || '—'],
                                ['Batch size', `${report.batch_size_multiplier}x`],
                                report.actual_duration != null ? ['Duration', `${Math.round(report.actual_duration / 60)} min`] : null,
                                report.total_cost != null ? ['Total cost', `${sym}${report.total_cost.toFixed(2)}`] : null,
                                report.yield_amount != null ? ['Yield', `${report.yield_amount} ${report.yield_unit || ''}`] : null,
                              ].filter(Boolean).map(([label, val]) => (
                                <div key={label as string} className="flex justify-between">
                                  <span className="text-gray-500">{label}</span>
                                  <span className="font-medium text-gray-800">{val}</span>
                                </div>
                              ))}
                              {report.notes && <div className="pt-2 border-t border-gray-200"><div className="text-xs text-gray-500 mb-1">Notes</div><div className="text-gray-700">{report.notes}</div></div>}
                            </div>
                          </div>
                          <div>
                            {report.wasted ? (
                              <div>
                                <h4 className="text-xs font-semibold text-red-500 uppercase mb-3">Waste Details</h4>
                                <div className="space-y-2 text-sm">
                                  {report.wasted_at_step_name && <div className="flex justify-between"><span className="text-gray-500">Failed at step</span><span className="font-medium text-red-700">{report.wasted_at_step_name}</span></div>}
                                  {report.waste_notes && <div className="pt-2 border-t border-gray-200"><div className="text-xs text-gray-500 mb-1">Waste notes</div><div className="text-gray-700">{report.waste_notes}</div></div>}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Ingredients Used</h4>
                                {report.ingredients_used?.length ? (
                                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="grid grid-cols-3 bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                                      <div>Ingredient</div><div>Amount</div><div>Cost</div>
                                    </div>
                                    {report.ingredients_used.map((ing: any, i: number) => (
                                      <div key={i} className="grid grid-cols-3 px-3 py-2 text-xs border-t border-gray-100">
                                        <div className="font-medium text-gray-800">{ing.name}</div>
                                        <div className="text-gray-600">{ing.amount} {ing.unit}</div>
                                        <div className="text-gray-600">{ing.cost != null ? `${sym}${Number(ing.cost).toFixed(2)}` : '—'}</div>
                                      </div>
                                    ))}
                                  </div>
                                ) : <p className="text-gray-400 italic text-xs">No ingredient data recorded.</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── LABOUR TAB ── */}
      {resolvedTab === 'labour' && (
        <>
          {/* Date range and controls */}
          <div className="bg-white/90 rounded-xl px-5 py-4 mb-6 shadow-sm border border-cyan-100 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-cyan-700">Date range:</span>
            <input type="date" value={labourDateFrom} onChange={e => setLabourDateFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={labourDateTo} onChange={e => setLabourDateTo(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent" />
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500">Group by:</span>
              <button onClick={() => setLabourGroupBy('employee')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium ${labourGroupBy === 'employee' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Employee
              </button>
              <button onClick={() => setLabourGroupBy('day')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium ${labourGroupBy === 'day' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Day
              </button>
              <button onClick={exportLabourCSV} disabled={labourEntries.length === 0}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40 ml-2">
                Export CSV
              </button>
            </div>
          </div>

          {labourLoading && <div className="bg-white/90 rounded-xl p-10 text-center text-gray-400 text-sm mb-6 shadow-sm">Loading labour data...</div>}
          {labourError && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">{labourError}</div>}

          {!labourLoading && !labourError && labourEntries.length === 0 && (
            <div className="bg-white/90 rounded-xl p-10 text-center text-gray-400 shadow-sm mb-6">
              <p className="font-medium text-gray-600 mb-1">No shift data found</p>
              <p className="text-sm">Labour data appears here once employees have clocked in and out during the selected date range.</p>
            </div>
          )}

          {!labourLoading && !labourError && labourEntries.length > 0 && (
            <>
              {/* Summary cards */}
              <Section>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Labour Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Hours', val: totalLabourHours.toFixed(1), sub: 'across all employees' },
                    { label: 'Total Labour Cost', val: `${sym}${totalLabourCost.toFixed(2)}`, sub: 'for period' },
                    { label: 'Employees', val: labourEntries.length, sub: 'worked during period' },
                    { label: 'Avg Hourly Rate', val: `${sym}${avgHourlyRate.toFixed(2)}`, sub: 'across team' },
                  ].map(({ label, val, sub }) => (
                    <div key={label} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="text-xs text-gray-500 uppercase mb-2">{label}</div>
                      <div className="text-xl font-semibold text-gray-900">{val}</div>
                      <div className="text-xs text-gray-400 mt-1">{sub}</div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* By employee */}
              {labourGroupBy === 'employee' && (
                <Section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">By Employee</h2>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-12 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                      <div className="col-span-3">Employee</div>
                      <div className="col-span-2">Job Title</div>
                      <div className="col-span-1 text-right">Shifts</div>
                      <div className="col-span-2 text-right">Hours</div>
                      <div className="col-span-2 text-right">Rate</div>
                      <div className="col-span-2 text-right">Cost</div>
                    </div>
                    {labourEntries.map(e => (
                      <div key={e.userId} className="grid grid-cols-12 px-4 py-3 text-sm border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <div className="col-span-3">
                          <div className="font-medium text-gray-900">{e.name}</div>
                          {e.locationName && <div className="text-xs text-gray-400">{e.locationName}</div>}
                        </div>
                        <div className="col-span-2 text-gray-500 text-xs self-center">{e.jobTitle ?? '—'}</div>
                        <div className="col-span-1 text-right text-gray-700">{e.shiftCount}</div>
                        <div className="col-span-2 text-right text-gray-700">{e.totalHours.toFixed(1)}h</div>
                        <div className="col-span-2 text-right text-gray-500">{sym}{e.hourlyRate.toFixed(2)}/h</div>
                        <div className="col-span-2 text-right font-semibold text-gray-900">{sym}{e.labourCost.toFixed(2)}</div>
                      </div>
                    ))}
                    <div className="grid grid-cols-12 px-4 py-3 text-sm bg-gray-50 border-t border-gray-200 font-semibold">
                      <div className="col-span-3 text-gray-700">Total</div>
                      <div className="col-span-2" />
                      <div className="col-span-1 text-right text-gray-700">{labourEntries.reduce((s, e) => s + e.shiftCount, 0)}</div>
                      <div className="col-span-2 text-right text-gray-700">{totalLabourHours.toFixed(1)}h</div>
                      <div className="col-span-2" />
                      <div className="col-span-2 text-right text-gray-900">{sym}{totalLabourCost.toFixed(2)}</div>
                    </div>
                  </div>
                </Section>
              )}

              {/* By day */}
              {labourGroupBy === 'day' && (
                <Section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">By Day</h2>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-3 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                      <div>Date</div>
                      <div className="text-right">Total Hours</div>
                      <div className="text-right">Labour Cost</div>
                    </div>
                    {labourDays.map(day => (
                      <div key={day.date} className="grid grid-cols-3 px-4 py-3 text-sm border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <div className="font-medium text-gray-900">{day.date}</div>
                        <div className="text-right text-gray-700">{day.totalHours.toFixed(1)}h</div>
                        <div className="text-right font-semibold text-gray-900">{sym}{day.totalCost.toFixed(2)}</div>
                      </div>
                    ))}
                    <div className="grid grid-cols-3 px-4 py-3 text-sm bg-gray-50 border-t border-gray-200 font-semibold">
                      <div className="text-gray-700">Total</div>
                      <div className="text-right text-gray-700">{totalLabourHours.toFixed(1)}h</div>
                      <div className="text-right text-gray-900">{sym}{totalLabourCost.toFixed(2)}</div>
                    </div>
                  </div>
                </Section>
              )}
            </>
          )}
        </>
      )}

      {/* ── POS TAB ── */}
      {resolvedTab === 'pos' && (
        <POSSalesAnalytics
          userId={user?.id}
          locations={locations}
          selectedLocationId={selectedLocationId}
        />
      )}
    </>
  );
}