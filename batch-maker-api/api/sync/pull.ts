// pages/api/sync/pull.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase, getUserFromRequest, checkSubscription } from '../../lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getUserFromRequest(req);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { isActive } = await checkSubscription(user.id);

    if (!isActive) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    const { lastSync } = req.query;
    const lastSyncDate = lastSync ? new Date(lastSync as string) : null;

    // Fetch all user data with optional incremental sync
    const [workflowsRes, batchesRes, reportsRes, photosRes] = await Promise.all([
      supabase
        .from('workflows')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('updated_at', lastSyncDate?.toISOString() || '1970-01-01'),
      
      supabase
        .from('batches')
        .select('*')
        .eq('user_id', user.id)
        .gte('updated_at', lastSyncDate?.toISOString() || '1970-01-01'),
      
      supabase
        .from('reports')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', lastSyncDate?.toISOString() || '1970-01-01'),
      
      supabase
        .from('photos')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', lastSyncDate?.toISOString() || '1970-01-01'),
    ]);

    return res.status(200).json({
      workflows: workflowsRes.data || [],
      batches: batchesRes.data || [],
      reports: reportsRes.data || [],
      photos: photosRes.data || [],
      synced_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Pull sync error:', error);
    return res.status(500).json({ error: error.message });
  }
}