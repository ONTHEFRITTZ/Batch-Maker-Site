'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

interface TeamMember {
  id: string;
  user_id: string;
  owner_id: string;
  role: 'owner' | 'admin' | 'member';
  require_clock_in: boolean;
  allow_remote_clock_in: boolean;
  allow_anytime_access: boolean;
  profiles?: {
    device_name?: string;
    email?: string;
  };
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export default function DashboardSettings() {
  const [user, setUser] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      window.location.href = '/login';
      return;
    }

    setUser(session.user);

    // Check if premium
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    const premium = profileData?.role === 'premium' || profileData?.role === 'admin';
    setIsPremium(premium);

    if (premium) {
      await fetchTeamMembers(session.user.id);
      await fetchInvitations(session.user.id);
    }

    setLoading(false);
  }

  async function fetchTeamMembers(userId: string) {
    const { data, error } = await supabase
      .from('network_member_roles')
      .select('*, profiles:user_id(device_name, email)')
      .eq('owner_id', userId);

    if (!error && data) setTeamMembers(data);
  }

  async function fetchInvitations(userId: string) {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('business_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error && data) setInvitations(data);
  }

  async function handleSendInvite() {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    setInviting(true);

    try {
      // Check if user is already a team member
      const existingMember = teamMembers.find(
        m => m.profiles?.email?.toLowerCase() === inviteEmail.toLowerCase()
      );

      if (existingMember) {
        alert('This person is already a team member');
        setInviting(false);
        return;
      }

      // Check if invitation already exists
      const existingInvite = invitations.find(
        inv => inv.email.toLowerCase() === inviteEmail.toLowerCase()
      );

      if (existingInvite) {
        alert('An invitation has already been sent to this email');
        setInviting(false);
        return;
      }

      // Create invitation
      const { error } = await supabase.from('invitations').insert({
        business_id: user.id,
        email: inviteEmail.toLowerCase(),
        role: inviteRole,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      alert(`Invitation sent to ${inviteEmail}!`);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('member');
      await fetchInvitations(user.id);
    } catch (error) {
      console.error('Error sending invitation:', error);
      alert('Failed to send invitation');
    } finally {
      setInviting(false);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    if (!confirm('Cancel this invitation?')) return;

    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', invitationId);

    if (error) {
      alert('Failed to cancel invitation');
      return;
    }

    await fetchInvitations(user.id);
  }

  async function handleUpdateTeamMember(userId: string, updates: Partial<TeamMember>) {
    const { error } = await supabase
      .from('network_member_roles')
      .update(updates)
      .eq('owner_id', user.id)
      .eq('user_id', userId);

    if (error) {
      alert('Failed to update team member');
      return;
    }

    await fetchTeamMembers(user.id);
  }

  async function handleRemoveTeamMember(userId: string) {
    if (!confirm('Remove this team member? They will lose access to your workflows.')) return;

    const { error } = await supabase
      .from('network_member_roles')
      .delete()
      .eq('owner_id', user.id)
      .eq('user_id', userId);

    if (error) {
      alert('Failed to remove team member');
      return;
    }

    await fetchTeamMembers(user.id);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading Settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Team Management Section (Premium Only) */}
        {isPremium && (
          <>
            <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Team Member Settings</h2>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <span>➕</span>
                  Invite Team Member
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Manage roles and permissions for your team members. Control clock-in requirements and access levels.
              </p>

              {teamMembers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm italic">No team members yet.</p>
                  <p className="text-gray-500 text-xs mt-2">Click "Invite Team Member" to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {teamMembers.map(member => (
                    <div key={member.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-semibold text-gray-900">
                            {member.user_id === user.id ? 'You' : member.profiles?.device_name || member.profiles?.email || 'Unknown'}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {member.user_id === user.id && <span className="text-blue-600 font-medium">Account Owner</span>}
                            {member.user_id !== user.id && member.profiles?.email && (
                              <span className="text-gray-500">{member.profiles.email}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {member.user_id !== user.id && (
                            <>
                              <select
                                value={member.role}
                                onChange={e => handleUpdateTeamMember(member.user_id, { role: e.target.value as any })}
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white"
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                                <option value="owner">Owner</option>
                              </select>
                              <button
                                onClick={() => handleRemoveTeamMember(member.user_id)}
                                className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                                title="Remove team member"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {member.user_id !== user.id && (
                        <div className="space-y-2 text-sm">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={member.require_clock_in}
                              onChange={e => handleUpdateTeamMember(member.user_id, { require_clock_in: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700">Require clock-in to access workflows</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={member.allow_remote_clock_in}
                              onChange={e => handleUpdateTeamMember(member.user_id, { allow_remote_clock_in: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700">Allow remote clock-in (bypass location check)</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={member.allow_anytime_access}
                              onChange={e => handleUpdateTeamMember(member.user_id, { allow_anytime_access: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700">Allow anytime access (bypass shift schedule)</span>
                          </label>
                        </div>
                      )}

                      {member.user_id !== user.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                          <div><strong>Member:</strong> Standard access, requires shifts & clock-in</div>
                          <div><strong>Admin:</strong> Can manage shifts, anytime access</div>
                          <div><strong>Owner:</strong> Full control, can manage all settings</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Invitations</h3>
                <div className="space-y-3">
                  {invitations.map(invitation => (
                    <div key={invitation.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div>
                        <div className="font-medium text-gray-900">{invitation.email}</div>
                        <div className="text-sm text-gray-600">
                          Role: {invitation.role} • Sent {new Date(invitation.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelInvitation(invitation.id)}
                        className="px-3 py-1.5 text-sm bg-white text-gray-700 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* General Settings */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">General Settings</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
              <div className="text-sm text-gray-600">
                {isPremium ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                    Premium Account
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                    Free Account
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <div className="text-sm text-gray-600">{user?.email}</div>
            </div>

            {!isPremium && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Upgrade to Premium</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Unlock team management, shift scheduling, and advanced features.
                </p>
                <Link 
                  href="/upgrade"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Upgrade Now
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
          style={{ zIndex: 9999 }}
          onClick={() => setShowInviteModal(false)}
        >
          <div 
            className="bg-white rounded-xl p-8 max-w-md w-full"
            style={{ zIndex: 10000, position: 'relative' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-6 text-gray-900">Invite Team Member</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="team@example.com"
                className="w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="member">Member - Standard access</option>
                <option value="admin">Admin - Can manage shifts</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                You can change their role and permissions after they accept the invitation.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSendInvite}
                disabled={inviting}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {inviting ? 'Sending...' : 'Send Invitation'}
              </button>
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}