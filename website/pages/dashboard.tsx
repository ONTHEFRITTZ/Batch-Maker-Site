'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

interface Workflow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  steps?: any[];
  claimed_by?: string;
  claimed_by_name?: string;
  deleted_at?: string;
}

interface Batch {
  id: string;
  name: string;
  workflow_id: string;
  created_at: string;
  current_step_index?: number;
  steps?: any[];
  [key: string]: any;
}

interface BatchCompletionReport {
  id: string;
  batch_id: string;
  batch_name: string;
  workflow_id: string;
  workflow_name: string;
  timestamp: number;
  date: string;
  time: string;
  completed_by: string;
  batch_size_multiplier: number;
  actual_duration?: number;
  notes?: string;
  total_cost?: number;
  yield_amount?: number;
  yield_unit?: string;
  photos?: string[];
  step_notes?: any;
  temperature_log?: any[];
  ingredients_used?: any[];
  archived?: boolean;
}

interface EnvironmentalReport {
  id: string;
  timestamp: number;
  date: string;
  time: string;
  ambient_temp?: number;
  humidity?: number;
  notes?: string;
  created_by: string;
  archived?: boolean;
}

interface Photo {
  id: string;
  url: string;
  created_at: string;
  batch_id?: string;
}

interface Profile {
  id: string;
  email: string;
  device_name?: string;
  role?: string;
  subscription_status?: string;
}

interface Network {
  id: string;
  owner_id: string;
  name?: string;
}

interface NetworkMember {
  id: string;
  user_id: string;
  network_id: string;
  role: string;
  last_active: string;
  profiles?: Profile;
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchReports, setBatchReports] = useState<BatchCompletionReport[]>([]);
  const [envReports, setEnvReports] = useState<EnvironmentalReport[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [network, setNetwork] = useState<Network | null>(null);
  const [networkMembers, setNetworkMembers] = useState<NetworkMember[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [workflowDetailOpen, setWorkflowDetailOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedReport, setSelectedReport] = useState<BatchCompletionReport | null>(null);
  const [reportDetailOpen, setReportDetailOpen] = useState(false);
  
  // Filter states
  const [showArchivedReports, setShowArchivedReports] = useState(false);
  const [reportSortBy, setReportSortBy] = useState<'date' | 'workflow' | 'user'>('date');

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (!user) return;

    // CRITICAL: Real-time syncing with app - DO NOT REMOVE
    const workflowsChannel = supabase
      .channel('workflows-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workflows',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchWorkflows(user.id)
      )
      .subscribe();

    const batchesChannel = supabase
      .channel('batches-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'batches',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchBatches(user.id)
      )
      .subscribe();

    const batchReportsChannel = supabase
      .channel('batch-reports-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'batch_completion_reports',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchBatchReports(user.id)
      )
      .subscribe();

    const envReportsChannel = supabase
      .channel('env-reports-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'environmental_reports',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchEnvReports(user.id)
      )
      .subscribe();

    const photosChannel = supabase
      .channel('photos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'photos',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchPhotos(user.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(workflowsChannel);
      supabase.removeChannel(batchesChannel);
      supabase.removeChannel(batchReportsChannel);
      supabase.removeChannel(envReportsChannel);
      supabase.removeChannel(photosChannel);
    };
  }, [user]);

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      window.location.href = '/login';
      return;
    }

    setUser(session.user);
    await fetchData(session.user.id);
  }

  async function fetchData(userId: string) {
    try {
      await Promise.all([
        fetchProfile(userId),
        fetchWorkflows(userId),
        fetchBatches(userId),
        fetchBatchReports(userId),
        fetchEnvReports(userId),
        fetchPhotos(userId),
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProfile(userId: string) {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return;
    }

    setProfile(profileData);

    const isPremium = profileData?.role === 'premium' || profileData?.role === 'admin';

    if (isPremium) {
      const { data: networkData, error: networkError } = await supabase
        .from('networks')
        .select('*')
        .eq('owner_id', userId)
        .single();

      if (!networkError && networkData) {
        setNetwork(networkData);

        const { data: membersData, error: membersError } = await supabase
          .from('network_members')
          .select(`
            *,
            profiles:user_id (
              id,
              email,
              device_name
            )
          `)
          .eq('network_id', networkData.id);

        if (!membersError) {
          setNetworkMembers(membersData || []);
        }
      }
    }
  }

  async function fetchWorkflows(userId: string) {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching workflows:', error);
    } else {
      console.log('Workflows fetched:', data?.length);
      setWorkflows(data || []);
    }
  }

  async function fetchBatches(userId: string) {
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching batches:', error);
    } else {
      console.log('Batches fetched:', data?.length);
      setBatches(data || []);
    }
  }

  async function fetchBatchReports(userId: string) {
    const { data, error } = await supabase
      .from('batch_completion_reports')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching batch reports:', error);
    } else {
      console.log('Batch reports fetched:', data?.length);
      setBatchReports(data || []);
    }
  }

  async function fetchEnvReports(userId: string) {
    const { data, error } = await supabase
      .from('environmental_reports')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching environmental reports:', error);
    } else {
      console.log('Environmental reports fetched:', data?.length);
      setEnvReports(data || []);
    }
  }

  async function fetchPhotos(userId: string) {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching photos:', error);
    } else {
      console.log('Photos fetched:', data?.length);
      setPhotos(data || []);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  async function archiveReport(reportId: string, table: string) {
    await supabase.from(table).update({ archived: true }).eq('id', reportId);
    if (table === 'batch_completion_reports') {
      await fetchBatchReports(user.id);
    } else {
      await fetchEnvReports(user.id);
    }
  }

  async function unarchiveReport(reportId: string, table: string) {
    await supabase.from(table).update({ archived: false }).eq('id', reportId);
    if (table === 'batch_completion_reports') {
      await fetchBatchReports(user.id);
    } else {
      await fetchEnvReports(user.id);
    }
  }

  function openAssignModal(workflow: Workflow) {
    setSelectedWorkflow(workflow);
    setAssignModalOpen(true);
  }

  async function handleAssignWorkflow(targetUserId: string) {
    if (!selectedWorkflow) return;

    try {
      const targetMember = networkMembers.find(m => m.user_id === targetUserId);
      
      const { error } = await supabase
        .from('workflows')
        .update({
          claimed_by: targetUserId,
          claimed_by_name: targetMember?.profiles?.device_name || targetMember?.profiles?.email,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedWorkflow.id);

      if (!error) {
        await fetchWorkflows(user.id);
        setAssignModalOpen(false);
        alert('Workflow assigned successfully!');
      } else {
        alert('Error assigning workflow: ' + error.message);
      }
    } catch (error) {
      console.error('Error assigning workflow:', error);
      alert('Error assigning workflow');
    }
  }

  async function handleInviteUser() {
    if (!inviteEmail || !network) return;

    try {
      alert(`Invitation sent to ${inviteEmail}! They'll need to sign in and join your network.`);
      setInviteEmail('');
      setInviteModalOpen(false);
    } catch (error) {
      console.error('Error inviting user:', error);
      alert('Error sending invitation');
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      const { error } = await supabase
        .from('network_members')
        .delete()
        .eq('id', memberId);

      if (!error) {
        await fetchProfile(user.id);
        alert('Member removed successfully');
      } else {
        alert('Error removing member: ' + error.message);
      }
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Error removing member');
    }
  }

  async function handleRefresh() {
    setLoading(true);
    await fetchData(user.id);
    setLoading(false);
  }

  async function exportReportsCSV() {
    const visibleReports = showArchivedReports ? batchReports : batchReports.filter(r => !r.archived);
    let csv = 'Date,Time,Batch,Workflow,User,Size,Duration,Cost,Yield,Notes\n';
    visibleReports.forEach(r => {
      const duration = r.actual_duration ? Math.round(r.actual_duration / 60) : '';
      const cost = r.total_cost || '';
      const yieldStr = r.yield_amount && r.yield_unit ? `${r.yield_amount}${r.yield_unit}` : '';
      const notes = (r.notes || '').replace(/"/g, '""');
      csv += `${r.date},${r.time},"${r.batch_name}","${r.workflow_name}",${r.completed_by},${r.batch_size_multiplier}x,${duration},${cost},${yieldStr},"${notes}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-reports-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  const isPremium = profile?.role === 'premium' || profile?.role === 'admin';
  
  const activeBatches = batches.filter(b => {
    if (!b.steps) return true;
    if (!Array.isArray(b.steps)) return true;
    const currentIndex = b.current_step_index ?? 0;
    return currentIndex < b.steps.length;
  });

  const totalReports = batchReports.length + envReports.length;
  const visibleBatchReports = showArchivedReports ? batchReports : batchReports.filter(r => !r.archived);
  const visibleEnvReports = showArchivedReports ? envReports : envReports.filter(r => !r.archived);

  // Analytics
  const today = new Date();
  const thisWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastYearToday = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

  const batchesThisWeek = batchReports.filter(r => new Date(r.timestamp) >= thisWeekStart).length;
  const batchesThisMonth = batchReports.filter(r => new Date(r.timestamp) >= thisMonthStart).length;
  const batchesLastYearToday = batchReports.filter(r => {
    const rDate = new Date(r.timestamp);
    return rDate.getFullYear() === lastYearToday.getFullYear() && 
           rDate.getMonth() === lastYearToday.getMonth() && 
           rDate.getDate() === lastYearToday.getDate();
  }).length;

  const avgBatchDuration = batchReports.filter(r => r.actual_duration).reduce((sum, r) => sum + (r.actual_duration || 0), 0) / (batchReports.filter(r => r.actual_duration).length || 1);
  const totalCost = batchReports.reduce((sum, r) => sum + (r.total_cost || 0), 0);

  // Team activity
  const recentActivity = batchReports.slice(0, 10).map(r => ({
    user: r.completed_by,
    action: `Completed ${r.batch_name}`,
    time: new Date(r.timestamp).toLocaleString(),
  }));

  // Sort reports
  let sortedReports = [...visibleBatchReports];
  if (reportSortBy === 'workflow') sortedReports.sort((a, b) => a.workflow_name.localeCompare(b.workflow_name));
  else if (reportSortBy === 'user') sortedReports.sort((a, b) => a.completed_by.localeCompare(b.completed_by));
  else sortedReports.sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1 style={styles.title}>Dashboard</h1>
            {isPremium && (
              <p style={styles.premiumBadge}>👑 Premium Account</p>
            )}
          </div>
          <div style={styles.headerButtons}>
            <button onClick={handleRefresh} style={styles.refreshButton}>
              🔄 Refresh
            </button>
            <Link href="/account" style={styles.linkButton}>
              Account
            </Link>
            <button onClick={signOut} style={styles.signOutButton}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div style={styles.content}>
        {/* User Welcome */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            Welcome back, {user?.user_metadata?.full_name || user?.email}!
          </h2>
          <div style={styles.userInfo}>
            <p><strong>Email:</strong> {user?.email}</p>
            <p><strong>Account created:</strong> {new Date(user?.created_at).toLocaleDateString()}</p>
            <p><strong>Subscription:</strong> {profile?.subscription_status || 'trial'}</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{workflows.length}</div>
            <div style={styles.statLabel}>Workflows</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{batches.length}</div>
            <div style={styles.statLabel}>Total Batches</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{activeBatches.length}</div>
            <div style={styles.statLabel}>Active Batches</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{totalReports}</div>
            <div style={styles.statLabel}>Reports</div>
          </div>
        </div>

        {/* Analytics */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>📊 Analytics</h2>
          <div style={styles.analyticsGrid}>
            <div style={styles.analyticItem}>
              <div style={styles.analyticLabel}>This Week</div>
              <div style={styles.analyticValue}>{batchesThisWeek} batches</div>
            </div>
            <div style={styles.analyticItem}>
              <div style={styles.analyticLabel}>This Month</div>
              <div style={styles.analyticValue}>{batchesThisMonth} batches</div>
            </div>
            <div style={styles.analyticItem}>
              <div style={styles.analyticLabel}>Same Day Last Year</div>
              <div style={styles.analyticValue}>{batchesLastYearToday} batches</div>
            </div>
            <div style={styles.analyticItem}>
              <div style={styles.analyticLabel}>Avg Duration</div>
              <div style={styles.analyticValue}>{Math.round(avgBatchDuration / 60)} min</div>
            </div>
            <div style={styles.analyticItem}>
              <div style={styles.analyticLabel}>Total Cost</div>
              <div style={styles.analyticValue}>${totalCost.toFixed(2)}</div>
            </div>
            <div style={styles.analyticItem}>
              <div style={styles.analyticLabel}>Avg Cost/Batch</div>
              <div style={styles.analyticValue}>${(totalCost / (batchReports.length || 1)).toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Team Activity (Premium) */}
        {isPremium && recentActivity.length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>👥 Team Activity</h2>
            <div style={styles.list}>
              {recentActivity.map((activity, i) => (
                <div key={i} style={styles.activityItem}>
                  <div>
                    <div style={styles.activityUser}>{activity.user}</div>
                    <div style={styles.activityAction}>{activity.action}</div>
                  </div>
                  <div style={styles.activityTime}>{activity.time}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Network Management (Premium Only) */}
        {isPremium && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Network Members</h2>
              <button
                onClick={() => setInviteModalOpen(true)}
                style={styles.primaryButton}
              >
                + Invite User
              </button>
            </div>

            {networkMembers.length === 0 ? (
              <p style={styles.emptyText}>
                No connected users yet. Invite team members to share workflows and collaborate.
              </p>
            ) : (
              <div style={styles.list}>
                {networkMembers.map((member) => (
                  <div key={member.id} style={styles.memberItem}>
                    <div>
                      <div style={styles.memberName}>
                        {member.profiles?.device_name || member.profiles?.email}
                        {member.role === 'owner' && (
                          <span style={styles.ownerBadge}>Owner</span>
                        )}
                      </div>
                      <div style={styles.memberEmail}>{member.profiles?.email}</div>
                      <div style={styles.memberDate}>
                        Last active: {new Date(member.last_active).toLocaleDateString()}
                      </div>
                    </div>
                    {member.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        style={styles.removeButton}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Workflows Section */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Your Workflows</h2>
            <span style={styles.countBadge}>{workflows.length} total</span>
          </div>

          {workflows.length === 0 ? (
            <p style={styles.emptyText}>No workflows yet. Create one in the mobile app!</p>
          ) : (
            <div style={styles.list}>
              {workflows.map((workflow) => (
                <div 
                  key={workflow.id} 
                  style={styles.workflowItemClickable}
                  onClick={() => {
                    setSelectedWorkflow(workflow);
                    setWorkflowDetailOpen(true);
                  }}
                >
                  <div style={styles.workflowInfo}>
                    <div style={styles.itemName}>{workflow.name}</div>
                    <div style={styles.itemMeta}>
                      {workflow.steps?.length || 0} steps
                    </div>
                    {workflow.claimed_by ? (
                      <div style={styles.assignedBadge}>
                        ✓ Assigned to: {workflow.claimed_by_name || 'Unknown'}
                      </div>
                    ) : (
                      <div style={styles.unassignedBadge}>
                        ⚠ Unassigned
                      </div>
                    )}
                    <div style={styles.itemDate}>
                      Created: {new Date(workflow.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={styles.clickHint}>Click to manage →</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Batches Section */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>All Batches</h2>
            <span style={styles.countBadge}>{batches.length} total ({activeBatches.length} active)</span>
          </div>

          {batches.length === 0 ? (
            <p style={styles.emptyText}>No batches. Start a workflow in the mobile app!</p>
          ) : (
            <div style={styles.list}>
              {batches.map((batch) => {
                const totalSteps = batch.steps?.length || 0;
                const currentStep = (batch.current_step_index ?? 0) + 1;
                const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
                const isActive = currentStep <= totalSteps && totalSteps > 0;

                return (
                  <div key={batch.id} style={styles.batchItem}>
                    <div style={styles.itemName}>{batch.name}</div>
                    <div style={styles.itemMeta}>
                      {totalSteps > 0 ? `Step ${currentStep} of ${totalSteps}` : 'No steps defined'} 
                      {isActive ? ' - Active' : ' - Completed'}
                    </div>
                    {totalSteps > 0 && (
                      <div style={styles.progressBarContainer}>
                        <div 
                          style={{...styles.progressBar, width: `${progress}%`}}
                        />
                      </div>
                    )}
                    <div style={styles.itemDate}>
                      Created: {new Date(batch.created_at).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Batch Completion Reports */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Batch Completion Reports</h2>
            <div style={styles.reportControls}>
              <select value={reportSortBy} onChange={(e) => setReportSortBy(e.target.value as any)} style={styles.select}>
                <option value="date">Sort by Date</option>
                <option value="workflow">Sort by Workflow</option>
                <option value="user">Sort by User</option>
              </select>
              <button onClick={() => setShowArchivedReports(!showArchivedReports)} style={styles.toggleButton}>
                {showArchivedReports ? 'Hide Archived' : 'Show Archived'}
              </button>
              <button onClick={exportReportsCSV} style={styles.exportButton}>📥 Export</button>
            </div>
          </div>

          {sortedReports.length === 0 ? (
            <p style={styles.emptyText}>No batch reports yet. Complete a batch in the mobile app!</p>
          ) : (
            <div style={styles.list}>
              {sortedReports.map((report) => (
                <div key={report.id} style={{...styles.reportItem, opacity: report.archived ? 0.6 : 1}}>
                  <div style={styles.reportMain} onClick={() => { setSelectedReport(report); setReportDetailOpen(true); }}>
                    <div style={styles.itemName}>
                      ✅ {report.batch_name} - {report.workflow_name}
                    </div>
                    <div style={styles.itemMeta}>
                      {report.completed_by} • {report.batch_size_multiplier}x
                      {report.actual_duration && ` • ${Math.round(report.actual_duration / 60)} min`}
                      {report.total_cost && ` • $${report.total_cost.toFixed(2)}`}
                    </div>
                    {report.notes && (
                      <div style={styles.reportNotes}>{report.notes}</div>
                    )}
                    <div style={styles.itemDate}>
                      {report.date} at {report.time}
                    </div>
                  </div>
                  <button 
                    onClick={() => report.archived ? unarchiveReport(report.id, 'batch_completion_reports') : archiveReport(report.id, 'batch_completion_reports')} 
                    style={styles.archiveButton}
                  >
                    {report.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Environmental Reports */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Environmental Reports</h2>
            <span style={styles.countBadge}>{visibleEnvReports.length} total</span>
          </div>

          {visibleEnvReports.length === 0 ? (
            <p style={styles.emptyText}>No environmental reports yet.</p>
          ) : (
            <div style={styles.list}>
              {visibleEnvReports.slice(0, 10).map((report) => (
                <div key={report.id} style={{...styles.reportItem, opacity: report.archived ? 0.6 : 1}}>
                  <div style={styles.reportMain}>
                    <div style={styles.itemName}>
                      🌡️ Environmental Report
                    </div>
                    <div style={styles.itemMeta}>
                      Station: {report.created_by}
                      {report.ambient_temp && ` • ${report.ambient_temp}°C`}
                      {report.humidity && ` • ${report.humidity}% humidity`}
                    </div>
                    {report.notes && (
                      <div style={styles.reportNotes}>{report.notes}</div>
                    )}
                    <div style={styles.itemDate}>
                      {report.date} at {report.time}
                    </div>
                  </div>
                  <button 
                    onClick={() => report.archived ? unarchiveReport(report.id, 'environmental_reports') : archiveReport(report.id, 'environmental_reports')} 
                    style={styles.archiveButton}
                  >
                    {report.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Photos */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Recent Photos</h2>
            <span style={styles.countBadge}>{photos.length} shown</span>
          </div>

          {photos.length === 0 ? (
            <p style={styles.emptyText}>No photos yet.</p>
          ) : (
            <div style={styles.photoGrid}>
              {photos.map((photo) => (
                <div key={photo.id} style={styles.photoCard}>
                  <img 
                    src={photo.url} 
                    alt="Batch photo" 
                    style={styles.photoImage}
                  />
                  <div style={styles.photoDate}>
                    {new Date(photo.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Detail Modal */}
      {reportDetailOpen && selectedReport && (
        <div style={styles.modalOverlay} onClick={() => setReportDetailOpen(false)}>
          <div style={styles.largeModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{selectedReport.batch_name}</h3>
            <div style={styles.detailGrid}>
              <div><strong>Workflow:</strong> {selectedReport.workflow_name}</div>
              <div><strong>Completed by:</strong> {selectedReport.completed_by}</div>
              <div><strong>Date:</strong> {selectedReport.date} at {selectedReport.time}</div>
              <div><strong>Batch size:</strong> {selectedReport.batch_size_multiplier}x</div>
              {selectedReport.actual_duration && <div><strong>Duration:</strong> {Math.round(selectedReport.actual_duration / 60)} min</div>}
              {selectedReport.total_cost && <div><strong>Cost:</strong> ${selectedReport.total_cost.toFixed(2)}</div>}
              {selectedReport.yield_amount && <div><strong>Yield:</strong> {selectedReport.yield_amount} {selectedReport.yield_unit}</div>}
            </div>
            {selectedReport.notes && (
              <div style={styles.detailSection}>
                <strong>Notes:</strong>
                <p>{selectedReport.notes}</p>
              </div>
            )}
            {selectedReport.ingredients_used && selectedReport.ingredients_used.length > 0 && (
              <div style={styles.detailSection}>
                <strong>Ingredients:</strong>
                <ul>
                  {selectedReport.ingredients_used.map((ing: any, i: number) => (
                    <li key={i}>{ing.name}: {ing.amount} {ing.unit} {ing.cost && `($${ing.cost})`}</li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={() => setReportDetailOpen(false)} style={styles.cancelButton}>Close</button>
          </div>
        </div>
      )}

      {/* Workflow Detail Modal */}
      {workflowDetailOpen && selectedWorkflow && (
        <div style={styles.modalOverlay} onClick={() => setWorkflowDetailOpen(false)}>
          <div style={styles.largeModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>📋 {selectedWorkflow.name}</h3>
            
            <div style={styles.detailGrid}>
              <div><strong>Steps:</strong> {selectedWorkflow.steps?.length || 0}</div>
              <div><strong>Created:</strong> {new Date(selectedWorkflow.created_at).toLocaleDateString()}</div>
              <div><strong>Last Updated:</strong> {new Date(selectedWorkflow.updated_at).toLocaleDateString()}</div>
              <div>
                <strong>Status:</strong> {selectedWorkflow.claimed_by ? 
                  <span style={{color: '#10b981'}}> ✓ Assigned</span> : 
                  <span style={{color: '#ef4444'}}> ⚠ Unassigned</span>
                }
              </div>
            </div>

            {selectedWorkflow.claimed_by && (
              <div style={styles.detailSection}>
                <strong>Currently Assigned To:</strong>
                <div style={styles.assignedUserCard}>
                  <div>
                    <div style={styles.assignedUserName}>{selectedWorkflow.claimed_by_name}</div>
                    <div style={styles.assignedUserMeta}>Assigned on {new Date(selectedWorkflow.updated_at).toLocaleDateString()}</div>
                  </div>
                  <button 
                    onClick={async () => {
                      await supabase.from('workflows').update({
                        claimed_by: null,
                        claimed_by_name: null,
                        updated_at: new Date().toISOString()
                      }).eq('id', selectedWorkflow.id);
                      await fetchWorkflows(user.id);
                      setWorkflowDetailOpen(false);
                    }}
                    style={styles.unassignButton}
                  >
                    Unassign
                  </button>
                </div>
              </div>
            )}

            {selectedWorkflow.steps && selectedWorkflow.steps.length > 0 && (
              <div style={styles.detailSection}>
                <strong>Workflow Steps:</strong>
                <div style={styles.stepsList}>
                  {selectedWorkflow.steps.map((step: any, index: number) => (
                    <div key={index} style={styles.stepItem}>
                      <div style={styles.stepNumber}>{index + 1}</div>
                      <div style={styles.stepContent}>
                        <div style={styles.stepName}>{step.name || step.title || `Step ${index + 1}`}</div>
                        {step.description && <div style={styles.stepDescription}>{step.description}</div>}
                        {step.duration && <div style={styles.stepDuration}>⏱ {step.duration} min</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isPremium && networkMembers.length > 0 && (
              <div style={styles.detailSection}>
                <strong>Assign to Team Member:</strong>
                <div style={styles.assignmentList}>
                  {networkMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={async () => {
                        await supabase.from('workflows').update({
                          claimed_by: member.user_id,
                          claimed_by_name: member.profiles?.device_name || member.profiles?.email,
                          updated_at: new Date().toISOString()
                        }).eq('id', selectedWorkflow.id);
                        await fetchWorkflows(user.id);
                        setWorkflowDetailOpen(false);
                        alert(`Workflow assigned to ${member.profiles?.device_name || member.profiles?.email}`);
                      }}
                      style={styles.assignMemberButton}
                      disabled={selectedWorkflow.claimed_by === member.user_id}
                    >
                      <div>
                        <div style={styles.memberButtonName}>
                          {member.profiles?.device_name || member.profiles?.email}
                          {selectedWorkflow.claimed_by === member.user_id && ' ✓'}
                        </div>
                        <div style={styles.memberButtonEmail}>{member.profiles?.email}</div>
                      </div>
                      {selectedWorkflow.claimed_by === member.user_id && (
                        <span style={styles.currentBadge}>Current</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setWorkflowDetailOpen(false)} style={styles.closeButton}>Close</button>
          </div>
        </div>
      )}

      {/* Assign Workflow Modal */}
      {assignModalOpen && selectedWorkflow && (
        <div style={styles.modalOverlay} onClick={() => setAssignModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              Assign Workflow: {selectedWorkflow.name}
            </h3>

            <div style={styles.modalList}>
              {networkMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleAssignWorkflow(member.user_id)}
                  style={styles.memberSelectButton}
                >
                  <div>
                    <div style={styles.memberSelectName}>
                      {member.profiles?.device_name || member.profiles?.email}
                    </div>
                    <div style={styles.memberSelectEmail}>
                      {member.profiles?.email}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setAssignModalOpen(false)}
              style={styles.cancelButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {inviteModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setInviteModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Invite User to Network</h3>
            
            <input
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={styles.input}
            />

            <div style={styles.modalButtons}>
              <button
                onClick={handleInviteUser}
                style={styles.primaryButton}
              >
                Send Invite
              </button>
              <button
                onClick={() => {
                  setInviteModalOpen(false);
                  setInviteEmail('');
                }}
                style={styles.cancelButton}
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

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '1rem 0' },
  headerContent: { maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.5rem', fontWeight: '600', margin: 0, color: '#111827' },
  premiumBadge: { fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' },
  headerButtons: { display: 'flex', gap: '0.75rem' },
  refreshButton: { padding: '0.5rem 1rem', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  linkButton: { padding: '0.5rem 1rem', backgroundColor: '#f3f4f6', color: '#374151', textDecoration: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500', display: 'flex', alignItems: 'center' },
  signOutButton: { padding: '0.5rem 1rem', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  content: { maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontSize: '1.125rem', color: '#6b7280' },
  card: { backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  cardTitle: { fontSize: '1.25rem', fontWeight: '600', margin: 0, color: '#111827' },
  userInfo: { fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.75' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  statCard: { backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'center' as const, boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' },
  statNumber: { fontSize: '2rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' },
  statLabel: { fontSize: '0.875rem', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  analyticsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' },
  analyticItem: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' },
  analyticLabel: { fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', textTransform: 'uppercase' as const },
  analyticValue: { fontSize: '1.25rem', fontWeight: '600', color: '#111827' },
  countBadge: { fontSize: '0.875rem', color: '#6b7280' },
  list: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  activityItem: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' },
  activityUser: { fontSize: '0.875rem', fontWeight: '500', color: '#111827' },
  activityAction: { fontSize: '0.875rem', color: '#6b7280' },
  activityTime: { fontSize: '0.75rem', color: '#9ca3af' },
  memberItem: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  memberName: { fontSize: '1rem', fontWeight: '500', color: '#111827', marginBottom: '0.25rem' },
  ownerBadge: { marginLeft: '0.5rem', fontSize: '0.75rem', backgroundColor: '#10b981', color: '#ffffff', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' },
  memberEmail: { fontSize: '0.875rem', color: '#6b7280' },
  memberDate: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' },
  removeButton: { padding: '0.5rem 1rem', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  workflowItem: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  workflowItemClickable: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' },
  workflowInfo: { flex: 1 },
  itemName: { fontSize: '1rem', fontWeight: '500', color: '#111827', marginBottom: '0.25rem' },
  itemMeta: { fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' },
  assignedBadge: { fontSize: '0.75rem', color: '#10b981', marginBottom: '0.25rem' },
  unassignedBadge: { fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.25rem' },
  clickHint: { fontSize: '0.875rem', color: '#6b7280' },
  assignedUserCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', marginTop: '0.5rem' },
  assignedUserName: { fontSize: '1rem', fontWeight: '500', color: '#111827' },
  assignedUserMeta: { fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' },
  unassignButton: { padding: '0.5rem 1rem', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' },
  stepsList: { marginTop: '0.5rem' },
  stepItem: { display: 'flex', gap: '1rem', padding: '0.75rem', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', marginBottom: '0.5rem' },
  stepNumber: { width: '2rem', height: '2rem', backgroundColor: '#3b82f6', color: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', flexShrink: 0 },
  stepContent: { flex: 1 },
  stepName: { fontSize: '0.875rem', fontWeight: '500', color: '#111827' },
  stepDescription: { fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' },
  stepDuration: { fontSize: '0.75rem', color: '#3b82f6', marginTop: '0.25rem' },
  assignmentList: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginTop: '0.5rem' },
  assignMemberButton: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', cursor: 'pointer', transition: 'all 0.2s' },
  memberButtonName: { fontSize: '1rem', fontWeight: '500', color: '#111827' },
  memberButtonEmail: { fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' },
  currentBadge: { padding: '0.25rem 0.75rem', backgroundColor: '#10b981', color: '#ffffff', borderRadius: '0.375rem', fontSize: '0.75rem' },
  closeButton: { width: '100%', padding: '0.75rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer', marginTop: '1rem' },
  itemDate: { fontSize: '0.75rem', color: '#9ca3af' },
  assignButton: { padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  batchItem: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' },
  progressBarContainer: { width: '100%', backgroundColor: '#e5e7eb', borderRadius: '9999px', height: '0.5rem', marginTop: '0.5rem', overflow: 'hidden' },
  progressBar: { backgroundColor: '#3b82f6', height: '100%', borderRadius: '9999px', transition: 'width 0.3s ease' },
  reportControls: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' as const },
  select: { padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' },
  toggleButton: { padding: '0.5rem 1rem', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' },
  exportButton: { padding: '0.5rem 1rem', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' },
  reportItem: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  reportMain: { flex: 1, cursor: 'pointer' },
  archiveButton: { padding: '0.5rem 1rem', backgroundColor: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' },
  reportNotes: { fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' as const },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' },
  photoCard: { border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' },
  photoImage: { width: '100%', height: '150px', objectFit: 'cover' as const },
  photoDate: { fontSize: '0.75rem', color: '#9ca3af', padding: '0.5rem' },
  emptyText: { color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic' as const },
  primaryButton: { padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '2rem', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto' as const },
  largeModal: { backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '2rem', maxWidth: '700px', width: '90%', maxHeight: '80vh', overflowY: 'auto' as const },
  modalTitle: { fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem', color: '#111827' },
  modalList: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginBottom: '1.5rem' },
  memberSelectButton: { width: '100%', textAlign: 'left' as const, padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', cursor: 'pointer' },
  memberSelectName: { fontSize: '1rem', fontWeight: '500', color: '#111827' },
  memberSelectEmail: { fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' },
  input: { width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '1rem', marginBottom: '1.5rem' },
  modalButtons: { display: 'flex', gap: '0.5rem' },
  cancelButton: { flex: 1, padding: '0.75rem', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem', fontSize: '0.875rem' },
  detailSection: { marginTop: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' },
};