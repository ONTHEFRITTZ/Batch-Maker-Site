// pages/api/directory/status.ts
// Sets employment_status on network_member_roles ONLY — never touches profiles.
// This preserves the employee's account so they can work at other businesses.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '../../../lib/supabase';

type EmploymentStatus = 'active' | 'on_leave' | 'terminated';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabaseClient();

    // Auth: get user from Bearer token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing authorization token' });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token' });

    // Premium check
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, subscription_status')
      .eq('id', user.id)
      .single();

    const isPremium = profile?.role === 'premium' || profile?.role === 'admin' || profile?.subscription_status === 'active';
    if (!isPremium) return res.status(403).json({ error: 'Premium subscription required' });

    const { member_id, status, reason } = req.body as {
      member_id: string;
      status: EmploymentStatus;
      reason?: string;
    };

    if (!member_id || !status) return res.status(400).json({ error: 'member_id and status are required' });
    if (!['active', 'on_leave', 'terminated'].includes(status)) {
      return res.status(400).json({ error: 'status must be active, on_leave, or terminated' });
    }

    // Verify this member belongs to the requesting owner
    const { data: existing } = await supabase
      .from('network_member_roles')
      .select('id')
      .eq('owner_id', user.id)
      .eq('user_id', member_id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Member not found in your business' });

    const updates: Record<string, any> = {
      employment_status: status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'terminated') {
      updates.termination_reason = reason || 'Not specified';
      updates.terminated_at = new Date().toISOString();
      updates.allow_anytime_access = false;
    } else if (status === 'on_leave') {
      updates.leave_reason = reason || null;
      updates.allow_anytime_access = false;
    } else if (status === 'active') {
      updates.termination_reason = null;
      updates.terminated_at = null;
      updates.leave_reason = null;
    }

    const { error } = await supabase
      .from('network_member_roles')
      .update(updates)
      .eq('owner_id', user.id)
      .eq('user_id', member_id);

    if (error) return res.status(500).json({ error: error.message });

    // NOTE: We deliberately do NOT update profiles — employee account stays valid for other businesses.
    return res.status(200).json({ success: true, status });

  } catch (error: any) {
    console.error('[directory/status]', error);
    return res.status(500).json({ error: error.message });
  }
}