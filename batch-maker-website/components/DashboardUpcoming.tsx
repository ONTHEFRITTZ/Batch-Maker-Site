'use client';
/**
 * components/DashboardUpcoming.tsx
 * Upcoming scheduled batches - full list view with all details.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { DashboardProps } from '../lib/dashboard-types';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

const STATUS_COLORS: Record<string, string> = {
  scheduled:   'bg-cyan-100 text-cyan-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed:   'bg-green-100 text-green-700',
  cancelled:   'bg-gray-100 text-gray-500',
};

type FilterStatus = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export default function DashboardUpcoming({
  user,
  scheduledBatches,
  workflows,
  networkMembers,
  fetchScheduledBatches,
}: DashboardProps) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('scheduled');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  function resolveAssigneeName(userId: string | null): string | null {
    if (!userId) return null;
    if (userId === user.id) return 'You';
    const member = networkMembers.find(m => m.user_id === userId);
    return member?.profiles?.device_name || member?.profiles?.email || 'Unknown';
  }

  function resolveWorkflowName(workflowId: string): string {
    return workflows.find(w => w.id === workflowId)?.name || 'Unknown workflow';
  }

  function daysUntil(dateStr: string): number {
    const d = new Date(dateStr + 'T00:00:00');
    return Math.ceil((d.getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
  }

  async function handleDelete(batchId: string) {
    if (!confirm('Permanently delete this scheduled batch? This cannot be undone.')) return;
    setDeletingId(batchId);
    const { error } = await supabase.from('scheduled_batches').delete().eq('id', batchId);
    setDeletingId(null);
    if (error) { alert('Failed to delete batch'); return; }
    fetchScheduledBatches?.();
  }

  async function handleCancel(batchId: string) {
    const { error } = await supabase
      .from('scheduled_batches')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', batchId);
    if (error) { alert('Failed to cancel batch'); return; }
    fetchScheduledBatches?.();
  }

  const filtered = scheduledBatches
    .filter(b => {
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!b.name.toLowerCase().includes(q) &&
            !resolveWorkflowName(b.workflow_id).toLowerCase().includes(q) &&
            !(b.assigned_to_name || '').toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const da = a.scheduled_time ? `${a.scheduled_date}T${a.scheduled_time}` : a.scheduled_date;
      const db = b.scheduled_time ? `${b.scheduled_date}T${b.scheduled_time}` : b.scheduled_date;
      return sortDir === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
    });

  const counts = {
    all: scheduledBatches.length,
    scheduled: scheduledBatches.filter(b => b.status === 'scheduled').length,
    in_progress: scheduledBatches.filter(b => b.status === 'in_progress').length,
    completed: scheduledBatches.filter(b => b.status === 'completed').length,
    cancelled: scheduledBatches.filter(b => b.status === 'cancelled').length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white/90 rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Scheduled Batches</h2>
          <Link
            href="/dashboard?view=calendar&tab=production"
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 transition-colors"
          >
            + Schedule Batch
          </Link>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search batches, workflows, assignees..."
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Date {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap mt-3">
          {(['all', 'scheduled', 'in_progress', 'completed', 'cancelled'] as FilterStatus[]).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status === 'all' ? 'All' :
               status === 'in_progress' ? 'In Progress' :
               status.charAt(0).toUpperCase() + status.slice(1)}
              {' '}({counts[status]})
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white/90 rounded-xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-12">
            {search || filterStatus !== 'all' ? 'No batches match your filters.' : 'No scheduled batches yet.'}
          </p>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden md:grid md:grid-cols-12 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
              <div className="col-span-3">Batch</div>
              <div className="col-span-2">Workflow</div>
              <div className="col-span-2">Date / Time</div>
              <div className="col-span-2">Assigned To</div>
              <div className="col-span-1">Size</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1"></div>
            </div>

            <div className="divide-y divide-gray-100">
              {filtered.map(batch => {
                const days = daysUntil(batch.scheduled_date);
                const isOverdue = days < 0 && batch.status === 'scheduled';
                const isToday = batch.scheduled_date === today;
                const assigneeName = batch.assigned_to_name || resolveAssigneeName(batch.assigned_to || null);

                return (
                  <div
                    key={batch.id}
                    className={`px-5 py-4 flex flex-col md:grid md:grid-cols-12 gap-3 items-start md:items-center transition-colors hover:bg-gray-50 ${
                      isOverdue ? 'border-l-4 border-red-400' :
                      isToday ? 'border-l-4 border-amber-400' :
                      batch.status === 'in_progress' ? 'border-l-4 border-cyan-400' :
                      'border-l-4 border-transparent'
                    }`}
                  >
                    {/* Batch name */}
                    <div className="col-span-3 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{batch.name}</div>
                      {batch.notes && (
                        <div className="text-xs text-gray-400 truncate italic mt-0.5">{batch.notes}</div>
                      )}
                    </div>

                    {/* Workflow */}
                    <div className="col-span-2 text-sm text-gray-600 truncate">
                      {resolveWorkflowName(batch.workflow_id)}
                    </div>

                    {/* Date / Time */}
                    <div className="col-span-2">
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(batch.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric'
                        })}
                      </div>
                      <div className="text-xs text-gray-500 flex gap-2">
                        {batch.scheduled_time && <span>{batch.scheduled_time}</span>}
                        {batch.status === 'scheduled' && (
                          <span className={
                            isOverdue ? 'text-red-500 font-medium' :
                            isToday ? 'text-amber-600 font-medium' :
                            'text-gray-400'
                          }>
                            {isOverdue ? `${Math.abs(days)}d overdue` :
                             isToday ? 'Today' :
                             `in ${days}d`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Assigned to */}
                    <div className="col-span-2 text-sm text-gray-600">
                      {assigneeName || <span className="text-gray-400 italic">Unassigned</span>}
                    </div>

                    {/* Size multiplier */}
                    <div className="col-span-1 text-sm text-gray-600">
                      {batch.batch_size_multiplier !== 1 ? `${batch.batch_size_multiplier}x` : '—'}
                    </div>

                    {/* Status */}
                    <div className="col-span-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[batch.status]}`}>
                        {batch.status === 'in_progress' ? 'Running' :
                         batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex gap-1 justify-end">
                      {batch.status === 'scheduled' && (
                        <button
                          onClick={() => handleCancel(batch.id)}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      {(batch.status === 'cancelled' || batch.status === 'completed') && (
                        <button
                          onClick={() => handleDelete(batch.id)}
                          disabled={deletingId === batch.id}
                          className="px-2 py-1 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              {filtered.length} batch{filtered.length !== 1 ? 'es' : ''}
              {filterStatus !== 'all' || search ? ` (filtered from ${scheduledBatches.length} total)` : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}