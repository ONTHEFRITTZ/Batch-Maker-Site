/**
 * pages/api/pos/disconnect.ts
 *
 * DELETE /api/pos/disconnect  body: { provider: 'square' }
 * Removes the pos_connection row and all cached pos_sales for that provider.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromRequest, createAuthenticatedClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getUserFromRequest(req);
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';
    const supabase = createAuthenticatedClient(authToken);

    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider required' });

    // Delete connection (RLS ensures only owner can delete their own)
    const { error: connError } = await supabase
      .from('pos_connections')
      .delete()
      .eq('owner_id', user.id)
      .eq('provider', provider);

    if (connError) throw connError;

    // Optionally purge synced sales for this provider
    const { error: salesError } = await supabase
      .from('pos_sales')
      .delete()
      .eq('owner_id', user.id)
      .eq('provider', provider);

    if (salesError) console.warn('Could not purge pos_sales:', salesError.message);

    res.json({ success: true, provider });
  } catch (error: any) {
    console.error('POS disconnect error:', error);
    res.status(error.message?.includes('token') ? 401 : 500).json({ error: error.message });
  }
}