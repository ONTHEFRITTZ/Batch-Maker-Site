// pages/api/notifications/low-stock.ts
// Call after any inventory transaction that reduces quantity.
// POST { ownerId, itemName, currentQty, parLevel, unit }
import type { NextApiRequest, NextApiResponse } from 'next';
import { sendPushToUsers } from '../../../lib/pushNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ownerId, itemName, currentQty, parLevel, unit } = req.body;
  if (!ownerId || !itemName) {
    return res.status(400).json({ error: 'ownerId and itemName are required' });
  }

  const title = 'Low Stock Alert';
  const body = `${itemName} is below par level — ${currentQty}${unit ? ` ${unit}` : ''} remaining (par: ${parLevel}${unit ? ` ${unit}` : ''}).`;

  await sendPushToUsers(
    ownerId,
    [ownerId],
    { title, body, data: { type: 'low_stock', itemName } },
    'low_stock'
  );

  return res.status(200).json({ success: true });
}