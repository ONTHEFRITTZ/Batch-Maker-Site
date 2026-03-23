// pages/api/notifications/catering-confirmed.ts
// Call when a catering order is confirmed and batches are scheduled.
// POST { ownerId, eventName, deliveryDate, batchCount }
import type { NextApiRequest, NextApiResponse } from 'next';
import { sendPushToUsers } from '../../../lib/pushNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ownerId, eventName, deliveryDate, batchCount } = req.body;
  if (!ownerId || !eventName) {
    return res.status(400).json({ error: 'ownerId and eventName are required' });
  }

  const dateStr = deliveryDate
    ? new Date(deliveryDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const title = 'Catering Order Confirmed';
  const body = `"${eventName}"${dateStr ? ` (delivery ${dateStr})` : ''} confirmed. ${batchCount} batch${batchCount !== 1 ? 'es' : ''} scheduled on the production calendar.`;

  await sendPushToUsers(
    ownerId,
    [ownerId],
    { title, body, data: { type: 'catering_confirmed', eventName } },
    'catering_confirmed'
  );

  return res.status(200).json({ success: true });
}