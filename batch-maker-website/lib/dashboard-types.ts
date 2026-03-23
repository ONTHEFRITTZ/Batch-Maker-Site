export interface Workflow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  steps?: any[];
  claimed_by?: string;
  claimed_by_name?: string;
  deleted_at?: string;
  archived_at?: string | null;
  location_id?: string;
  sort_order?: number;
}

export interface Batch {
  id: string;
  name: string;
  workflow_id: string;
  created_at: string;
  current_step_index?: number;
  steps?: any[];
  location_id?: string;
  completed_at?: string;
  active_timers?: any[];
  [key: string]: any;
}

export interface BatchCompletionReport {
  id: string;
  batch_id: string;
  batch_name: string;
  workflow_id: string;
  workflow_name: string;
  timestamp: number;
  date: string;
  time: string;
  completed_by: string;
  batch_size_multiplier: number;
  actual_duration?: number;
  notes?: string;
  total_cost?: number;
  yield_amount?: number;
  yield_unit?: string;
  photos?: string[];
  step_notes?: any;
  temperature_log?: any[];
  ingredients_used?: any[];
  archived?: boolean;
  location_id?: string;
  user_id?: string;
  wasted?: boolean;
  wasted_at?: string;
  wasted_at_step?: number;
  wasted_at_step_name?: string;
  waste_notes?: string;
}

export interface InventoryItem {
  id: string;
  owner_id: string;
  name: string;
  category?: string;
  size?: string;
  unit: string;
  supplier_id?: string;
  par_level?: number;
  par_reset_on_sod?: boolean;
  last_par_check_at?: string;
  ingredient?: boolean;
  brand?: string;
  notes?: string;
  location_id?: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  user_id: string;
  item_id: string;
  batch_id?: string;
  type: 'add' | 'use' | 'adjust' | 'waste';
  quantity: number;
  cost?: number;
  notes?: string;
  created_by: string;
  created_at: string;
  location_id?: string;
}

export interface ShoppingListItem {
  id: string;
  user_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  status: 'pending' | 'ordered' | 'received';
  estimated_cost?: number;
  supplier?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  location_id?: string;
}

export interface ScheduledBatch {
  id: string;
  user_id: string;
  workflow_id: string;
  template_id?: string;
  scheduled_date: string;
  scheduled_time?: string;
  name: string;
  batch_size_multiplier: number;
  assigned_to?: string;
  assigned_to_name?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  location_id?: string;
}

export interface Profile {
  id: string;
  email: string;
  device_name?: string;
  role?: 'free' | 'premium' | 'admin';
  subscription_status?: 'trial' | 'active' | 'cancelled' | 'expired';
}

export interface NetworkMember {
  id: string;
  owner_id: string;
  user_id: string;
  role: string;
  require_clock_in?: boolean;
  allow_remote_clock_in?: boolean;
  allow_anytime_access?: boolean;
  employment_status?: string;
  job_title?: string;
  phone?: string;
  hire_date?: string;
  hourly_rate?: number;
  holiday_allowance?: number;
  pending_email?: string;
  created_at?: string;
  updated_at?: string;
  profiles?: Profile;
}

export interface BatchTemplate {
  id: string;
  name: string;
  description?: string;
  workflow_id: string;
  workflow_name: string;
  steps: any[];
  ingredients_used?: any[];
  batch_size_multiplier: number;
  estimated_duration?: number;
  estimated_cost?: number;
  selling_price?: number;
  created_by: string;
  created_at: string;
  times_used: number;
}

export interface ActiveSession {
  user_id: string;
  device_name: string;
  current_workflow_id?: string;
  current_workflow_name?: string;
  current_batch_id?: string;
  current_step?: number;
  last_heartbeat: string;
  status: 'idle' | 'working' | 'offline';
}

export interface Location {
  id: string;
  user_id: string;
  name: string;
  address?: string;
  is_default?: boolean;
  created_at?: string;
}

export interface ClockedInMember {
  user_id: string;
  device_name: string;
  clock_in: string;
  current_workflow_name?: string;
  current_batch_id?: string;
  current_step?: number;
}

// ── Phase 6: POS Integration ──────────────────────────────────────────────

export interface PosConnection {
  id: string;
  owner_id: string;
  provider: 'square' | 'toast' | 'lightspeed' | 'clover';
  display_name?: string;
  location_id?: string;
  merchant_id?: string;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  // Note: access_token and refresh_token are NEVER returned to the client
}

export interface PosSale {
  id: string;
  owner_id: string;
  location_id?: string | null;
  item_name: string;
  item_id_external: string;
  date: string;              // ISO date "YYYY-MM-DD"
  quantity_sold: number;
  revenue: number;
  provider: 'square' | 'toast' | 'lightspeed' | 'clover';
  synced_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardProps {
  user: any;
  profile: Profile | null;
  workflows: Workflow[];
  batches: Batch[];
  batchReports: BatchCompletionReport[];
  batchTemplates: BatchTemplate[];
  networkMembers: NetworkMember[];
  inventoryItems: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
  shoppingList: ShoppingListItem[];
  scheduledBatches: ScheduledBatch[];
  isPremium: boolean;
  fetchInventoryItems: () => void;
  fetchInventoryTransactions: () => void;
  fetchShoppingList: () => void;
  fetchScheduledBatches: () => void;
  fetchWorkflows: () => void;
  fetchBatches: () => void;
  fetchBatchReports?: () => void;

  // Location support
  locations?: Location[];
  selectedLocationId?: string;

  // Team clock-in state
  clockedInMembers?: ClockedInMember[];

  // Sub-tab routing — used by Inventory, Analytics, and Schedule
  activeSubTab?: string;
  onSubTabChange?: (tab: string) => void;
}