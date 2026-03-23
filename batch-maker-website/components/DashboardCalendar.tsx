import { useState, useEffect } from 'react';
import type { DashboardProps } from '../lib/dashboard-types';
import { getSupabaseClient } from '../lib/supabase';
import { getPredictiveSuggestions, type PredictiveSuggestion } from '../lib/predictiveSchedule';

const supabase = getSupabaseClient();

export default function Calendar({
  user,
  workflows,
  scheduledBatches,
  networkMembers,
  batchTemplates,
  isPremium,
  fetchScheduledBatches,
}: DashboardProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatingBatch, setDuplicatingBatch] = useState<any>(null);
  const [duplicateTargetDate, setDuplicateTargetDate] = useState('');
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [recurringBatch, setRecurringBatch] = useState<any>(null);
  const [recurringDaysOfWeek, setRecurringDaysOfWeek] = useState<number[]>([]);
  const [recurringWeeksAhead, setRecurringWeeksAhead] = useState(4);

  // ── Phase 6: Predictive suggestions ───────────────────────────────────────
  const [suggestions, setSuggestions] = useState<PredictiveSuggestion[]>([]);

  useEffect(() => {
    async function loadSuggestions() {
      try {
        const results = await getPredictiveSuggestions(supabase, user.id, workflows);
        setSuggestions(results.slice(0, 10)); // top 10
      } catch (e) {
        // POS not connected — silently skip
      }
    }
    loadSuggestions();
  }, [user.id, workflows]);

  const [editFormData, setEditFormData] = useState({
    name: '',
    scheduled_date: '',
    scheduled_time: '',
    assigned_to: '',
    batch_size_multiplier: 1,
    notes: '',
  });
  const [scheduleFormData, setScheduleFormData] = useState({
    workflow_id: '',
    template_id: '',
    scheduled_date: '',
    scheduled_time: '',
    name: '',
    batch_size_multiplier: 1,
    assigned_to: '',
    notes: '',
  });

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayOfWeekNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const assignableMembers = [
    { id: user.id, label: 'You' },
    ...networkMembers
      .filter(m => m.user_id !== user.id)
      .map(m => ({
        id: m.user_id,
        label: m.profiles?.device_name || m.profiles?.email || 'Unknown',
      })),
  ];

  function resolveAssigneeName(userId: string | null): string | null {
    if (!userId) return null;
    if (userId === user.id) return 'You';
    const member = networkMembers.find(m => m.user_id === userId);
    return member?.profiles?.device_name || member?.profiles?.email || 'Unknown';
  }

  const getCalendarDays = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const calendarDays = getCalendarDays();

  const getBatchesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return scheduledBatches.filter(b => b.scheduled_date === dateStr);
  };

  // ── Phase 6: Helper to check if a date has suggestions ────────────────────
  const getSuggestionsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return suggestions.filter(s => s.suggestedDate === dateStr);
  };

  // ─── SCHEDULE (create new) ───────────────────────────────────────────────
  async function handleScheduleBatch() {
    if (!scheduleFormData.workflow_id || !scheduleFormData.scheduled_date || !scheduleFormData.name) {
      alert('Please fill in required fields');
      return;
    }
    try {
      const assignedToName = resolveAssigneeName(scheduleFormData.assigned_to || null);
      const { error } = await supabase.from('scheduled_batches').insert({
        user_id: user.id,
        workflow_id: scheduleFormData.workflow_id,
        template_id: scheduleFormData.template_id || null,
        scheduled_date: scheduleFormData.scheduled_date,
        scheduled_time: scheduleFormData.scheduled_time || null,
        name: scheduleFormData.name,
        batch_size_multiplier: scheduleFormData.batch_size_multiplier,
        assigned_to: scheduleFormData.assigned_to || null,
        assigned_to_name: assignedToName,
        status: 'scheduled',
        notes: scheduleFormData.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      if (scheduleFormData.assigned_to && scheduleFormData.assigned_to !== user.id) {
        fetch('/api/notifications/batch-assigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerId: user.id,
            assignedToUserId: scheduleFormData.assigned_to,
            batchName: scheduleFormData.name,
            scheduledDate: scheduleFormData.scheduled_date,
            workflowName: workflows.find(w => w.id === scheduleFormData.workflow_id)?.name,
          }),
        }).catch(() => {});
      }

      await fetchScheduledBatches();
      setScheduleModalOpen(false);
      setScheduleFormData({ workflow_id: '', template_id: '', scheduled_date: '', scheduled_time: '', name: '', batch_size_multiplier: 1, assigned_to: '', notes: '' });
    } catch (error) {
      console.error('Error scheduling batch:', error);
      alert('Failed to schedule batch');
    }
  }

  // ─── EDIT ────────────────────────────────────────────────────────────────
  function openEditForm(batch: any) {
    setEditingBatchId(batch.id);
    setEditFormData({
      name: batch.name,
      scheduled_date: batch.scheduled_date,
      scheduled_time: batch.scheduled_time || '',
      assigned_to: batch.assigned_to || '',
      batch_size_multiplier: batch.batch_size_multiplier || 1,
      notes: batch.notes || '',
    });
  }

  async function handleSaveEdit() {
    if (!editingBatchId) return;
    try {
      const assignedToName = resolveAssigneeName(editFormData.assigned_to || null);
      const { error } = await supabase
        .from('scheduled_batches')
        .update({
          name: editFormData.name,
          scheduled_date: editFormData.scheduled_date,
          scheduled_time: editFormData.scheduled_time || null,
          assigned_to: editFormData.assigned_to || null,
          assigned_to_name: assignedToName,
          batch_size_multiplier: editFormData.batch_size_multiplier,
          notes: editFormData.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingBatchId);
      if (error) throw error;
      await fetchScheduledBatches();
      setEditingBatchId(null);
      const newDate = new Date(editFormData.scheduled_date + 'T00:00:00');
      if (newDate.getMonth() !== selectedDate.getMonth() || newDate.getFullYear() !== selectedDate.getFullYear()) {
        setSelectedDate(newDate);
      }
      if (selectedDayDate) {
        const currentDayStr = selectedDayDate.toISOString().split('T')[0];
        if (editFormData.scheduled_date !== currentDayStr) setSelectedDayDate(null);
      }
    } catch (error) {
      console.error('Error saving edit:', error);
      alert('Failed to save changes');
    }
  }

  // ─── START ────────────────────────────────────────────────────────────────
  async function handleStartBatch(batch: any) {
    try {
      const now = new Date();
      const workflow = workflows.find(w => w.id === batch.workflow_id);
      if (!workflow) { alert('Workflow not found'); return; }

      const { error: batchError } = await supabase
        .from('batches')
        .insert({
          user_id: user.id,
          workflow_id: batch.workflow_id,
          name: batch.name,
          batch_size_multiplier: batch.batch_size_multiplier || 1,
          current_step_index: 0,
          claimed_by: batch.assigned_to || user.id,
          claimed_by_name: batch.assigned_to_name || 'You',
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        });
      if (batchError) throw batchError;

      const scheduledDateTime = batch.scheduled_time
        ? new Date(`${batch.scheduled_date}T${batch.scheduled_time}`)
        : new Date(`${batch.scheduled_date}T00:00:00`);
      const updates: any = { status: 'in_progress', updated_at: now.toISOString() };
      if (now < scheduledDateTime) {
        updates.scheduled_date = now.toISOString().split('T')[0];
        updates.scheduled_time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      const { error: updateError } = await supabase.from('scheduled_batches').update(updates).eq('id', batch.id);
      if (updateError) throw updateError;

      await fetchScheduledBatches();
      alert(`Batch "${batch.name}" started! You can now work on it from the Workflows page.`);
    } catch (error) {
      console.error('Error starting batch:', error);
      alert('Failed to start batch');
    }
  }

  // ─── CANCEL (soft) ────────────────────────────────────────────────────────
  async function handleCancelBatch(batchId: string) {
    try {
      const { error } = await supabase
        .from('scheduled_batches')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', batchId);
      if (error) throw error;
      await fetchScheduledBatches();
    } catch (error) {
      console.error('Error cancelling batch:', error);
      alert('Failed to cancel batch');
    }
  }

  // ─── HARD DELETE (any status) ─────────────────────────────────────────────
  async function handleDeleteBatch(batch: any) {
    const isRunning = batch.status === 'in_progress';
    const msg = isRunning
      ? `Force delete "${batch.name}"? This will remove it from the calendar and clean up any orphaned batch data. Use this when a batch is stuck "Running".`
      : `Permanently delete "${batch.name}" from the calendar? This cannot be undone.`;
    if (!confirm(msg)) return;
    try {
      if (isRunning) {
        await supabase
          .from('batches')
          .delete()
          .eq('user_id', user.id)
          .eq('workflow_id', batch.workflow_id)
          .is('completed_at', null);
      }
      const { error } = await supabase.from('scheduled_batches').delete().eq('id', batch.id);
      if (error) throw error;
      await fetchScheduledBatches();
    } catch (error) {
      console.error('Force delete failed:', error);
      alert('Failed to delete. Try again.');
    }
  }

  // ─── MARK COMPLETE ────────────────────────────────────────────────────────
  async function handleMarkComplete(batchId: string) {
    if (!confirm('Mark this batch as completed?')) return;
    const { error } = await supabase
      .from('scheduled_batches')
      .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', batchId);
    if (error) { alert('Failed'); return; }

    const batch = scheduledBatches.find(b => b.id === batchId);
    const workflow = workflows.find(w => w.id === batch?.workflow_id);
    fetch('/api/notifications/batch-completed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: user.id,
        batchName: batch?.name || 'Batch',
        workflowName: workflow?.name || null,
        completedByName: 'Owner',
      }),
    }).catch(() => {});

    await fetchScheduledBatches();
  }

  // ─── DUPLICATE TO DATE ────────────────────────────────────────────────────
  function openDuplicateModal(batch: any) {
    setDuplicatingBatch(batch);
    setDuplicateTargetDate('');
    setDuplicateModalOpen(true);
  }

  async function handleDuplicateBatch() {
    if (!duplicatingBatch || !duplicateTargetDate) { alert('Please select a target date'); return; }
    try {
      const assignedToName = resolveAssigneeName(duplicatingBatch.assigned_to || null);
      const { error } = await supabase.from('scheduled_batches').insert({
        user_id: user.id,
        workflow_id: duplicatingBatch.workflow_id,
        template_id: duplicatingBatch.template_id || null,
        scheduled_date: duplicateTargetDate,
        scheduled_time: duplicatingBatch.scheduled_time || null,
        name: duplicatingBatch.name,
        batch_size_multiplier: duplicatingBatch.batch_size_multiplier || 1,
        assigned_to: duplicatingBatch.assigned_to || null,
        assigned_to_name: assignedToName,
        status: 'scheduled',
        notes: duplicatingBatch.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await fetchScheduledBatches();
      setDuplicateModalOpen(false);
      setDuplicatingBatch(null);
      const newDate = new Date(duplicateTargetDate + 'T00:00:00');
      if (newDate.getMonth() !== selectedDate.getMonth() || newDate.getFullYear() !== selectedDate.getFullYear()) {
        setSelectedDate(newDate);
      }
    } catch (error) {
      console.error('Error duplicating batch:', error);
      alert('Failed to duplicate batch');
    }
  }

  // ─── RECURRING SCHEDULE ───────────────────────────────────────────────────
  function openRecurringModal(batch: any) {
    setRecurringBatch(batch);
    setRecurringDaysOfWeek([new Date(batch.scheduled_date + 'T00:00:00').getDay()]);
    setRecurringWeeksAhead(4);
    setRecurringModalOpen(true);
  }

  async function handleCreateRecurring() {
    if (!recurringBatch || recurringDaysOfWeek.length === 0) { alert('Select at least one day of the week'); return; }
    try {
      const inserts: any[] = [];
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + recurringWeeksAhead * 7);
      const assignedToName = resolveAssigneeName(recurringBatch.assigned_to || null);

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (recurringDaysOfWeek.includes(d.getDay())) {
          const dateStr = d.toISOString().split('T')[0];
          if (dateStr === recurringBatch.scheduled_date) continue;
          const alreadyExists = scheduledBatches.some(
            b => b.scheduled_date === dateStr && b.workflow_id === recurringBatch.workflow_id && b.name === recurringBatch.name
          );
          if (!alreadyExists) {
            inserts.push({
              user_id: user.id,
              workflow_id: recurringBatch.workflow_id,
              template_id: recurringBatch.template_id || null,
              scheduled_date: dateStr,
              scheduled_time: recurringBatch.scheduled_time || null,
              name: recurringBatch.name,
              batch_size_multiplier: recurringBatch.batch_size_multiplier || 1,
              assigned_to: recurringBatch.assigned_to || null,
              assigned_to_name: assignedToName,
              status: 'scheduled',
              notes: recurringBatch.notes || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      if (inserts.length === 0) { alert('No new dates to schedule (all already exist or no matching days found).'); return; }

      const { error } = await supabase.from('scheduled_batches').insert(inserts);
      if (error) throw error;
      await fetchScheduledBatches();
      setRecurringModalOpen(false);
      setRecurringBatch(null);
      alert(`Created ${inserts.length} recurring batch${inserts.length > 1 ? 'es' : ''}!`);
    } catch (error) {
      console.error('Error creating recurring batches:', error);
      alert('Failed to create recurring batches');
    }
  }

  const dayDetailBatches = selectedDayDate ? getBatchesForDate(selectedDayDate) : [];

  const upcomingBatches = [...scheduledBatches]
    .filter(b => b.status === 'scheduled')
    .sort((a, b) => {
      const dateA = a.scheduled_time ? `${a.scheduled_date}T${a.scheduled_time}` : a.scheduled_date;
      const dateB = b.scheduled_time ? `${b.scheduled_date}T${b.scheduled_time}` : b.scheduled_date;
      return dateA.localeCompare(dateB);
    })
    .slice(0, 10);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Calendar Grid ── */}
      <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <h2 className="text-xl font-semibold text-gray-900">Production Calendar</h2>
          <button onClick={() => setScheduleModalOpen(true)} className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 transition-colors">
            + Schedule Batch
          </button>
        </div>

        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors">
            ◀ Previous
          </button>
          <h3 className="text-lg font-semibold text-gray-900">{monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}</h3>
          <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors">
            Next ▶
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center font-semibold text-xs text-gray-500 uppercase">{day}</div>
          ))}

          {calendarDays.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} className="aspect-square bg-gray-50 rounded-md"></div>;
            const batchesOnDay = getBatchesForDate(date);
            const isToday = date.toDateString() === new Date().toDateString();
            const isSelected = selectedDayDate && date.toDateString() === selectedDayDate.toDateString();
            const hasRunning = batchesOnDay.some(b => b.status === 'in_progress');
            const daySuggestions = getSuggestionsForDate(date);

            return (
              <div
                key={date.toISOString()}
                onClick={() => setSelectedDayDate(isSelected ? null : date)}
                className={`aspect-square border rounded-md p-1.5 relative overflow-hidden cursor-pointer transition-all ${
                  isSelected ? 'bg-cyan-50 border-cyan-500 ring-2 ring-cyan-200' :
                  hasRunning ? 'bg-yellow-50 border-yellow-300 hover:border-yellow-400' :
                  batchesOnDay.length > 0 ? 'bg-white border-gray-200 hover:border-cyan-300 hover:bg-cyan-50' :
                  daySuggestions.length > 0 ? 'bg-amber-50 border-amber-200 hover:border-amber-400' :
                  isToday ? 'bg-sky-50 border-sky-300' : 'bg-white border-gray-100'
                }`}
              >
                <div className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-sky-600' : 'text-gray-700'}`}>
                  {date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {batchesOnDay.slice(0, 2).map(batch => (
                    <div key={batch.id} className={`text-[9px] px-1 py-0.5 rounded whitespace-nowrap overflow-hidden text-ellipsis ${
                      batch.status === 'completed' ? 'bg-green-100 text-green-700' :
                      batch.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                      batch.status === 'cancelled' ? 'bg-red-100 text-red-500 line-through' :
                      'bg-cyan-100 text-cyan-700'
                    }`}>
                      {batch.name}
                    </div>
                  ))}
                  {batchesOnDay.length > 2 && <div className="text-[9px] text-gray-500 italic px-1">+{batchesOnDay.length - 2} more</div>}

                  {/* 💡 Suggestion badge */}
                  {daySuggestions.length > 0 && (
                    <div className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
                      💡 {daySuggestions.length} suggestion{daySuggestions.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Day Detail Panel ── */}
      {selectedDayDate && (
        <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm border border-cyan-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedDayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setScheduleFormData(prev => ({ ...prev, scheduled_date: selectedDayDate.toISOString().split('T')[0] }));
                  setScheduleModalOpen(true);
                }}
                className="px-3 py-1.5 bg-cyan-500 text-white rounded-md text-xs font-medium hover:bg-cyan-600 transition-colors"
              >
                + Add Batch
              </button>
              <button onClick={() => { setSelectedDayDate(null); setEditingBatchId(null); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">✕</button>
            </div>
          </div>

          {dayDetailBatches.length === 0 && getSuggestionsForDate(selectedDayDate).length === 0 ? (
            <p className="text-gray-400 text-sm italic text-center py-6">Nothing scheduled for this day.</p>
          ) : (
            <div className="space-y-3">
              {dayDetailBatches.map(batch => {
                const workflow = workflows.find(w => w.id === batch.workflow_id);
                const isEditing = editingBatchId === batch.id;

                // ── Editing state ──
                if (isEditing) {
                  return (
                    <div key={batch.id} className="p-4 bg-cyan-50 rounded-lg border border-cyan-200">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-cyan-700">Editing</span>
                        <button onClick={() => setEditingBatchId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                      <input
                        type="text"
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        placeholder="Batch name"
                        className="w-full p-2 text-sm border border-gray-300 rounded-md mb-2"
                      />
                      <div className="flex gap-2 mb-2">
                        <input type="date" value={editFormData.scheduled_date} onChange={(e) => setEditFormData({ ...editFormData, scheduled_date: e.target.value })} className="flex-[2] p-2 text-sm border border-gray-300 rounded-md" />
                        <input type="time" value={editFormData.scheduled_time} onChange={(e) => setEditFormData({ ...editFormData, scheduled_time: e.target.value })} className="flex-1 p-2 text-sm border border-gray-300 rounded-md" />
                      </div>
                      <input
                        type="number" step="0.1" value={editFormData.batch_size_multiplier}
                        onChange={(e) => setEditFormData({ ...editFormData, batch_size_multiplier: parseFloat(e.target.value) || 1 })}
                        placeholder="Size multiplier"
                        className="w-full p-2 text-sm border border-gray-300 rounded-md mb-2"
                      />
                      <select value={editFormData.assigned_to} onChange={(e) => setEditFormData({ ...editFormData, assigned_to: e.target.value })} className="w-full p-2 text-sm border border-gray-300 rounded-md mb-2">
                        <option value="">Unassigned</option>
                        {assignableMembers.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                      <textarea value={editFormData.notes} onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })} placeholder="Notes" className="w-full p-2 text-sm border border-gray-300 rounded-md mb-3 min-h-[50px]" />
                      <button onClick={handleSaveEdit} className="w-full px-4 py-2 bg-cyan-500 text-white rounded-md text-sm font-medium hover:bg-cyan-600 transition-colors">
                        Save Changes
                      </button>
                    </div>
                  );
                }

                // ── View state ──
                return (
                  <div key={batch.id} className={`p-4 rounded-lg border flex justify-between items-start gap-3 ${
                    batch.status === 'completed' ? 'bg-green-50 border-green-200' :
                    batch.status === 'in_progress' ? 'bg-yellow-50 border-yellow-300' :
                    batch.status === 'cancelled' ? 'bg-gray-50 border-gray-200 opacity-60' :
                    'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`font-semibold text-gray-900 ${batch.status === 'cancelled' ? 'line-through' : ''}`}>{batch.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          batch.status === 'completed' ? 'bg-green-200 text-green-700' :
                          batch.status === 'in_progress' ? 'bg-yellow-200 text-yellow-700' :
                          batch.status === 'cancelled' ? 'bg-gray-200 text-gray-500' :
                          'bg-cyan-100 text-cyan-700'
                        }`}>
                          {batch.status === 'in_progress' ? 'In Progress' : batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {workflow && <div>{workflow.name}</div>}
                        {batch.scheduled_time && <div>{batch.scheduled_time}</div>}
                        {batch.assigned_to && <div>{batch.assigned_to_name || resolveAssigneeName(batch.assigned_to)}</div>}
                        {batch.batch_size_multiplier !== 1 && <div>{batch.batch_size_multiplier}x</div>}
                        {batch.notes && <div className="italic mt-1">{batch.notes}</div>}
                      </div>
                    </div>

                    {/* ── Action buttons — context-sensitive ── */}
                    <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      {batch.status === 'scheduled' && (
                        <>
                          <button onClick={() => openEditForm(batch)} className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200 transition-colors">Edit</button>
                          <button onClick={() => openDuplicateModal(batch)} className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 transition-colors" title="Copy to another date">Copy</button>
                          <button onClick={() => openRecurringModal(batch)} className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200 transition-colors" title="Repeat on days of week">Repeat</button>
                          <button onClick={() => handleStartBatch(batch)} className="px-2.5 py-1 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600 transition-colors">Start</button>
                          <button onClick={() => handleCancelBatch(batch.id)} className="px-2.5 py-1 bg-red-100 text-red-600 rounded text-xs font-medium hover:bg-red-200 transition-colors">Cancel</button>
                          <button onClick={() => handleDeleteBatch(batch)} className="px-2.5 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors" title="Permanently delete">Delete</button>
                        </>
                      )}
                      {batch.status === 'in_progress' && (
                        <>
                          <span className="text-xs text-yellow-600 font-medium self-center">Running…</span>
                          <button onClick={() => handleMarkComplete(batch.id)} className="px-2.5 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 transition-colors">Mark Done</button>
                          <button onClick={() => handleDeleteBatch(batch)} className="px-2.5 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors" title="Force delete stuck batch">Force Delete</button>
                        </>
                      )}
                      {batch.status === 'completed' && (
                        <>
                          <span className="text-xs text-green-600 font-medium self-center">✓ Done</span>
                          <button onClick={() => openDuplicateModal(batch)} className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 transition-colors">Copy</button>
                          <button onClick={() => handleDeleteBatch(batch)} className="px-2.5 py-1 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300 transition-colors">Delete</button>
                        </>
                      )}
                      {batch.status === 'cancelled' && (
                        <>
                          <span className="text-xs text-gray-400 font-medium self-center">Cancelled</span>
                          <button onClick={() => handleDeleteBatch(batch)} className="px-2.5 py-1 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300 transition-colors">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Predictive suggestions for this day ── */}
          {(() => {
            const daySuggestions = getSuggestionsForDate(selectedDayDate);
            if (daySuggestions.length === 0) return null;
            return (
              <div className="mt-4 pt-4 border-t border-amber-200">
                <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-1">
                  💡 Suggested Batches (based on past sales)
                </h3>
                <div className="space-y-2">
                  {daySuggestions.map((s, i) => (
                    <div key={i} className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{s.itemName}</div>
                        <div className="text-xs text-gray-500">
                          Avg sold: {s.avgQtySold}/day
                          {s.matchedWorkflowName && <> · Workflow: <span className="text-cyan-600">{s.matchedWorkflowName}</span></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          s.confidence === 'high' ? 'bg-green-100 text-green-700' :
                          s.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{s.confidence}</span>
                        <span className="text-sm font-semibold text-amber-800">{s.suggestedBatchQty}×</span>
                        {s.matchedWorkflowId && (
                          <button
                            onClick={() => {
                              setScheduleFormData(prev => ({
                                ...prev,
                                workflow_id: s.matchedWorkflowId!,
                                name: s.itemName,
                                batch_size_multiplier: s.suggestedBatchQty,
                                scheduled_date: selectedDayDate.toISOString().split('T')[0],
                              }));
                              setScheduleModalOpen(true);
                            }}
                            className="px-2 py-1 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600 transition-colors"
                          >
                            Schedule
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      
      {/* ── Upcoming Demand (POS-driven) ── */}
      {suggestions.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
            💡 Upcoming 
          </h2>
          <p className="text-sm text-gray-500 mb-4">Based on your POS sales history from the past 4 weeks.</p>
          <div className="space-y-3">
            {suggestions.slice(0, 5).map((s, i) => (
              <div key={i} className="p-4 bg-white rounded-lg border border-amber-200 flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{s.itemName}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {new Date(s.suggestedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {' · '}Avg {s.avgQtySold} sold/day
                    {s.matchedWorkflowName && <> · <span className="text-cyan-600">{s.matchedWorkflowName}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    s.confidence === 'high' ? 'bg-green-100 text-green-700' :
                    s.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{s.confidence} confidence</span>
                  <span className="text-sm font-bold text-amber-700">{s.suggestedBatchQty}×</span>
                  {s.matchedWorkflowId && (
                    <button
                      onClick={() => {
                        const newDate = new Date(s.suggestedDate + 'T00:00:00');
                        setSelectedDate(newDate);
                        setSelectedDayDate(newDate);
                        setScheduleFormData(prev => ({
                          ...prev,
                          workflow_id: s.matchedWorkflowId!,
                          name: s.itemName,
                          batch_size_multiplier: s.suggestedBatchQty,
                          scheduled_date: s.suggestedDate,
                        }));
                        setScheduleModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-amber-500 text-white rounded-md text-xs font-medium hover:bg-amber-600 transition-colors"
                    >
                      Schedule
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Schedule Batch Modal ── */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setScheduleModalOpen(false)}>
          <div className="bg-white/90 rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold mb-6 text-gray-900">Schedule Batch</h3>
            <select value={scheduleFormData.workflow_id} onChange={(e) => setScheduleFormData({ ...scheduleFormData, workflow_id: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg mb-4">
              <option value="">Select workflow *</option>
              {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input type="text" placeholder="Batch name *" value={scheduleFormData.name} onChange={(e) => setScheduleFormData({ ...scheduleFormData, name: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg mb-4" />
            <div className="flex gap-2 mb-4">
              <input type="date" value={scheduleFormData.scheduled_date} onChange={(e) => setScheduleFormData({ ...scheduleFormData, scheduled_date: e.target.value })} className="flex-[2] p-3 border border-gray-300 rounded-lg" />
              <input type="time" value={scheduleFormData.scheduled_time} onChange={(e) => setScheduleFormData({ ...scheduleFormData, scheduled_time: e.target.value })} className="flex-1 p-3 border border-gray-300 rounded-lg" />
            </div>
            <input type="number" step="0.1" placeholder="Batch size multiplier" value={scheduleFormData.batch_size_multiplier || ''} onChange={(e) => setScheduleFormData({ ...scheduleFormData, batch_size_multiplier: parseFloat(e.target.value) || 1 })} className="w-full p-3 border border-gray-300 rounded-lg mb-4" />
            <select value={scheduleFormData.assigned_to} onChange={(e) => setScheduleFormData({ ...scheduleFormData, assigned_to: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg mb-4">
              <option value="">Assign to (optional)</option>
              {assignableMembers.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <textarea placeholder="Notes" value={scheduleFormData.notes} onChange={(e) => setScheduleFormData({ ...scheduleFormData, notes: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg mb-4 min-h-[60px]" />
            <div className="flex gap-2">
              <button onClick={handleScheduleBatch} className="flex-1 px-4 py-3 bg-cyan-500 text-white rounded-lg font-medium hover:bg-cyan-600 transition-colors">Schedule Batch</button>
              <button onClick={() => setScheduleModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Duplicate Batch Modal ── */}
      {duplicateModalOpen && duplicatingBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDuplicateModalOpen(false)}>
          <div className="bg-white/90 rounded-xl p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-semibold mb-2 text-gray-900">Copy Batch to Another Day</h3>
            <p className="text-sm text-gray-500 mb-6">Copying <strong>"{duplicatingBatch.name}"</strong> — all settings will be duplicated.</p>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Date *</label>
            <input type="date" value={duplicateTargetDate} onChange={e => setDuplicateTargetDate(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg mb-6" />
            <div className="flex gap-2">
              <button onClick={handleDuplicateBatch} className="flex-1 px-4 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors">Copy Batch</button>
              <button onClick={() => setDuplicateModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recurring Schedule Modal ── */}
      {recurringModalOpen && recurringBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRecurringModalOpen(false)}>
          <div className="bg-white/90 rounded-xl p-8 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-semibold mb-2 text-gray-900">Repeat Batch</h3>
            <p className="text-sm text-gray-500 mb-6">Create recurring copies of <strong>"{recurringBatch.name}"</strong> on selected days of the week.</p>

            <label className="block text-sm font-medium text-gray-700 mb-3">Repeat on these days *</label>
            <div className="flex gap-2 flex-wrap mb-6">
              {dayOfWeekNames.map((day, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setRecurringDaysOfWeek(prev =>
                      prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
                    );
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    recurringDaysOfWeek.includes(idx)
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">How many weeks ahead?</label>
            <select value={recurringWeeksAhead} onChange={e => setRecurringWeeksAhead(Number(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg mb-6">
              {[1, 2, 4, 6, 8, 12].map(w => <option key={w} value={w}>{w} week{w > 1 ? 's' : ''}</option>)}
            </select>

            <p className="text-xs text-gray-400 mb-6">
              Existing scheduled batches with the same name and workflow on those dates will not be duplicated.
            </p>

            <div className="flex gap-2">
              <button onClick={handleCreateRecurring} className="flex-1 px-4 py-3 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition-colors">Create Recurring</button>
              <button onClick={() => setRecurringModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}