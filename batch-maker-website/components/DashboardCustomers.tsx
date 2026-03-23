'use client';
/**
 * components/DashboardCustomers.tsx
 *
 * Customer profile management — sub-tab under Calendar.
 * Features: compact table, sort, filter, duplicate email warning,
 * mailto link, order history, paid/unpaid summary.
 * Security: all queries scoped to owner_id via RLS.
 */

import { useState, useEffect, useMemo } from 'react';
import type { DashboardProps } from '../lib/dashboard-types';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // computed after load
  order_count?: number;
  last_order_date?: string | null;
  has_unpaid?: boolean;
}

interface CustomerOrder {
  id: string;
  event_name: string;
  delivery_date: string;
  status: string;
  total_amount: number | null;
  is_paid: boolean;
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  billing_address: '',
  delivery_address: '',
  notes: '',
};

type SortKey = 'name' | 'updated_at' | 'last_order_date' | 'order_count';
type SortDir = 'asc' | 'desc';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-cyan-100 text-cyan-700',
  fulfilled: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
};

export default function DashboardCustomers({ user }: DashboardProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allOrders, setAllOrders] = useState<Record<string, CustomerOrder[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dupWarning, setDupWarning] = useState(false);

  // Search / sort / filter
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterUnpaid, setFilterUnpaid] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      // Load customers
      const { data: custData, error: custErr } = await supabase
        .from('catering_customers')
        .select('*')
        .eq('owner_id', user.id)
        .order('name');
      if (custErr) throw custErr;

      // Load all orders for these customers in one query
      const { data: ordData } = await supabase
        .from('catering_orders')
        .select('id, customer_id, event_name, delivery_date, status, total_amount, is_paid')
        .eq('owner_id', user.id)
        .not('customer_id', 'is', null)
        .order('delivery_date', { ascending: false });

      // Group orders by customer_id
      const orderMap: Record<string, CustomerOrder[]> = {};
      for (const ord of ordData || []) {
        if (!orderMap[ord.customer_id]) orderMap[ord.customer_id] = [];
        orderMap[ord.customer_id].push(ord);
      }
      setAllOrders(orderMap);

      // Attach computed fields to customers
      const enriched = (custData || []).map((c: any) => {
        const orders = orderMap[c.id] || [];
        return {
          ...c,
          order_count: orders.length,
          last_order_date: orders[0]?.delivery_date || null,
          has_unpaid: orders.some(o => !o.is_paid && o.status !== 'cancelled'),
        };
      });
      setCustomers(enriched);
    } catch (e) {
      console.error('Failed to load customers:', e);
    } finally {
      setLoading(false);
    }
  }

  // Check for duplicate email
  function checkDuplicate(email: string) {
    if (!email.trim()) { setDupWarning(false); return; }
    const dup = customers.some(c =>
      c.email?.toLowerCase() === email.toLowerCase() && c.id !== editingId
    );
    setDupWarning(dup);
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDupWarning(false);
    setShowForm(true);
  }

  function openEdit(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      billing_address: customer.billing_address || '',
      delivery_address: customer.delivery_address || '',
      notes: customer.notes || '',
    });
    setDupWarning(false);
    setShowForm(true);
    setExpandedId(null);
  }

  async function handleSave() {
    if (!form.name.trim()) { alert('Name is required'); return; }
    if (dupWarning) { if (!confirm('A customer with this email already exists. Save anyway?')) return; }
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('catering_customers')
          .update({
            name: form.name.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            billing_address: form.billing_address.trim() || null,
            delivery_address: form.delivery_address.trim() || null,
            notes: form.notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId)
          .eq('owner_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('catering_customers')
          .insert({
            owner_id: user.id,
            name: form.name.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            billing_address: form.billing_address.trim() || null,
            delivery_address: form.delivery_address.trim() || null,
            notes: form.notes.trim() || null,
          });
        if (error) throw error;
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setDupWarning(false);
      await loadAll();
    } catch (e: any) {
      alert(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(customerId: string, name: string) {
    if (!confirm(`Delete "${name}"? Their orders will remain but will no longer be linked to this customer.`)) return;
    const { error } = await supabase
      .from('catering_customers')
      .delete()
      .eq('id', customerId)
      .eq('owner_id', user.id);
    if (error) { alert('Failed to delete customer'); return; }
    await loadAll();
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-cyan-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const displayed = useMemo(() => {
    let list = [...customers];

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    }

    // Filter unpaid
    if (filterUnpaid) list = list.filter(c => c.has_unpaid);

    // Sort
    list.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'name':
          av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'updated_at':
          av = a.updated_at; bv = b.updated_at; break;
        case 'last_order_date':
          av = a.last_order_date || ''; bv = b.last_order_date || ''; break;
        case 'order_count':
          av = a.order_count || 0; bv = b.order_count || 0; break;
        default:
          return 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [customers, search, sortKey, sortDir, filterUnpaid]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/90 rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
          <h2 className="text-xl font-semibold text-gray-900">
            Customers
            {customers.length > 0 && <span className="ml-2 text-sm font-normal text-gray-400">{customers.length} total</span>}
          </h2>
          <button onClick={openCreate}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 transition-colors">
            + New Customer
          </button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email or phone..."
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <button
            onClick={() => setFilterUnpaid(f => !f)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              filterUnpaid
                ? 'bg-amber-100 text-amber-700 border-amber-300'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {filterUnpaid ? 'Showing: Unpaid' : 'Filter: Unpaid'}
          </button>
        </div>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white/90 rounded-xl p-6 shadow-sm border border-cyan-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit Customer' : 'New Customer'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Full name or business name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email}
                onChange={e => { setForm({ ...form, email: e.target.value }); checkDuplicate(e.target.value); }}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${dupWarning ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}
                placeholder="email@example.com" />
              {dupWarning && (
                <p className="text-xs text-amber-600 mt-1">A customer with this email already exists.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
              <input type="text" value={form.billing_address} onChange={e => setForm({ ...form, billing_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Street, City, Postal Code" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
              <input type="text" value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="If different from billing" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2}
                placeholder="Dietary requirements, preferences, payment terms..." />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Customer'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setDupWarning(false); }}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Customer table */}
      <div className="bg-white/90 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-12">
            {search || filterUnpaid ? 'No customers match your filters.' : 'No customers yet. Add one to get started.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleSort('name')}>
                  Name <SortIcon k="name" />
                </th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Contact</th>
                <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => toggleSort('order_count')}>
                  Orders <SortIcon k="order_count" />
                </th>
                <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 hidden sm:table-cell" onClick={() => toggleSort('last_order_date')}>
                  Last Order <SortIcon k="last_order_date" />
                </th>
                <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 hidden sm:table-cell" onClick={() => toggleSort('updated_at')}>
                  Modified <SortIcon k="updated_at" />
                </th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map(customer => {
                const isExpanded = expandedId === customer.id;
                const orders = allOrders[customer.id] || [];
                const unpaidCount = orders.filter(o => !o.is_paid && o.status !== 'cancelled').length;

                return (
                  <>
                    <tr
                      key={customer.id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-cyan-50' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : customer.id)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{customer.name}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="text-gray-600">
                          {customer.email && (
                            <a href={`mailto:${customer.email}`}
                              onClick={e => e.stopPropagation()}
                              className="text-cyan-600 hover:underline block truncate max-w-[180px]">
                              {customer.email}
                            </a>
                          )}
                          {customer.phone && <span className="text-gray-500 text-xs">{customer.phone}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{customer.order_count || 0}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {customer.last_order_date
                          ? new Date(customer.last_order_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {new Date(customer.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        {unpaidCount > 0 ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
                            {unpaidCount} UNPAID
                          </span>
                        ) : customer.order_count ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">
                            ALL PAID
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEdit(customer)}
                            className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded hover:bg-gray-200 transition-colors">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(customer.id, customer.name)}
                            className="px-2.5 py-1 bg-red-50 text-red-500 text-xs font-medium rounded hover:bg-red-100 transition-colors">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${customer.id}-detail`}>
                        <td colSpan={7} className="px-4 py-4 bg-cyan-50 border-b border-cyan-100">
                          <div className="space-y-4">
                            {/* Address / notes */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              {customer.billing_address && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Billing Address</div>
                                  <div className="text-gray-700">{customer.billing_address}</div>
                                </div>
                              )}
                              {customer.delivery_address && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Delivery Address</div>
                                  <div className="text-gray-700">{customer.delivery_address}</div>
                                </div>
                              )}
                              {customer.notes && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</div>
                                  <div className="text-gray-700 italic">{customer.notes}</div>
                                </div>
                              )}
                            </div>

                            {/* Order history */}
                            <div>
                              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Order History</div>
                              {orders.length === 0 ? (
                                <div className="text-sm text-gray-400 italic">No orders yet.</div>
                              ) : (
                                <div className="space-y-1.5">
                                  {orders.map(order => (
                                    <div key={order.id} className="flex justify-between items-center p-2.5 bg-white rounded-lg border border-gray-200 text-sm">
                                      <div>
                                        <span className="font-medium text-gray-900">{order.event_name}</span>
                                        <span className="text-gray-400 text-xs ml-2">
                                          {new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        {order.total_amount != null && (
                                          <span className="font-semibold text-gray-700">${order.total_amount.toFixed(2)}</span>
                                        )}
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-500'}`}>
                                          {order.status.toUpperCase()}
                                        </span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${order.is_paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                          {order.is_paid ? 'PAID' : 'UNPAID'}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                  <div className="flex justify-between text-xs text-gray-400 pt-1 px-1">
                                    <span>{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
                                    <span>
                                      {orders.filter(o => o.is_paid).length} paid ·{' '}
                                      {orders.filter(o => !o.is_paid && o.status !== 'cancelled').length} outstanding
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}