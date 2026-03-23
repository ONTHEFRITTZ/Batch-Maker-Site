import { useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DashboardProps, ActiveSession } from '../lib/dashboard-types';
import ImportRecipeModal from './ImportRecipeModal';
import { getSupabaseClient } from '../lib/supabase';
import Modal from './Modal';

const supabase = getSupabaseClient();

// ─── Simple inline toast ──────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const show = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId.current;
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
          t.type === 'success' ? 'bg-amber-600' : t.type === 'error' ? 'bg-red-600' : 'bg-cyan-600'
        }`}>
          {t.type === 'success' ? '✓ ' : t.type === 'error' ? '✗ ' : 'i '}{t.message}
        </div>
      ))}
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────

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
  clockedInMembers,
}: DashboardProps) {
  const router = useRouter();
  const { toasts, show: showToast } = useToast();

  const [assignWorkflowModalOpen, setAssignWorkflowModalOpen] = useState(false);
  const [assignBatchModalOpen, setAssignBatchModalOpen] = useState(false);
  const [selectedWorkflowForAssignment, setSelectedWorkflowForAssignment] = useState<string>('');
  const [selectedBatchForAssignment, setSelectedBatchForAssignment] = useState<string>('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // ─── Drag and drop state ─────────────────────────────────────────────────
  const dragSourceId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [orderedActiveWorkflows, setOrderedActiveWorkflows] = useState<typeof workflows | null>(null);

  // ─── Derive active sessions purely from props ─────────────────────────────
  const activeSessions = useMemo<ActiveSession[]>(() => {
    const sessions: ActiveSession[] = [];
    const activeBatches = batches.filter(b => !b.completed_at);

    for (const batch of activeBatches) {
      const workflow = workflows.find(w => w.id === batch.workflow_id);
      const member = networkMembers.find(m => m.user_id === batch.claimed_by);

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

    workflows.forEach(workflow => {
      if (workflow.claimed_by && !sessions.find(s => s.current_workflow_id === workflow.id)) {
        const member = networkMembers.find(m => m.user_id === workflow.claimed_by);
        const isCurrentUser = workflow.claimed_by === user.id;

        sessions.push({
          user_id: workflow.claimed_by,
          device_name:
            workflow.claimed_by_name ||
            (isCurrentUser ? 'You' : member?.profiles?.device_name || 'Unknown'),
          current_workflow_id: workflow.id,
          current_workflow_name: workflow.name,
          last_heartbeat: workflow.updated_at || new Date().toISOString(),
          status: 'idle',
        });
      }
    });

    return sessions;
  }, [batches, workflows, networkMembers, user.id]);

  // ─── Batch mutation functions ─────────────────────────────────────────────

  async function handleClaimBatch(batchId: string) {
    try {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('device_name, email')
        .eq('id', user.id)
        .single();

      const myDisplayName = myProfile?.device_name || myProfile?.email || user.email || 'Unknown';

      const { data: updatedRows, error } = await supabase
        .from('batches')
        .update({
          claimed_by: user.id,
          claimed_by_name: myDisplayName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId)
        .select();

      if (error) throw error;

      if (!updatedRows || updatedRows.length === 0) {
        console.error('Claim silently blocked by RLS — batch id:', batchId);
        alert('Could not claim batch. You may not have permission.');
        return;
      }

      await Promise.all([fetchBatches(), fetchWorkflows()]);
      alert('Batch claimed successfully!');
    } catch (error) {
      console.error('Error claiming batch:', error);
      alert('Failed to claim batch');
    }
  }

  async function handleReleaseBatch(batchId: string) {
    if (!window.confirm('Release this batch? It will become available for others to claim.')) return;

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

      await Promise.all([fetchBatches(), fetchWorkflows()]);
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
      const deviceName =
        member?.profiles?.device_name || member?.profiles?.email || (isCurrentUser ? 'You' : 'Unknown');

      const { error } = await supabase
        .from('batches')
        .update({
          claimed_by: assignToUserId,
          claimed_by_name: deviceName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId);

      if (error) throw error;

      await Promise.all([fetchBatches(), fetchWorkflows()]);
      setAssignBatchModalOpen(false);
      showToast(`Batch assigned to ${deviceName}`, 'success');
    } catch (error) {
      console.error('Error assigning batch:', error);
      showToast('Failed to assign batch', 'error');
    }
  }

  async function handleCancelBatch(batchId: string) {
    if (!window.confirm('Cancel this batch? All progress will be lost. This action cannot be undone.')) return;

    try {
      const { error } = await supabase.from('batches').delete().eq('id', batchId);

      if (error) throw error;

      await Promise.all([fetchBatches(), fetchWorkflows()]);
      showToast('Batch canceled successfully', 'success');
    } catch (error) {
      console.error('Error canceling batch:', error);
      showToast('Failed to cancel batch', 'error');
    }
  }

  function handleOpenBatch(batchId: string) {
    router.push(`/batch-execution?id=${batchId}`);
  }

  // ─── Workflow mutation functions ──────────────────────────────────────────

  async function handleAssignWorkflow(workflowId: string, assignToUserId: string) {
    try {
      const workflow = workflows.find(w => w.id === workflowId);
      if (!workflow) { showToast('Workflow not found', 'error'); return; }

      const member = networkMembers.find(m => m.user_id === assignToUserId);
      const isCurrentUser = assignToUserId === user.id;
      const deviceName =
        member?.profiles?.device_name || member?.profiles?.email || (isCurrentUser ? 'You' : 'Unknown');

      const { error } = await supabase
        .from('workflows')
        .update({
          claimed_by: assignToUserId,
          claimed_by_name: deviceName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (error) throw error;

      await Promise.all([fetchWorkflows(), fetchBatches()]);
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

      await Promise.all([fetchWorkflows(), fetchBatches()]);
      showToast('Workflow unassigned', 'success');
    } catch (error) {
      console.error('Error unassigning workflow:', error);
      showToast('Failed to unassign workflow', 'error');
    }
  }

  async function handleArchiveWorkflow(workflowId: string) {
    if (!window.confirm('Archive this workflow? It will be hidden from the main list but can be restored any time.')) return;
    try {
      const { error } = await supabase
        .from('workflows')
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', workflowId);
      if (error) throw error;
      await fetchWorkflows();
      showToast('Workflow archived', 'info');
    } catch (e) {
      showToast('Failed to archive workflow', 'error');
    }
  }

  async function handleUnarchiveWorkflow(workflowId: string) {
    try {
      const { error } = await supabase
        .from('workflows')
        .update({ archived_at: null, updated_at: new Date().toISOString() })
        .eq('id', workflowId);
      if (error) throw error;
      await fetchWorkflows();
      showToast('Workflow restored', 'success');
    } catch (e) {
      showToast('Failed to restore workflow', 'error');
    }
  }

  // ─── Drag and drop handlers ───────────────────────────────────────────────

  function handleDragStart(workflowId: string) {
    dragSourceId.current = workflowId;
  }

  function handleDragOver(e: React.DragEvent, workflowId: string) {
    e.preventDefault();
    if (dragSourceId.current !== workflowId) {
      setDragOverId(workflowId);
    }
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);

    const sourceId = dragSourceId.current;
    if (!sourceId || sourceId === targetId) return;

    const current = orderedActiveWorkflows ?? sortedActiveWorkflows;
    const sourceIndex = current.findIndex(w => w.id === sourceId);
    const targetIndex = current.findIndex(w => w.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const reordered = [...current];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setOrderedActiveWorkflows(reordered);
    dragSourceId.current = null;

    persistSortOrder(reordered).catch(err => {
      console.error('Failed to persist sort order:', err);
      showToast('Failed to save new order', 'error');
    });
  }

  function handleDragEnd() {
    dragSourceId.current = null;
    setDragOverId(null);
  }

  async function persistSortOrder(ordered: typeof workflows) {
    const now = new Date().toISOString();
    const updates = ordered.map((w, index) =>
      supabase
        .from('workflows')
        .update({ sort_order: index + 1, updated_at: now })
        .eq('id', w.id)
    );
    await Promise.all(updates);
  }

  // ─── Derived display data ─────────────────────────────────────────────────

  const batchesByUser = activeSessions
    .filter(s => s.status === 'working' || (s.device_name === 'Unclaimed' && s.current_batch_id))
    .reduce((acc, session) => {
      let userBatches;

      if (session.device_name === 'Unclaimed') {
        userBatches = batches.filter(
          b => !b.claimed_by && !b.completed_at && b.id === session.current_batch_id
        );
      } else {
        userBatches = batches.filter(b => b.claimed_by === session.user_id && !b.completed_at);
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

  const activeWorkflows = workflows.filter(w => !w.archived_at);
  const archivedWorkflows = workflows.filter(w => w.archived_at);

  const sortedActiveWorkflows = useMemo(() => {
    return [...activeWorkflows].sort((a, b) => {
      const aOrder = (a as any).sort_order ?? 0;
      const bOrder = (b as any).sort_order ?? 0;
      if (aOrder !== 0 && bOrder !== 0) return aOrder - bOrder;
      if (aOrder !== 0) return -1;
      if (bOrder !== 0) return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [activeWorkflows]);

  const prevWorkflowIds = useRef<string>('');
  const currentIds = activeWorkflows.map(w => w.id).sort().join(',');
  if (prevWorkflowIds.current !== currentIds) {
    prevWorkflowIds.current = currentIds;
    if (orderedActiveWorkflows !== null) {
      setOrderedActiveWorkflows(null);
    }
  }

  const displayedActiveWorkflows = orderedActiveWorkflows ?? sortedActiveWorkflows;

  function formatClockInTime(clockIn: string) {
    const now = new Date();
    const clockInDate = new Date(clockIn);
    const diffMs = now.getTime() - clockInDate.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHrs > 0) return `${diffHrs}h ${diffMins}m`;
    return `${diffMins}m`;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* ─── TEAM STATUS ──────────────────────────────────────────────── */}
      {isPremium && clockedInMembers && clockedInMembers.length > 0 && (
        <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Team Status
            <span className="ml-2 text-sm font-normal text-green-600">
              {clockedInMembers.length} clocked in
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clockedInMembers.map(member => (
              <div
                key={member.user_id}
                className={`p-4 bg-gray-50 rounded-lg border-l-4 ${
                  member.current_batch_id ? 'border-green-500' : 'border-cyan-400'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className={`w-2 h-2 rounded-full ${
                      member.current_batch_id ? 'bg-green-500 animate-pulse' : 'bg-cyan-400'
                    }`} />
                    {member.device_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {member.current_batch_id ? 'Working' : 'Clocked In'}
                  </div>
                </div>

                {member.current_workflow_name && (
                  <div className="text-sm text-cyan-600 mb-1 truncate">
                    {member.current_workflow_name}
                    {member.current_step !== undefined && (
                      <span className="text-gray-500"> · Step {member.current_step + 1}</span>
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

      {/* ─── ACTIVE WORK SESSIONS — heading now inside the card ───────── */}
      {Object.keys(batchesByUser).length > 0 && (
        <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Active Work Sessions</h2>
          <div className="space-y-4">
            {Object.entries(batchesByUser).map(([userId, { session, batches: userBatches }]) => (
              <div
                key={userId}
                className={`rounded-lg border p-4 ${
                  session.device_name === 'Unclaimed'
                    ? 'border-orange-300 bg-orange-50/50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-200">
                  <div className={`w-3 h-3 rounded-full ${
                    session.device_name === 'Unclaimed'
                      ? 'bg-orange-500'
                      : session.status === 'working'
                      ? 'bg-green-500 animate-pulse'
                      : 'bg-gray-400'
                  }`} />
                  <h3 className="text-base font-semibold text-gray-900">{session.device_name}</h3>
                  <span className="text-xs text-gray-500">
                    ({userBatches.length} active {userBatches.length === 1 ? 'batch' : 'batches'})
                  </span>
                  {session.device_name === 'Unclaimed' && (
                    <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-md font-medium">
                      Available to claim
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {userBatches.map(batch => {
                    const workflow = workflows.find(w => w.id === batch.workflow_id);
                    const currentStep = batch.current_step_index || 0;
                    const totalSteps = workflow?.steps?.length || 0;
                    const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

                    return (
                      <div
                        key={batch.id}
                        className={`p-4 bg-white rounded-lg border-l-4 ${
                          session.device_name === 'Unclaimed' ? 'border-orange-400' : 'border-green-400'
                        }`}
                      >
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
                                  className="px-4 py-2 bg-cyan-500 text-white rounded-md text-sm font-medium hover:bg-cyan-600 transition-colors"
                                >
                                  Assign to Team
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenBatch(batch.id)}
                                className="px-4 py-2 bg-cyan-500 text-white rounded-md text-sm font-medium hover:bg-cyan-600 transition-colors"
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
        </div>
      )}

      {/* ─── ALL WORKFLOWS ────────────────────────────────────────────── */}
      <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">All Workflows</h2>
            {displayedActiveWorkflows.length > 1 && (
              <p className="text-xs text-gray-400 mt-0.5">Drag the handle on the left to reorder</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              Import Recipe
            </button>
            <Link
              href="/workflows/create"
              className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 transition-colors"
            >
              + Create Workflow
            </Link>
          </div>
        </div>

        {displayedActiveWorkflows.length === 0 && archivedWorkflows.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-8">
            No workflows yet. Create your first workflow to get started!
          </p>
        ) : (
          <div className="space-y-4">
            {displayedActiveWorkflows.map(workflow => {
              const activeBatch = batches.find(b => b.workflow_id === workflow.id && !b.completed_at);
              const isActive = !!activeBatch;
              const isAssigned = !!workflow.claimed_by;
              const isDragTarget = dragOverId === workflow.id;

              return (
                <div
                  key={workflow.id}
                  draggable
                  onDragStart={() => handleDragStart(workflow.id)}
                  onDragOver={e => handleDragOver(e, workflow.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, workflow.id)}
                  onDragEnd={handleDragEnd}
                  className={`p-5 bg-gray-50 rounded-lg border-l-4 flex justify-between items-center gap-4 flex-wrap transition-all ${
                    isDragTarget
                      ? 'border-l-4 border-cyan-400 bg-cyan-50 shadow-md scale-[1.01]'
                      : isActive
                      ? 'border-green-500'
                      : isAssigned
                      ? 'border-cyan-500'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Drag handle */}
                  <div
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors select-none px-1"
                    title="Drag to reorder"
                  >
                    <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
                      <circle cx="4" cy="4" r="1.5" />
                      <circle cx="8" cy="4" r="1.5" />
                      <circle cx="4" cy="10" r="1.5" />
                      <circle cx="8" cy="10" r="1.5" />
                      <circle cx="4" cy="16" r="1.5" />
                      <circle cx="8" cy="16" r="1.5" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{workflow.name}</span>
                        {isActive && <span className="text-xs text-green-500 font-medium">Active</span>}
                        {!isActive && isAssigned && <span className="text-xs text-cyan-500 font-medium">Assigned</span>}
                        {!isActive && !isAssigned && <span className="text-xs text-gray-400 font-medium">Open</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        Created {new Date(workflow.created_at).toLocaleDateString()}
                        {workflow.steps && ` · ${workflow.steps.length} steps`}
                      </div>
                    </div>

                    {isAssigned && (
                      <div className="text-sm text-cyan-600 mt-2">
                        Assigned to:{' '}
                        {workflow.claimed_by === user.id ? 'You' : workflow.claimed_by_name || 'Unknown'}
                        {isActive && activeBatch && (
                          <span className="text-gray-500">
                            {' · Step '}{(activeBatch.current_step_index || 0) + 1}/{workflow.steps?.length || '?'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Link
                      href={`/workflows/edit?id=${workflow.id}`}
                      className="px-4 py-2 bg-cyan-500 text-white rounded-md text-sm font-medium hover:bg-cyan-600 transition-colors"
                    >
                      View
                    </Link>

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

                    <button
                      onClick={() => handleArchiveWorkflow(workflow.id)}
                      className="px-4 py-2 bg-gray-200 text-gray-600 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              );
            })}

            {archivedWorkflows.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showArchived ? 'Hide archived' : `Show archived (${archivedWorkflows.length})`}
                </button>
                {showArchived && (
                  <div className="mt-3 space-y-3">
                    {archivedWorkflows.map(workflow => (
                      <div
                        key={workflow.id}
                        className="p-5 bg-gray-50 rounded-lg border-l-4 border-gray-300 flex justify-between items-center gap-4 flex-wrap opacity-60"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-700">{workflow.name}</span>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Archived</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            Created {new Date(workflow.created_at).toLocaleDateString()}
                            {workflow.steps && ` · ${workflow.steps.length} steps`}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUnarchiveWorkflow(workflow.id)}
                            className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 transition-colors"
                          >
                            Restore
                          </button>
                          <Link
                            href={`/workflows/edit?id=${workflow.id}`}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── ASSIGN WORKFLOW MODAL ────────────────────────────────────── */}
      <Modal isOpen={assignWorkflowModalOpen} onClose={() => setAssignWorkflowModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-6 text-gray-900">Assign Workflow</h3>
          <p className="mb-4 text-gray-500">Select a team member to assign this workflow to:</p>
          <select
            value=""
            onChange={e => {
              if (e.target.value) handleAssignWorkflow(selectedWorkflowForAssignment, e.target.value);
            }}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4"
          >
            <option value="">Select team member</option>
            {assignableMembers.map(member => (
              <option key={member.id} value={member.id}>{member.label}</option>
            ))}
          </select>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setAssignWorkflowModalOpen(false)}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── ASSIGN BATCH MODAL ───────────────────────────────────────── */}
      <Modal isOpen={assignBatchModalOpen} onClose={() => setAssignBatchModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-6 text-gray-900">Assign Batch</h3>
          <p className="mb-4 text-gray-500">Select a team member to assign this batch to:</p>
          <select
            value=""
            onChange={e => {
              if (e.target.value) handleAssignBatch(selectedBatchForAssignment, e.target.value);
            }}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4"
          >
            <option value="">Select team member</option>
            {assignableMembers.map(member => (
              <option key={member.id} value={member.id}>{member.label}</option>
            ))}
          </select>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setAssignBatchModalOpen(false)}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── IMPORT RECIPE MODAL ──────────────────────────────────────── */}
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