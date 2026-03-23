// pages/api/notifications/clock-event.ts
// Call this from your clock-in and clock-out API handlers.
// POST { ownerId, userId, userName, action: 'clock_in' | 'clock_out', locationName?: string }

import type { NextApiRequest, NextApiResponse } from 'next';
import { sendPushToUsers, isNotifEnabled } from '../../../lib/pushNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ownerId, userId, userName, action, locationName } = req.body;
  if (!ownerId || !userId || !action) {
    return res.status(400).json({ error: 'ownerId, userId, and action are required' });
  }

  const enabled = await isNotifEnabled(ownerId, 'clock_in_out');
  if (!enabled) return res.status(200).json({ skipped: true });

  const isIn = action === 'clock_in';
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  const title = isIn ? '🟢 Employee Clocked In' : '🔴 Employee Clocked Out';
  const body = `${userName} clocked ${isIn ? 'in' : 'out'} at ${time}${locationName ? ` · ${locationName}` : ''}.`;

  // Only notify the owner (not the employee themselves for clock events)
  await sendPushToUsers(
    ownerId,
    [ownerId],
    { title, body, data: { userId, action, type: 'clock_in_out' } },
    'clock_in_out'
  );

  return res.status(200).json({ success: true });
}