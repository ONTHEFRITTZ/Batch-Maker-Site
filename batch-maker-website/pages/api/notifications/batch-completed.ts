// pages/api/notifications/batch-completed.ts
// Called from batch completion handler.
// POST { ownerId, batchName, completedByName, workflowName, ingredientsUsed?, locationId?, batchSizeMultiplier? }
//
// After sending the completion notification, deducts ingredients from inventory
// and fires a low stock alert for any item that drops below par level.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { sendPushToUsers, isNotifEnabled } from '../../../lib/pushNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    ownerId,
    batchName,
    completedByName,
    workflowName,
    ingredientsUsed,   // array of { name, amount, unit } — from batch completion report
    locationId,
    batchSizeMultiplier = 1,
  } = req.body;

  if (!ownerId || !batchName) {
    return res.status(400).json({ error: 'ownerId and batchName are required' });
  }

  // ── 1. Send batch completed notification ──────────────────────────────────
  const completionEnabled = await isNotifEnabled(ownerId, 'batch_completed');
  if (completionEnabled) {
    const title = 'Batch Completed';
    const body = `"${batchName}"${workflowName ? ` (${workflowName})` : ''} was completed${completedByName ? ` by ${completedByName}` : ''}.`;
    await sendPushToUsers(
      ownerId,
      [ownerId],
      { title, body, data: { type: 'batch_completed' } },
      'batch_completed'
    );
  }

  // ── 2. Deduct ingredients from inventory and check par levels ─────────────
  if (!ingredientsUsed?.length) {
    return res.status(200).json({ success: true, deducted: 0 });
  }

  const supabase = getSupabaseAdmin();
  const lowStockEnabled = await isNotifEnabled(ownerId, 'low_stock');
  let deducted = 0;

  for (const ingredient of ingredientsUsed) {
    if (!ingredient.name) continue;

    // Find matching inventory item by name (case-insensitive)
    const { data: items } = await supabase
      .from('inventory_items')
      .select('id, name, par_level, unit')
      .eq('owner_id', ownerId)
      .ilike('name', `%${ingredient.name}%`)
      .limit(1);

    const item = items?.[0];
    if (!item) continue;

    const consumedQty = (parseFloat(ingredient.amount) || 0) * batchSizeMultiplier;
    if (consumedQty <= 0) continue;

    // Find location_inventory row
    let locQuery = supabase
      .from('location_inventory')
      .select('id, quantity')
      .eq('inventory_item_id', item.id)
      .eq('owner_id', ownerId);

    if (locationId) locQuery = locQuery.eq('location_id', locationId);

    const { data: locRows } = await locQuery.limit(1);
    const locRow = locRows?.[0];

    if (!locRow) continue;

    const newQty = Math.max(0, (parseFloat(locRow.quantity) || 0) - consumedQty);

    await supabase
      .from('location_inventory')
      .update({
        quantity: newQty,
        last_updated_by: ownerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', locRow.id);

    // Log transaction
    await supabase.from('inventory_transactions').insert({
      user_id: ownerId,
      item_id: item.id,
      type: 'use',
      quantity: consumedQty,
      notes: `Used in batch: ${batchName}`,
      created_by: ownerId,
      location_id: locationId || null,
      created_at: new Date().toISOString(),
    });

    deducted++;

    // Check par level and fire low stock notification if needed
    if (lowStockEnabled && item.par_level != null && newQty <= item.par_level) {
      await sendPushToUsers(
        ownerId,
        [ownerId],
        {
          title: 'Low Stock Alert',
          body: `${item.name} is below par level — ${newQty}${item.unit ? ` ${item.unit}` : ''} remaining (par: ${item.par_level}${item.unit ? ` ${item.unit}` : ''}).`,
          data: { type: 'low_stock', itemId: item.id, itemName: item.name },
        },
        'low_stock'
      );
    }
  }

  return res.status(200).json({ success: true, deducted });
}