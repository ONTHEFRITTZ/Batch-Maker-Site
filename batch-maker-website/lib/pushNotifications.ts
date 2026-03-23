// lib/pushNotifications.ts
// Core utility for sending Expo push notifications server-side.
// All API routes and cron jobs import from here.

import { getSupabaseAdmin } from './supabase';

export type NotificationType =
  | 'shift_assigned'
  | 'batch_due'
  | 'batch_completed'
  | 'clock_in_out'
  | 'low_stock'
  | 'batch_assigned'
  | 'catering_confirmed'
  | 'catering_unpaid'
  | 'batch_starting_soon'
  | 'late_for_shift';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ── Preference column map ──────────────────────────────────────────────────
const PREF_COLUMN: Partial<Record<NotificationType, string>> = {
  low_stock:           'notif_low_stock',
  batch_assigned:      'notif_batch_assigned',
  batch_completed:     'notif_batch_completed',
  catering_confirmed:  'notif_catering_confirmed',
  catering_unpaid:     'notif_catering_unpaid',
  batch_starting_soon: 'notif_batch_starting_soon',
  late_for_shift:      'notif_late_for_shift',
  // Legacy types — always enabled
  shift_assigned:      'notif_batch_assigned',
  batch_due:           'notif_batch_starting_soon',
  clock_in_out:        undefined,
};

// ── Check if a notification type is enabled for an owner ──────────────────
export async function isNotifEnabled(
  ownerId: string,
  type: NotificationType
): Promise<boolean> {
  const col = PREF_COLUMN[type];
  if (!col) return true; // no preference column = always on

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('notification_preferences')
    .select(col)
    .eq('owner_id', ownerId)
    .maybeSingle();

  // No row yet = use default (true)
  if (!data) return true;
  return (data as any)[col] !== false;
}

// ── Get notification settings for an owner ────────────────────────────────
export async function getNotifSettings(ownerId: string): Promise<{
  batch_starting_soon_minutes: number;
  late_for_shift_minutes: number;
}> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('notification_preferences')
    .select('batch_starting_soon_minutes, late_for_shift_minutes')
    .eq('owner_id', ownerId)
    .maybeSingle();

  return {
    batch_starting_soon_minutes: data?.batch_starting_soon_minutes ?? 60,
    late_for_shift_minutes: data?.late_for_shift_minutes ?? 15,
  };
}

// ── Send to one or more user IDs ───────────────────────────────────────────
export async function sendPushToUsers(
  ownerIdForLog: string,
  userIds: string[],
  payload: PushPayload,
  type: NotificationType
): Promise<void> {
  if (!userIds.length) return;

  // Check preference before sending
  const enabled = await isNotifEnabled(ownerIdForLog, type);
  if (!enabled) return;

  const supabase = getSupabaseAdmin();

  const { data: tokenRows, error } = await supabase
    .from('expo_push_tokens')
    .select('user_id, token')
    .in('user_id', userIds);

  if (error || !tokenRows?.length) return;

  const messages = tokenRows.map((row) => ({
    to: row.token,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    sound: 'default',
    priority: 'high',
  }));

  const chunks = chunkArray(messages, 100);
  const results: any[] = [];

  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      const json = await res.json();
      results.push(...(json.data || []));
    } catch (err) {
      console.error('[Push] Expo request failed:', err);
    }
  }

  const logs = tokenRows.map((row, i) => ({
    owner_id: ownerIdForLog,
    recipient_id: row.user_id,
    type,
    title: payload.title,
    body: payload.body,
    data: payload.data || null,
    status: results[i]?.status === 'error' ? 'failed' : 'sent',
    error: results[i]?.status === 'error' ? results[i]?.details?.error : null,
  }));

  await supabase.from('notification_log').insert(logs);
}

// ── Get all user IDs currently on shift for an owner ──────────────────────
export async function getUsersOnShift(ownerId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const { data } = await supabase
    .from('shifts')
    .select('assigned_to')
    .eq('owner_id', ownerId)
    .eq('shift_date', today)
    .eq('status', 'scheduled')
    .lte('start_time', nowTime)
    .gte('end_time', nowTime);

  return data ? [...new Set(data.map((s: any) => s.assigned_to))] : [];
}

// ── Helpers ───────────────────────────────────────────────────────────────
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}