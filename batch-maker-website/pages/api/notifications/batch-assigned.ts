// pages/api/notifications/batch-assigned.ts
// Call when a scheduled batch is assigned to a user.
// POST { ownerId, assignedToUserId, batchName, scheduledDate, workflowName? }
import type { NextApiRequest, NextApiResponse } from 'next';
import { sendPushToUsers } from '../../../lib/pushNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ownerId, assignedToUserId, batchName, scheduledDate, workflowName } = req.body;
  if (!ownerId || !assignedToUserId || !batchName) {
    return res.status(400).json({ error: 'ownerId, assignedToUserId, and batchName are required' });
  }

  // Don't notify if the owner assigned it to themselves
  if (assignedToUserId === ownerId) {
    return res.status(200).json({ skipped: true, reason: 'self-assignment' });
  }

  const dateStr = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const title = 'Batch Assigned to You';
  const body = `"${batchName}"${workflowName ? ` (${workflowName})` : ''}${dateStr ? ` is scheduled for ${dateStr}` : ''}.`;

  await sendPushToUsers(
    ownerId,
    [assignedToUserId],
    { title, body, data: { type: 'batch_assigned', batchName } },
    'batch_assigned'
  );

  return res.status(200).json({ success: true });
}