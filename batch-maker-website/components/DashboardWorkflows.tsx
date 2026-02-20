import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DashboardProps, ActiveSession } from '../lib/dashboard-types';
import ImportRecipeModal from './ImportRecipeModal';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

// ─── Simple inline toast ──────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let nextId = 0;
  const show = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
          t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {t.type === 'success' ? '✓ ' : t.type === 'error' ? '✗ ' : 'ℹ '}{t.message}
        </div>
      ))}
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────

interface ClockedInMember {
  user_id: string;
  device_name: string;
  clock_in: string;
  current_workflow_name?: string;
  current_batch_id?: string;
  current_step?: number;
}

export default function Workflows({
  user,
  workflows,
  batches,
  networkMembers,
  isPremium,
  fetchWorkflows,
  fetchBatches,
  locations,
  selectedLocationId,
}: DashboardProps) {
  const router = useRouter();
  const { toasts, show: showToast } = useToast();
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  // FIX: Team Status now tracks actually-clocked-in employees from time_entries
  const [clockedInMembers, setClockedInMembers] = useState<ClockedInMember[]>([]);
  const [assignWorkflowModalOpen, setAssignWorkflowModalOpen] = useState(false);
  const [assignBatchModalOpen, setAssignBatchModalOpen] = useState(false);
  const [selectedWorkflowForAssignment, setSelectedWorkflowForAssignment] = useState<string>('');
  const [selectedBatchForAssignment, setSelectedBatchForAssignment] = useState<string>('');
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    fetchActiveSessions();
    fetchClockedInTeam();
    const interval = setInterval(() => {
      fetchActiveSessions();
      fetchClockedInTeam();
    }, 10000); // Refresh every 10s

    const batchChannel = supabase
      .channel('workflows-batches-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches', filter: `user_id=eq.${user.id}` },
        () => {
          fetchActiveSessions();
          fetchClockedInTeam();
        }
      )
      .subscribe();

    // Also listen for clock-in/out changes
    const timeEntryChannel = supabase
      .channel('time-entries-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_entries', filter: `owner_id=eq.${user.id}` },
        () => fetchClockedInTeam()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(batchChannel);
      supabase.removeChannel(timeEntryChannel);
    };
  }, [user]);

  // FIX: Team Status now queries time_entries for active clock-ins only
  async function fetchClockedInTeam() {
    if (!user) return;
    try {
      const { data: activeEntries } = await supabase
        .from('time_entries')
        .select('user_id, clock_in')
        .eq('owner_id', user.id)
        .is('clock_out', null);

      if (!activeEntries || activeEntries.length === 0) {
        setClockedInMembers([]);
        return;
      }

      // Get profiles for clocked-in users
      const userIds = activeEntries.map(e => e.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, device_name, email')
        .in('id', userIds);

      // Enrich with current batch/workflow info
      const members: ClockedInMember[] = activeEntries.map(entry => {
        const profile = profiles?.find(p => p.id === entry.user_id);
        const activeBatch = batches.find(b => b.claimed_by === entry.user_id && !b.completed_at);
        const activeWorkflow = workflows.find(w => w.id === activeBatch?.workflow_id);

        return {
          user_id: entry.user_id,
          device_name: profile?.device_name || profile?.email || 'Unknown',
          clock_in: entry.clock_in,
          current_workflow_name: activeWorkflow?.name || activeBatch?.name,
          current_batch_id: activeBatch?.id,
          current_step: activeBatch?.current_step_index,
        };
      });

      setClockedInMembers(members);
    } catch (err) {
      console.error('Error fetching clocked-in team:', err);
    }
  }

  async function fetchActiveSessions() {
    if (!user) return;
    
    const sessions: ActiveSession[] = [];
    
    const { data: activeBatches } = await supabase
      .from('batches')
      .select('*')
      .eq('user_id', user.id)
      .is('completed_at', null)
      .order('updated_at', { ascending: false });

    const { data: freshMembers } = await supabase
      .from('networks')
      .select('*')
      .eq('owner_id', user.id);

    // Fetch profiles separately if we have members
    let profilesData: any[] = [];
    if (freshMembers && freshMembers.length > 0) {
      const userIds = freshMembers.map((m: any) => m.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, email, device_name')
          .in('id', userIds);
        profilesData = data || [];
      }
    }

    // Merge profiles into members
    const freshMembersWithProfiles = freshMembers?.map((member: any) => ({
      ...member,
      profiles: profilesData.find((p: any) => p.id === member.user_id)
    })) || [];

    if (activeBatches) {
      for (const batch of activeBatches) {
        const workflow = workflows.find(w => w.id === batch.workflow_id);
        const member = freshMembersWithProfiles?.find((m: any) => m.user_id === batch.claimed_by);
        
        let deviceName = 'Unclaimed';
        let workingUserId = user.id;
        
        if (batch.claimed_by) {
          workingUserId = batch.claimed_by;
          const isCurrentUser = batch.claimed_by === user.id;
          
          if (isCurrentUser) {
            deviceName = 'You';
          } else if (batch.claimed_by_name) {
            deviceName = batch.claimed_by_name;
          } else if (member?.profiles?.device_name) {
            deviceName = member.profiles.device_name;
          } else if (member?.profiles?.email) {
            deviceName = member.profiles.email;
          } else {
            deviceName = 'Unknown User';
          }
        }
        
        sessions.push({
          user_id: workingUserId,
          device_name: deviceName,
          current_workflow_id: batch.workflow_id,
          current_workflow_name: workflow?.name || batch.name,
          current_batch_id: batch.id,
          current_step: batch.current_step_index || 0,
          last_heartbeat: batch.updated_at || batch.created_at,
          status: batch.claimed_by ? 'working' : 'idle',
        });
      }
    }

    workflows?.forEach(workflow => {
      if (workflow.claimed_by && !sessions.find(s => s.current_workflow_id === workflow.id)) {
        const member = freshMembersWithProfiles?.find((m: any) => m.user_id === workflow.claimed_by);
        const isCurrentUser = workflow.claimed_by === user.id;
        
        sessions.push({
          user_id: workflow.claimed_by,
          device_name: workflow.claimed_by_name || (isCurrentUser ? 'You' : member?.profiles?.device_name || 'Unknown'),
          current_workflow_id: workflow.id,
          current_workflow_name: workflow.name,
          last_heartbeat: workflow.updated_at || new Date().toISOString(),
          status: 'idle',
        });
      }
    });

    setActiveSessions(sessions);
  }

  // ============ BATCH MANAGEMENT FUNCTIONS ============

  async function handleClaimBatch(batchId: string) {
    try {
      const { error } = await supabase
        .from('batches')
        .update({
          claimed_by: user.id,
          claimed_by_name: 'You',
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId);

      if (error) throw error;

      await fetchBatches();
      await fetchWorkflows();
      await fetchActiveSessions();
      showToast('Batch claimed successfully!', 'success');
    } catch (error) {
      console.error('Error claiming batch:', error);
      showToast('Failed to claim batch', 'error');
    }
  }

  async function handleReleaseBatch(batchId: string) {
    if (!window.confirm('Release this batch? It will become available for others to claim.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('batches')
        .update({
          claimed_by: null,
          claimed_by_name: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId);

      if (error) throw error;

      await fetchBatches();
      await fetchWorkflows();
      await fetchActiveSessions();
      showToast('Batch released successfully!', 'success');
    } catch (error) {
      console.error('Error releasing batch:', error);
      showToast('Failed to release batch', 'error');
    }
  }

  async function handleAssignBatch(batchId: string, assignToUserId: string) {
    try {
      const member = networkMembers.find(m => m.user_id === assignToUserId);
      const isCurrentUser = assignToUserId === user.id;
      const deviceName = member?.profiles?.device_name || member?.profiles?.email || (isCurrentUser ? 'You' : 'Unknown');

      const { error } = await supabase
        .from('batches')
        .update({
          claimed_by: assignToUserId,
          claimed_by_name: deviceName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId);

      if (error) throw error;

      await fetchBatches();
      await fetchWorkflows();
      await fetchActiveSessions();
      setAssignBatchModalOpen(false);
      showToast(`Batch assigned to ${deviceName}`, 'success');
    } catch (error) {
      console.error('Error assigning batch:', error);
      showToast('Failed to assign batch', 'error');
    }
  }

  async function handleCancelBatch(batchId: string) {
    if (!window.confirm('Cancel this batch? All progress will be lost. This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('batches')
        .delete()
        .eq('id', batchId);

      if (error) throw error;

      await fetchBatches();
      await fetchWorkflows();
      await fetchActiveSessions();
      showToast('Batch canceled successfully', 'success');
    } catch (error) {
      console.error('Error canceling batch:', error);
      showToast('Failed to cancel batch', 'error');
    }
  }

  function handleOpenBatch(batchId: string) {
    router.push(`/batch-execution?id=${batchId}`);
  }

  // ============ WORKFLOW ASSIGNMENT FUNCTIONS ============

  async function handleAssignWorkflow(workflowId: string, assignToUserId: string) {
    try {
      const workflow = workflows.find(w => w.id === workflowId);
      if (!workflow) {
        showToast('Workflow not found', 'error');
        return;
      }

      const member = networkMembers.find(m => m.user_id === assignToUserId);
      const isCurrentUser = assignToUserId === user.id;
      const deviceName = member?.profiles?.device_name || member?.profiles?.email || (isCurrentUser ? 'You' : 'Unknown');

      const { error } = await supabase
        .from('workflows')
        .update({
          claimed_by: assignToUserId,
          claimed_by_name: deviceName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (error) throw error;

      await fetchWorkflows();
      await fetchBatches();
      
      setAssignWorkflowModalOpen(false);
      showToast(`Workflow "${workflow.name}" assigned to ${deviceName}`, 'success');
    } catch (error) {
      console.error('Error assigning workflow:', error);
      showToast('Failed to assign workflow', 'error');
    }
  }

  async function handleUnassignWorkflow(workflowId: string) {
    try {
      const { error } = await supabase
        .from('workflows')
        .update({
          claimed_by: null,
          claimed_by_name: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (error) throw error;

      await fetchWorkflows();
      await fetchBatches();
      
      showToast('Workflow unassigned', 'success');
    } catch (error) {
      console.error('Error unassigning workflow:', error);
      showToast('Failed to unassign workflow', 'error');
    }
  }

  // Group active batches by user
  const batchesByUser = activeSessions
    .filter(s => s.status === 'working' || (s.device_name === 'Unclaimed' && s.current_batch_id))
    .reduce((acc, session) => {
      let userBatches;
      
      if (session.device_name === 'Unclaimed') {
        userBatches = batches.filter(b => 
          !b.claimed_by && !b.completed_at && b.id === session.current_batch_id
        );
      } else {
        userBatches = batches.filter(b => 
          b.claimed_by === session.user_id && !b.completed_at
        );
      }
      
      if (userBatches.length > 0) {
        acc[session.device_name === 'Unclaimed' ? 'unclaimed' : session.user_id] = {
          session,
          batches: userBatches,
        };
      }
      return acc;
    }, {} as Record<string, { session: ActiveSession; batches: typeof batches }>);

  const assignableMembers = [
    { id: user.id, label: 'You' },
    ...networkMembers
      .filter(m => m.user_id !== user.id)
      .map(m => ({
        id: m.user_id,
        label: m.profiles?.device_name || m.profiles?.email || 'Unknown',
      })),
  ];

  function formatClockInTime(clockIn: string) {
    const now = new Date();
    const clockInDate = new Date(clockIn);
    const diffMs = now.getTime() - clockInDate.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHrs > 0) return `${diffHrs}h ${diffMins}m`;
    return `${diffMins}m`;
  }

  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* ─── TEAM STATUS (clock-in based) ─────────────────────────────── */}
      {isPremium && clockedInMembers.length > 0 && (
        <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Team Status
            <span className="ml-2 text-sm font-normal text-green-600">● {clockedInMembers.length} clocked in</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clockedInMembers.map((member) => (
              <div
                key={member.user_id}
                className={`p-4 bg-gray-50 rounded-lg border-l-4 ${
                  member.current_batch_id ? 'border-green-500' : 'border-blue-400'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className={`w-2 h-2 rounded-full ${
                      member.current_batch_id ? 'bg-green-500 animate-pulse' : 'bg-blue-400'
                    }`}></span>
                    {member.device_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {member.current_batch_id ? 'Working' : 'Clocked In'}
                  </div>
                </div>

                {member.current_workflow_name && (
                  <div className="text-sm text-blue-600 mb-1 truncate">
                    {member.current_workflow_name}
                    {member.current_step !== undefined && (
                      <span className="text-gray-500"> • Step {member.current_step + 1}</span>
                    )}
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  Clocked in {formatClockInTime(member.clock_in)} ago
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Batches - Organized by User */}
      {Object.keys(batchesByUser).length > 0 && (
        <div className="mb-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Active Work Sessions</h2>
          
          {Object.entries(batchesByUser).map(([userId, { session, batches: userBatches }]) => (
            <div key={userId} className={`bg-white/90 rounded-xl p-6 shadow-sm ${
              session.device_name === 'Unclaimed' ? 'border-2 border-orange-300' : ''
            }`}>
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200">
                <div className={`w-3 h-3 rounded-full ${
                  session.device_name === 'Unclaimed' ? 'bg-orange-500' :
                  session.status === 'working' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`}></div>
                <h3 className="text-lg font-semibold text-gray-900">{session.device_name}</h3>
                <span className="text-xs text-gray-500">
                  ({userBatches.length} active {userBatches.length === 1 ? 'batch' : 'batches'})
                </span>
                {session.device_name === 'Unclaimed' && (
                  <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">
                    Available to claim
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {userBatches.map(batch => {
                  const workflow = workflows.find(w => w.id === batch.workflow_id);
                  const progress = workflow?.steps 
                    ? ((batch.current_step_index || 0) / workflow.steps.length) * 100
                    : 0;
                  const currentStep = batch.current_step_index || 0;
                  const totalSteps = workflow?.steps?.length || 0;
            
                  return (
                    <div key={batch.id} className={`p-4 bg-gray-50 rounded-lg border-l-4 ${
                      session.device_name === 'Unclaimed' ? 'border-orange-400' : 'border-green-400'
                    }`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-medium text-gray-900">{batch.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Step {currentStep + 1}/{totalSteps}
                            {workflow?.steps?.[currentStep]?.title && 
                              ` — ${workflow.steps[currentStep].title}`}
                          </div>
                        </div>
                      </div>

                      {totalSteps > 0 && (
                        <div className="mb-3">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-green-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        {!batch.claimed_by ? (
                          <>
                            <button
                              onClick={() => handleClaimBatch(batch.id)}
                              className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 transition-colors"
                            >
                              Claim Batch
                            </button>
                            {isPremium && (
                              <button
                                onClick={() => {
                                  setSelectedBatchForAssignment(batch.id);
                                  setAssignBatchModalOpen(true);
                                }}
                                className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
                              >
                                👤 Assign to Team
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleOpenBatch(batch.id)}
                              className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
                            >
                              Open Batch
                            </button>
                            {batch.claimed_by === user.id && (
                              <button
                                onClick={() => handleReleaseBatch(batch.id)}
                                className="px-4 py-2 bg-yellow-500 text-white rounded-md text-sm font-medium hover:bg-yellow-600 transition-colors"
                              >
                                Release
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => handleCancelBatch(batch.id)}
                          className="px-4 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All Workflows */}
      <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <h2 className="text-xl font-semibold text-gray-900">All Workflows</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors flex items-center gap-2"
            >
              <span>📥</span>
              Import Recipe
            </button>
            <Link href="/workflows/create" className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
              + Create Workflow
            </Link>
          </div>
        </div>

        {workflows.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-8">
            No workflows yet. Create your first workflow to get started!
          </p>
        ) : (
          <div className="space-y-4">
            {workflows.map(workflow => {
              const activeBatch = batches.find(b => b.workflow_id === workflow.id && !b.completed_at);
              const isActive = !!activeBatch;
              const isAssigned = !!workflow.claimed_by;

              return (
                <div 
                  key={workflow.id} 
                  className={`p-5 bg-gray-50 rounded-lg border-l-4 flex justify-between items-center gap-4 flex-wrap ${
                    isActive ? 'border-green-500' : isAssigned ? 'border-blue-500' : 'border-gray-200'
                  }`}
                >
                  <div className="flex-1">
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{workflow.name}</span>
                        {isActive && <span className="text-xs text-green-500 font-medium">● Active</span>}
                        {!isActive && isAssigned && <span className="text-xs text-blue-500 font-medium">● Assigned</span>}
                        {!isActive && !isAssigned && <span className="text-xs text-gray-400 font-medium">○ Open</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        Created {new Date(workflow.created_at).toLocaleDateString()}
                        {workflow.steps && ` • ${workflow.steps.length} steps`}
                      </div>
                    </div>

                    {isAssigned && (
                      <div className="text-sm text-blue-600 mt-2">
                        👤 Assigned to: {workflow.claimed_by === user.id ? 'You' : workflow.claimed_by_name || 'Unknown'}
                        {isActive && activeBatch && (
                          <span className="text-gray-500">
                            {' • Step '}{(activeBatch.current_step_index || 0) + 1}/{workflow.steps?.length || '?'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Link 
                      href={`/workflows/edit?id=${workflow.id}`} 
                      className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
                    >
                      View
                    </Link>

                    {/* Assign/Release Workflow Buttons */}
                    {!isAssigned ? (
                      <button
                        onClick={() => {
                          setSelectedWorkflowForAssignment(workflow.id);
                          setAssignWorkflowModalOpen(true);
                        }}
                        className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 transition-colors"
                      >
                        Assign
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUnassignWorkflow(workflow.id)}
                        className="px-4 py-2 bg-yellow-500 text-white rounded-md text-sm font-medium hover:bg-yellow-600 transition-colors"
                      >
                        Release
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Workflow Modal */}
      {assignWorkflowModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 99999 }} onClick={() => setAssignWorkflowModalOpen(false)}>
          <div className="bg-white/90 rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold mb-6 text-gray-900">Assign Workflow</h3>
            
            <p className="mb-4 text-gray-500">
              Select a team member to assign this workflow to:
            </p>

            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleAssignWorkflow(selectedWorkflowForAssignment, e.target.value);
                }
              }}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            >
              <option value="">Select team member</option>
              {assignableMembers.map(member => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setAssignWorkflowModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Batch Modal */}
      {assignBatchModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 99999 }} onClick={() => setAssignBatchModalOpen(false)}>
          <div className="bg-white/90 rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold mb-6 text-gray-900">Assign Batch</h3>
            
            <p className="mb-4 text-gray-500">
              Select a team member to assign this batch to:
            </p>

            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleAssignBatch(selectedBatchForAssignment, e.target.value);
                }
              }}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            >
              <option value="">Select team member</option>
              {assignableMembers.map(member => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setAssignBatchModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Recipe Modal */}
      <ImportRecipeModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        userId={user.id}
        locationId={selectedLocationId !== 'all' ? selectedLocationId : undefined}
        onWorkflowCreated={() => {
          fetchWorkflows();
          fetchBatches();
        }}
      />
    </>
  );
}