import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient, getUserFromRequest, checkSubscription } from '../../lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  let user: any;

  try {
    user = await getUserFromRequest(req);
  } catch (err: any) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing token' });
  }

  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';
    const supabase = createAuthenticatedClient(authToken);

    const hasAccess = await checkSubscription(user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Premium subscription required' });
    }

    // ── GET: List all team members for this owner ──────────────────────────
    if (req.method === 'GET') {
      const { data: members, error } = await supabase
        .from('network_member_roles')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Team members fetch error:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch team members' });
      }

      // Fetch profiles separately
      const userIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
      let profiles: any[] = [];

      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, email, device_name')
          .in('id', userIds);
        profiles = profileData || [];
      }

      const teamMembers = (members || []).map((m: any) => ({
        ...m,
        profiles: profiles.find((p: any) => p.id === m.user_id) || {},
      }));

      return res.status(200).json({ teamMembers });
    }

    // ── POST: Add a team member directly (e.g. after invite accepted) ──────
    if (req.method === 'POST') {
      const { user_id, role } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('network_member_roles')
        .select('id')
        .eq('owner_id', user.id)
        .eq('user_id', user_id)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: 'This user is already a team member' });
      }

      const { data, error } = await supabase
        .from('network_member_roles')
        .insert({
          owner_id: user.id,
          user_id,
          role: role || 'member',
          employment_status: 'active',
          require_clock_in: true,
          allow_remote_clock_in: false,
          allow_anytime_access: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Team member creation error:', error);
        return res.status(500).json({ error: error.message || 'Failed to add team member' });
      }

      return res.status(201).json({ teamMember: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('Directory API error:', error);
    return res.status(500).json({ error: error?.message || 'An unexpected error occurred' });
  }
}