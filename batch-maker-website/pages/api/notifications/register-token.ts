// pages/api/notifications/register-token.ts
// Called by the mobile app on login or when Expo issues a new push token.
// POST { token: string, device_name?: string }

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const accessToken = authHeader.replace('Bearer ', '');

  // Verify the user via their JWT
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { token, device_name } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token is required' });
  }

  // Validate it looks like an Expo push token
  if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
    return res.status(400).json({ error: 'Invalid Expo push token format' });
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('expo_push_tokens')
    .upsert(
      {
        user_id: user.id,
        token,
        device_name: device_name || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' }
    );

  if (error) {
    console.error('[register-token] Upsert failed:', error);
    return res.status(500).json({ error: 'Failed to register token' });
  }

  return res.status(200).json({ success: true });
}