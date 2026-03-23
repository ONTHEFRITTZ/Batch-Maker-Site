import { useState, useEffect } from 'react';
import type { DashboardProps } from '../lib/dashboard-types';
import { getSupabaseClient } from '../lib/supabase';
import Modal from './Modal';

const supabase = getSupabaseClient();

// ─── Toast ────────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; }
let toastCounter = 0;
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (message: string, type: ToastType = 'success') => {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };
  return { toasts, showToast };
}
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
          t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-cyan-600'
        }`}>
          {t.type === 'success' ? '✓ ' : t.type === 'error' ? '✗ ' : 'ℹ '}{t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Ingredient list per category ─────────────────────────────────────────────
const INGREDIENTS_BY_CATEGORY: Record<string, string[]> = {
  'Produce': [
    'Apples', 'Avocados', 'Bananas', 'Beets', 'Bell Peppers', 'Broccoli',
    'Cabbage', 'Carrots', 'Cauliflower', 'Celery', 'Cilantro', 'Corn',
    'Cucumbers', 'Eggplant', 'Garlic', 'Ginger', 'Green Beans', 'Jalapeños',
    'Kale', 'Lemons', 'Lettuce', 'Limes', 'Mangoes', 'Mushrooms', 'Onions',
    'Oranges', 'Parsley', 'Pears', 'Pineapple', 'Potatoes', 'Rosemary',
    'Shallots', 'Spinach', 'Strawberries', 'Sweet Potatoes', 'Thyme',
    'Tomatoes', 'Zucchini', 'Other',
  ],
  'Meat': [
    'Bacon', 'Beef Brisket', 'Beef Ground', 'Beef Ribeye', 'Beef Sirloin',
    'Beef Tenderloin', 'Chicken Breast', 'Chicken Drumsticks', 'Chicken Ground',
    'Chicken Thighs', 'Chicken Whole', 'Chicken Wings', 'Duck Breast',
    'Ham', 'Lamb Chops', 'Lamb Ground', 'Lamb Leg', 'Pork Belly',
    'Pork Chops', 'Pork Ground', 'Pork Loin', 'Pork Ribs', 'Pork Shoulder',
    'Prosciutto', 'Salami', 'Sausage', 'Turkey Breast', 'Turkey Ground',
    'Turkey Whole', 'Veal', 'Other',
  ],
  'Seafood': [
    'Calamari', 'Clams', 'Cod', 'Crab', 'Halibut', 'Lobster', 'Mahi Mahi',
    'Mussels', 'Octopus', 'Oysters', 'Salmon', 'Scallops', 'Shrimp',
    'Snapper', 'Swordfish', 'Tilapia', 'Tuna', 'Other',
  ],
  'Dairy': [
    'Butter', 'Buttermilk', 'Cheddar Cheese', 'Cream', 'Cream Cheese',
    'Eggs', 'Feta Cheese', 'Gouda Cheese', 'Greek Yogurt', 'Half and Half',
    'Heavy Cream', 'Milk', 'Mozzarella Cheese', 'Parmesan Cheese',
    'Ricotta Cheese', 'Sour Cream', 'Swiss Cheese', 'Whipping Cream',
    'Yogurt', 'Other',
  ],
  'Dry Goods': [
    'All Purpose Flour', 'Almonds', 'Baking Powder', 'Baking Soda',
    'Basmati Rice', 'Black Beans', 'Bread Crumbs', 'Bread Flour',
    'Brown Rice', 'Brown Sugar', 'Cake Flour', 'Canola Oil', 'Cashews',
    'Chickpeas', 'Chocolate Chips', 'Cinnamon', 'Cocoa Powder',
    'Coconut Oil', 'Coffee', 'Corn Flour', 'Corn Starch', 'Couscous',
    'Dried Cranberries', 'Dried Yeast', 'Elbow Pasta', 'Fettuccine',
    'Flax Seeds', 'Granulated Sugar', 'Hemp Seeds', 'Honey',
    'Icing Sugar', 'Jasmine Rice', 'Kidney Beans', 'Lentils',
    'Linguine', 'Maple Syrup', 'Oats', 'Olive Oil', 'Panko',
    'Peanut Butter', 'Penne Pasta', 'Pine Nuts', 'Pinto Beans',
    'Pumpkin Seeds', 'Quinoa', 'Salt', 'Sesame Seeds', 'Spaghetti',
    'Sunflower Oil', 'Sunflower Seeds', 'Vegetable Oil', 'Vinegar',
    'Walnuts', 'Whole Wheat Flour', 'Other',
  ],
  'Liquor': [
    'Bourbon', 'Brandy', 'Gin', 'Rum', 'Rye Whiskey', 'Scotch',
    'Tequila', 'Triple Sec', 'Vodka', 'Whiskey', 'Other',
  ],
  'Beer': [
    'Craft IPA', 'Craft Lager', 'Domestic Lager', 'Draft Beer',
    'Imported Lager', 'Pale Ale', 'Seasonal Beer', 'Stout', 'Other',
  ],
  'Wine': [
    'Cabernet Sauvignon', 'Champagne', 'Chardonnay', 'House Red',
    'House White', 'Merlot', 'Pinot Grigio', 'Pinot Noir',
    'Prosecco', 'Rose', 'Sauvignon Blanc', 'Sparkling Wine', 'Other',
  ],
  'Non-Alcoholic': [
    'Club Soda', 'Coffee Beans', 'Espresso Beans', 'Green Tea',
    'Herbal Tea', 'Hot Chocolate Mix', 'Juice', 'Lemonade',
    'Mineral Water', 'Soda', 'Sparkling Water', 'Sports Drink',
    'Tea Bags', 'Tonic Water', 'Other',
  ],
  'Cleaning': [
    'All Purpose Cleaner', 'Degreaser', 'Dish Soap', 'Dishwasher Detergent',
    'Disinfectant', 'Floor Cleaner', 'Glass Cleaner', 'Hand Sanitizer',
    'Hand Soap', 'Sanitizer Tablets', 'Scrub Pads', 'Sponges', 'Other',
  ],
  'Paper/Supplies': [
    'Aluminum Foil', 'Aprons', 'Butcher Paper', 'Catering Trays',
    'Cocktail Napkins', 'Cling Wrap', 'Coffee Cups', 'Cutlery Packs',
    'Deli Paper', 'Disposable Gloves', 'Food Containers', 'Freezer Bags',
    'Garbage Bags', 'Hair Nets', 'Kraft Paper Bags', 'Lunch Bags',
    'Napkins', 'Paper Bags', 'Paper Towels', 'Parchment Paper',
    'Plastic Bags', 'Sandwich Bags', 'Straws', 'Takeout Containers',
    'Tissue Paper', 'To-Go Cups', 'Wax Paper', 'Other',
  ],
  'Other': ['Other'],
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Supplier {
  id: string;
  owner_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  default_tax: number | null;
  notes: string | null;
  created_at: string;
}

interface Order {
  id: string;
  owner_id: string;
  location_id: string | null;
  supplier_id: string | null;
  order_number: string | null;
  order_date: string | null;
  status: 'paid' | 'unpaid';
  subtotal: number | null;
  tax: number | null;
  fees: number | null;
  discounts: number | null;
  total: number | null;
  notes: string | null;
  created_at: string;
  supplier_name?: string | null;
  order_line_items?: OrderLineItem[];
}

interface OrderLineItem {
  id: string;
  order_id: string;
  inventory_item_id: string | null;
  name: string;
  size: string | null;
  quantity: number | null;
  quantity_received: number | null;
  unit: string | null;
  unit_price: number | null;
  extended_price: number | null;
  category: string | null;
}

interface InventoryTransfer {
  id: string;
  owner_id: string;
  from_location_id: string | null;
  to_location_id: string | null;
  inventory_item_id: string;
  quantity: number;
  transferred_by: string | null;
  notes: string | null;
  created_at: string;
  item_name?: string;
  item_unit?: string;
  from_location_name?: string;
  to_location_name?: string;
}

interface NewInventoryItem {
  ingredient: string;
  brand: string;
  category: string;
  size: string;
  unit: string;
  par_level: string;
  supplier_id: string;
  location_id: string;
  notes: string;
}

interface BulkEditForm {
  category: string;
  supplier_id: string;
  location_id: string;
  unit: string;
  par_level: string;
}

const BULK_EDIT_UNCHANGED = '__unchanged__';

const CATEGORIES = [
  'Produce', 'Meat', 'Seafood', 'Dairy', 'Dry Goods',
  'Liquor', 'Beer', 'Wine', 'Non-Alcoholic',
  'Cleaning', 'Paper/Supplies', 'Other',
];

const UNITS = [
  'CS', 'EA', 'LB', 'KG', 'BT', 'BAG', 'BOX', 'CAN',
  'GAL', 'L', 'ML', 'OZ', 'PKG', 'ROLL', 'SHEET', 'Other',
];

const VALID_TABS = ['items', 'orders', 'suppliers', 'transfers'] as const;
type InventoryTab = typeof VALID_TABS[number];

function buildItemName(ingredient: string, brand: string, supplierName: string | null): string {
  const parts = [ingredient.trim()];
  if (brand.trim()) parts.push(brand.trim());
  if (supplierName) parts.push(supplierName);
  return parts.join(' — ');
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Inventory({
  user,
  locations = [],
  selectedLocationId = 'all',
  activeSubTab,
  onSubTabChange,
}: DashboardProps) {
  const { toasts, showToast } = useToast();

  const resolvedTab: InventoryTab =
    VALID_TABS.includes(activeSubTab as InventoryTab)
      ? (activeSubTab as InventoryTab)
      : 'items';

  function setActiveTab(tab: InventoryTab) {
    if (onSubTabChange) onSubTabChange(tab);
  }

  // ── Data state ─────────────────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [newSchemaItems, setNewSchemaItems] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // ── Supplier state ─────────────────────────────────────────────────────────
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierOrders, setSupplierOrders] = useState<Order[]>([]);
  const [supplierForm, setSupplierForm] = useState({
    name: '', contact_name: '', phone: '', email: '',
    payment_terms: '', default_tax: '', notes: '',
  });

  // ── Order state ────────────────────────────────────────────────────────────
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');

  // ── Order line item editing state ──────────────────────────────────────────
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
  const [editingLineItems, setEditingLineItems] = useState<Record<string, Partial<OrderLineItem>>>({});

  // ── Items state ────────────────────────────────────────────────────────────
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [itemCategoryFilter, setItemCategoryFilter] = useState('all');
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [itemForm, setItemForm] = useState<NewInventoryItem>({
    ingredient: '', brand: '', category: 'Produce', size: '', unit: '',
    par_level: '', supplier_id: '', location_id: '', notes: '',
  });
  const [bulkForm, setBulkForm] = useState<BulkEditForm>({
    category: BULK_EDIT_UNCHANGED,
    supplier_id: BULK_EDIT_UNCHANGED,
    location_id: BULK_EDIT_UNCHANGED,
    unit: BULK_EDIT_UNCHANGED,
    par_level: BULK_EDIT_UNCHANGED,
  });

  // ── Merge state ────────────────────────────────────────────────────────────
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);
  const [mergeSaving, setMergeSaving] = useState(false);

  // ── Transfer state ─────────────────────────────────────────────────────────
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_location_id: '', to_location_id: '',
    inventory_item_id: '', quantity: '', notes: '',
  });

  const selectedLocation = selectedLocationId !== 'all'
    ? locations.find((l: any) => l.id === selectedLocationId)
    : locations.find((l: any) => l.is_default) ?? locations[0];
  const sym = (selectedLocation as any)?.currency_symbol ?? '$';

  const ingredientOptions = INGREDIENTS_BY_CATEGORY[itemForm.category] ?? ['Other'];

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  async function fetchSuppliers() {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('owner_id', user.id)
      .order('name');
    setSuppliers(data ?? []);
  }

  async function fetchOrders() {
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*, order_line_items(*)')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (!ordersData) { setOrders([]); return; }
    const withSuppliers = ordersData.map((o: any) => ({
      ...o,
      supplier_name: suppliers.find((s: Supplier) => s.id === o.supplier_id)?.name ?? null,
    }));
    setOrders(withSuppliers);
  }

  async function fetchNewSchemaItems() {
    const { data: itemsData } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('owner_id', user.id)
      .order('name');
    if (!itemsData) { setNewSchemaItems([]); return; }

    const itemIds = itemsData.map((i: any) => i.id);
    const { data: locInvData } = itemIds.length
      ? await supabase
          .from('location_inventory')
          .select('*')
          .eq('owner_id', user.id)
          .in('inventory_item_id', itemIds)
      : { data: [] };

    const merged = itemsData.map((item: any) => ({
      ...item,
      location_inventory: (locInvData ?? []).filter(
        (li: any) => li.inventory_item_id === item.id
      ),
      supplier_name: suppliers.find((s: Supplier) => s.id === item.supplier_id)?.name ?? null,
    }));
    setNewSchemaItems(merged);
  }

  async function fetchTransfers() {
    const { data: rawTransfers } = await supabase
      .from('inventory_transfers')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (!rawTransfers?.length) { setTransfers([]); return; }

    const itemIds = [...new Set(rawTransfers.map((t: any) => t.inventory_item_id))];
    const { data: itemRows } = await supabase
      .from('inventory_items')
      .select('id, name, unit')
      .in('id', itemIds);

    const itemMap: Record<string, { name: string; unit: string }> = {};
    (itemRows ?? []).forEach((i: any) => { itemMap[i.id] = { name: i.name, unit: i.unit ?? '' }; });

    const locationMap: Record<string, string> = {};
    locations.forEach((l: any) => { locationMap[l.id] = l.name; });

    const resolved: InventoryTransfer[] = rawTransfers.map((t: any) => ({
      ...t,
      item_name: itemMap[t.inventory_item_id]?.name ?? 'Unknown Item',
      item_unit: itemMap[t.inventory_item_id]?.unit ?? '',
      from_location_name: t.from_location_id ? (locationMap[t.from_location_id] ?? 'Unknown') : 'N/A',
      to_location_name: t.to_location_id ? (locationMap[t.to_location_id] ?? 'Unknown') : 'N/A',
    }));

    setTransfers(resolved);
  }

  useEffect(() => {
    setLoadingTab(true);
    Promise.all([fetchSuppliers()])
      .then(() => Promise.all([fetchOrders(), fetchNewSchemaItems(), fetchTransfers()]))
      .finally(() => setLoadingTab(false));
  }, [user.id, selectedLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection helpers ──────────────────────────────────────────────────────
  function toggleItemSelection(id: string) {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(items: any[]) {
    if (selectedItemIds.size === items.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(items.map((i: any) => i.id)));
    }
  }

  function clearSelection() {
    setSelectedItemIds(new Set());
  }

  // ── Supplier CRUD ──────────────────────────────────────────────────────────
  async function handleSaveSupplier() {
    if (!supplierForm.name.trim()) { showToast('Supplier name is required', 'error'); return; }
    try {
      const payload = {
        owner_id: user.id,
        name: supplierForm.name.trim(),
        contact_name: supplierForm.contact_name || null,
        phone: supplierForm.phone || null,
        email: supplierForm.email || null,
        payment_terms: supplierForm.payment_terms || null,
        default_tax: supplierForm.default_tax ? parseFloat(supplierForm.default_tax) : null,
        notes: supplierForm.notes || null,
      };
      if (editingSupplier) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id);
        if (error) throw error;
        showToast('Supplier updated', 'success');
      } else {
        const { error } = await supabase.from('suppliers').insert(payload);
        if (error) throw error;
        showToast('Supplier added', 'success');
      }
      await fetchSuppliers();
      setSupplierModalOpen(false);
      setEditingSupplier(null);
      setSupplierForm({ name: '', contact_name: '', phone: '', email: '', payment_terms: '', default_tax: '', notes: '' });
    } catch (e: any) {
      showToast(e.message || 'Failed to save supplier', 'error');
    }
  }

  async function handleDeleteSupplier(id: string) {
    if (!window.confirm('Delete this supplier? This cannot be undone.')) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) { showToast('Failed to delete supplier', 'error'); return; }
    showToast('Supplier deleted', 'success');
    await fetchSuppliers();
    if (selectedSupplier?.id === id) setSelectedSupplier(null);
  }

  function openEditSupplier(s: Supplier) {
    setEditingSupplier(s);
    setSupplierForm({
      name: s.name,
      contact_name: s.contact_name ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      payment_terms: s.payment_terms ?? '',
      default_tax: s.default_tax != null ? String(s.default_tax) : '',
      notes: s.notes ?? '',
    });
    setSupplierModalOpen(true);
  }

  async function loadSupplierOrders(supplier: Supplier) {
    setSelectedSupplier(supplier);
    const { data } = await supabase
      .from('orders')
      .select('*, order_line_items(*)')
      .eq('owner_id', user.id)
      .eq('supplier_id', supplier.id)
      .order('created_at', { ascending: false });
    setSupplierOrders(data ?? []);
  }

  // ── Order actions ──────────────────────────────────────────────────────────
  async function handleDeleteOrder(id: string) {
    if (!window.confirm('Delete this order? This cannot be undone.')) return;
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)
      .eq('owner_id', user.id);
    if (error) { showToast('Failed to delete order', 'error'); return; }
    showToast('Order deleted', 'success');
    await fetchOrders();
    if (selectedSupplier) await loadSupplierOrders(selectedSupplier);
  }

  async function markOrderPaid(id: string, paid: boolean) {
    const { error } = await supabase
      .from('orders')
      .update({ status: paid ? 'paid' : 'unpaid' })
      .eq('id', id);
    if (error) { showToast('Failed to update order', 'error'); return; }
    showToast(paid ? 'Order marked as paid' : 'Order marked as unpaid', 'success');
    await fetchOrders();
    if (selectedSupplier) await loadSupplierOrders(selectedSupplier);
  }

  // ── Order line item actions ────────────────────────────────────────────────
  function toggleLineItemSelection(id: string) {
    setSelectedLineItemIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function startEditingLineItem(li: OrderLineItem) {
    setEditingLineItems(prev => ({
      ...prev,
      [li.id]: {
        name: li.name,
        size: li.size,
        category: li.category,
        quantity: li.quantity,
        quantity_received: li.quantity_received,
        unit: li.unit,
        unit_price: li.unit_price,
        extended_price: li.extended_price,
      },
    }));
  }

  function updateEditingLineItem(id: string, field: string, value: any) {
    setEditingLineItems(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  function cancelEditingLineItem(id: string) {
    setEditingLineItems(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // ── PATCHED: saveLineItem — now updates location_inventory stock and cost ──
  async function saveLineItem(id: string) {
    const patch = editingLineItems[id];
    if (!patch) return;
    const originalOrder = orders.find(o => o.order_line_items?.some(li => li.id === id));
    const originalLi = originalOrder?.order_line_items?.find(li => li.id === id);
    const { error } = await supabase.from('order_line_items').update(patch).eq('id', id);
    if (error) { showToast('Failed to save line item', 'error'); return; }
    // Update location_inventory when quantity_received changes
    const newQtyReceived = parseFloat(String(patch.quantity_received ?? originalLi?.quantity_received ?? 0)) || 0;
    const oldQtyReceived = parseFloat(String(originalLi?.quantity_received ?? 0)) || 0;
    const deltaQty = newQtyReceived - oldQtyReceived;
    const linkedItemId = originalLi?.inventory_item_id;
    const orderLocationId = originalOrder?.location_id;
    if (deltaQty !== 0 && linkedItemId && orderLocationId) {
      const { data: locRow } = await supabase
        .from('location_inventory')
        .select('id, quantity, cost_per_unit')
        .eq('inventory_item_id', linkedItemId)
        .eq('location_id', orderLocationId)
        .eq('owner_id', user.id)
        .maybeSingle();
      const unitPrice = parseFloat(String(patch.unit_price ?? originalLi?.unit_price ?? 0)) || 0;
      const currentQty = parseFloat(String(locRow?.quantity ?? 0)) || 0;
      const newTotalQty = Math.max(0, currentQty + deltaQty);
      // Weighted average cost per unit
      let newCostPerUnit: number | null = locRow?.cost_per_unit ?? null;
      if (unitPrice > 0 && deltaQty > 0) {
        const existingCost = (parseFloat(String(locRow?.cost_per_unit ?? 0)) || 0) * currentQty;
        const incomingCost = unitPrice * deltaQty;
        newCostPerUnit = newTotalQty > 0 ? (existingCost + incomingCost) / newTotalQty : unitPrice;
      }
      if (locRow) {
        await supabase.from('location_inventory').update({
          quantity: newTotalQty,
          cost_per_unit: newCostPerUnit,
          last_updated_by: user.id,
          updated_at: new Date().toISOString(),
        }).eq('id', locRow.id);
      } else if (deltaQty > 0) {
        await supabase.from('location_inventory').insert({
          owner_id: user.id,
          location_id: orderLocationId,
          inventory_item_id: linkedItemId,
          quantity: deltaQty,
          cost_per_unit: unitPrice || null,
          last_updated_by: user.id,
          updated_at: new Date().toISOString(),
        });
      }
      if (newCostPerUnit != null) {
        await supabase.from('inventory_items').update({
          cost_per_unit: newCostPerUnit,
          updated_at: new Date().toISOString(),
        }).eq('id', linkedItemId);
      }
      await supabase.from('inventory_transactions').insert({
        user_id: user.id,
        item_id: linkedItemId,
        type: deltaQty > 0 ? 'add' : 'adjust',
        reason_code: 'order_received',
        quantity: Math.abs(deltaQty),
        unit_price: unitPrice || null,
        cost: unitPrice > 0 ? unitPrice * Math.abs(deltaQty) : null,
        notes: `Order received: ${originalOrder?.order_number || originalOrder?.id}`,
        created_by: user.id,
        location_id: orderLocationId,
        created_at: new Date().toISOString(),
      });
      await fetchNewSchemaItems();
    }
    showToast('Line item saved', 'success');
    cancelEditingLineItem(id);
    await fetchOrders();
    if (selectedSupplier) await loadSupplierOrders(selectedSupplier);
  }

  async function deleteSelectedLineItems(orderId: string) {
    const ids = Array.from(selectedLineItemIds);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} line item${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    const { error } = await supabase
      .from('order_line_items')
      .delete()
      .in('id', ids);
    if (error) { showToast('Failed to delete line items', 'error'); return; }
    showToast(`${ids.length} line item${ids.length !== 1 ? 's' : ''} deleted`, 'success');
    setSelectedLineItemIds(new Set());
    await fetchOrders();
    if (selectedSupplier) await loadSupplierOrders(selectedSupplier);
  }

  // ── Item CRUD ──────────────────────────────────────────────────────────────
  async function handleSaveItem() {
    if (!itemForm.ingredient) { showToast('Ingredient is required', 'error'); return; }
    if (!itemForm.location_id) { showToast('Location is required', 'error'); return; }
    if (!itemForm.category) { showToast('Category is required', 'error'); return; }

    const supplierName = suppliers.find(s => s.id === itemForm.supplier_id)?.name ?? null;
    const generatedName = buildItemName(itemForm.ingredient, itemForm.brand, supplierName);

    try {
      const payload = {
        owner_id: user.id,
        name: generatedName,
        ingredient: itemForm.ingredient || null,
        brand: itemForm.brand || null,
        category: itemForm.category,
        size: itemForm.size || null,
        unit: itemForm.unit || null,
        par_level: itemForm.par_level ? parseFloat(itemForm.par_level) : null,
        supplier_id: itemForm.supplier_id || null,
        location_id: itemForm.location_id,
        notes: itemForm.notes || null,
      };
      if (editingItem) {
        const { error } = await supabase.from('inventory_items').update(payload).eq('id', editingItem.id);
        if (error) throw error;
        showToast('Item updated', 'success');
      } else {
        const { error } = await supabase.from('inventory_items').insert(payload);
        if (error) throw error;
        showToast('Item added', 'success');
      }
      await fetchNewSchemaItems();
      setItemModalOpen(false);
      setEditingItem(null);
      clearSelection();
      setItemForm({ ingredient: '', brand: '', category: 'Produce', size: '', unit: '', par_level: '', supplier_id: '', location_id: '', notes: '' });
    } catch (e: any) {
      showToast(e.message || 'Failed to save item', 'error');
    }
  }

  async function handleBulkSave() {
    const ids = Array.from(selectedItemIds);
    if (!ids.length) return;

    const patch: Record<string, any> = {};
    if (bulkForm.category !== BULK_EDIT_UNCHANGED) patch.category = bulkForm.category;
    if (bulkForm.supplier_id !== BULK_EDIT_UNCHANGED) patch.supplier_id = bulkForm.supplier_id || null;
    if (bulkForm.location_id !== BULK_EDIT_UNCHANGED) patch.location_id = bulkForm.location_id || null;
    if (bulkForm.unit !== BULK_EDIT_UNCHANGED) patch.unit = bulkForm.unit || null;
    if (bulkForm.par_level !== BULK_EDIT_UNCHANGED) {
      patch.par_level = bulkForm.par_level ? parseFloat(bulkForm.par_level) : null;
    }

    if (Object.keys(patch).length === 0) {
      showToast('No changes to save', 'info'); return;
    }

    try {
      const { error } = await supabase
        .from('inventory_items')
        .update(patch)
        .in('id', ids)
        .eq('owner_id', user.id);
      if (error) throw error;
      showToast(`${ids.length} item${ids.length !== 1 ? 's' : ''} updated`, 'success');
      await fetchNewSchemaItems();
      setItemModalOpen(false);
      setIsBulkEdit(false);
      clearSelection();
      setBulkForm({
        category: BULK_EDIT_UNCHANGED,
        supplier_id: BULK_EDIT_UNCHANGED,
        location_id: BULK_EDIT_UNCHANGED,
        unit: BULK_EDIT_UNCHANGED,
        par_level: BULK_EDIT_UNCHANGED,
      });
    } catch (e: any) {
      showToast(e.message || 'Failed to update items', 'error');
    }
  }

  async function handleDeleteItem(id: string) {
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) { showToast('Failed to delete item', 'error'); return; }
    showToast('Item deleted', 'success');
    setSelectedItemIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    await fetchNewSchemaItems();
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedItemIds);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} item${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .in('id', ids)
      .eq('owner_id', user.id);
    if (error) { showToast('Failed to delete items', 'error'); return; }
    showToast(`${ids.length} item${ids.length !== 1 ? 's' : ''} deleted`, 'success');
    clearSelection();
    await fetchNewSchemaItems();
  }

  function openEditItem(item: any) {
    setIsBulkEdit(false);
    setEditingItem(item);
    setItemForm({
      ingredient: item.ingredient ?? '',
      brand: item.brand ?? '',
      category: item.category ?? 'Produce',
      size: item.size ?? '',
      unit: item.unit ?? '',
      par_level: item.par_level != null ? String(item.par_level) : '',
      supplier_id: item.supplier_id ?? '',
      location_id: item.location_id ?? '',
      notes: item.notes ?? '',
    });
    setItemModalOpen(true);
  }

  function openBulkEdit() {
    setIsBulkEdit(true);
    setEditingItem(null);
    setBulkForm({
      category: BULK_EDIT_UNCHANGED,
      supplier_id: BULK_EDIT_UNCHANGED,
      location_id: BULK_EDIT_UNCHANGED,
      unit: BULK_EDIT_UNCHANGED,
      par_level: BULK_EDIT_UNCHANGED,
    });
    setItemModalOpen(true);
  }

  // ── Merge two inventory items ──────────────────────────────────────────────
  async function handleMerge() {
    const ids = Array.from(selectedItemIds);
    if (ids.length !== 2 || !mergePrimaryId) return;

    const secondaryId = ids.find(id => id !== mergePrimaryId);
    if (!secondaryId) return;

    setMergeSaving(true);
    try {
      // Step 1 — fetch all location_inventory rows for both items
      const { data: primaryLocInv } = await supabase
        .from('location_inventory')
        .select('id, location_id, quantity')
        .eq('inventory_item_id', mergePrimaryId)
        .eq('owner_id', user.id);

      const { data: secondaryLocInv } = await supabase
        .from('location_inventory')
        .select('id, location_id, quantity')
        .eq('inventory_item_id', secondaryId)
        .eq('owner_id', user.id);

      // Step 2 — merge quantities per location
      for (const secRow of (secondaryLocInv ?? [])) {
        const primRow = (primaryLocInv ?? []).find(
          (r: any) => r.location_id === secRow.location_id
        );
        if (primRow) {
          const { error } = await supabase
            .from('location_inventory')
            .update({
              quantity: (parseFloat(primRow.quantity) || 0) + (parseFloat(secRow.quantity) || 0),
              last_updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', primRow.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('location_inventory')
            .update({
              inventory_item_id: mergePrimaryId,
              last_updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', secRow.id);
          if (error) throw error;
        }
      }

      // Step 3 — reassign order_line_items from secondary to primary
      const { error: lineItemsError } = await supabase
        .from('order_line_items')
        .update({ inventory_item_id: mergePrimaryId })
        .eq('inventory_item_id', secondaryId);
      if (lineItemsError) throw lineItemsError;

      // Step 4 — reassign inventory_transactions from secondary to primary
      const { error: txError } = await supabase
        .from('inventory_transactions')
        .update({ item_id: mergePrimaryId })
        .eq('item_id', secondaryId);
      if (txError) console.warn('Failed to reassign transactions:', txError.message);

      // Step 5 — delete the secondary item
      const { error: deleteError } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', secondaryId)
        .eq('owner_id', user.id);
      if (deleteError) throw deleteError;

      showToast('Items merged successfully', 'success');
      setMergeModalOpen(false);
      setMergePrimaryId(null);
      clearSelection();
      await fetchNewSchemaItems();
    } catch (e: any) {
      showToast(e.message || 'Failed to merge items', 'error');
    } finally {
      setMergeSaving(false);
    }
  }

  // ── PATCHED: handleSaveTransfer — now actually moves stock between locations
  async function handleSaveTransfer() {
    if (!transferForm.inventory_item_id) { showToast('Item is required', 'error'); return; }
    if (!transferForm.quantity || parseFloat(transferForm.quantity) <= 0) {
      showToast('A valid quantity is required', 'error'); return;
    }
    const qty = parseFloat(transferForm.quantity);
    try {
      const { error } = await supabase.from('inventory_transfers').insert({
        owner_id: user.id,
        from_location_id: transferForm.from_location_id || null,
        to_location_id: transferForm.to_location_id || null,
        inventory_item_id: transferForm.inventory_item_id,
        quantity: qty,
        transferred_by: user.id,
        notes: transferForm.notes || null,
      });
      if (error) throw error;
      // Deduct from source location
      if (transferForm.from_location_id) {
        const { data: srcRow } = await supabase
          .from('location_inventory')
          .select('id, quantity')
          .eq('inventory_item_id', transferForm.inventory_item_id)
          .eq('location_id', transferForm.from_location_id)
          .eq('owner_id', user.id)
          .maybeSingle();
        if (srcRow) {
          await supabase.from('location_inventory').update({
            quantity: Math.max(0, (parseFloat(srcRow.quantity) || 0) - qty),
            last_updated_by: user.id,
            updated_at: new Date().toISOString(),
          }).eq('id', srcRow.id);
        }
      }
      // Add to destination location
      if (transferForm.to_location_id) {
        const { data: dstRow } = await supabase
          .from('location_inventory')
          .select('id, quantity')
          .eq('inventory_item_id', transferForm.inventory_item_id)
          .eq('location_id', transferForm.to_location_id)
          .eq('owner_id', user.id)
          .maybeSingle();
        if (dstRow) {
          await supabase.from('location_inventory').update({
            quantity: (parseFloat(dstRow.quantity) || 0) + qty,
            last_updated_by: user.id,
            updated_at: new Date().toISOString(),
          }).eq('id', dstRow.id);
        } else {
          await supabase.from('location_inventory').insert({
            owner_id: user.id,
            location_id: transferForm.to_location_id,
            inventory_item_id: transferForm.inventory_item_id,
            quantity: qty,
            last_updated_by: user.id,
            updated_at: new Date().toISOString(),
          });
        }
      }
      // Write inventory_transactions ledger entries for the transfer
      const txBase = {
        user_id: user.id,
        item_id: transferForm.inventory_item_id,
        quantity: qty,
        created_by: user.id,
        created_at: new Date().toISOString(),
        notes: transferForm.notes || null,
      };
      if (transferForm.from_location_id) {
        await supabase.from('inventory_transactions').insert({
          ...txBase,
          type: 'remove',
          reason_code: 'transfer_out',
          location_id: transferForm.from_location_id,
          source_table: 'inventory_transfers',
        });
      }
      if (transferForm.to_location_id) {
        await supabase.from('inventory_transactions').insert({
          ...txBase,
          type: 'add',
          reason_code: 'transfer_in',
          location_id: transferForm.to_location_id,
          source_table: 'inventory_transfers',
        });
      }
      showToast('Transfer logged and stock updated', 'success');
      await fetchTransfers();
      await fetchNewSchemaItems();
      setTransferModalOpen(false);
      setTransferForm({ from_location_id: '', to_location_id: '', inventory_item_id: '', quantity: '', notes: '' });
    } catch (e: any) {
      showToast(e.message || 'Failed to log transfer', 'error');
    }
  }

  // ── Client-side filtering ──────────────────────────────────────────────────
  const locationFilteredItems = newSchemaItems.filter((item: any) => {
    if (selectedLocationId === 'all') return true;
    return item.location_id === null || item.location_id === selectedLocationId;
  });

  const filteredItems = locationFilteredItems.filter((item: any) => {
    const q = itemSearchQuery.toLowerCase();
    const matchSearch = !q ||
      item.name?.toLowerCase().includes(q) ||
      item.ingredient?.toLowerCase().includes(q) ||
      item.brand?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.supplier_name?.toLowerCase().includes(q);
    const matchCat = itemCategoryFilter === 'all' || item.category === itemCategoryFilter;
    return matchSearch && matchCat;
  });

  const filteredOrders = orders.filter(inv => {
    if (orderFilter !== 'all' && inv.status !== orderFilter) return false;
    if (orderDateFrom && inv.order_date && inv.order_date < orderDateFrom) return false;
    if (orderDateTo && inv.order_date && inv.order_date > orderDateTo) return false;
    return true;
  });

  function orderTotals(invList: Order[]) {
    return invList.reduce((acc, inv) => ({
      subtotal: acc.subtotal + (inv.subtotal ?? 0),
      tax: acc.tax + (inv.tax ?? 0),
      total: acc.total + (inv.total ?? 0),
    }), { subtotal: 0, tax: 0, total: 0 });
  }

  const previewSupplierName = suppliers.find(s => s.id === itemForm.supplier_id)?.name ?? null;
  const itemNamePreview = itemForm.ingredient
    ? buildItemName(itemForm.ingredient, itemForm.brand, previewSupplierName)
    : null;

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((i: any) => selectedItemIds.has(i.id));
  const someSelected = selectedItemIds.size > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="bg-white/90 rounded-xl shadow-sm mb-6">

        {loadingTab && (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        )}

        {/* ── ITEMS TAB ── */}
        {resolvedTab === 'items' && !loadingTab && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <h2 className="text-xl font-semibold text-gray-900">
                Inventory Items
                {selectedLocationId !== 'all' && (
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    — {locations.find((l: any) => l.id === selectedLocationId)?.name ?? ''}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {someSelected && (
                  <>
                    <span className="text-xs text-gray-500">{selectedItemIds.size} selected</span>
                    <button
                      onClick={openBulkEdit}
                      className="px-3 py-2 bg-cyan-50 text-cyan-600 border border-cyan-200 rounded-lg text-sm font-medium hover:bg-cyan-100"
                    >
                      Edit Selected
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      className="px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100"
                    >
                      Delete Selected
                    </button>
                    {selectedItemIds.size === 2 && (
                      <button
                        onClick={() => {
                          setMergePrimaryId(Array.from(selectedItemIds)[0]);
                          setMergeModalOpen(true);
                        }}
                        className="px-3 py-2 bg-purple-50 text-purple-600 border border-purple-200 rounded-lg text-sm font-medium hover:bg-purple-100"
                      >
                        Merge Items
                      </button>
                    )}
                    <button
                      onClick={clearSelection}
                      className="px-3 py-2 text-gray-400 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                    >
                      Clear
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setIsBulkEdit(false);
                    setEditingItem(null);
                    setItemForm({
                      ingredient: '', brand: '', category: 'Produce', size: '', unit: '',
                      par_level: '', supplier_id: '',
                      location_id: selectedLocationId !== 'all' ? selectedLocationId : '',
                      notes: '',
                    });
                    setItemModalOpen(true);
                  }}
                  className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600"
                >
                  + New Item
                </button>
              </div>
            </div>

            <div className="flex gap-3 mb-4 flex-wrap">
              <input
                type="text"
                placeholder="Search items, brands, suppliers..."
                value={itemSearchQuery}
                onChange={e => setItemSearchQuery(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <select
                value={itemCategoryFilter}
                onChange={e => setItemCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Total Items</div>
                <div className="text-2xl font-bold text-gray-900">{locationFilteredItems.length}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Categories</div>
                <div className="text-2xl font-bold text-gray-900">
                  {new Set(locationFilteredItems.map((i: any) => i.category)).size}
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Below Par</div>
                <div className="text-2xl font-bold text-red-500">
                  {locationFilteredItems.filter((item: any) => {
                    if (!item.par_level) return false;
                    const locInv = item.location_inventory?.find((li: any) =>
                      selectedLocationId === 'all' || li.location_id === selectedLocationId
                    );
                    const qty = selectedLocationId === 'all'
                      ? (item.location_inventory ?? []).reduce((s: number, li: any) => s + (li.quantity ?? 0), 0)
                      : (locInv?.quantity ?? 0);
                    return qty < item.par_level;
                  }).length}
                </div>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <p className="text-center text-gray-400 text-sm italic py-8">
                {itemSearchQuery || itemCategoryFilter !== 'all'
                  ? 'No items match your filters.'
                  : 'No items yet. Add your first inventory item.'}
              </p>
            ) : (
              <div className="space-y-1">
                {/* ── Items table header — Size/Unit removed, Stock + Cost/Unit added ── */}
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-100 rounded-lg text-xs font-semibold text-gray-600 items-center">
                  <div className="col-span-1 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={() => toggleSelectAll(filteredItems)}
                      className="w-4 h-4 rounded border-gray-300 text-cyan-500 cursor-pointer"
                    />
                  </div>
                  <div className="col-span-3">Name</div>
                  <div className="col-span-2">Category</div>
                  <div className="col-span-2">Location</div>
                  <div className="col-span-1 text-right">Stock</div>
                  <div className="col-span-1 text-right">Par</div>
                  <div className="col-span-1 text-right">Cost/Unit</div>
                  <div className="col-span-1" />
                </div>

                {filteredItems.map((item: any) => {
                  const locInv = selectedLocationId !== 'all'
                    ? item.location_inventory?.find((li: any) => li.location_id === selectedLocationId)
                    : null;
                  const qty = selectedLocationId === 'all'
                    ? (item.location_inventory ?? []).reduce((s: number, li: any) => s + (li.quantity ?? 0), 0)
                    : (locInv?.quantity ?? 0);
                  const belowPar = item.par_level && qty < item.par_level;
                  const itemLocationName = item.location_id
                    ? (locations.find((l: any) => l.id === item.location_id)?.name ?? '—')
                    : 'All Locations';
                  const isSelected = selectedItemIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`grid grid-cols-12 gap-2 px-4 py-3 border rounded-lg items-center transition-colors ${
                        isSelected
                          ? 'bg-cyan-50 border-cyan-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="col-span-1 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItemSelection(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-cyan-500 cursor-pointer"
                        />
                      </div>
                      <div className="col-span-3">
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {item.ingredient ?? item.name}
                          {belowPar && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Low</span>
                          )}
                        </div>
                        {item.brand && (
                          <div className="text-xs text-gray-500">{item.brand}</div>
                        )}
                        {item.notes && <div className="text-xs text-gray-400 truncate">{item.notes}</div>}
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{item.category}</span>
                      </div>
                      <div className="col-span-2 text-xs text-gray-500 truncate">{itemLocationName}</div>
                      {/* Stock — aggregate quantity across locations */}
                      <div className="col-span-1 text-right text-sm font-medium">
                        <span className={belowPar ? 'text-red-600' : 'text-gray-700'}>
                          {qty > 0 ? `${qty}${item.unit ? ' ' + item.unit : ''}` : '—'}
                        </span>
                      </div>
                      {/* Par */}
                      <div className="col-span-1 text-right text-sm">
                        {item.par_level != null ? (
                          <span className={belowPar ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                            {item.par_level}
                          </span>
                        ) : '—'}
                      </div>
                      {/* Cost/Unit — populated when orders are received */}
                      <div className="col-span-1 text-right text-xs text-gray-500">
                        {item.cost_per_unit != null ? `${sym}${parseFloat(item.cost_per_unit).toFixed(2)}` : '—'}
                      </div>
                      <div className="col-span-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {resolvedTab === 'orders' && !loadingTab && (
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Orders</h2>

            <div className="flex gap-3 mb-4 flex-wrap items-center">
              <select
                value={orderFilter}
                onChange={e => setOrderFilter(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
              <input
                type="date"
                value={orderDateFrom}
                onChange={e => setOrderDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={orderDateTo}
                onChange={e => setOrderDateTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              {(orderDateFrom || orderDateTo || orderFilter !== 'all') && (
                <button
                  onClick={() => { setOrderDateFrom(''); setOrderDateTo(''); setOrderFilter('all'); }}
                  className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {filteredOrders.length > 0 && (() => {
              const totals = orderTotals(filteredOrders);
              const unpaidTotal = orderTotals(filteredOrders.filter(i => i.status === 'unpaid')).total;
              return (
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    ['Orders',   filteredOrders.length,                 'text-gray-900'],
                    ['Subtotal', `${sym}${totals.subtotal.toFixed(2)}`, 'text-gray-900'],
                    ['Tax',      `${sym}${totals.tax.toFixed(2)}`,      'text-gray-900'],
                    ['Unpaid',   `${sym}${unpaidTotal.toFixed(2)}`,     'text-red-600'],
                  ].map(([label, val, color]) => (
                    <div key={label as string} className="p-4 bg-gray-50 rounded-lg text-center">
                      <div className="text-xs text-gray-500 uppercase mb-1">{label}</div>
                      <div className={`text-xl font-bold ${color}`}>{val}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {filteredOrders.length === 0 ? (
              <p className="text-center text-gray-400 text-sm italic py-8">
                No orders found. They appear here after scanning an order in the app.
              </p>
            ) : (
              <div className="space-y-2">
                {filteredOrders.map(inv => (
                  <div key={inv.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div
                      className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedOrder(expandedOrder === inv.id ? null : inv.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">
                          {inv.supplier_name ?? 'Unknown Supplier'}
                          {inv.order_number && (
                            <span className="text-gray-400 font-normal ml-2">#{inv.order_number}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {inv.order_date ?? 'No date'} · {inv.order_line_items?.length ?? 0} items
                          {inv.location_id && (
                            <span className="ml-2 text-cyan-400">
                              {locations.find((l: any) => l.id === inv.location_id)?.name ?? ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900 text-sm">
                          {sym}{(inv.total ?? 0).toFixed(2)}
                        </div>
                        <div className={`text-xs font-medium ${inv.status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>
                          {inv.status === 'paid' ? '✓ Paid' : 'Unpaid'}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); markOrderPaid(inv.id, inv.status !== 'paid'); }}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                          inv.status === 'paid'
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                      >
                        {inv.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteOrder(inv.id); }}
                        className="px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap bg-red-50 text-red-500 hover:bg-red-100"
                      >
                        Delete
                      </button>
                      <span className="text-gray-400 text-xs ml-1">
                        {expandedOrder === inv.id ? '▲' : '▼'}
                      </span>
                    </div>

                    {expandedOrder === inv.id && (
                      <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                        {inv.order_line_items && inv.order_line_items.length > 0 ? (
                          <>
                            {selectedLineItemIds.size > 0 && (
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-gray-500">{selectedLineItemIds.size} selected</span>
                                <button
                                  onClick={() => deleteSelectedLineItems(inv.id)}
                                  className="px-2 py-1 bg-red-50 text-red-500 border border-red-200 rounded text-xs hover:bg-red-100"
                                >
                                  Delete Selected
                                </button>
                                <button
                                  onClick={() => setSelectedLineItemIds(new Set())}
                                  className="px-2 py-1 text-gray-400 border border-gray-200 rounded text-xs hover:bg-gray-50"
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 border-b border-gray-200">
                                  <th className="pb-2 w-6">
                                    <input
                                      type="checkbox"
                                      checked={inv.order_line_items.length > 0 && inv.order_line_items.every(li => selectedLineItemIds.has(li.id))}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setSelectedLineItemIds(new Set(inv.order_line_items!.map(li => li.id)));
                                        } else {
                                          setSelectedLineItemIds(new Set());
                                        }
                                      }}
                                      className="w-3 h-3 rounded border-gray-300 cursor-pointer"
                                    />
                                  </th>
                                  <th className="text-left pb-2">Item</th>
                                  <th className="text-left pb-2">Category</th>
                                  <th className="text-right pb-2">Qty Ordered</th>
                                  <th className="text-right pb-2">Qty Received</th>
                                  <th className="text-right pb-2">Unit Price</th>
                                  <th className="text-right pb-2">Total</th>
                                  <th className="text-center pb-2">Status</th>
                                  <th className="pb-2 w-12"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {inv.order_line_items.map(li => {
                                  const isEditing = !!editingLineItems[li.id];
                                  const draft = editingLineItems[li.id] ?? {};
                                  const qtyOrdered = isEditing ? (draft.quantity ?? li.quantity ?? 0) : (li.quantity ?? 0);
                                  const qtyReceived = isEditing ? (draft.quantity_received ?? li.quantity_received ?? 0) : (li.quantity_received ?? 0);
                                  const isFullyReceived = qtyReceived >= qtyOrdered && qtyOrdered > 0;
                                  const isShort = qtyReceived > 0 && qtyReceived < qtyOrdered;
                                  const isBackorder = qtyReceived === 0;

                                  return (
                                    <tr key={li.id} className={isEditing ? 'bg-cyan-50' : ''}>
                                      <td className="py-1.5">
                                        <input
                                          type="checkbox"
                                          checked={selectedLineItemIds.has(li.id)}
                                          onChange={() => toggleLineItemSelection(li.id)}
                                          className="w-3 h-3 rounded border-gray-300 cursor-pointer"
                                        />
                                      </td>
                                      <td className="py-1.5">
                                        {isEditing ? (
                                          <div className="flex flex-col gap-1">
                                            <input
                                              type="text"
                                              value={draft.name ?? li.name}
                                              onChange={e => updateEditingLineItem(li.id, 'name', e.target.value)}
                                              className="border border-gray-300 rounded px-2 py-0.5 text-xs w-full"
                                            />
                                            <input
                                              type="text"
                                              value={draft.size ?? li.size ?? ''}
                                              onChange={e => updateEditingLineItem(li.id, 'size', e.target.value || null)}
                                              placeholder="Size"
                                              className="border border-gray-300 rounded px-2 py-0.5 text-xs w-full"
                                            />
                                          </div>
                                        ) : (
                                          <>
                                            <div className="font-medium text-gray-900">{li.name}</div>
                                            {li.size && <div className="text-gray-400">{li.size}</div>}
                                          </>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-gray-500">
                                        {isEditing ? (
                                          <select
                                            value={draft.category ?? li.category ?? ''}
                                            onChange={e => updateEditingLineItem(li.id, 'category', e.target.value)}
                                            className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                                          >
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                          </select>
                                        ) : (
                                          li.category ?? '—'
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right">
                                        {isEditing ? (
                                          <input
                                            type="number"
                                            value={draft.quantity ?? li.quantity ?? ''}
                                            onChange={e => updateEditingLineItem(li.id, 'quantity', parseFloat(e.target.value) || 0)}
                                            className="border border-gray-300 rounded px-2 py-0.5 text-xs w-16 text-right"
                                          />
                                        ) : (
                                          <span>{li.quantity} {li.unit}</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right">
                                        {isEditing ? (
                                          <input
                                            type="number"
                                            value={draft.quantity_received ?? li.quantity_received ?? ''}
                                            onChange={e => updateEditingLineItem(li.id, 'quantity_received', parseFloat(e.target.value) || 0)}
                                            className="border border-gray-300 rounded px-2 py-0.5 text-xs w-16 text-right"
                                          />
                                        ) : (
                                          <span className={isShort ? 'text-yellow-600 font-medium' : isBackorder ? 'text-red-500 font-medium' : 'text-green-600'}>
                                            {li.quantity_received ?? 0} {li.unit}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right">
                                        {isEditing ? (
                                          <input
                                            type="number"
                                            value={draft.unit_price ?? li.unit_price ?? ''}
                                            onChange={e => updateEditingLineItem(li.id, 'unit_price', parseFloat(e.target.value) || null)}
                                            className="border border-gray-300 rounded px-2 py-0.5 text-xs w-20 text-right"
                                          />
                                        ) : (
                                          li.unit_price != null ? `${sym}${li.unit_price.toFixed(2)}` : '—'
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right font-medium">
                                        {isEditing ? (
                                          <input
                                            type="number"
                                            value={draft.extended_price ?? li.extended_price ?? ''}
                                            onChange={e => updateEditingLineItem(li.id, 'extended_price', parseFloat(e.target.value) || null)}
                                            className="border border-gray-300 rounded px-2 py-0.5 text-xs w-20 text-right"
                                          />
                                        ) : (
                                          li.extended_price != null ? `${sym}${li.extended_price.toFixed(2)}` : '—'
                                        )}
                                      </td>
                                      <td className="py-1.5 text-center">
                                        {isFullyReceived && (
                                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Received</span>
                                        )}
                                        {isShort && (
                                          <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">Short</span>
                                        )}
                                        {isBackorder && (
                                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-xs font-medium">Backordered</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-center">
                                        {isEditing ? (
                                          <div className="flex gap-1 justify-center">
                                            <button
                                              onClick={() => saveLineItem(li.id)}
                                              className="px-2 py-0.5 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                                            >
                                              Save
                                            </button>
                                            <button
                                              onClick={() => cancelEditingLineItem(li.id)}
                                              className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => startEditingLineItem(li)}
                                            className="px-2 py-0.5 text-cyan-400 hover:text-cyan-600 rounded text-xs"
                                          >
                                            Edit
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No line items.</p>
                        )}
                        <div className="mt-3 border-t border-gray-200 pt-3">
                          {(() => {
                            const receivedValue = (inv.order_line_items ?? []).reduce((sum, li) => {
                              const qty = li.quantity_received ?? 0;
                              const price = li.unit_price ?? 0;
                              return sum + qty * price;
                            }, 0);
                            const invoiceTotal = inv.total ?? 0;
                            const variance = receivedValue - invoiceTotal;
                            const hasShortage = variance < -0.01;
                            return (
                              <div className="flex justify-between items-end">
                                <div className="flex gap-3 text-xs">
                                  <div className="px-2 py-1 bg-gray-100 rounded">
                                    <span className="text-gray-400">Received Value </span>
                                    <span className="font-semibold text-gray-700">{sym}{receivedValue.toFixed(2)}</span>
                                  </div>
                                  {hasShortage && (
                                    <div className="px-2 py-1 bg-yellow-50 border border-yellow-200 rounded">
                                      <span className="text-yellow-600">Shortage </span>
                                      <span className="font-semibold text-yellow-700">{sym}{Math.abs(variance).toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-6 text-xs text-gray-500">
                                  {[
                                    ['Subtotal',  inv.subtotal],
                                    ['Tax',       inv.tax],
                                    ['Fees',      inv.fees],
                                    ['Discounts', inv.discounts],
                                    ['Invoice Total', inv.total],
                                  ].filter(([, v]) => v != null).map(([label, val]) => (
                                    <div key={label as string} className="text-right">
                                      <div className="text-gray-400">{label}</div>
                                      <div className={`font-semibold ${label === 'Invoice Total' ? 'text-gray-900 text-sm' : 'text-gray-700'}`}>
                                        {sym}{(val as number).toFixed(2)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SUPPLIERS TAB ── */}
        {resolvedTab === 'suppliers' && !loadingTab && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Suppliers</h2>
              <button
                onClick={() => {
                  setEditingSupplier(null);
                  setSupplierForm({ name: '', contact_name: '', phone: '', email: '', payment_terms: '', default_tax: '', notes: '' });
                  setSupplierModalOpen(true);
                }}
                className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600"
              >
                + Add Supplier
              </button>
            </div>

            {selectedSupplier ? (
              <div>
                <button
                  onClick={() => setSelectedSupplier(null)}
                  className="flex items-center gap-1 text-sm text-cyan-500 hover:text-cyan-700 mb-4"
                >
                  ← Back to Suppliers
                </button>
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{selectedSupplier.name}</h3>
                      {selectedSupplier.contact_name && (
                        <div className="text-sm text-gray-600 mt-1">Contact: {selectedSupplier.contact_name}</div>
                      )}
                      {selectedSupplier.phone && <div className="text-sm text-gray-500">{selectedSupplier.phone}</div>}
                      {selectedSupplier.email && <div className="text-sm text-gray-500">{selectedSupplier.email}</div>}
                      {selectedSupplier.payment_terms && (
                        <div className="text-sm text-gray-500 mt-1">Terms: {selectedSupplier.payment_terms}</div>
                      )}
                    </div>
                    <button
                      onClick={() => openEditSupplier(selectedSupplier)}
                      className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {supplierOrders.length > 0 && (() => {
                  const totals = orderTotals(supplierOrders);
                  return (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {[
                        ['Total Orders', supplierOrders.length,             'text-gray-900'],
                        ['Total Spend',  `${sym}${totals.total.toFixed(2)}`, 'text-gray-900'],
                        ['Unpaid',       `${sym}${orderTotals(supplierOrders.filter(i => i.status === 'unpaid')).total.toFixed(2)}`, 'text-red-500'],
                      ].map(([label, val, color]) => (
                        <div key={label as string} className="p-3 bg-gray-50 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">{label}</div>
                          <div className={`text-xl font-bold ${color}`}>{val}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <h3 className="text-base font-semibold text-gray-900 mb-3">Order History</h3>
                {supplierOrders.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-4 text-center">No orders for this supplier yet.</p>
                ) : (
                  <div className="space-y-2">
                    {supplierOrders.map(inv => (
                      <div key={inv.id} className="flex items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-lg">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {inv.order_date ?? 'No date'}
                            {inv.order_number && <span className="text-gray-400 ml-2">#{inv.order_number}</span>}
                          </div>
                          <div className="text-xs text-gray-400">{inv.order_line_items?.length ?? 0} items</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm">{sym}{(inv.total ?? 0).toFixed(2)}</div>
                          <div className={`text-xs ${inv.status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>
                            {inv.status === 'paid' ? '✓ Paid' : 'Unpaid'}
                          </div>
                        </div>
                        <button
                          onClick={() => markOrderPaid(inv.id, inv.status !== 'paid')}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            inv.status === 'paid' ? 'bg-gray-100 text-gray-600' : 'bg-green-500 text-white hover:bg-green-600'
                          }`}
                        >
                          {inv.status === 'paid' ? 'Unmark' : 'Mark Paid'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              suppliers.length === 0 ? (
                <p className="text-center text-gray-400 text-sm italic py-8">No suppliers yet. Add your first supplier.</p>
              ) : (
                <div className="space-y-2">
                  {suppliers.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1 cursor-pointer" onClick={() => loadSupplierOrders(s)}>
                        <div className="font-medium text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-500 flex gap-3 mt-0.5">
                          {s.contact_name && <span>{s.contact_name}</span>}
                          {s.phone && <span>{s.phone}</span>}
                          {s.email && <span>{s.email}</span>}
                          {s.payment_terms && <span>Terms: {s.payment_terms}</span>}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {orders.filter(i => i.supplier_id === s.id).length} orders
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditSupplier(s)} className="px-2 py-1 text-xs text-cyan-500 hover:bg-cyan-50 rounded">Edit</button>
                        <button onClick={() => handleDeleteSupplier(s.id)} className="px-2 py-1 text-xs text-red-400 hover:bg-red-50 rounded">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* ── TRANSFERS TAB ── */}
        {resolvedTab === 'transfers' && !loadingTab && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Location Transfers</h2>
              <button
                onClick={() => setTransferModalOpen(true)}
                className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600"
              >
                + Log Transfer
              </button>
            </div>

            {transfers.length === 0 ? (
              <p className="text-center text-gray-400 text-sm italic py-8">No transfers yet.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-100 rounded-lg text-xs font-semibold text-gray-600">
                  <div className="col-span-2">Date</div>
                  <div className="col-span-3">Item</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2">From</div>
                  <div className="col-span-3">To</div>
                </div>
                {transfers.map(t => (
                  <div
                    key={t.id}
                    className="grid grid-cols-12 gap-2 px-4 py-3 bg-white border border-gray-200 rounded-lg items-center text-sm"
                  >
                    <div className="col-span-2 text-xs text-gray-500">
                      {new Date(t.created_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-3 font-medium text-gray-900">{t.item_name ?? '—'}</div>
                    <div className="col-span-2 text-right text-gray-700">
                      {t.quantity} {t.item_unit ?? ''}
                    </div>
                    <div className="col-span-2 text-xs text-gray-500">{t.from_location_name}</div>
                    <div className="col-span-3 text-xs text-gray-500">
                      → {t.to_location_name}
                      {t.notes && <div className="text-gray-400 italic">{t.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Supplier modal */}
      <Modal isOpen={supplierModalOpen} onClose={() => { setSupplierModalOpen(false); setEditingSupplier(null); }}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-6 text-gray-900">
            {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
          </h3>
          {[
            ['name',          'Supplier Name *', 'text'],
            ['contact_name',  'Contact Name',    'text'],
            ['phone',         'Phone',           'text'],
            ['email',         'Email',           'email'],
            ['payment_terms', 'Payment Terms (e.g. Net 30)', 'text'],
            ['default_tax',   'Default Tax %',   'number'],
          ].map(([field, placeholder, type]) => (
            <input
              key={field}
              type={type}
              placeholder={placeholder as string}
              value={(supplierForm as any)[field as string]}
              onChange={e => setSupplierForm({ ...supplierForm, [field as string]: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg mb-3"
            />
          ))}
          <textarea
            placeholder="Notes"
            value={supplierForm.notes}
            onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4 min-h-[80px]"
          />
          <div className="flex gap-2">
            <button onClick={handleSaveSupplier} className="flex-1 px-4 py-3 bg-cyan-500 text-white rounded-lg font-medium hover:bg-cyan-600">
              {editingSupplier ? 'Save Changes' : 'Add Supplier'}
            </button>
            <button onClick={() => { setSupplierModalOpen(false); setEditingSupplier(null); }} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Item modal — single edit and bulk edit */}
      <Modal isOpen={itemModalOpen} onClose={() => { setItemModalOpen(false); setEditingItem(null); setIsBulkEdit(false); }}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">

          {isBulkEdit ? (
            <>
              <h3 className="text-xl font-semibold mb-1 text-gray-900">Edit {selectedItemIds.size} Items</h3>
              <p className="text-sm text-gray-400 mb-4">
                Only fields left blank will be skipped. Greyed fields cannot be bulk edited.
              </p>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                <select
                  value={bulkForm.category === BULK_EDIT_UNCHANGED ? '' : bulkForm.category}
                  onChange={e => setBulkForm({ ...bulkForm, category: e.target.value || BULK_EDIT_UNCHANGED })}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                >
                  <option value="">— No change —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Supplier</label>
                <select
                  value={bulkForm.supplier_id === BULK_EDIT_UNCHANGED ? '' : bulkForm.supplier_id}
                  onChange={e => setBulkForm({ ...bulkForm, supplier_id: e.target.value || BULK_EDIT_UNCHANGED })}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                >
                  <option value="">— No change —</option>
                  <option value="__clear__">Clear supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Location</label>
                <select
                  value={bulkForm.location_id === BULK_EDIT_UNCHANGED ? '' : bulkForm.location_id}
                  onChange={e => setBulkForm({ ...bulkForm, location_id: e.target.value || BULK_EDIT_UNCHANGED })}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                >
                  <option value="">— No change —</option>
                  {locations.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}{l.is_default ? ' (Default)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Unit</label>
                <select
                  value={bulkForm.unit === BULK_EDIT_UNCHANGED ? '' : bulkForm.unit}
                  onChange={e => setBulkForm({ ...bulkForm, unit: e.target.value || BULK_EDIT_UNCHANGED })}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                >
                  <option value="">— No change —</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Par Level</label>
                <input
                  type="number"
                  placeholder="Leave blank for no change"
                  value={bulkForm.par_level === BULK_EDIT_UNCHANGED ? '' : bulkForm.par_level}
                  onChange={e => setBulkForm({ ...bulkForm, par_level: e.target.value || BULK_EDIT_UNCHANGED })}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Not available in bulk edit</div>
                <div className="grid grid-cols-3 gap-2">
                  {['Ingredient', 'Brand', 'Size', 'Notes'].map(f => (
                    <div key={f} className="px-3 py-2 bg-gray-100 rounded text-xs text-gray-400 text-center">{f}</div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleBulkSave} className="flex-1 px-4 py-3 bg-cyan-500 text-white rounded-lg font-medium hover:bg-cyan-600">
                  Save Changes
                </button>
                <button
                  onClick={() => { setItemModalOpen(false); setIsBulkEdit(false); }}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-xl font-semibold mb-2 text-gray-900">
                {editingItem ? 'Edit Item' : 'Add Item'}
              </h3>

              {itemNamePreview && (
                <div className="mb-4 px-3 py-2 bg-cyan-50 border border-cyan-200 rounded-lg">
                  <div className="text-xs text-cyan-500 font-semibold uppercase mb-0.5">Item will be saved as</div>
                  <div className="text-sm font-medium text-cyan-900">{itemNamePreview}</div>
                </div>
              )}

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={itemForm.category}
                  onChange={e => setItemForm({ ...itemForm, category: e.target.value, ingredient: '' })}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Ingredient <span className="text-red-500">*</span>
                </label>
                <select
                  value={itemForm.ingredient}
                  onChange={e => setItemForm({ ...itemForm, ingredient: e.target.value })}
                  className={`w-full p-3 border rounded-lg ${!itemForm.ingredient ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                >
                  <option value="">Select ingredient...</option>
                  {ingredientOptions.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Brand</label>
                <input
                  type="text"
                  placeholder="e.g. Robin Hood, Sysco Brand"
                  value={itemForm.brand}
                  onChange={e => setItemForm({ ...itemForm, brand: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Supplier</label>
                <select
                  value={itemForm.supplier_id}
                  onChange={e => setItemForm({ ...itemForm, supplier_id: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                >
                  <option value="">No Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Location <span className="text-red-500">*</span>
                </label>
                <select
                  value={itemForm.location_id}
                  onChange={e => setItemForm({ ...itemForm, location_id: e.target.value })}
                  className={`w-full p-3 border rounded-lg ${!itemForm.location_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                >
                  <option value="">Select a location...</option>
                  {locations.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}{l.is_default ? ' (Default)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Size (e.g. 25lb)"
                  value={itemForm.size}
                  onChange={e => setItemForm({ ...itemForm, size: e.target.value })}
                  className="flex-1 p-3 border border-gray-300 rounded-lg"
                />
                <select
                  value={itemForm.unit}
                  onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
                  className="flex-1 p-3 border border-gray-300 rounded-lg"
                >
                  <option value="">Unit...</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <input
                type="number"
                placeholder="Par Level"
                value={itemForm.par_level}
                onChange={e => setItemForm({ ...itemForm, par_level: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg mb-3"
              />

              <textarea
                placeholder="Notes"
                value={itemForm.notes}
                onChange={e => setItemForm({ ...itemForm, notes: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4 min-h-[72px]"
              />

              <div className="flex gap-2">
                <button onClick={handleSaveItem} className="flex-1 px-4 py-3 bg-cyan-500 text-white rounded-lg font-medium hover:bg-cyan-600">
                  {editingItem ? 'Save Changes' : 'Add Item'}
                </button>
                <button onClick={() => { setItemModalOpen(false); setEditingItem(null); }} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Transfer modal */}
      <Modal isOpen={transferModalOpen} onClose={() => setTransferModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-6 text-gray-900">Log Transfer</h3>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Item <span className="text-red-500">*</span>
            </label>
            <select
              value={transferForm.inventory_item_id}
              onChange={e => setTransferForm({ ...transferForm, inventory_item_id: e.target.value })}
              className={`w-full p-3 border rounded-lg ${!transferForm.inventory_item_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
            >
              <option value="">Select Item...</option>
              {newSchemaItems.map((i: any) => (
                <option key={i.id} value={i.id}>{i.name}{i.unit ? ` (${i.unit})` : ''}</option>
              ))}
            </select>
          </div>

          <input
            type="number"
            placeholder="Quantity *"
            value={transferForm.quantity}
            onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
            className="w-full p-3 border border-gray-300 rounded-lg mb-3"
            min="0"
            step="any"
          />

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 mb-1">From Location</label>
            <select
              value={transferForm.from_location_id}
              onChange={e => setTransferForm({ ...transferForm, from_location_id: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">None / External</option>
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 mb-1">To Location</label>
            <select
              value={transferForm.to_location_id}
              onChange={e => setTransferForm({ ...transferForm, to_location_id: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">None / External</option>
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <textarea
            placeholder="Notes"
            value={transferForm.notes}
            onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4 min-h-[72px]"
          />

          <div className="flex gap-2">
            <button onClick={handleSaveTransfer} className="flex-1 px-4 py-3 bg-cyan-500 text-white rounded-lg font-medium hover:bg-cyan-600">
              Log Transfer
            </button>
            <button onClick={() => setTransferModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Merge modal */}
      <Modal isOpen={mergeModalOpen} onClose={() => { if (!mergeSaving) { setMergeModalOpen(false); setMergePrimaryId(null); } }}>
        <div className="bg-white rounded-xl p-8 max-w-lg w-full">
          <h3 className="text-xl font-semibold mb-2 text-gray-900">Merge Items</h3>
          <p className="text-sm text-gray-500 mb-5">
            The primary item is kept. The secondary item is deleted. Quantities are combined at every location. All order history is reassigned to the primary item.
          </p>

          {(() => {
            const ids = Array.from(selectedItemIds);
            const items = ids.map(id => newSchemaItems.find((i: any) => i.id === id)).filter(Boolean);
            if (items.length !== 2) return null;

            return (
              <div className="space-y-3 mb-6">
                {items.map((item: any) => {
                  const isPrimary = item.id === mergePrimaryId;
                  const totalQty = (item.location_inventory ?? []).reduce(
                    (s: number, li: any) => s + (li.quantity ?? 0), 0
                  );
                  return (
                    <div
                      key={item.id}
                      onClick={() => setMergePrimaryId(item.id)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        isPrimary
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                            isPrimary ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                          }`}>
                            {isPrimary && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">
                              {item.ingredient ?? item.name}
                              {isPrimary && (
                                <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Keep</span>
                              )}
                              {!isPrimary && (
                                <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Delete</span>
                              )}
                            </div>
                            {item.brand && <div className="text-xs text-gray-500 mt-0.5">{item.brand}</div>}
                          </div>
                        </div>
                        <div className="text-right text-xs text-gray-500 flex-shrink-0 ml-4">
                          <div className="font-medium text-gray-700">{totalQty} {item.unit ?? ''} in stock</div>
                          <div>{item.category ?? '—'}</div>
                          {item.supplier_name && <div>{item.supplier_name}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400 text-center">Click an item to set it as primary</p>
              </div>
            );
          })()}

          {(() => {
            const ids = Array.from(selectedItemIds);
            const items = ids.map(id => newSchemaItems.find((i: any) => i.id === id)).filter(Boolean);
            if (items.length !== 2 || !mergePrimaryId) return null;
            const primary = items.find((i: any) => i.id === mergePrimaryId);
            const secondary = items.find((i: any) => i.id !== mergePrimaryId);
            if (!primary || !secondary) return null;
            const primaryQty = (primary.location_inventory ?? []).reduce((s: number, li: any) => s + (li.quantity ?? 0), 0);
            const secondaryQty = (secondary.location_inventory ?? []).reduce((s: number, li: any) => s + (li.quantity ?? 0), 0);
            return (
              <div className="mb-5 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                Combined stock will be <span className="font-semibold text-gray-900">{primaryQty + secondaryQty} {primary.unit ?? ''}</span> under <span className="font-semibold text-gray-900">{primary.ingredient ?? primary.name}</span>
              </div>
            );
          })()}

          <div className="flex gap-2">
            <button
              onClick={handleMerge}
              disabled={mergeSaving || !mergePrimaryId}
              className="flex-1 px-4 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mergeSaving ? 'Merging...' : 'Confirm Merge'}
            </button>
            <button
              onClick={() => { setMergeModalOpen(false); setMergePrimaryId(null); }}
              disabled={mergeSaving}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} />
    </>
  );
}