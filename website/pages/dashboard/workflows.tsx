import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { DashboardProps, ActiveSession } from './types';
import { supabase } from '../../lib/supabase';

export default function Workflows({
  user,
  workflows,
  batches,
  networkMembers,
  isPremium,
  fetchWorkflows,
  fetchBatches,
}: DashboardProps) {
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [assignWorkflowModalOpen, setAssignWorkflowModalOpen] = useState(false);
  const [selectedWorkflowForAssignment, setSelectedWorkflowForAssignment] = useState<string>('');

  useEffect(() => {
    if (!user || !isPremium) return;

    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 5000);

    return () => clearInterval(interval);
  }, [user, isPremium, batches, networkMembers]);

  async function fetchActiveSessions() {
    if (!user) return;
    
    const sessions: ActiveSession[] = [];
    
    // Get all active batches
    const { data: activeBatches } = await supabase
      .from('batches')
      .select('*')
      .eq('user_id', user.id)
      .is('completed_at', null);

    // Map batches to sessions
    if (activeBatches) {
      for (const batch of activeBatches) {
        const workflow = workflows.find(w => w.id === batch.workflow_id);
        const member = networkMembers.find(m => m.user_id === batch.claimed_by);
        
        sessions.push({
          user_id: batch.claimed_by || 'unknown',
          device_name: batch.claimed_by_name || member?.profiles?.device_name || 'Unknown Device',
          current_workflow_id: batch.workflow_id,
          current_workflow_name: workflow?.name || batch.name,
          current_batch_id: batch.id,
          current_step: batch.current_step_index || 0,
          last_heartbeat: batch.updated_at || batch.created_at,
          status: 'working',
        });
      }
    }

    // Add idle network members
    networkMembers.forEach(member => {
      if (!sessions.find(s => s.user_id === member.user_id)) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const isOnline = member.last_active > fiveMinutesAgo;
        
        sessions.push({
          user_id: member.user_id,
          device_name: member.profiles?.device_name || member.profiles?.email || 'Unknown',
          last_heartbeat: member.last_active,
          status: isOnline ? 'idle' : 'offline',
        });
      }
    });

    setActiveSessions(sessions);
  }

  async function handleAssignWorkflow(workflowId: string, assignToUserId: string) {
    try {
      const workflow = workflows.find(w => w.id === workflowId);
      const member = networkMembers.find(m => m.user_id === assignToUserId);
      
      if (!workflow || !member) {
        alert('Workflow or user not found');
        return;
      }

      const { error } = await supabase
        .from('workflows')
        .update({
          claimed_by: assignToUserId,
          claimed_by_name: member.profiles?.device_name || member.profiles?.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (error) throw error;

      await fetchWorkflows();
      setAssignWorkflowModalOpen(false);
      alert(`Workflow "${workflow.name}" assigned to ${member.profiles?.device_name || member.profiles?.email}`);
    } catch (error) {
      console.error('Error assigning workflow:', error);
      alert('Failed to assign workflow');
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
      alert('Workflow unassigned');
    } catch (error) {
      console.error('Error unassigning workflow:', error);
      alert('Failed to unassign workflow');
    }
  }

  return (
    <>
      {/* Real-Time Active Sessions */}
      {isPremium && activeSessions.length > 0 && (
        <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">👥 Active Team Members</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSessions.map(session => (
              <div 
                key={session.user_id} 
                className={`p-4 bg-gray-50 rounded-lg border-l-4 ${
                  session.status === 'working' ? 'border-green-500' :
                  session.status === 'idle' ? 'border-yellow-500' : 'border-gray-400'
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className={`w-2 h-2 rounded-full ${
                      session.status === 'working' ? 'bg-green-500' :
                      session.status === 'idle' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}></span>
                    {session.device_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {session.status === 'working' ? '🔨 Working' :
                     session.status === 'idle' ? '⏸️ Idle' : '⚫ Offline'}
                  </div>
                </div>

                {session.status === 'working' && (
                  <div className="mb-2">
                    <div className="text-sm font-medium text-blue-600 mb-1">
                      {session.current_workflow_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Step {(session.current_step || 0) + 1}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  Last active: {new Date(session.last_heartbeat).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Workflows */}
      <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <h2 className="text-xl font-semibold text-gray-900">📋 All Workflows</h2>
          <Link href="/workflows/create" className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
            + Create Workflow
          </Link>
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
                      </div>
                      <div className="text-xs text-gray-500">
                        Created {new Date(workflow.created_at).toLocaleDateString()}
                        {workflow.steps && ` • ${workflow.steps.length} steps`}
                      </div>
                    </div>

                    {isAssigned && (
                      <div className="text-sm text-blue-600 mt-2">
                        👤 Assigned to: {workflow.claimed_by_name}
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
                      href={`/workflows/${workflow.id}`} 
                      className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
                    >
                      View
                    </Link>

                    {isPremium && (
                      <>
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
                            className="px-4 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-colors"
                          >
                            Unassign
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Batches */}
      <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">🔨 In Progress</h2>
        {batches.filter(b => !b.completed_at).length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-8">
            No batches currently in progress.
          </p>
        ) : (
          <div className="space-y-3">
            {batches.filter(b => !b.completed_at).map(batch => {
              const workflow = workflows.find(w => w.id === batch.workflow_id);
              const progress = workflow?.steps 
                ? ((batch.current_step_index || 0) / workflow.steps.length) * 100
                : 0;
        
              return (
                <div key={batch.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="font-medium text-gray-900 mb-1">{batch.name}</div>
                  <div className="text-sm text-gray-500 mb-3">
                    Workflow: {workflow?.name || 'Unknown'}
                    {batch.claimed_by_name && ` • Being worked on by ${batch.claimed_by_name}`}
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div 
                      className="h-full bg-green-500 transition-all duration-300" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Step {(batch.current_step_index || 0) + 1} of {workflow?.steps?.length || '?'}
                    {' • '}
                    {Math.round(progress)}% complete
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Workflow Modal */}
      {assignWorkflowModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAssignWorkflowModalOpen(false)}>
          <div className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold mb-6 text-gray-900">Assign Workflow</h3>
            
            <p className="mb-4 text-gray-500">
              Select a team member to assign this workflow to:
            </p>

            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleAssignWorkflow(selectedWorkflowForAssignment, e.target.value);
                }
              }}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            >
              <option value="">Select team member</option>
              {networkMembers.map(member => (
                <option key={member.id} value={member.user_id}>
                  {member.profiles?.device_name || member.profiles?.email}
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
    </>
  );
}