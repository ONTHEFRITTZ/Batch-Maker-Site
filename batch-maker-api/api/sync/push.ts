// pages/api/sync/push.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase, getUserFromRequest, checkSubscription } from '../../lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getUserFromRequest(req);
    const hasAccess = await checkSubscription(user.id);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    const { workflows, batches, reports, deviceId } = req.body;

    const results = {
      workflows: { success: 0, errors: 0 },
      batches: { success: 0, errors: 0 },
      reports: { success: 0, errors: 0 },
    };

    // Sync workflows
    if (workflows && Array.isArray(workflows)) {
      for (const workflow of workflows) {
        try {
          const { error } = await supabase
            .from('workflows')
            .upsert({
              ...workflow,
              user_id: user.id,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'id',
            });

          if (error) {
            console.error('Workflow sync error:', error);
            results.workflows.errors++;
          } else {
            results.workflows.success++;
          }
        } catch (err) {
          console.error('Workflow exception:', err);
          results.workflows.errors++;
        }
      }
    }

    // Sync batches
    if (batches && Array.isArray(batches)) {
      for (const batch of batches) {
        try {
          const { error } = await supabase
            .from('batches')
            .upsert({
              ...batch,
              user_id: user.id,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'id',
            });

          if (error) {
            console.error('Batch sync error:', error);
            results.batches.errors++;
          } else {
            results.batches.success++;
          }
        } catch (err) {
          console.error('Batch exception:', err);
          results.batches.errors++;
        }
      }
    }

    // Sync reports
    if (reports && Array.isArray(reports)) {
      for (const report of reports) {
        try {
          const { error } = await supabase
            .from('reports')
            .upsert({
              ...report,
              user_id: user.id,
              created_at: report.created_at || new Date().toISOString(),
            }, {
              onConflict: 'id',
            });

          if (error) {
            console.error('Report sync error:', error);
            results.reports.errors++;
          } else {
            results.reports.success++;
          }
        } catch (err) {
          console.error('Report exception:', err);
          results.reports.errors++;
        }
      }
    }

    // Log sync activity
    await supabase.from('sync_logs').insert({
      user_id: user.id,
      device_id: deviceId || 'unknown',
      action: 'push',
      entity_type: 'bulk',
      entity_id: 'sync',
      data: results,
    });

    return res.status(200).json({
      success: true,
      results,
      synced_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Push sync error:', error);
    return res.status(401).json({ error: error.message });
  }
}