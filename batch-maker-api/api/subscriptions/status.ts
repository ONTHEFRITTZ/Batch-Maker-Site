// pages/api/subscriptions/status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getUserFromRequest } from '../../lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getUserFromRequest(req);

    // Get profile with subscription info
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Calculate access status
    const now = new Date();
    let hasAccess = false;
    let status = profile.subscription_status;
    let expiresAt = null;
    let daysRemaining = null;

    if (status === 'trial') {
      const trialExpiry = new Date(profile.trial_expires_at);
      hasAccess = trialExpiry > now;
      expiresAt = profile.trial_expires_at;
      daysRemaining = Math.ceil((trialExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    } else if (status === 'active') {
      if (profile.subscription_expires_at) {
        const subExpiry = new Date(profile.subscription_expires_at);
        hasAccess = subExpiry > now;
        expiresAt = profile.subscription_expires_at;
        daysRemaining = Math.ceil((subExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        hasAccess = true; // Lifetime or non-expiring subscription
      }
    }

    return res.status(200).json({
      user_id: user.id,
      subscription_status: status,
      subscription_platform: profile.subscription_platform,
      has_access: hasAccess,
      expires_at: expiresAt,
      days_remaining: daysRemaining,
      trial_started_at: profile.trial_started_at,
      trial_expires_at: profile.trial_expires_at,
    });
  } catch (error: any) {
    console.error('Status check error:', error);
    return res.status(401).json({ error: error.message });
  }
}