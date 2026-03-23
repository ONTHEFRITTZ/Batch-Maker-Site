// ============================================
// FILE: pages/api/timeEntries.ts
// Backend routes for time tracking
// ============================================

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '../../lib/supabase';

const supabase = getSupabaseClient();

// ─── Helpers ──────────────────────────────────────────────────────────────

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getAuthUser(req: NextApiRequest): Promise<any> {
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) throw new ApiError(401, 'Missing authorization token');

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new ApiError(401, 'Invalid or expired token');
  return user;
}

function wrapHandler(fn: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error(`[timeEntries] ${status}:`, message);
      res.status(status).json({ error: message });
    }
  };
}

// Helper: calculate hours between two ISO timestamps
function calcTotalHours(clockIn: string, clockOut: string): number {
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  return Math.max(0, Math.round((ms / (1000 * 60 * 60)) * 100) / 100);
}

// Helper: fire-and-forget notification call (non-fatal)
async function fireNotification(path: string, body: Record<string, any>) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    await fetch(`${baseUrl}/api/notifications/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Non-fatal — never let a notification failure break the main action
    console.error(`[notifications] ${path} failed:`, err);
  }
}

// ─── canClockIn ───────────────────────────────────────────────────────────

async function canClockIn(
  userId: string,
  ownerId: string
): Promise<{ allowed: boolean; reason?: string; shift?: any }> {

  const { data: role } = await supabase
    .from('network_member_roles')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('user_id', userId)
    .single();

  if (!role) {
    return { allowed: false, reason: 'Not a member of this network' };
  }

  const empStatus = (role.employment_status || 'active') as string;

  if (empStatus === 'terminated') {
    return {
      allowed: false,
      reason: 'Your employment with this business has ended. Please contact your manager.',
    };
  }

  if (empStatus === 'on_leave') {
    return {
      allowed: false,
      reason: 'You are currently marked as on leave. Please contact your manager if this is incorrect.',
    };
  }

  if (role.allow_anytime_access || role.role === 'admin' || role.role === 'owner') {
    return { allowed: true };
  }

  if (!role.require_clock_in) {
    return { allowed: true };
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const { data: todayShifts } = await supabase
    .from('shifts')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('assigned_to', userId)
    .eq('shift_date', today)
    .eq('status', 'scheduled');

  if (!todayShifts || todayShifts.length === 0) {
    return { allowed: false, reason: 'No scheduled shift today' };
  }

  for (const shift of todayShifts) {
    const shiftStart = new Date(`${shift.shift_date}T${shift.start_time}`);
    const shiftEnd = new Date(`${shift.shift_date}T${shift.end_time}`);
    const thirtyMinBefore = new Date(shiftStart.getTime() - 30 * 60 * 1000);

    if (now >= thirtyMinBefore && now <= shiftEnd) {
      return { allowed: true, shift };
    }
  }

  return { allowed: false, reason: 'No shift starting within 30 minutes' };
}

// ─── POST /api/time-entries/clock-in ──────────────────────────────────────

export const clockIn = wrapHandler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');

  const user = await getAuthUser(req);
  const { owner_id, location } = req.body || {};

  if (!owner_id) throw new ApiError(400, 'owner_id is required');

  const { data: activeEntry } = await supabase
    .from('time_entries')
    .select('id, owner_id')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle();

  if (activeEntry) throw new ApiError(409, 'Already clocked in. Clock out first.');

  const check = await canClockIn(user.id, owner_id);
  if (!check.allowed) throw new ApiError(403, check.reason || 'Not authorized to clock in');

  const { data: timeEntry, error } = await supabase
    .from('time_entries')
    .insert({
      owner_id,
      user_id: user.id,
      shift_id: check.shift?.id || null,
      clock_in: new Date().toISOString(),
      clock_in_location: location || null,
    })
    .select()
    .single();

  if (error || !timeEntry) throw new ApiError(500, 'Failed to clock in');

  // ── Notify owner of clock-in ───────────────────────────────────────────
  const { data: profile } = await supabase.from('profiles').select('device_name, email').eq('id', user.id).single();
  const userName = profile?.device_name || profile?.email || 'An employee';
  const locationName = location?.name || null;
  fireNotification('clock-event', { ownerId: owner_id, userId: user.id, userName, action: 'clock_in', locationName });

  res.status(201).json(timeEntry);
});

// ─── POST /api/time-entries/clock-out ─────────────────────────────────────

export const clockOut = wrapHandler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');

  const user = await getAuthUser(req);
  const { location } = req.body || {};

  const { data: activeEntry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle();

  if (!activeEntry) throw new ApiError(404, 'No active clock-in found');

  const clockOutTime = new Date().toISOString();
  const totalHours = calcTotalHours(activeEntry.clock_in, clockOutTime);

  const { data: timeEntry, error } = await supabase
    .from('time_entries')
    .update({
      clock_out: clockOutTime,
      clock_out_location: location || null,
      total_hours: totalHours,
      updated_at: clockOutTime,
    })
    .eq('id', activeEntry.id)
    .select()
    .single();

  if (error || !timeEntry) throw new ApiError(500, 'Failed to clock out');

  // ── Notify owner of clock-out ──────────────────────────────────────────
  const { data: profile } = await supabase.from('profiles').select('device_name, email').eq('id', user.id).single();
  const userName = profile?.device_name || profile?.email || 'An employee';
  const locationName = location?.name || null;
  fireNotification('clock-event', { ownerId: activeEntry.owner_id, userId: user.id, userName, action: 'clock_out', locationName });

  res.status(200).json(timeEntry);
});

// ─── GET /api/time-entries/active ─────────────────────────────────────────

export const getActiveEntry = wrapHandler(async (req, res) => {
  if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');

  const user = await getAuthUser(req);

  const { data: activeEntry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle();

  res.status(200).json(activeEntry || null);
});

// ─── GET /api/time-entries ────────────────────────────────────────────────

export const getTimeEntries = wrapHandler(async (req, res) => {
  if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');

  const user = await getAuthUser(req);
  const { start_date, end_date, user_id } = req.query as Record<string, string>;

  let query = supabase
    .from('time_entries')
    .select('*')
    .order('clock_in', { ascending: false });

  if (user_id && user_id !== user.id) {
    query = query.eq('owner_id', user.id).eq('user_id', user_id);
  } else {
    query = query.or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);
  }

  if (start_date) query = query.gte('clock_in', start_date);
  if (end_date) query = query.lte('clock_in', end_date);

  const { data: entries, error } = await query;
  if (error) throw new ApiError(500, 'Failed to fetch time entries');

  res.status(200).json(entries || []);
});

// ─── PATCH /api/time-entries/[id] ─────────────────────────────────────────

export const editTimeEntry = wrapHandler(async (req, res) => {
  if (req.method !== 'PATCH') throw new ApiError(405, 'Method not allowed');

  const user = await getAuthUser(req);
  const id = req.query.id as string;
  const { clock_in: newClockIn, clock_out: newClockOut, edit_reason } = req.body || {};

  if (!id) throw new ApiError(400, 'Time entry ID required');
  if (!edit_reason) throw new ApiError(400, 'edit_reason is required');

  const { data: entry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (!entry || entry.owner_id !== user.id) {
    throw new ApiError(403, 'Not authorized to edit this entry');
  }

  const updatedClockIn = newClockIn || entry.clock_in;
  const updatedClockOut = newClockOut || entry.clock_out;

  const updates: any = {
    edited_by: user.id,
    edited_at: new Date().toISOString(),
    edit_reason,
    updated_at: new Date().toISOString(),
  };

  if (newClockIn) updates.clock_in = newClockIn;
  if (newClockOut) updates.clock_out = newClockOut;

  if (updatedClockOut) {
    updates.total_hours = calcTotalHours(updatedClockIn, updatedClockOut);
  }

  const { data: updated, error } = await supabase
    .from('time_entries')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) throw new ApiError(500, 'Failed to update time entry');

  try {
    const { data: employeeProfile } = await supabase
      .from('profiles')
      .select('device_name, email')
      .eq('id', entry.user_id)
      .single();

    if (employeeProfile?.email) {
      console.log(`[timeEntries] Edit notification would be sent to ${employeeProfile.email}`);
    }
  } catch (emailErr) {
    console.error('[timeEntries] Email notification failed:', emailErr);
  }

  res.status(200).json(updated);
});

// ─── GET /api/time-entries/check-shift-alert ──────────────────────────────

export const checkShiftAlert = wrapHandler(async (req, res) => {
  if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');

  const user = await getAuthUser(req);

  const { data: activeEntry } = await supabase
    .from('time_entries')
    .select('*, shifts(*)')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle();

  if (!activeEntry?.shifts) {
    res.status(200).json({ alert: false });
    return;
  }

  const shift = activeEntry.shifts;
  const shiftEnd = new Date(`${shift.shift_date}T${shift.end_time}`);
  const now = new Date();
  const thirtyMinAfterShift = new Date(shiftEnd.getTime() + 30 * 60 * 1000);

  if (now > thirtyMinAfterShift) {
    res.status(200).json({
      alert: true,
      message: 'Your shift ended over 30 minutes ago. Are you still working?',
      shift_end: shiftEnd.toISOString(),
      minutes_over: Math.floor((now.getTime() - shiftEnd.getTime()) / (1000 * 60)),
    });
  } else {
    res.status(200).json({ alert: false });
  }
});

// ─── DELETE /api/time-entries/[id] ────────────────────────────────────────

export const deleteTimeEntry = wrapHandler(async (req, res) => {
  if (req.method !== 'DELETE') throw new ApiError(405, 'Method not allowed');

  const user = await getAuthUser(req);
  const id = req.query.id as string;
  if (!id) throw new ApiError(400, 'Time entry ID required');

  const { data: entry } = await supabase
    .from('time_entries')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (!entry || entry.owner_id !== user.id) {
    throw new ApiError(403, 'Not authorized to delete this entry');
  }

  const { error } = await supabase.from('time_entries').delete().eq('id', id);
  if (error) throw new ApiError(500, 'Failed to delete time entry');

  res.status(200).json({ success: true });
});

// ─── Default export ────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { action } = req.query;

  switch (action) {
    case 'clock-in':     return clockIn(req, res);
    case 'clock-out':    return clockOut(req, res);
    case 'active':       return getActiveEntry(req, res);
    case 'shift-alert':  return checkShiftAlert(req, res);
    default:             return getTimeEntries(req, res);
  }
}