'use client';
/**
 * components/DashboardCatering.tsx
 *
 * Catering order management — sub-tab under Calendar.
 * Updated: customer picker, paid/unpaid toggle, total amount field.
 */

import { useState, useEffect } from 'react';
import type { DashboardProps } from '../lib/dashboard-types';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

interface CateringOrderItem {
  workflow_id: string;
  item_name: string;
  quantity_needed: number;
  yield_unit: string;
  batches_required: number;
  lead_time_days: number;
}

interface CateringOrder {
  id: string;
  event_name: string;
  delivery_date: string;
  lead_time_days: number;
  status: 'draft' | 'confirmed' | 'fulfilled' | 'cancelled';
  notes: string | null;
  location_id: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  is_paid: boolean;
  total_amount: number | null;
  created_at: string;
  items?: CateringOrderItem[];
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  delivery_address: string | null;
}

function calcLeadTimeDays(totalMinutes: number | null | undefined): number {
  if (!totalMinutes || totalMinutes < 240) return 0;
  if (totalMinutes < 1440) return 1;
  return Math.ceil(totalMinutes / 1440);
}

function calcProductionDate(deliveryDate: string, leadTimeDays: number): string {
  const d = new Date(deliveryDate + 'T00:00:00');
  d.setDate(d.getDate() - leadTimeDays);
  return d.toISOString().split('T')[0];
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-cyan-100 text-cyan-700',
  fulfilled: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
};

export default function DashboardCatering({
  user,
  workflows,
  locations,
  selectedLocationId,
  fetchScheduledBatches,
}: DashboardProps) {
  const [orders, setOrders] = useState<CateringOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    event_name: '',
    delivery_date: '',
    notes: '',
    location_id: selectedLocationId !== 'all' ? selectedLocationId : '',
    customer_id: '',
    total_amount: '',
  });
  const [lineItems, setLineItems] = useState<{
    workflow_id: string;
    quantity_needed: string;
    lead_time_days: number;
  }[]>([{ workflow_id: '', quantity_needed: '', lead_time_days: 1 }]);

  useEffect(() => {
    loadOrders();
    loadCustomers();
  }, [selectedLocationId]);

  async function loadCustomers() {
    const { data } = await supabase
      .from('catering_customers')
      .select('id, name, email, phone, delivery_address')
      .eq('owner_id', user.id)
      .order('name');
    setCustomers(data || []);
  }

  async function loadOrders() {
    setLoading(true);
    try {
      let query = supabase
        .from('catering_orders')
        .select(`
          *,
          catering_customers ( name ),
          catering_order_items (
            workflow_id, item_name, quantity_needed,
            yield_unit, batches_required, lead_time_days
          )
        `)
        .eq('owner_id', user.id)
        .order('delivery_date', { ascending: true });

      if (selectedLocationId && selectedLocationId !== 'all') {
        query = query.eq('location_id', selectedLocationId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setOrders((data || []).map((o: any) => ({
        ...o,
        customer_name: o.catering_customers?.name || null,
        items: o.catering_order_items || [],
      })));
    } catch (e) {
      console.error('Failed to load catering orders:', e);
    } finally {
      setLoading(false);
    }
  }

  function addLineItem() {
    setLineItems([...lineItems, { workflow_id: '', quantity_needed: '', lead_time_days: 1 }]);
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: string, value: any) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'workflow_id' && value) {
      const wf = workflows.find(w => w.id === value) as any;
      updated[index].lead_time_days = calcLeadTimeDays(wf?.total_time_minutes);
    }
    setLineItems(updated);
  }

  async function handleCreateOrder() {
    if (!formData.event_name.trim() || !formData.delivery_date) {
      alert('Event name and delivery date are required');
      return;
    }
    const validItems = lineItems.filter(i => i.workflow_id && i.quantity_needed);
    if (validItems.length === 0) {
      alert('Add at least one line item');
      return;
    }

    setCreating(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from('catering_orders')
        .insert({
          owner_id: user.id,
          location_id: formData.location_id || null,
          customer_id: formData.customer_id || null,
          event_name: formData.event_name.trim(),
          delivery_date: formData.delivery_date,
          lead_time_days: Math.max(...validItems.map(i => i.lead_time_days)),
          status: 'draft',
          notes: formData.notes.trim() || null,
          total_amount: formData.total_amount ? parseFloat(formData.total_amount) : null,
          is_paid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const itemRows = validItems.map(item => {
        const wf = workflows.find(w => w.id === item.workflow_id) as any;
        const qty = parseFloat(item.quantity_needed) || 0;
        const yieldAmt = wf?.yield_amount || 1;
        return {
          order_id: order.id,
          workflow_id: item.workflow_id,
          item_name: wf?.name || '',
          quantity_needed: qty,
          yield_unit: wf?.yield_unit || 'units',
          batches_required: Math.ceil(qty / yieldAmt),
          lead_time_days: item.lead_time_days,
        };
      });

      const { error: itemsError } = await supabase
        .from('catering_order_items')
        .insert(itemRows);
      if (itemsError) throw itemsError;

      setShowForm(false);
      setFormData({ event_name: '', delivery_date: '', notes: '', location_id: selectedLocationId !== 'all' ? selectedLocationId : '', customer_id: '', total_amount: '' });
      setLineItems([{ workflow_id: '', quantity_needed: '', lead_time_days: 1 }]);
      await loadOrders();
    } catch (e: any) {
      alert(`Failed to create order: ${e.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirmOrder(order: CateringOrder) {
    if (!order.items?.length) return;
    if (!confirm(`Confirm "${order.event_name}"? This will schedule all required batches on the production calendar.`)) return;

    try {
      const inserts: any[] = [];
      for (const item of order.items) {
        const productionDate = calcProductionDate(order.delivery_date, item.lead_time_days);
        for (let i = 0; i < item.batches_required; i++) {
          inserts.push({
            user_id: user.id,
            workflow_id: item.workflow_id,
            scheduled_date: productionDate,
            name: `${item.item_name} — ${order.event_name}`,
            batch_size_multiplier: 1,
            status: 'scheduled',
            notes: `Catering order: ${order.event_name} (delivery ${order.delivery_date})`,
            location_id: order.location_id || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      if (inserts.length > 0) {
        const { error: batchError } = await supabase.from('scheduled_batches').insert(inserts);
        if (batchError) throw batchError;
      }

      const { error: statusError } = await supabase
        .from('catering_orders')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (statusError) throw statusError;

      await loadOrders();
      fetchScheduledBatches?.();

      // Fire catering confirmed notification (non-blocking)
      fetch('/api/notifications/catering-confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: user.id,
          eventName: order.event_name,
          deliveryDate: order.delivery_date,
          batchCount: inserts.length,
        }),
      }).catch(() => {});

      alert(`Order confirmed. ${inserts.length} batch${inserts.length !== 1 ? 'es' : ''} scheduled on the production calendar.`);
    } catch (e: any) {
      alert(`Failed to confirm order: ${e.message}`);
    }
  }

  async function handleTogglePaid(order: CateringOrder) {
    const { error } = await supabase
      .from('catering_orders')
      .update({ is_paid: !order.is_paid, updated_at: new Date().toISOString() })
      .eq('id', order.id);
    if (error) { alert('Failed to update payment status'); return; }
    await loadOrders();
  }

  async function handleUpdateStatus(orderId: string, status: string) {
    const { error } = await supabase
      .from('catering_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) { alert('Failed to update status'); return; }
    await loadOrders();
  }

  async function handleDeleteOrder(orderId: string) {
    if (!confirm('Delete this catering order? Scheduled batches will not be removed.')) return;
    const { error } = await supabase.from('catering_orders').delete().eq('id', orderId);
    if (error) { alert('Failed to delete order'); return; }
    await loadOrders();
  }

  const activeWorkflows = workflows.filter((w: any) => !w.archived_at);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/90 rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold text-gray-900">Catering Orders</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Order'}
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Create catering orders and the system will automatically schedule the required production batches based on each workflow's preparation time.
        </p>
      </div>

      {/* New order form */}
      {showForm && (
        <div className="bg-white/90 rounded-xl p-6 shadow-sm border border-cyan-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">New Catering Order</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
              <input type="text" value={formData.event_name}
                onChange={e => setFormData({ ...formData, event_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g., Smith Wedding, Friday Farmers Market" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery / Collection Date *</label>
              <input type="date" value={formData.delivery_date}
                onChange={e => setFormData({ ...formData, delivery_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
              <select value={formData.customer_id}
                onChange={e => setFormData({ ...formData, customer_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">No customer (ad-hoc order)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Total</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" value={formData.total_amount}
                  onChange={e => setFormData({ ...formData, total_amount: e.target.value })}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="0.00" />
              </div>
            </div>
          </div>

          {locations && locations.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select value={formData.location_id}
                onChange={e => setFormData({ ...formData, location_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All locations</option>
                {locations.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Line items */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">Items Required *</label>
              <button onClick={addLineItem} className="text-xs text-cyan-600 hover:text-cyan-800 font-medium">+ Add Item</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 uppercase px-1">
                <div className="col-span-4">Workflow</div>
                <div className="col-span-3">Quantity Needed</div>
                <div className="col-span-3">Lead Time (days)</div>
                <div className="col-span-2">Batches</div>
              </div>
              {lineItems.map((item, index) => {
                const wf = workflows.find(w => w.id === item.workflow_id) as any;
                const qty = parseFloat(item.quantity_needed) || 0;
                const yieldAmt = wf?.yield_amount || 1;
                const batchesRequired = qty > 0 ? Math.ceil(qty / yieldAmt) : 0;
                const productionDate = formData.delivery_date && item.lead_time_days >= 0
                  ? calcProductionDate(formData.delivery_date, item.lead_time_days)
                  : null;
                return (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <select value={item.workflow_id}
                        onChange={e => updateLineItem(index, 'workflow_id', e.target.value)}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">Select workflow</option>
                        {activeWorkflows.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.name}{(w as any).yield_amount ? ` (${(w as any).yield_amount} ${(w as any).yield_unit || 'units'}/batch)` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input type="number" min="0" value={item.quantity_needed}
                        onChange={e => updateLineItem(index, 'quantity_needed', e.target.value)}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder={wf?.yield_unit || 'qty'} />
                    </div>
                    <div className="col-span-3">
                      <input type="number" min="0" value={item.lead_time_days}
                        onChange={e => updateLineItem(index, 'lead_time_days', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" />
                      {productionDate && (
                        <div className="text-[10px] text-cyan-600 mt-0.5 px-1">
                          Produce: {new Date(productionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <span className="text-sm font-semibold text-gray-700">{batchesRequired > 0 ? `${batchesRequired}×` : '—'}</span>
                      {lineItems.length > 1 && (
                        <button onClick={() => removeLineItem(index)} className="text-red-400 hover:text-red-600 text-xs ml-auto">✕</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!activeWorkflows.some((w: any) => w.yield_amount) && (
              <p className="text-xs text-amber-600 mt-2">
                Some workflows are missing yield data. Set yield amounts on your workflows for accurate batch calculations.
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2}
              placeholder="Any special requirements or notes..." />
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreateOrder} disabled={creating}
              className="px-6 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 disabled:opacity-50 transition-colors">
              {creating ? 'Creating...' : 'Create Order'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Orders list */}
      <div className="bg-white/90 rounded-xl p-6 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-12">No catering orders yet. Create one to get started.</p>
        ) : (
          <div className="space-y-4">
            {orders.map(order => {
              const isExpanded = expandedId === order.id;
              const deliveryDate = new Date(order.delivery_date + 'T00:00:00');
              const daysUntil = Math.ceil((deliveryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const isUrgent = daysUntil <= 3 && order.status === 'draft';

              return (
                <div key={order.id} className={`border rounded-xl overflow-hidden transition-all ${isUrgent ? 'border-red-300' : 'border-gray-200'}`}>
                  <div
                    className={`p-4 cursor-pointer flex justify-between items-start gap-3 ${isUrgent ? 'bg-red-50' : 'bg-gray-50'}`}
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-900">{order.event_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[order.status]}`}>
                          {order.status.toUpperCase()}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${order.is_paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {order.is_paid ? 'PAID' : 'UNPAID'}
                        </span>
                        {isUrgent && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-200 text-red-700">URGENT</span>}
                      </div>
                      <div className="text-sm text-gray-500 flex gap-3 flex-wrap">
                        {order.customer_name && <span className="text-cyan-600">{order.customer_name}</span>}
                        <span>
                          Delivery: {deliveryDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {daysUntil > 0 ? ` (in ${daysUntil} day${daysUntil !== 1 ? 's' : ''})` : daysUntil === 0 ? ' (today)' : ' (past)'}
                        </span>
                        {order.total_amount != null && <span className="font-medium text-gray-700">${order.total_amount.toFixed(2)}</span>}
                        {order.items && <span>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {order.status === 'draft' && (
                        <button onClick={e => { e.stopPropagation(); handleConfirmOrder(order); }}
                          className="px-3 py-1.5 bg-cyan-500 text-white text-xs font-medium rounded-lg hover:bg-cyan-600 transition-colors">
                          Confirm & Schedule
                        </button>
                      )}
                      {order.status === 'confirmed' && (
                        <button onClick={e => { e.stopPropagation(); handleUpdateStatus(order.id, 'fulfilled'); }}
                          className="px-3 py-1.5 bg-cyan-500 text-white text-xs font-medium rounded-lg hover:bg-cyan-600 transition-colors">
                          Mark Fulfilled
                        </button>
                      )}
                      <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 border-t border-gray-200">
                      {order.items && order.items.length > 0 && (
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Line Items</div>
                          <div className="space-y-2">
                            {order.items.map((item, i) => {
                              const productionDate = calcProductionDate(order.delivery_date, item.lead_time_days);
                              return (
                                <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                                  <div>
                                    <div className="font-medium text-gray-900">{item.item_name}</div>
                                    <div className="text-xs text-gray-500">
                                      {item.quantity_needed} {item.yield_unit} needed · {item.batches_required} batch{item.batches_required !== 1 ? 'es' : ''}
                                    </div>
                                  </div>
                                  <div className="text-xs text-cyan-600 text-right">
                                    Produce by<br />
                                    {new Date(productionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {order.notes && <div className="mb-4 text-sm text-gray-500 italic">{order.notes}</div>}

                      <div className="flex gap-2 flex-wrap items-center">
                        <button
                          onClick={() => handleTogglePaid(order)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            order.is_paid
                              ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {order.is_paid ? '✓ Paid — Mark Unpaid' : 'Mark as Paid'}
                        </button>
                        {order.status !== 'cancelled' && order.status !== 'fulfilled' && (
                          <button onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                            className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors border border-red-200">
                            Cancel Order
                          </button>
                        )}
                        <button onClick={() => handleDeleteOrder(order.id)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}