import { useState } from 'react';
import type { DashboardProps } from './types';
import { supabase } from '../../lib/supabase';

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

  const getCalendarDays = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const calendarDays = getCalendarDays();

  const getBatchesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return scheduledBatches.filter(b => b.scheduled_date === dateStr);
  };

  async function handleScheduleBatch() {
    if (!scheduleFormData.workflow_id || !scheduleFormData.scheduled_date || !scheduleFormData.name) {
      alert('Please fill in required fields');
      return;
    }

    try {
      const assignedMember = networkMembers.find(m => m.user_id === scheduleFormData.assigned_to);
      
      const { error } = await supabase.from('scheduled_batches').insert({
        user_id: user.id,
        workflow_id: scheduleFormData.workflow_id,
        template_id: scheduleFormData.template_id || null,
        scheduled_date: scheduleFormData.scheduled_date,
        scheduled_time: scheduleFormData.scheduled_time || null,
        name: scheduleFormData.name,
        batch_size_multiplier: scheduleFormData.batch_size_multiplier,
        assigned_to: scheduleFormData.assigned_to || null,
        assigned_to_name: assignedMember ? (assignedMember.profiles?.device_name || assignedMember.profiles?.email) : null,
        status: 'scheduled',
        notes: scheduleFormData.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      await fetchScheduledBatches();
      setScheduleModalOpen(false);
      setScheduleFormData({
        workflow_id: '', template_id: '', scheduled_date: '', scheduled_time: '',
        name: '', batch_size_multiplier: 1, assigned_to: '', notes: '',
      });
      alert('Batch scheduled successfully!');
    } catch (error) {
      console.error('Error scheduling batch:', error);
      alert('Failed to schedule batch');
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <h2 className="text-xl font-semibold text-gray-900">Production Calendar</h2>
          <button onClick={() => setScheduleModalOpen(true)} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
            + Schedule Batch
          </button>
        </div>

        <div className="flex justify-between items-center mb-4">
          <button 
            onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors"
          >
            ◀ Previous
          </button>
          <h3 className="text-lg font-semibold text-gray-900">
            {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
          </h3>
          <button 
            onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors"
          >
            Next ▶
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center font-semibold text-xs text-gray-500 uppercase">
              {day}
            </div>
          ))}
          
          {calendarDays.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} className="aspect-square bg-gray-50"></div>;
            
            const batchesOnDay = getBatchesForDate(date);
            const isToday = date.toDateString() === new Date().toDateString();
            
            return (
              <div 
                key={date.toISOString()} 
                className={`aspect-square border rounded-md p-2 relative overflow-hidden ${
                  isToday ? 'bg-sky-50 border-sky-400' : 'bg-white border-gray-200'
                }`}
              >
                <div className="text-sm font-medium text-gray-900 mb-1">{date.getDate()}</div>
                {batchesOnDay.length > 0 && (
                  <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-semibold">
                    {batchesOnDay.length}
                  </div>
                )}
                <div className="space-y-0.5">
                  {batchesOnDay.slice(0, 2).map(batch => (
                    <div 
                      key={batch.id} 
                      className={`text-[10px] px-1 py-0.5 rounded whitespace-nowrap overflow-hidden text-ellipsis ${
                        batch.status === 'completed' ? 'bg-green-100' :
                        batch.status === 'in_progress' ? 'bg-yellow-100' :
                        batch.status === 'cancelled' ? 'bg-red-100' : 'bg-blue-100'
                      }`}
                      title={`${batch.name}${batch.scheduled_time ? ` at ${batch.scheduled_time}` : ''}${batch.assigned_to_name ? ` - ${batch.assigned_to_name}` : ''}`}
                    >
                      {batch.name.substring(0, 15)}{batch.name.length > 15 ? '...' : ''}
                      {batch.assigned_to_name && <span className="absolute top-1 right-6 text-[8px]">👤</span>}
                    </div>
                  ))}
                  {batchesOnDay.length > 2 && (
                    <div className="text-[10px] text-gray-500 italic">+{batchesOnDay.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Scheduled Batches */}
      <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Upcoming Scheduled Batches</h2>
        {scheduledBatches.filter(b => b.status === 'scheduled').length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-8">No upcoming batches scheduled.</p>
        ) : (
          <div className="space-y-3">
            {scheduledBatches
              .filter(b => b.status === 'scheduled')
              .slice(0, 10)
              .map(batch => (
                <div key={batch.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex justify-between items-center">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 mb-1">{batch.name}</div>
                    <div className="text-sm text-gray-500">
                      📅 {new Date(batch.scheduled_date).toLocaleDateString()}
                      {batch.scheduled_time && ` at ${batch.scheduled_time}`}
                      {batch.assigned_to_name && ` • 👤 ${batch.assigned_to_name}`}
                      • {batch.batch_size_multiplier}x
                    </div>
                    {batch.notes && <div className="text-xs text-gray-500 italic mt-1">{batch.notes}</div>}
                  </div>
                  <button 
                    onClick={async () => {
                      const { error } = await supabase
                        .from('scheduled_batches')
                        .update({ status: 'in_progress' })
                        .eq('id', batch.id);
                      if (!error) await fetchScheduledBatches();
                    }}
                    className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 transition-colors"
                  >
                    Start
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Schedule Batch Modal */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setScheduleModalOpen(false)}>
          <div className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold mb-6 text-gray-900">Schedule Batch</h3>

            <select
              value={scheduleFormData.workflow_id}
              onChange={(e) => setScheduleFormData({...scheduleFormData, workflow_id: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            >
              <option value="">Select workflow *</option>
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>{wf.name}</option>
              ))}
            </select>

            <select
              value={scheduleFormData.template_id}
              onChange={(e) => setScheduleFormData({...scheduleFormData, template_id: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            >
              <option value="">Use template (optional)</option>
              {batchTemplates
                .filter(t => t.workflow_id === scheduleFormData.workflow_id)
                .map(template => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
            </select>

            <input
              type="text"
              placeholder="Batch name *"
              value={scheduleFormData.name}
              onChange={(e) => setScheduleFormData({...scheduleFormData, name: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            />

            <div className="flex gap-2 mb-4">
              <input
                type="date"
                value={scheduleFormData.scheduled_date}
                onChange={(e) => setScheduleFormData({...scheduleFormData, scheduled_date: e.target.value})}
                className="flex-[2] p-3 border border-gray-300 rounded-lg"
              />
              <input
                type="time"
                value={scheduleFormData.scheduled_time}
                onChange={(e) => setScheduleFormData({...scheduleFormData, scheduled_time: e.target.value})}
                className="flex-1 p-3 border border-gray-300 rounded-lg"
              />
            </div>

            <input
              type="number"
              step="0.1"
              placeholder="Batch size multiplier"
              value={scheduleFormData.batch_size_multiplier || ''}
              onChange={(e) => setScheduleFormData({...scheduleFormData, batch_size_multiplier: parseFloat(e.target.value) || 1})}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            />

            {isPremium && networkMembers.length > 0 && (
              <select
                value={scheduleFormData.assigned_to}
                onChange={(e) => setScheduleFormData({...scheduleFormData, assigned_to: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4"
              >
                <option value="">Assign to (optional)</option>
                {networkMembers.map(member => (
                  <option key={member.id} value={member.user_id}>
                    {member.profiles?.device_name || member.profiles?.email}
                  </option>
                ))}
              </select>
            )}

            <textarea
              placeholder="Notes"
              value={scheduleFormData.notes}
              onChange={(e) => setScheduleFormData({...scheduleFormData, notes: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 min-h-[60px]"
            />

            <div className="flex gap-2">
              <button onClick={handleScheduleBatch} className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors">
                Schedule Batch
              </button>
              <button onClick={() => setScheduleModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}