'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

type MemberStatus = 'active' | 'on_leave' | 'terminated';

interface TeamMember {
  id: string;
  user_id: string | null;
  owner_id: string;
  role: 'owner' | 'admin' | 'member';
  employment_status: MemberStatus;
  job_title?: string;
  phone?: string;
  hire_date?: string;
  leave_reason?: string;
  termination_reason?: string;
  terminated_at?: string;
  require_clock_in: boolean;
  allow_remote_clock_in: boolean;
  allow_anytime_access: boolean;
  location_ids?: string[];
  hourly_rate?: number;
  pending_email?: string | null;
  profiles?: {
    device_name?: string;
    email?: string;
  };
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string;
}

interface Location {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<MemberStatus, { label: string; color: string; dot: string }> = {
  active:     { label: 'Active',     color: 'bg-green-100 text-green-800',   dot: 'bg-green-500'  },
  on_leave:   { label: 'On Leave',   color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
  terminated: { label: 'Terminated', color: 'bg-red-100 text-red-800',       dot: 'bg-red-500'    },
};

function Initials({ name, status }: { name: string; status: MemberStatus }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const bg = status === 'active' ? 'bg-cyan-500' : status === 'on_leave' ? 'bg-yellow-500' : 'bg-gray-400';
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 ${bg}`}>
      {initials}
    </div>
  );
}

export default function Directory() {
  const [user, setUser] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);

  const [filter, setFilter] = useState<'all' | MemberStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ member: TeamMember; newStatus: MemberStatus } | null>(null);
  const [statusReason, setStatusReason] = useState('');

  const [inviteForm, setInviteForm] = useState({
    email: '', first_name: '', last_name: '', job_title: '', phone: '', role: 'member' as 'member' | 'admin',
  });
  const [inviting, setInviting] = useState(false);

  // ── Add pending employee form ──────────────────────────────────────────────
  const [addForm, setAddForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    job_title: '',
    phone: '',
    hire_date: '',
    role: 'member' as 'member' | 'admin',
    hourly_rate: '',
    require_clock_in: true,
    allow_remote_clock_in: false,
    allow_anytime_access: false,
    location_ids: [] as string[],
  });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    job_title: '', phone: '', hire_date: '', role: 'member' as 'member' | 'admin',
    require_clock_in: true, allow_remote_clock_in: false, allow_anytime_access: false,
    location_ids: [] as string[],
    hourly_rate: '',
  });

  useEffect(() => { checkUser(); }, []);

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = '/login'; return; }
    setUser(session.user);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    const premium = profileData?.role === 'premium' || profileData?.role === 'admin';
    setIsPremium(premium);

    if (premium) {
      await Promise.all([
        fetchTeamMembers(session.user.id),
        fetchInvitations(session.user.id),
        fetchLocations(session.user.id),
      ]);
    }
    setLoading(false);
  }

  async function fetchTeamMembers(ownerId: string) {
    const { data: members, error } = await supabase
      .from('network_member_roles')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
    if (error || !members) { setTeamMembers([]); return; }

    // Only fetch profiles for members who have a user_id
    const userIds = members.map(m => m.user_id).filter(Boolean);
    let profilesMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, device_name, email')
        .in('id', userIds);
      if (profiles) profiles.forEach(p => { profilesMap[p.id] = p; });
    }

    setTeamMembers(members.map(m => ({
      ...m,
      profiles: m.user_id ? (profilesMap[m.user_id] || {}) : undefined,
    })));
  }

  async function fetchInvitations(ownerId: string) {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('business_id', ownerId)
      .order('created_at', { ascending: false });
    if (!error && data) setInvitations(data);
  }

  async function fetchLocations(ownerId: string) {
    const { data } = await supabase
      .from('locations')
      .select('id, name')
      .eq('user_id', ownerId)
      .order('name');
    setLocations(data || []);
  }

  // ── Send invite (existing flow) ────────────────────────────────────────────
  async function handleSendInvite() {
    if (!inviteForm.email) { alert('Email is required'); return; }
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/directory/invite', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inviteForm),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      alert(`Invitation sent to ${inviteForm.email}!`);
      setShowInviteModal(false);
      setInviteForm({ email: '', first_name: '', last_name: '', job_title: '', phone: '', role: 'member' });
      await fetchInvitations(user.id);
    } catch (err: any) {
      alert(err.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  }

  // ── Add pending employee (new flow) ────────────────────────────────────────
  async function handleAddPendingEmployee() {
    setAddError(null);

    if (!addForm.first_name.trim()) { setAddError('First name is required'); return; }
    if (!addForm.email.trim()) { setAddError('Email is required'); return; }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(addForm.email.trim())) {
      setAddError('Please enter a valid email address');
      return;
    }

    // Check for duplicate email in existing members
    const emailAlreadyExists = teamMembers.some(m =>
      m.profiles?.email?.toLowerCase() === addForm.email.trim().toLowerCase() ||
      m.pending_email?.toLowerCase() === addForm.email.trim().toLowerCase()
    );
    if (emailAlreadyExists) {
      setAddError('An employee with this email already exists in your team');
      return;
    }

    setAdding(true);
    try {
      const displayName = [addForm.first_name.trim(), addForm.last_name.trim()]
        .filter(Boolean)
        .join(' ');

      const { error } = await supabase
        .from('network_member_roles')
        .insert({
          owner_id: user.id,
          user_id: null,
          pending_email: addForm.email.trim().toLowerCase(),
          role: addForm.role,
          employment_status: 'active',
          job_title: addForm.job_title.trim() || null,
          phone: addForm.phone.trim() || null,
          hire_date: addForm.hire_date || null,
          hourly_rate: addForm.hourly_rate ? parseFloat(addForm.hourly_rate) : null,
          require_clock_in: addForm.require_clock_in,
          allow_remote_clock_in: addForm.allow_remote_clock_in,
          allow_anytime_access: addForm.allow_anytime_access,
          location_ids: addForm.location_ids.length ? addForm.location_ids : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setShowAddModal(false);
      setAddForm({
        first_name: '', last_name: '', email: '', job_title: '', phone: '',
        hire_date: '', role: 'member', hourly_rate: '',
        require_clock_in: true, allow_remote_clock_in: false, allow_anytime_access: false,
        location_ids: [],
      });
      await fetchTeamMembers(user.id);
    } catch (err: any) {
      setAddError(err.message || 'Failed to add employee');
    } finally {
      setAdding(false);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    if (!confirm('Cancel this invitation?')) return;
    await supabase.from('invitations').delete().eq('id', invitationId);
    await fetchInvitations(user.id);
  }

  function openEditModal(member: TeamMember) {
    setEditingMember(member);
    setEditForm({
      job_title: member.job_title || '',
      phone: member.phone || '',
      hire_date: member.hire_date || '',
      role: (member.role === 'admin' ? 'admin' : 'member') as 'member' | 'admin',
      require_clock_in: member.require_clock_in ?? true,
      allow_remote_clock_in: member.allow_remote_clock_in ?? false,
      allow_anytime_access: member.allow_anytime_access ?? false,
      location_ids: member.location_ids || [],
      hourly_rate: member.hourly_rate != null ? String(member.hourly_rate) : '',
    });
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    if (!editingMember) return;
    const { error } = await supabase
      .from('network_member_roles')
      .update({
        job_title: editForm.job_title || null,
        phone: editForm.phone || null,
        hire_date: editForm.hire_date || null,
        role: editForm.role,
        hourly_rate: editForm.hourly_rate ? parseFloat(editForm.hourly_rate) : null,
        require_clock_in: editForm.require_clock_in,
        allow_remote_clock_in: editForm.allow_remote_clock_in,
        allow_anytime_access: editForm.allow_anytime_access,
        location_ids: editForm.location_ids.length ? editForm.location_ids : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingMember.id);
    if (error) { alert('Failed to update member'); return; }
    setShowEditModal(false);
    setEditingMember(null);
    await fetchTeamMembers(user.id);
  }

  function openStatusModal(member: TeamMember, newStatus: MemberStatus) {
    setStatusTarget({ member, newStatus });
    setStatusReason('');
    setShowStatusModal(true);
  }

  async function handleStatusChange() {
    if (!statusTarget) return;
    const { member, newStatus } = statusTarget;
    const updates: any = { employment_status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'terminated') {
      if (!statusReason.trim()) { alert('Please provide a reason for termination'); return; }
      updates.termination_reason = statusReason;
      updates.terminated_at = new Date().toISOString();
      updates.allow_anytime_access = false;
    } else if (newStatus === 'on_leave') {
      updates.leave_reason = statusReason || null;
      updates.allow_anytime_access = false;
    } else if (newStatus === 'active') {
      updates.termination_reason = null;
      updates.terminated_at = null;
      updates.leave_reason = null;
    }
    const { error } = await supabase
      .from('network_member_roles')
      .update(updates)
      .eq('id', member.id);
    if (error) { alert('Failed to update status'); return; }
    setShowStatusModal(false);
    setStatusTarget(null);
    await fetchTeamMembers(user.id);
  }

  async function handleRemoveMember(member: TeamMember) {
    const name = member.pending_email
      ? member.pending_email
      : member.profiles?.device_name || member.profiles?.email || 'this employee';
    if (!confirm(`Remove ${name} from your business? Their Batch Maker account will not be deleted.`)) return;
    const { error } = await supabase
      .from('network_member_roles')
      .delete()
      .eq('id', member.id);
    if (error) { alert('Failed to remove member'); return; }
    await fetchTeamMembers(user.id);
  }

  function handleExport() {
    const rows = [
      ['Name', 'Email', 'Job Title', 'Phone', 'Hire Date', 'Status', 'Role', 'Pending'],
      ...teamMembers.map(m => [
        m.profiles?.device_name || (m.pending_email ? '(pending)' : ''),
        m.profiles?.email || m.pending_email || '',
        m.job_title || '',
        m.phone || '',
        m.hire_date || '',
        m.employment_status || 'active',
        m.role || '',
        m.pending_email ? 'Yes' : 'No',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `team-directory-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  // ── Helper: resolve display name for a member ──────────────────────────────
  function getMemberDisplayName(member: TeamMember): string {
    if (member.profiles?.device_name) return member.profiles.device_name;
    if (member.profiles?.email) return member.profiles.email;
    if (member.pending_email) return member.pending_email;
    return 'Unknown';
  }

  function isMemberPending(member: TeamMember): boolean {
    return !member.user_id && !!member.pending_email;
  }

  const filteredMembers = teamMembers.filter(m => {
    const status = (m.employment_status || 'active') as MemberStatus;
    const matchesFilter = filter === 'all' || status === filter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      m.profiles?.email?.toLowerCase().includes(q) ||
      m.profiles?.device_name?.toLowerCase().includes(q) ||
      m.pending_email?.toLowerCase().includes(q) ||
      (m.job_title || '').toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const counts = {
    all: teamMembers.length,
    active: teamMembers.filter(m => (m.employment_status || 'active') === 'active').length,
    on_leave: teamMembers.filter(m => m.employment_status === 'on_leave').length,
    terminated: teamMembers.filter(m => m.employment_status === 'terminated').length,
  };

  const pendingInvites = invitations.filter(i => i.status === 'pending');
  const pendingEmployees = teamMembers.filter(m => isMemberPending(m));

  if (loading) {
    return (
      <div className="min-h-screen dashboard-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="min-h-screen dashboard-bg flex items-center justify-center p-6">
        <div className="text-center max-w-md glass-card rounded-2xl p-10">
          <div className="text-4xl mb-4">👥</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Team Directory</h1>
          <p className="text-gray-500 mb-6">Upgrade to Premium to manage your team.</p>
          <Link href="/dashboard" className="inline-block px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors mr-3">← Dashboard</Link>
          <Link href="/upgrade" className="inline-block px-6 py-3 bg-cyan-600 text-white rounded-xl font-semibold hover:bg-cyan-700 transition-colors">Upgrade Now</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen dashboard-bg">

      {/* ── Header ── */}
      <header className="glass-card border-b border-gray-200 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Team Directory</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {teamMembers.length} employee{teamMembers.length !== 1 ? 's' : ''}
              {pendingEmployees.length > 0 && ` · ${pendingEmployees.length} pending sign-in`}
              {pendingInvites.length > 0 && ` · ${pendingInvites.length} pending invite${pendingInvites.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              ↓ Export CSV
            </button>
            <button
              onClick={() => { setAddError(null); setShowAddModal(true); }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              + Add Employee
            </button>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors"
            >
              + Invite by Email
            </button>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Pending employees banner */}
        {pendingEmployees.length > 0 && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-cyan-900 mb-1">
              Waiting for app sign-in ({pendingEmployees.length})
            </h2>
            <p className="text-xs text-cyan-700 mb-3">
              These employees have been added to your team. They will be linked automatically when they install the Batch Maker app and sign in with the email below.
            </p>
            <div className="space-y-2">
              {pendingEmployees.map(m => (
                <div key={m.id} className="bg-white rounded-lg px-4 py-3 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-gray-900 text-sm">{m.pending_email}</span>
                    {m.job_title && <span className="ml-2 text-xs text-gray-500">{m.job_title}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-medium">
                      Pending sign-in
                    </span>
                    <button
                      onClick={() => handleRemoveMember(m)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending invitations */}
        {pendingInvites.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-amber-900 mb-3">
              Pending Invitations ({pendingInvites.length})
            </h2>
            <div className="space-y-2">
              {pendingInvites.map(invite => (
                <div key={invite.id} className="bg-white rounded-lg px-4 py-3 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-gray-900 text-sm">{invite.email}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      sent {new Date(invite.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCancelInvitation(invite.id)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="glass-card rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex gap-1">
            {([['all', 'All'], ['active', 'Active'], ['on_leave', 'On Leave'], ['terminated', 'Terminated']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === val ? 'bg-cyan-100 text-cyan-700' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {label} <span className="ml-1 opacity-70">({counts[val]})</span>
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search by name, email, or job title…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {/* Members table */}
        <div className="glass-card rounded-xl border border-gray-200 overflow-hidden">
          {filteredMembers.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="text-4xl mb-3">👥</div>
              <p className="font-medium text-gray-600 mb-1">No team members found</p>
              <p className="text-sm">Add an employee or send an invite to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Job Title</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Access</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMembers.map(member => {
                    const status = (member.employment_status || 'active') as MemberStatus;
                    const cfg = STATUS_CONFIG[status];
                    const name = getMemberDisplayName(member);
                    const isPending = isMemberPending(member);
                    const isTerminated = status === 'terminated';

                    return (
                      <tr
                        key={member.id}
                        className={`hover:bg-gray-50/50 transition-colors ${isTerminated ? 'opacity-60' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {isPending ? (
                              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200 text-gray-400 text-sm font-semibold flex-shrink-0">
                                ?
                              </div>
                            ) : (
                              <Initials name={name} status={status} />
                            )}
                            <div>
                              <div className="font-medium text-gray-900 text-sm flex items-center gap-2">
                                {isPending ? (
                                  <span className="text-gray-400 italic">{member.pending_email}</span>
                                ) : name}
                                {isPending && (
                                  <span className="text-[10px] bg-cyan-100 text-cyan-600 px-1.5 py-0.5 rounded-full font-semibold">
                                    Pending sign-in
                                  </span>
                                )}
                              </div>
                              {!isPending && member.profiles?.email && (
                                <div className="text-xs text-gray-500">{member.profiles.email}</div>
                              )}
                              {member.hire_date && (
                                <div className="text-xs text-gray-400">
                                  Hired {new Date(member.hire_date + 'T00:00:00').toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {member.job_title || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {member.phone || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                          {status === 'terminated' && member.termination_reason && (
                            <div className="text-xs text-gray-400 mt-1 max-w-[150px] truncate" title={member.termination_reason}>
                              {member.termination_reason}
                            </div>
                          )}
                          {status === 'on_leave' && member.leave_reason && (
                            <div className="text-xs text-gray-400 mt-1">{member.leave_reason}</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${member.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                            {member.role || 'member'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-0.5 text-xs text-gray-500">
                            {member.allow_anytime_access && <span className="text-green-600">✓ Anytime access</span>}
                            {!member.allow_anytime_access && member.require_clock_in && <span>Shift required</span>}
                            {member.allow_remote_clock_in && <span>Remote clock-in</span>}
                            {isPending && <span className="text-cyan-500 italic">Not active yet</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => openEditModal(member)}
                              className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200 transition-colors"
                            >
                              Edit
                            </button>
                            {!isPending && status !== 'active' && (
                              <button
                                onClick={() => openStatusModal(member, 'active')}
                                className="px-2.5 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 transition-colors"
                              >
                                Reactivate
                              </button>
                            )}
                            {!isPending && status === 'active' && (
                              <button
                                onClick={() => openStatusModal(member, 'on_leave')}
                                className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium hover:bg-yellow-200 transition-colors"
                              >
                                Leave
                              </button>
                            )}
                            {!isPending && status !== 'terminated' && (
                              <button
                                onClick={() => openStatusModal(member, 'terminated')}
                                className="px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 transition-colors"
                              >
                                Terminate
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveMember(member)}
                              className="px-2.5 py-1 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">
          Terminating or removing an employee only affects their access to <strong>your</strong> business. Their Batch Maker account remains active.
        </p>
      </div>

      {/* ── ADD EMPLOYEE MODAL (no invite required) ── */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-1">Add Employee</h2>
            <p className="text-sm text-gray-500 mb-6">
              Enter their details now. When they install the Batch Maker app and sign in with the email below, they will be linked to your team automatically.
            </p>

            {addError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {addError}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.first_name}
                    onChange={e => setAddForm({ ...addForm, first_name: e.target.value })}
                    placeholder="Jane"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={addForm.last_name}
                    onChange={e => setAddForm({ ...addForm, last_name: e.target.value })}
                    placeholder="Doe"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="employee@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  They must sign in to the app with exactly this email address.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={addForm.job_title}
                  onChange={e => setAddForm({ ...addForm, job_title: e.target.value })}
                  placeholder="Baker"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="+1 555 123 4567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date</label>
                  <input
                    type="date"
                    value={addForm.hire_date}
                    onChange={e => setAddForm({ ...addForm, hire_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={addForm.role}
                    onChange={e => setAddForm({ ...addForm, role: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={addForm.hourly_rate}
                    onChange={e => setAddForm({ ...addForm, hourly_rate: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {locations.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Allowed Locations</label>
                  <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                      <input
                        type="checkbox"
                        checked={addForm.location_ids.length === 0}
                        onChange={() => setAddForm({ ...addForm, location_ids: [] })}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">All locations</span>
                    </label>
                    {locations.map(loc => (
                      <label key={loc.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addForm.location_ids.includes(loc.id)}
                          onChange={e => {
                            setAddForm(prev => ({
                              ...prev,
                              location_ids: e.target.checked
                                ? [...prev.location_ids, loc.id]
                                : prev.location_ids.filter(id => id !== loc.id),
                            }));
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">{loc.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Leave "All locations" checked to allow access everywhere.</p>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Access Settings</p>
                {[
                  { key: 'require_clock_in', label: 'Require clock-in to access workflows' },
                  { key: 'allow_remote_clock_in', label: 'Allow remote clock-in (bypass location)' },
                  { key: 'allow_anytime_access', label: 'Allow anytime access (bypass shift schedule)' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(addForm as any)[key]}
                      onChange={e => setAddForm({ ...addForm, [key]: e.target.checked })}
                      className="rounded border-gray-300 text-green-600"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPendingEmployee}
                disabled={adding}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INVITE MODAL (existing flow unchanged) ── */}
      {showInviteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-1">Invite Team Member</h2>
            <p className="text-sm text-gray-500 mb-6">
              Sends an email invitation. The employee must click the link to accept.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="employee@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={inviteForm.first_name}
                    onChange={e => setInviteForm({ ...inviteForm, first_name: e.target.value })}
                    placeholder="Jane"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={inviteForm.last_name}
                    onChange={e => setInviteForm({ ...inviteForm, last_name: e.target.value })}
                    placeholder="Doe"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={inviteForm.job_title}
                  onChange={e => setInviteForm({ ...inviteForm, job_title: e.target.value })}
                  placeholder="Baker"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={inviteForm.phone}
                  onChange={e => setInviteForm({ ...inviteForm, phone: e.target.value })}
                  placeholder="+1 555 123 4567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="member">Member — requires shift to clock in</option>
                  <option value="admin">Admin — can manage shifts and anytime access</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvite}
                disabled={inviting}
                className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
              >
                {inviting ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MEMBER MODAL ── */}
      {showEditModal && editingMember && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-1">Edit Employee</h2>
            <p className="text-sm text-gray-500 mb-6">
              {isMemberPending(editingMember)
                ? `Pending — ${editingMember.pending_email}`
                : editingMember.profiles?.device_name || editingMember.profiles?.email}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={editForm.job_title}
                  onChange={e => setEditForm({ ...editForm, job_title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date</label>
                <input
                  type="date"
                  value={editForm.hire_date}
                  onChange={e => setEditForm({ ...editForm, hire_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.hourly_rate}
                  onChange={e => setEditForm({ ...editForm, hourly_rate: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm({ ...editForm, role: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {locations.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Allowed Locations</label>
                  <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                      <input
                        type="checkbox"
                        checked={editForm.location_ids.length === 0}
                        onChange={() => setEditForm({ ...editForm, location_ids: [] })}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">All locations</span>
                    </label>
                    {locations.map(loc => (
                      <label key={loc.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.location_ids.includes(loc.id)}
                          onChange={e => {
                            setEditForm(prev => ({
                              ...prev,
                              location_ids: e.target.checked
                                ? [...prev.location_ids, loc.id]
                                : prev.location_ids.filter(id => id !== loc.id),
                            }));
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">{loc.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Leave "All locations" checked to allow access everywhere.</p>
                </div>
              )}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Access Settings</p>
                {[
                  { key: 'require_clock_in', label: 'Require clock-in to access workflows' },
                  { key: 'allow_remote_clock_in', label: 'Allow remote clock-in (bypass location)' },
                  { key: 'allow_anytime_access', label: 'Allow anytime access (bypass shift schedule)' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(editForm as any)[key]}
                      onChange={e => setEditForm({ ...editForm, [key]: e.target.checked })}
                      className="rounded border-gray-300 text-cyan-600"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STATUS CHANGE MODAL ── */}
      {showStatusModal && statusTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
          onClick={() => setShowStatusModal(false)}
        >
          <div
            className="bg-white rounded-xl p-8 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {statusTarget.newStatus === 'terminated' ? 'Terminate Employee' :
               statusTarget.newStatus === 'on_leave'   ? 'Mark as On Leave' :
               'Reactivate Employee'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {getMemberDisplayName(statusTarget.member)}
            </p>
            {statusTarget.newStatus === 'terminated' && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason for termination *</label>
                <textarea
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  placeholder="e.g. Contract ended, Resignation, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 min-h-[80px]"
                />
                <p className="text-xs text-gray-400 mb-4">
                  This employee will immediately lose access. Their Batch Maker account is unaffected.
                </p>
              </>
            )}
            {statusTarget.newStatus === 'on_leave' && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason (optional)</label>
                <input
                  type="text"
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  placeholder="e.g. Parental leave, Medical leave"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
                />
                <p className="text-xs text-gray-400 mb-4">Employee will not be able to clock in while on leave.</p>
              </>
            )}
            {statusTarget.newStatus === 'active' && (
              <p className="text-sm text-gray-600 mb-6">This will restore their access to workflows and clock-in.</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowStatusModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusChange}
                className={`flex-1 px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors ${
                  statusTarget.newStatus === 'terminated' ? 'bg-red-600 hover:bg-red-700' :
                  statusTarget.newStatus === 'on_leave'   ? 'bg-yellow-500 hover:bg-yellow-600' :
                  'bg-green-600 hover:bg-green-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}