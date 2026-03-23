// pages/api/notifications/cron-shift-reminders.ts
// Cron job — run every 15 minutes.
// Finds shifts starting within the next 60 minutes and notifies the assigned employee.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { sendPushToUsers, isNotifEnabled } from '../../../lib/pushNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();

  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 60 * 1000);
  const todayStr = now.toISOString().split('T')[0];
  const timeNow = now.toTimeString().slice(0, 5);
  const time60 = in60.toTimeString().slice(0, 5);

  const { data: upcomingShifts, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('shift_date', todayStr)
    .eq('status', 'scheduled')
    .gte('start_time', timeNow)
    .lte('start_time', time60);

  if (error) {
    console.error('[cron-shift-reminders] Query error:', error);
    return res.status(500).json({ error: 'DB error' });
  }

  if (!upcomingShifts?.length) {
    return res.status(200).json({ sent: 0 });
  }

  let sent = 0;

  for (const shift of upcomingShifts) {
    const ownerId = shift.owner_id;

    const enabled = await isNotifEnabled(ownerId, 'shift_assigned');
    if (!enabled) continue;

    const minutesUntil = Math.round(
      (new Date(`${todayStr}T${shift.start_time}`).getTime() - now.getTime()) / 60000
    );

    const title = '📅 Shift Starting Soon';
    const body = `Your shift starts in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''} at ${shift.start_time.slice(0, 5)}${shift.role ? ` — ${shift.role}` : ''}.`;

    await sendPushToUsers(
      ownerId,
      [shift.assigned_to],
      { title, body, data: { shiftId: shift.id, type: 'shift_reminder' } },
      'shift_assigned'
    );

    sent++;
  }

  return res.status(200).json({ sent });
}