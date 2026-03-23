// pages/api/notifications/shift-assigned.ts
// Call this from your shift creation logic after inserting into `shifts`.
// POST { shiftId: string, ownerId: string }
// Can also be called internally — not exposed to end users directly.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { sendPushToUsers, isNotifEnabled } from '../../../lib/pushNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { shiftId, ownerId } = req.body;
  if (!shiftId || !ownerId) return res.status(400).json({ error: 'shiftId and ownerId required' });

  // Check owner has this notification type enabled
  const enabled = await isNotifEnabled(ownerId, 'shift_assigned');
  if (!enabled) return res.status(200).json({ skipped: true, reason: 'disabled by owner' });

  const supabase = getSupabaseAdmin();

  const { data: shift, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .single();

  if (error || !shift) return res.status(404).json({ error: 'Shift not found' });

  const shiftDate = new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  let title = '';
  let body = '';

  if (shift.status === 'holiday') {
    title = '🏖️ Holiday Approved';
    body = `Your holiday on ${shiftDate} has been confirmed.`;
  } else if (shift.status === 'sick') {
    title = '🤒 Sick Day Recorded';
    body = `A sick day has been recorded for ${shiftDate}.`;
  } else {
    const time = shift.start_time
      ? `${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}`
      : '';
    title = '📅 New Shift Scheduled';
    body = `You have a shift on ${shiftDate}${time ? ` from ${time}` : ''}${shift.role ? ` — ${shift.role}` : ''}.`;
  }

  await sendPushToUsers(ownerId, [shift.assigned_to], { title, body, data: { shiftId, type: 'shift_assigned' } }, 'shift_assigned');

  return res.status(200).json({ success: true });
}