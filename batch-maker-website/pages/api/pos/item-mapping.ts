/**
 * pages/api/pos/item-mapping.ts
 *
 * GET    /api/pos/item-mapping?provider=X   — fetch existing mappings
 * POST   /api/pos/item-mapping              — save/replace all mappings for provider
 * DELETE /api/pos/item-mapping              — remove single mapping { provider, pos_item_id }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromRequest, createAuthenticatedClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await getUserFromRequest(req);
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';
    const supabase = createAuthenticatedClient(authToken);

    if (req.method === 'GET') {
      const { provider } = req.query;
      if (!provider) return res.status(400).json({ error: 'provider required' });

      const { data, error } = await supabase
        .from('pos_item_workflow_map')
        .select('id, pos_item_id, pos_item_name, workflow_id')
        .eq('owner_id', user.id)
        .eq('provider', provider);

      if (error) throw error;
      return res.json({ mappings: data || [] });
    }

    if (req.method === 'POST') {
      const { provider, mappings } = req.body;
      if (!provider) return res.status(400).json({ error: 'provider required' });
      if (!Array.isArray(mappings)) return res.status(400).json({ error: 'mappings array required' });

      // Upsert all mappings — replace on conflict
      const rows = mappings.map((m: any) => ({
        owner_id: user.id,
        provider,
        pos_item_id: m.pos_item_id,
        pos_item_name: m.pos_item_name,
        workflow_id: m.workflow_id,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('pos_item_workflow_map')
          .upsert(rows, { onConflict: 'owner_id,provider,pos_item_id' });
        if (error) throw error;
      }

      // Remove any mappings not in the new set (items that were set to "No mapping")
      const keptItemIds = mappings.map((m: any) => m.pos_item_id);
      if (keptItemIds.length > 0) {
        await supabase
          .from('pos_item_workflow_map')
          .delete()
          .eq('owner_id', user.id)
          .eq('provider', provider)
          .not('pos_item_id', 'in', `(${keptItemIds.map((id: string) => `"${id}"`).join(',')})`);
      } else {
        // No mappings — delete all for this provider
        await supabase
          .from('pos_item_workflow_map')
          .delete()
          .eq('owner_id', user.id)
          .eq('provider', provider);
      }

      return res.json({ success: true, saved: rows.length });
    }

    if (req.method === 'DELETE') {
      const { provider, pos_item_id } = req.body;
      if (!provider || !pos_item_id) return res.status(400).json({ error: 'provider and pos_item_id required' });

      const { error } = await supabase
        .from('pos_item_workflow_map')
        .delete()
        .eq('owner_id', user.id)
        .eq('provider', provider)
        .eq('pos_item_id', pos_item_id);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('POS item-mapping error:', error);
    res.status(500).json({ error: error.message });
  }
}