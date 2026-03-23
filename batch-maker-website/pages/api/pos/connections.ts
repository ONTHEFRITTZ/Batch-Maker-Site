/**
 * pages/api/pos/connections.ts
 *
 * GET /api/pos/connections
 * Returns current user's POS connections — provider, display_name, connected_at.
 * Never returns raw tokens.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromRequest, createAuthenticatedClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getUserFromRequest(req);
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';
    const supabase = createAuthenticatedClient(authToken);

    const { data, error } = await supabase
      .from('pos_connections')
      .select('id, provider, display_name, location_id, merchant_id, expires_at, created_at, updated_at')
      .eq('owner_id', user.id);

    if (error) throw error;

    res.json({ connections: data || [] });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
}