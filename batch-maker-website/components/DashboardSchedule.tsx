import { useState, useEffect } from 'react';
import type { DashboardProps } from '../lib/dashboard-types';
import { getSupabaseClient } from '../lib/supabase';
import Modal from './Modal';

const supabase = getSupabaseClient();

interface Shift {
  id: string;
  owner_id: string;
  assigned_to: string;
  assigned_to_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  role: string | null;
  notes: string | null;
  status: 'scheduled' | 'cancelled' | 'completed' | 'holiday' | 'sick';
  created_at: string;
  updated_at: string;
}

interface TimeEntry {
  id: string;
  owner_id: string;
  user_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  total_hours: number | null;
  edited_by: string | null;
  edited_at: string | null;
  edit_reason: string | null;
  created_at: string;
}

interface ScheduleTemplate {
  id: string;
  owner_id: string;
  name: string;
  shifts: Array<{
    day_of_week: number;
    assigned_to: string;
    assigned_to_name: string;
    start_time: string;
    end_time: string;
    role: string | null;
    notes: string | null;
    status: string;
  }>;
  created_at: string;
}

interface HolidayRequest {
  id: string;
  owner_id: string;
  employee_id: string;
  type: 'holiday' | 'unpaid_leave';
  date_from: string;
  date_to: string;
  days: number;
  notes: string | null;
  status: 'pending' | 'approved' | 'declined';
  decline_reason: string | null;
  created_at: string;
}

// ── NEW: Recurring task definition ────────────────────────────────────────────
interface RecurringTask {
  id: string;
  owner_id: string;
  location_id: string | null;
  title: string;
  description: string | null;
  category: string;
  frequency: 'daily' | 'weekly' | 'specific_days';
  days_of_week: number[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface RecurringTaskForm {
  title: string;
  description: string;
  category: string;
  frequency: 'daily' | 'weekly' | 'specific_days';
  days_of_week: number[];
  location_id: string;
  active: boolean;
}

const EMPTY_RECURRING_TASK_FORM: RecurringTaskForm = {
  title: '',
  description: '',
  category: 'General',
  frequency: 'daily',
  days_of_week: [],
  location_id: '',
  active: true,
};

const RECURRING_CATEGORIES = [
  'General',
  'Cleaning',
  'Opening',
  'Closing',
  'Prep',
  'Safety',
  'Maintenance',
  'Admin',
];

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  holiday:   'Holiday',
  sick:      'Sick Day',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-green-50 border-green-200',
  completed: 'bg-cyan-50 border-cyan-200',
  cancelled: 'bg-gray-50 border-gray-200 opacity-60',
  holiday:   'bg-orange-50 border-orange-200',
  sick:      'bg-red-50 border-red-200',
};

const DOT_COLORS: Record<string, string> = {
  scheduled: 'bg-green-100 text-green-700',
  completed: 'bg-cyan-100 text-cyan-700',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
  holiday:   'bg-orange-100 text-orange-700',
  sick:      'bg-red-100 text-red-700',
};

const URL_TO_INTERNAL: Record<string, string> = {
  calendar:  'calendar',
  shifts:    'list',
  labour:    'labour',
  requests:  'requests',
  recurring: 'recurring',
};

const VALID_URL_TABS = ['calendar', 'shifts', 'labour', 'requests', 'recurring'] as const;
type UrlTab = typeof VALID_URL_TABS[number];
type InternalTab = 'calendar' | 'list' | 'labour' | 'requests' | 'recurring';

export default function DashboardSchedule({
  user,
  networkMembers,
  isPremium,
  locations = [],
  selectedLocationId = 'all',
  activeSubTab,
  onSubTabChange,
}: DashboardProps) {
  const selectedLocation = selectedLocationId !== 'all'
    ? locations.find((l: any) => l.id === selectedLocationId)
    : locations.find((l: any) => l.is_default) ?? locations[0];
  const currencySymbol = (selectedLocation as any)?.currency_symbol ?? '$';

  // ── Tab state ──────────────────────────────────────────────────────────────
  const resolvedUrlTab: UrlTab =
    VALID_URL_TABS.includes(activeSubTab as UrlTab)
      ? (activeSubTab as UrlTab)
      : 'calendar';
  const activeTab: InternalTab = (URL_TO_INTERNAL[resolvedUrlTab] as InternalTab) ?? 'calendar';

  function setActiveTab(urlTab: UrlTab) {
    if (onSubTabChange) onSubTabChange(urlTab);
  }

  // ── Employee selector ──────────────────────────────────────────────────────
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [createShiftModalOpen, setCreateShiftModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatingShift, setDuplicatingShift] = useState<Shift | null>(null);
  const [duplicateTargetDate, setDuplicateTargetDate] = useState('');
  const [duplicateTargetEmployees, setDuplicateTargetEmployees] = useState<string[]>([]);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [recurringShift, setRecurringShift] = useState<Shift | null>(null);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringWeeksAhead, setRecurringWeeksAhead] = useState(4);
  const [recurringEmployees, setRecurringEmployees] = useState<string[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateMode, setTemplateMode] = useState<'save' | 'apply'>('save');
  const [templateName, setTemplateName] = useState('');
  const [applyTemplateId, setApplyTemplateId] = useState('');
  const [applyTemplateWeekStart, setApplyTemplateWeekStart] = useState('');
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteEmployee, setBulkDeleteEmployee] = useState('all');
  const [bulkDeleteDateFrom, setBulkDeleteDateFrom] = useState('');
  const [bulkDeleteDateTo, setBulkDeleteDateTo] = useState('');
  const [bulkDeleteStatus, setBulkDeleteStatus] = useState('all');
  const [hourlyRates, setHourlyRates] = useState<Record<string, number>>({});
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [holidayAllowances, setHolidayAllowances] = useState<Record<string, { allowance: number }>>({});
  const [editingAllowance, setEditingAllowance] = useState<string | null>(null);
  const [allowanceInput, setAllowanceInput] = useState('');
  const [holidayRequests, setHolidayRequests] = useState<HolidayRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [decliningRequest, setDecliningRequest] = useState<HolidayRequest | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [requestFilter, setRequestFilter] = useState<'pending' | 'all'>('pending');
  const [clockingInId, setClockingInId] = useState<string | null>(null);

  // ── NEW: Recurring task state ──────────────────────────────────────────────
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [recurringTasksLoading, setRecurringTasksLoading] = useState(false);
  const [recurringTaskModalOpen, setRecurringTaskModalOpen] = useState(false);
  const [editingRecurringTask, setEditingRecurringTask] = useState<RecurringTask | null>(null);
  const [recurringTaskForm, setRecurringTaskForm] = useState<RecurringTaskForm>(EMPTY_RECURRING_TASK_FORM);
  const [savingRecurringTask, setSavingRecurringTask] = useState(false);

  const [shiftFormData, setShiftFormData] = useState({
    assigned_to: [] as string[],
    shift_date: '',
    start_time: '09:00',
    end_time: '17:00',
    role: '',
    notes: '',
    status: 'scheduled' as Shift['status'],
  });

  const [entryEditData, setEntryEditData] = useState({ clock_in: '', clock_out: '', edit_reason: '' });

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayOfWeekNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    if (!user || !isPremium) return;
    fetchShifts();
    fetchTimeEntries();
    fetchTemplates();
    fetchHourlyRates();
    fetchHolidayAllowances();
    fetchHolidayRequests();
    fetchRecurringTasks();
  }, [user, isPremium, selectedDate]);

  async function fetchShifts() {
    const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).toISOString().split('T')[0];
    const { data, error } = await supabase.from('shifts').select('*').eq('owner_id', user.id).gte('shift_date', startOfMonth).lte('shift_date', endOfMonth).order('shift_date').order('start_time');
    if (!error && data) setShifts(data);
  }

  async function fetchTimeEntries() {
    const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString();
    const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const { data, error } = await supabase.from('time_entries').select('*').eq('owner_id', user.id).gte('clock_in', startOfMonth).lte('clock_in', endOfMonth).order('clock_in', { ascending: false });
    if (!error && data) setTimeEntries(data);
  }

  async function fetchTemplates() {
    const { data } = await supabase.from('schedule_templates').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
    if (data) setTemplates(data);
  }

  async function fetchHourlyRates() {
    const { data } = await supabase.from('network_member_roles').select('user_id, hourly_rate').eq('owner_id', user.id);
    if (data) {
      const rates: Record<string, number> = {};
      data.forEach((r: any) => { if (r.hourly_rate) rates[r.user_id] = r.hourly_rate; });
      setHourlyRates(rates);
    }
  }

  async function fetchHolidayAllowances() {
    const { data } = await supabase.from('network_member_roles').select('user_id, holiday_allowance').eq('owner_id', user.id);
    if (data) {
      const allowances: Record<string, { allowance: number }> = {};
      data.forEach((r: any) => { allowances[r.user_id] = { allowance: r.holiday_allowance || 28 }; });
      setHolidayAllowances(allowances);
    }
  }

  async function fetchHolidayRequests() {
    setRequestsLoading(true);
    const { data } = await supabase.from('holiday_requests').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
    if (data) setHolidayRequests(data);
    setRequestsLoading(false);
  }

  // ── NEW: Fetch recurring task definitions ──────────────────────────────────
  async function fetchRecurringTasks() {
    setRecurringTasksLoading(true);
    const { data } = await supabase
      .from('recurring_tasks')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setRecurringTasks(data);
    setRecurringTasksLoading(false);
  }

  async function sendPushToEmployee(employeeId: string, title: string, body: string) {
    try {
      const { data: tokenRow } = await supabase.from('expo_push_tokens').select('token').eq('user_id', employeeId).single();
      if (!tokenRow?.token) return;
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: tokenRow.token, title, body, sound: 'default' }),
      });
    } catch (err) {
      console.error('Push notification failed:', err);
    }
  }

  // ── Clock in / out ─────────────────────────────────────────────────────────
  async function handleClockIn(memberId: string) {
    setClockingInId(memberId);
    const locationId = selectedLocationId !== 'all'
      ? selectedLocationId
      : (locations.find((l: any) => l.is_default) ?? locations[0])?.id;

    try {
      const { error } = await supabase.from('time_entries').insert({
        owner_id: user.id,
        user_id: memberId,
        clock_in: new Date().toISOString(),
        clock_out: null,
        total_hours: null,
        shift_id: null,
        location_id: locationId || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await fetchTimeEntries();
    } catch (err: any) {
      alert('Failed to clock in: ' + err.message);
    } finally {
      setClockingInId(null);
    }
  }

  async function handleClockOut(memberId: string) {
    setClockingInId(memberId);
    try {
      const openEntry = timeEntries.find(e => e.user_id === memberId && !e.clock_out);
      if (!openEntry) { alert('No open clock-in found for this employee.'); return; }
      const clockOut = new Date().toISOString();
      const totalHours = (new Date(clockOut).getTime() - new Date(openEntry.clock_in).getTime()) / 3600000;
      const { error } = await supabase.from('time_entries').update({
        clock_out: clockOut,
        total_hours: parseFloat(totalHours.toFixed(4)),
        updated_at: new Date().toISOString(),
      }).eq('id', openEntry.id);
      if (error) throw error;
      await fetchTimeEntries();
    } catch (err: any) {
      alert('Failed to clock out: ' + err.message);
    } finally {
      setClockingInId(null);
    }
  }

  async function handleApprove(request: HolidayRequest) {
    setProcessingRequestId(request.id);
    try {
      const { error } = await supabase.from('holiday_requests').update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', request.id);
      if (error) throw error;
      const employeeName = resolveUserName(request.employee_id);
      const inserts: any[] = [];
      const cur = new Date(request.date_from + 'T00:00:00');
      const end = new Date(request.date_to + 'T00:00:00');
      while (cur <= end) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) {
          inserts.push({ owner_id: user.id, assigned_to: request.employee_id, assigned_to_name: employeeName, shift_date: cur.toISOString().split('T')[0], start_time: '00:00', end_time: '00:00', role: null, notes: request.notes || null, status: request.type === 'holiday' ? 'holiday' : 'cancelled', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (inserts.length > 0) await supabase.from('shifts').insert(inserts);
      const typeLabel = request.type === 'holiday' ? 'Holiday' : 'Unpaid Leave';
      await sendPushToEmployee(request.employee_id, `${typeLabel} Approved`, `Your ${request.days} day${request.days !== 1 ? 's' : ''} off (${request.date_from} to ${request.date_to}) has been approved.`);
      await fetchHolidayRequests();
      await fetchShifts();
    } catch (err: any) {
      alert('Failed to approve request: ' + err.message);
    } finally {
      setProcessingRequestId(null);
    }
  }

  function openDeclineModal(request: HolidayRequest) {
    setDecliningRequest(request);
    setDeclineReason('');
    setDeclineModalOpen(true);
  }

  async function handleDecline() {
    if (!decliningRequest) return;
    setProcessingRequestId(decliningRequest.id);
    try {
      const { error } = await supabase.from('holiday_requests').update({ status: 'declined', reviewed_by: user.id, reviewed_at: new Date().toISOString(), decline_reason: declineReason.trim() || null }).eq('id', decliningRequest.id);
      if (error) throw error;
      const typeLabel = decliningRequest.type === 'holiday' ? 'Holiday' : 'Unpaid Leave';
      await sendPushToEmployee(decliningRequest.employee_id, `${typeLabel} Request Declined`, declineReason.trim() ? `Your request (${decliningRequest.date_from} to ${decliningRequest.date_to}) was declined: ${declineReason.trim()}` : `Your request (${decliningRequest.date_from} to ${decliningRequest.date_to}) was declined.`);
      setDeclineModalOpen(false);
      setDecliningRequest(null);
      setDeclineReason('');
      await fetchHolidayRequests();
    } catch (err: any) {
      alert('Failed to decline request: ' + err.message);
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function handleDeleteRequest(request: HolidayRequest) {
    const employeeName = resolveUserName(request.employee_id);
    const typeLabel = request.type === 'holiday' ? 'holiday' : 'unpaid leave';
    const confirmMsg = request.status === 'approved'
      ? `Delete this approved ${typeLabel} for ${employeeName}? This will also remove the associated shifts from the calendar.`
      : `Delete this ${typeLabel} request for ${employeeName}?`;
    if (!confirm(confirmMsg)) return;
    setProcessingRequestId(request.id);
    try {
      const { error } = await supabase.from('holiday_requests').delete().eq('id', request.id);
      if (error) throw error;
      if (request.status === 'approved') {
        await supabase.from('shifts').delete().eq('owner_id', user.id).eq('assigned_to', request.employee_id).in('status', ['holiday', 'cancelled']).gte('shift_date', request.date_from).lte('shift_date', request.date_to);
      }
      await fetchHolidayRequests();
      await fetchShifts();
    } catch (err: any) {
      alert('Failed to delete request: ' + err.message);
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function handleSaveHourlyRate(userId: string) {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0) { alert('Enter a valid rate'); return; }
    await supabase.from('network_member_roles').upsert({ owner_id: user.id, user_id: userId, hourly_rate: rate }, { onConflict: 'owner_id,user_id' });
    setHourlyRates(prev => ({ ...prev, [userId]: rate }));
    setEditingRate(null);
  }

  async function handleSaveAllowance(userId: string) {
    const days = parseInt(allowanceInput);
    if (isNaN(days) || days < 0) { alert('Enter a valid number of days'); return; }
    await supabase.from('network_member_roles').upsert({ owner_id: user.id, user_id: userId, holiday_allowance: days }, { onConflict: 'owner_id,user_id' });
    setHolidayAllowances(prev => ({ ...prev, [userId]: { allowance: days } }));
    setEditingAllowance(null);
  }

  // ── NEW: Recurring task CRUD ───────────────────────────────────────────────
  function openCreateRecurringTask() {
    setEditingRecurringTask(null);
    setRecurringTaskForm({
      ...EMPTY_RECURRING_TASK_FORM,
      location_id: selectedLocationId !== 'all' ? selectedLocationId : (locations[0]?.id ?? ''),
    });
    setRecurringTaskModalOpen(true);
  }

  function openEditRecurringTask(task: RecurringTask) {
    setEditingRecurringTask(task);
    setRecurringTaskForm({
      title: task.title,
      description: task.description ?? '',
      category: task.category,
      frequency: task.frequency,
      days_of_week: task.days_of_week ?? [],
      location_id: task.location_id ?? '',
      active: task.active,
    });
    setRecurringTaskModalOpen(true);
  }

  async function handleSaveRecurringTask() {
    if (!recurringTaskForm.title.trim()) {
      alert('Please enter a task title.');
      return;
    }
    if (
      (recurringTaskForm.frequency === 'weekly' || recurringTaskForm.frequency === 'specific_days') &&
      recurringTaskForm.days_of_week.length === 0
    ) {
      alert('Please select at least one day of the week.');
      return;
    }

    setSavingRecurringTask(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        owner_id:     user.id,
        location_id:  recurringTaskForm.location_id || null,
        title:        recurringTaskForm.title.trim(),
        description:  recurringTaskForm.description.trim() || null,
        category:     recurringTaskForm.category,
        frequency:    recurringTaskForm.frequency,
        days_of_week: recurringTaskForm.frequency === 'daily' ? [] : recurringTaskForm.days_of_week,
        active:       recurringTaskForm.active,
        updated_at:   now,
      };

      if (editingRecurringTask) {
        const { error } = await supabase
          .from('recurring_tasks')
          .update(payload)
          .eq('id', editingRecurringTask.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recurring_tasks')
          .insert({ ...payload, created_at: now });
        if (error) throw error;
      }

      setRecurringTaskModalOpen(false);
      setEditingRecurringTask(null);
      await fetchRecurringTasks();
    } catch (err: any) {
      alert('Failed to save task: ' + err.message);
    } finally {
      setSavingRecurringTask(false);
    }
  }

  async function handleDeleteRecurringTask(task: RecurringTask) {
    if (!confirm(`Permanently delete "${task.title}"? This will not affect completions already recorded.`)) return;
    const { error } = await supabase.from('recurring_tasks').delete().eq('id', task.id);
    if (error) { alert('Failed to delete task: ' + error.message); return; }
    await fetchRecurringTasks();
  }

  async function handleToggleRecurringTaskActive(task: RecurringTask) {
    const { error } = await supabase
      .from('recurring_tasks')
      .update({ active: !task.active, updated_at: new Date().toISOString() })
      .eq('id', task.id);
    if (error) { alert('Failed to update task: ' + error.message); return; }
    await fetchRecurringTasks();
  }

  function toggleRecurringFormDay(idx: number) {
    setRecurringTaskForm(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(idx)
        ? prev.days_of_week.filter(d => d !== idx)
        : [...prev.days_of_week, idx],
    }));
  }

  function resolveLocationName(locationId: string | null): string {
    if (!locationId) return 'All locations';
    const loc = locations.find((l: any) => l.id === locationId);
    return (loc as any)?.name ?? 'Unknown location';
  }

  function formatFrequency(task: RecurringTask): string {
    if (task.frequency === 'daily') return 'Every day';
    if (!task.days_of_week?.length) return task.frequency;
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return task.days_of_week.map(d => names[d]).join(', ');
  }

  const assignableMembers = [
    { id: user.id, label: 'You' },
    ...networkMembers.filter(m => m.user_id !== user.id).map(m => ({ id: m.user_id, label: m.profiles?.device_name || m.profiles?.email || 'Unknown' })),
  ];

  function resolveUserName(userId: string): string {
    if (userId === user.id) return 'You';
    const member = networkMembers.find(m => m.user_id === userId);
    return member?.profiles?.device_name || member?.profiles?.email || 'Unknown';
  }

  function calcHours(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
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

  const getShiftsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const all = shifts.filter(s => s.shift_date === dateStr);
    return selectedEmployeeId === 'all' ? all : all.filter(s => s.assigned_to === selectedEmployeeId);
  };

  const getTimeEntriesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const all = timeEntries.filter(e => e.clock_in.split('T')[0] === dateStr);
    return selectedEmployeeId === 'all' ? all : all.filter(e => e.user_id === selectedEmployeeId);
  };

  async function handleCreateShift() {
    if (!shiftFormData.assigned_to.length || !shiftFormData.shift_date || !shiftFormData.start_time || !shiftFormData.end_time) { alert('Please fill in all required fields'); return; }
    const inserts = shiftFormData.assigned_to.map(empId => ({ owner_id: user.id, assigned_to: empId, assigned_to_name: resolveUserName(empId), shift_date: shiftFormData.shift_date, start_time: shiftFormData.start_time, end_time: shiftFormData.end_time, role: shiftFormData.role || null, notes: shiftFormData.notes || null, status: shiftFormData.status, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('shifts').insert(inserts);
    if (error) { alert('Failed to create shift'); return; }
    await fetchShifts();
    setCreateShiftModalOpen(false);
    setShiftFormData({ assigned_to: [], shift_date: '', start_time: '09:00', end_time: '17:00', role: '', notes: '', status: 'scheduled' });
  }

  async function handleCancelShift(shiftId: string) {
    const { error } = await supabase.from('shifts').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', shiftId);
    if (error) { alert('Failed to cancel shift'); return; }
    await fetchShifts();
  }

  async function handleDeleteShift(shiftId: string) {
    if (!confirm('Permanently delete this shift?')) return;
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
    if (error) { alert('Failed to delete shift'); return; }
    await fetchShifts();
  }

  function openDuplicateModal(shift: Shift) {
    setDuplicatingShift(shift);
    setDuplicateTargetDate('');
    setDuplicateTargetEmployees([shift.assigned_to]);
    setDuplicateModalOpen(true);
  }

  async function handleDuplicateShift() {
    if (!duplicatingShift || !duplicateTargetDate || !duplicateTargetEmployees.length) { alert('Please select a target date and at least one employee'); return; }
    const inserts = duplicateTargetEmployees.map(empId => ({ owner_id: user.id, assigned_to: empId, assigned_to_name: resolveUserName(empId), shift_date: duplicateTargetDate, start_time: duplicatingShift.start_time, end_time: duplicatingShift.end_time, role: duplicatingShift.role || null, notes: duplicatingShift.notes || null, status: 'scheduled' as const, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('shifts').insert(inserts);
    if (error) { alert('Failed to duplicate shift'); return; }
    await fetchShifts();
    setDuplicateModalOpen(false);
    setDuplicatingShift(null);
    const newDate = new Date(duplicateTargetDate + 'T00:00:00');
    if (newDate.getMonth() !== selectedDate.getMonth() || newDate.getFullYear() !== selectedDate.getFullYear()) setSelectedDate(newDate);
  }

  function openRecurringModal(shift: Shift) {
    setRecurringShift(shift);
    setRecurringDays([new Date(shift.shift_date + 'T00:00:00').getDay()]);
    setRecurringWeeksAhead(4);
    setRecurringEmployees([shift.assigned_to]);
    setRecurringModalOpen(true);
  }

  async function handleCreateRecurring() {
    if (!recurringShift || !recurringDays.length || !recurringEmployees.length) { alert('Select at least one day and one employee'); return; }
    const inserts: any[] = [];
    const startDate = new Date(); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(); endDate.setDate(endDate.getDate() + recurringWeeksAhead * 7);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (recurringDays.includes(d.getDay())) {
        const dateStr = d.toISOString().split('T')[0];
        if (dateStr === recurringShift.shift_date) continue;
        for (const empId of recurringEmployees) {
          const exists = shifts.some(s => s.shift_date === dateStr && s.assigned_to === empId && s.start_time === recurringShift.start_time);
          if (!exists) inserts.push({ owner_id: user.id, assigned_to: empId, assigned_to_name: resolveUserName(empId), shift_date: dateStr, start_time: recurringShift.start_time, end_time: recurringShift.end_time, role: recurringShift.role || null, notes: recurringShift.notes || null, status: 'scheduled', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
      }
    }
    if (!inserts.length) { alert('No new shifts to create — all already exist.'); return; }
    const { error } = await supabase.from('shifts').insert(inserts);
    if (error) { alert('Failed to create recurring shifts'); return; }
    await fetchShifts();
    setRecurringModalOpen(false);
    setRecurringShift(null);
    alert(`Created ${inserts.length} recurring shift${inserts.length > 1 ? 's' : ''}!`);
  }

  async function handleEditTimeEntry() {
    if (!editingEntryId || !entryEditData.edit_reason) { alert('Edit reason is required'); return; }
    const updates: any = { edit_reason: entryEditData.edit_reason, edited_by: user.id, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (entryEditData.clock_in) updates.clock_in = entryEditData.clock_in;
    if (entryEditData.clock_out) updates.clock_out = entryEditData.clock_out;
    const { error } = await supabase.from('time_entries').update(updates).eq('id', editingEntryId);
    if (error) { alert('Failed to edit time entry'); return; }
    await fetchTimeEntries();
    setEditingEntryId(null);
    setEntryEditData({ clock_in: '', clock_out: '', edit_reason: '' });
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) { alert('Enter a template name'); return; }
    const dayOfWeek = selectedDate.getDay();
    const mon = new Date(selectedDate);
    mon.setDate(selectedDate.getDate() - ((dayOfWeek + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const monStr = mon.toISOString().split('T')[0];
    const sunStr = sun.toISOString().split('T')[0];
    const { data: weekShifts } = await supabase.from('shifts').select('*').eq('owner_id', user.id).gte('shift_date', monStr).lte('shift_date', sunStr).eq('status', 'scheduled');
    if (!weekShifts?.length) { alert('No scheduled shifts in the current week to save.'); return; }
    const templateShifts = weekShifts.map((s: any) => ({ day_of_week: new Date(s.shift_date + 'T00:00:00').getDay(), assigned_to: s.assigned_to, assigned_to_name: s.assigned_to_name, start_time: s.start_time, end_time: s.end_time, role: s.role || null, notes: s.notes || null, status: s.status }));
    const { error } = await supabase.from('schedule_templates').insert({ owner_id: user.id, name: templateName.trim(), shifts: templateShifts, created_at: new Date().toISOString() });
    if (error) { alert('Failed to save template'); return; }
    await fetchTemplates();
    setTemplateName('');
    setTemplateModalOpen(false);
    alert(`Template "${templateName}" saved with ${templateShifts.length} shifts!`);
  }

  async function handleApplyTemplate() {
    if (!applyTemplateId || !applyTemplateWeekStart) { alert('Select a template and a week start date'); return; }
    const template = templates.find(t => t.id === applyTemplateId);
    if (!template) return;
    const weekMon = new Date(applyTemplateWeekStart + 'T00:00:00');
    const inserts = template.shifts.map((s: any) => {
      const shiftDate = new Date(weekMon);
      const offset = s.day_of_week === 0 ? 6 : s.day_of_week - 1;
      shiftDate.setDate(weekMon.getDate() + offset);
      return { owner_id: user.id, assigned_to: s.assigned_to, assigned_to_name: s.assigned_to_name, shift_date: shiftDate.toISOString().split('T')[0], start_time: s.start_time, end_time: s.end_time, role: s.role || null, notes: s.notes || null, status: 'scheduled', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    });
    const { error } = await supabase.from('shifts').insert(inserts);
    if (error) { alert('Failed to apply template'); return; }
    await fetchShifts();
    setTemplateModalOpen(false);
    setSelectedDate(new Date(applyTemplateWeekStart + 'T00:00:00'));
    alert(`Applied "${template.name}" — ${inserts.length} shifts created!`);
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    await supabase.from('schedule_templates').delete().eq('id', id);
    await fetchTemplates();
  }

  async function handleBulkDelete() {
    if (!bulkDeleteDateFrom || !bulkDeleteDateTo) { alert('Select a date range'); return; }
    if (!confirm(`Permanently delete all matching shifts between ${bulkDeleteDateFrom} and ${bulkDeleteDateTo}? This cannot be undone.`)) return;
    let query = supabase.from('shifts').delete().eq('owner_id', user.id).gte('shift_date', bulkDeleteDateFrom).lte('shift_date', bulkDeleteDateTo);
    if (bulkDeleteEmployee !== 'all') query = (query as any).eq('assigned_to', bulkDeleteEmployee);
    if (bulkDeleteStatus !== 'all') query = (query as any).eq('status', bulkDeleteStatus);
    const { error } = await query;
    if (error) { alert('Failed to delete shifts'); return; }
    await fetchShifts();
    setBulkDeleteModalOpen(false);
    setBulkDeleteEmployee('all');
    setBulkDeleteDateFrom('');
    setBulkDeleteDateTo('');
    setBulkDeleteStatus('all');
    alert('Shifts deleted.');
  }

  function handleExportPrint() {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const monthName = monthNames[month];
    const allDays: Date[] = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) allDays.push(new Date(year, month, i));
    const membersToShow = selectedEmployeeId === 'all' ? assignableMembers : assignableMembers.filter(m => m.id === selectedEmployeeId);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Schedule — ${monthName} ${year}</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-bottom:24px}th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;border:1px solid #d1d5db}td{padding:5px 8px;border:1px solid #e5e7eb;vertical-align:top}.shift{margin-bottom:3px;padding:2px 4px;border-radius:3px;background:#dbeafe}.shift.holiday{background:#fed7aa}.shift.sick{background:#fecaca}.shift.cancelled{background:#f3f4f6;text-decoration:line-through;color:#9ca3af}@media print{button{display:none}}</style></head><body><h1>Schedule — ${monthName} ${year}</h1><p>Generated ${new Date().toLocaleDateString()}</p><table><thead><tr><th>Date</th>${membersToShow.map(m => `<th>${m.label}</th>`).join('')}</tr></thead><tbody>${allDays.map(date => { const dateStr = date.toISOString().split('T')[0]; const dayShifts = shifts.filter(s => s.shift_date === dateStr); return `<tr><td><strong>${dayOfWeekNames[date.getDay()]}</strong> ${date.getDate()}</td>${membersToShow.map(m => { const ms = dayShifts.filter(s => s.assigned_to === m.id); if (!ms.length) return '<td></td>'; return `<td>${ms.map(s => `<div class="shift ${s.status}">${s.status==='holiday'?'Holiday':s.status==='sick'?'Sick':`${s.start_time}–${s.end_time}`}</div>`).join('')}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table><button onclick="window.print()">Print</button></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) win.focus();
  }

  const labourStats = assignableMembers.map(member => {
    const memberShifts = shifts.filter(s => s.assigned_to === member.id && s.status === 'scheduled');
    const memberEntries = timeEntries.filter(e => e.user_id === member.id);
    const scheduledHours = memberShifts.reduce((sum, s) => sum + calcHours(s.start_time, s.end_time), 0);
    const actualHours = memberEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
    const holidayCount = shifts.filter(s => s.assigned_to === member.id && s.status === 'holiday').length;
    const sickCount = shifts.filter(s => s.assigned_to === member.id && s.status === 'sick').length;
    const rate = hourlyRates[member.id] || 0;
    const labourCost = actualHours * rate;
    const allowance = holidayAllowances[member.id]?.allowance ?? 28;
    return { ...member, scheduledHours, actualHours, holidayCount, sickCount, shiftCount: memberShifts.length, rate, labourCost, allowance };
  });

  const calendarDays = getCalendarDays();
  const dayDetailShifts = selectedDayDate ? getShiftsForDate(selectedDayDate) : [];
  const dayDetailTimeEntries = selectedDayDate ? getTimeEntriesForDate(selectedDayDate) : [];

  const filteredRequests = requestFilter === 'pending'
    ? holidayRequests.filter(r => r.status === 'pending')
    : holidayRequests;
  const pendingCount = holidayRequests.filter(r => r.status === 'pending').length;

  const focusedEmployee = selectedEmployeeId !== 'all'
    ? assignableMembers.find(m => m.id === selectedEmployeeId) ?? null
    : null;
  const focusedStat = focusedEmployee ? labourStats.find(s => s.id === focusedEmployee.id) : null;
  const focusedIsOnline = focusedEmployee
    ? timeEntries.some(e => e.user_id === focusedEmployee.id && !e.clock_out)
    : false;
  const focusedOpenEntry = focusedEmployee
    ? timeEntries.find(e => e.user_id === focusedEmployee.id && !e.clock_out)
    : null;

  if (!isPremium) {
    return (
      <div className="bg-white/90 rounded-xl p-6 shadow-sm text-center">
        <p className="text-gray-500">Schedule management is available for Premium accounts only.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── EMPLOYEE SELECTOR + TEAM STATUS PANEL ──────────────────────────── */}
      <div className="bg-white/90 rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">

        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</span>
          <div className="flex items-center gap-2 ml-auto">
            {selectedEmployeeId !== 'all' && (
              <button
                onClick={() => setSelectedEmployeeId('all')}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
              >
                Clear filter
              </button>
            )}
            <select
              value={selectedEmployeeId}
              onChange={e => {
                setSelectedEmployeeId(e.target.value);
                setSelectedDayDate(null);
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <option value="all">All employees</option>
              {assignableMembers.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {focusedEmployee && focusedStat ? (
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${focusedIsOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div>
                  <div className="font-semibold text-gray-900">{focusedEmployee.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {focusedStat.shiftCount} shift{focusedStat.shiftCount !== 1 ? 's' : ''} this month
                    &nbsp;&middot;&nbsp;{focusedStat.scheduledHours.toFixed(1)}h scheduled
                    &nbsp;&middot;&nbsp;{focusedStat.actualHours.toFixed(1)}h clocked
                  </div>
                  {focusedIsOnline && focusedOpenEntry && (
                    <div className="text-xs text-green-600 mt-1 font-medium">
                      Clocked in at {new Date(focusedOpenEntry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {(focusedStat.holidayCount > 0 || focusedStat.sickCount > 0) && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {focusedStat.holidayCount > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">{focusedStat.holidayCount}d holiday</span>}
                      {focusedStat.sickCount > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">{focusedStat.sickCount}d sick</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {focusedIsOnline ? (
                  <button
                    onClick={() => handleClockOut(focusedEmployee.id)}
                    disabled={clockingInId === focusedEmployee.id}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {clockingInId === focusedEmployee.id ? 'Saving...' : 'Clock Out'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleClockIn(focusedEmployee.id)}
                    disabled={clockingInId === focusedEmployee.id}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {clockingInId === focusedEmployee.id ? 'Saving...' : 'Clock In'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShiftFormData(prev => ({ ...prev, assigned_to: [focusedEmployee.id] }));
                    setCreateShiftModalOpen(true);
                  }}
                  className="px-4 py-2 bg-cyan-100 text-cyan-700 rounded-lg text-sm font-semibold hover:bg-cyan-200 transition-colors"
                >
                  + Add Shift
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              The calendar below shows only {focusedEmployee.label === 'You' ? 'your' : `${focusedEmployee.label}'s`} shifts.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-7 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
              <div className="col-span-2">Employee</div>
              <div className="text-right">Shifts</div>
              <div className="text-right">Scheduled</div>
              <div className="text-right">Clocked</div>
              <div className="text-right">Status</div>
              <div className="text-right">Actions</div>
            </div>
            {assignableMembers.map((member, i) => {
              const stat = labourStats.find(s => s.id === member.id);
              const isOnline = timeEntries.some(e => e.user_id === member.id && !e.clock_out);
              const isProcessing = clockingInId === member.id;
              return (
                <div
                  key={member.id}
                  className={`grid grid-cols-2 sm:grid-cols-7 px-4 py-2.5 text-sm items-center ${i !== 0 ? 'border-t border-gray-100' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <div className="col-span-2 flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <button
                      className="font-medium text-gray-900 hover:text-cyan-600 transition-colors text-left"
                      onClick={() => { setSelectedEmployeeId(member.id); setSelectedDayDate(null); }}
                    >
                      {member.label}
                    </button>
                    {(stat?.holidayCount || 0) > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">{stat!.holidayCount}d holiday</span>}
                    {(stat?.sickCount || 0) > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">{stat!.sickCount}d sick</span>}
                  </div>
                  <div className="text-right text-gray-600">{stat?.shiftCount || 0}</div>
                  <div className="text-right text-gray-600">{stat?.scheduledHours.toFixed(1)}h</div>
                  <div className="text-right text-gray-600">{stat?.actualHours.toFixed(1)}h</div>
                  <div className="text-right">
                    {isOnline
                      ? <span className="text-xs text-green-600 font-medium">Clocked In</span>
                      : <span className="text-xs text-gray-400">—</span>}
                  </div>
                  <div className="text-right">
                    {isOnline ? (
                      <button onClick={() => handleClockOut(member.id)} disabled={isProcessing} className="px-2.5 py-1 bg-red-100 text-red-600 rounded text-xs font-semibold hover:bg-red-200 transition-colors disabled:opacity-50">
                        {isProcessing ? '...' : 'Clock Out'}
                      </button>
                    ) : (
                      <button onClick={() => handleClockIn(member.id)} disabled={isProcessing} className="px-2.5 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold hover:bg-green-200 transition-colors disabled:opacity-50">
                        {isProcessing ? '...' : 'Clock In'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── REQUESTS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <div className="bg-white/90 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Time Off Requests</h2>
              {pendingCount > 0 && <p className="text-sm text-orange-600 mt-0.5">{pendingCount} request{pendingCount !== 1 ? 's' : ''} awaiting review</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRequestFilter('pending')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${requestFilter === 'pending' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Pending {pendingCount > 0 && `(${pendingCount})`}</button>
              <button onClick={() => setRequestFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${requestFilter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</button>
              <button onClick={fetchHolidayRequests} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">Refresh</button>
            </div>
          </div>
          {requestsLoading ? (
            <div className="text-center py-12 text-gray-400">Loading requests...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12"><p className="text-gray-400 text-sm italic">{requestFilter === 'pending' ? 'No pending requests.' : 'No requests yet.'}</p></div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map(req => {
                const employeeName = resolveUserName(req.employee_id);
                const isProcessing = processingRequestId === req.id;
                return (
                  <div key={req.id} className={`rounded-xl border p-4 ${req.status === 'pending' ? 'border-orange-200 bg-orange-50' : req.status === 'approved' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-900">{employeeName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${req.type === 'holiday' ? 'bg-cyan-100 text-cyan-700' : 'bg-purple-100 text-purple-700'}`}>{req.type === 'holiday' ? 'Holiday' : 'Unpaid Leave'}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${req.status === 'pending' ? 'bg-orange-200 text-orange-700' : req.status === 'approved' ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'}`}>{req.status === 'pending' ? 'Pending' : req.status === 'approved' ? 'Approved' : 'Declined'}</span>
                        </div>
                        <div className="text-sm text-gray-700 mb-1">
                          <span className="font-medium">{req.date_from}</span>
                          {req.date_from !== req.date_to && <span> to <span className="font-medium">{req.date_to}</span></span>}
                          <span className="text-gray-500 ml-2">· {req.days} working day{req.days !== 1 ? 's' : ''}</span>
                        </div>
                        {req.notes && <p className="text-sm text-gray-600 italic mt-1">"{req.notes}"</p>}
                        {req.status === 'declined' && req.decline_reason && <p className="text-sm text-red-600 mt-1">Declined: {req.decline_reason}</p>}
                        <p className="text-xs text-gray-400 mt-1">Submitted {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                        {req.status === 'pending' && (
                          <>
                            <button onClick={() => handleApprove(req)} disabled={isProcessing} className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition-colors disabled:opacity-50">{isProcessing ? '...' : 'Approve'}</button>
                            <button onClick={() => openDeclineModal(req)} disabled={isProcessing} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-200 transition-colors disabled:opacity-50">Decline</button>
                          </>
                        )}
                        <button onClick={() => handleDeleteRequest(req)} disabled={isProcessing} className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm font-semibold hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50">{isProcessing ? '...' : 'Delete'}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CALENDAR TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'calendar' && (
        <>
          <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Shift Schedule
                  {focusedEmployee && (
                    <span className="ml-2 text-sm font-normal text-cyan-600">— {focusedEmployee.label}</span>
                  )}
                </h2>
                {focusedEmployee && (
                  <p className="text-xs text-gray-400 mt-0.5">Showing shifts for {focusedEmployee.label} only. Use the dropdown above to switch employee or view all.</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setTemplateMode('apply'); setTemplateModalOpen(true); }} className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200 transition-colors">Load Template</button>
                <button onClick={() => { setTemplateMode('save'); setTemplateModalOpen(true); }} className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors">Save Week</button>
                <button onClick={handleExportPrint} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Print</button>
                <button onClick={() => setBulkDeleteModalOpen(true)} className="px-3 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors">Bulk Delete</button>
                <button onClick={() => setCreateShiftModalOpen(true)} className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 transition-colors">+ Create Shift</button>
              </div>
            </div>
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors">Previous</button>
              <h3 className="text-lg font-semibold text-gray-900">{monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}</h3>
              <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors">Next</button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {dayOfWeekNames.map(day => (
                <div key={day} className="p-2 text-center font-semibold text-xs text-gray-500 uppercase">{day}</div>
              ))}
              {calendarDays.map((date, index) => {
                if (!date) return <div key={`empty-${index}`} className="aspect-square bg-gray-50 rounded-md" />;
                const shiftsOnDay = getShiftsForDate(date);
                const isToday = date.toDateString() === new Date().toDateString();
                const isSelected = selectedDayDate && date.toDateString() === selectedDayDate.toDateString();
                const hasHoliday = shiftsOnDay.some(s => s.status === 'holiday');
                const hasSick = shiftsOnDay.some(s => s.status === 'sick');
                return (
                  <div
                    key={date.toISOString()}
                    onClick={() => setSelectedDayDate(isSelected ? null : date)}
                    className={`aspect-square border rounded-md p-1.5 relative overflow-hidden cursor-pointer transition-all ${
                      isSelected ? 'bg-cyan-50 border-cyan-500 ring-2 ring-cyan-200'
                      : hasHoliday ? 'bg-orange-50 border-orange-200 hover:border-orange-400'
                      : hasSick ? 'bg-red-50 border-red-200 hover:border-red-400'
                      : shiftsOnDay.length > 0 ? 'bg-white border-gray-200 hover:border-cyan-300 hover:bg-cyan-50'
                      : isToday ? 'bg-sky-50 border-sky-300'
                      : 'bg-white border-gray-100'
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-sky-600' : 'text-gray-700'}`}>{date.getDate()}</div>
                    {shiftsOnDay.length > 0 && (
                      <div className="absolute top-1 right-1 bg-cyan-500 text-white rounded-full flex items-center justify-center" style={{ width: '18px', height: '18px', fontSize: '9px', fontWeight: 600 }}>
                        {shiftsOnDay.length}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {shiftsOnDay.slice(0, 2).map(shift => (
                        <div key={shift.id} className={`text-[9px] px-1 py-0.5 rounded whitespace-nowrap overflow-hidden text-ellipsis ${DOT_COLORS[shift.status] || 'bg-green-100 text-green-700'}`}>
                          {shift.status === 'holiday' ? 'Holiday' : shift.status === 'sick' ? 'Sick' : shift.start_time.slice(0, 5)} {shift.assigned_to_name}
                        </div>
                      ))}
                      {shiftsOnDay.length > 2 && <div className="text-[9px] text-gray-500 italic px-1">+{shiftsOnDay.length - 2}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedDayDate && (
            <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm border border-cyan-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedDayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h2>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => {
                      setShiftFormData(prev => ({
                        ...prev,
                        shift_date: selectedDayDate.toISOString().split('T')[0],
                        assigned_to: focusedEmployee ? [focusedEmployee.id] : [],
                      }));
                      setCreateShiftModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-cyan-500 text-white rounded-md text-xs font-medium hover:bg-cyan-600 transition-colors"
                  >
                    + Add Shift
                  </button>
                  <button onClick={() => setSelectedDayDate(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">x</button>
                </div>
              </div>
              {dayDetailShifts.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Shifts</h3>
                  <div className="space-y-2">
                    {dayDetailShifts.map(shift => (
                      <div key={shift.id} className={`p-3 rounded-lg border ${STATUS_COLORS[shift.status] || 'bg-white border-gray-200'}`}>
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 text-sm">{shift.assigned_to_name}</div>
                            <div className="text-xs text-gray-600">
                              {shift.status === 'holiday' ? 'Holiday' : shift.status === 'sick' ? 'Sick Day' : `${shift.start_time} – ${shift.end_time} (${calcHours(shift.start_time, shift.end_time).toFixed(1)}h)`}
                              {shift.role && ` • ${shift.role}`}
                            </div>
                            {shift.notes && <div className="text-xs text-gray-500 italic mt-1">{shift.notes}</div>}
                            <div className="text-xs mt-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${shift.status === 'holiday' ? 'bg-orange-100 text-orange-700' : shift.status === 'sick' ? 'bg-red-100 text-red-700' : shift.status === 'cancelled' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                                {STATUS_LABELS[shift.status] || shift.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                            {shift.status === 'scheduled' && (
                              <>
                                <button onClick={() => openDuplicateModal(shift)} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200">Copy</button>
                                <button onClick={() => openRecurringModal(shift)} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200">Repeat</button>
                                <button onClick={() => handleCancelShift(shift.id)} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs font-medium hover:bg-red-200">Cancel</button>
                              </>
                            )}
                            <button onClick={() => handleDeleteShift(shift.id)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300">Delete</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {dayDetailTimeEntries.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Time Entries</h3>
                  <div className="space-y-2">
                    {dayDetailTimeEntries.map(entry => {
                      const isEditing = editingEntryId === entry.id;
                      if (isEditing) {
                        return (
                          <div key={entry.id} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="mb-2 text-xs font-semibold text-yellow-700">Edit Time Entry</div>
                            <div className="flex gap-2 mb-2">
                              <div className="flex-1">
                                <label className="text-xs text-gray-600 block mb-1">Clock In</label>
                                <input type="datetime-local" value={entryEditData.clock_in} onChange={e => setEntryEditData({ ...entryEditData, clock_in: e.target.value })} className="w-full p-2 text-xs border border-gray-300 rounded" />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs text-gray-600 block mb-1">Clock Out</label>
                                <input type="datetime-local" value={entryEditData.clock_out} onChange={e => setEntryEditData({ ...entryEditData, clock_out: e.target.value })} className="w-full p-2 text-xs border border-gray-300 rounded" />
                              </div>
                            </div>
                            <input type="text" placeholder="Reason for edit *" value={entryEditData.edit_reason} onChange={e => setEntryEditData({ ...entryEditData, edit_reason: e.target.value })} className="w-full p-2 text-xs border border-gray-300 rounded mb-2" />
                            <div className="flex gap-2">
                              <button onClick={handleEditTimeEntry} className="flex-1 px-3 py-1.5 bg-yellow-500 text-white rounded text-xs font-medium hover:bg-yellow-600">Save</button>
                              <button onClick={() => setEditingEntryId(null)} className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200">Cancel</button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={entry.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex justify-between items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{resolveUserName(entry.user_id)}</div>
                            <div className="text-xs text-gray-600">
                              In: {new Date(entry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {entry.clock_out ? ` · Out: ${new Date(entry.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' · Still clocked in'}
                              {entry.total_hours ? ` · ${entry.total_hours.toFixed(2)}h` : ''}
                            </div>
                            {entry.edited_at && <div className="text-[10px] text-orange-600 mt-0.5">Edited: {entry.edit_reason}</div>}
                          </div>
                          <button
                            onClick={() => { setEditingEntryId(entry.id); setEntryEditData({ clock_in: new Date(entry.clock_in).toISOString().slice(0, 16), clock_out: entry.clock_out ? new Date(entry.clock_out).toISOString().slice(0, 16) : '', edit_reason: '' }); }}
                            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200"
                          >
                            Edit
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {dayDetailShifts.length === 0 && dayDetailTimeEntries.length === 0 && (
                <p className="text-gray-400 text-sm italic text-center py-6">Nothing scheduled for this day.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── ALL SHIFTS TAB ───────────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <div className="bg-white/90 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
            <h2 className="text-xl font-semibold text-gray-900">
              All Shifts — {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
              {focusedEmployee && <span className="ml-2 text-sm font-normal text-cyan-600">— {focusedEmployee.label}</span>}
            </h2>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleExportPrint} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Print</button>
              <button onClick={() => setBulkDeleteModalOpen(true)} className="px-3 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors">Bulk Delete</button>
              <button onClick={() => setCreateShiftModalOpen(true)} className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 transition-colors">+ Create Shift</button>
            </div>
          </div>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">Previous Month</button>
            <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">Next Month</button>
          </div>
          {(() => {
            const visibleShifts = selectedEmployeeId === 'all'
              ? shifts
              : shifts.filter(s => s.assigned_to === selectedEmployeeId);
            return visibleShifts.length === 0 ? (
              <p className="text-gray-400 text-sm italic text-center py-8">No shifts this month{focusedEmployee ? ` for ${focusedEmployee.label}` : ''}.</p>
            ) : (
              <div className="space-y-2">
                {[...visibleShifts].sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time)).map(shift => (
                  <div key={shift.id} className={`p-3 rounded-lg border flex justify-between items-center gap-3 ${STATUS_COLORS[shift.status] || 'bg-white border-gray-200'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{shift.assigned_to_name}</span>
                        <span className="text-gray-500 text-xs">
                          {new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {shift.status !== 'holiday' && shift.status !== 'sick' && ` · ${shift.start_time}–${shift.end_time} (${calcHours(shift.start_time, shift.end_time).toFixed(1)}h)`}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${shift.status === 'holiday' ? 'bg-orange-100 text-orange-700' : shift.status === 'sick' ? 'bg-red-100 text-red-700' : shift.status === 'cancelled' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                          {STATUS_LABELS[shift.status]}
                        </span>
                        {shift.role && <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded">{shift.role}</span>}
                      </div>
                      {shift.notes && <div className="text-xs text-gray-500 italic mt-0.5">{shift.notes}</div>}
                    </div>
                    <div className="flex gap-1.5">
                      {shift.status === 'scheduled' && (
                        <>
                          <button onClick={() => openDuplicateModal(shift)} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200">Copy</button>
                          <button onClick={() => openRecurringModal(shift)} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200">Repeat</button>
                          <button onClick={() => handleCancelShift(shift.id)} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs font-medium hover:bg-red-200">Cancel</button>
                        </>
                      )}
                      <button onClick={() => handleDeleteShift(shift.id)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── LABOUR REPORT TAB ────────────────────────────────────────────── */}
      {activeTab === 'labour' && (
        <div className="space-y-6">
          <div className="bg-white/90 rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h2 className="text-xl font-semibold text-gray-900">Labour Report — {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}</h2>
              <div className="flex gap-2">
                <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">Previous</button>
                <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">Next</button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-cyan-50 rounded-lg p-4 text-center"><div className="text-2xl font-bold text-cyan-700">{labourStats.reduce((sum, s) => sum + s.scheduledHours, 0).toFixed(1)}h</div><div className="text-xs text-cyan-600">Scheduled Hours</div></div>
              <div className="bg-green-50 rounded-lg p-4 text-center"><div className="text-2xl font-bold text-green-700">{labourStats.reduce((sum, s) => sum + s.actualHours, 0).toFixed(1)}h</div><div className="text-xs text-green-600">Actual Hours</div></div>
              <div className="bg-orange-50 rounded-lg p-4 text-center"><div className="text-2xl font-bold text-orange-700">{labourStats.reduce((sum, s) => sum + s.holidayCount, 0)}</div><div className="text-xs text-orange-600">Holiday Days</div></div>
              <div className="bg-purple-50 rounded-lg p-4 text-center"><div className="text-2xl font-bold text-purple-700">{currencySymbol}{labourStats.reduce((sum, s) => sum + s.labourCost, 0).toFixed(2)}</div><div className="text-xs text-purple-600">Est. Labour Cost</div></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Employee</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Shifts</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Sched. Hours</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Actual Hours</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Rate/hr</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Labour Cost</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Holiday</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Sick</th>
                  </tr>
                </thead>
                <tbody>
                  {labourStats.map(stat => (
                    <tr key={stat.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-900">{stat.label}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{stat.shiftCount}</td>
                      <td className="py-2 px-3 text-right text-cyan-700 font-medium">{stat.scheduledHours.toFixed(1)}h</td>
                      <td className="py-2 px-3 text-right text-green-700 font-medium">{stat.actualHours.toFixed(1)}h</td>
                      <td className="py-2 px-3 text-right">
                        {editingRate === stat.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-gray-500">{currencySymbol}</span>
                            <input type="number" min="0" step="0.01" value={rateInput} onChange={e => setRateInput(e.target.value)} className="w-16 p-1 text-xs border border-gray-300 rounded text-right" autoFocus />
                            <button onClick={() => handleSaveHourlyRate(stat.id)} className="text-green-600 hover:text-green-700 text-xs font-medium ml-1">Save</button>
                            <button onClick={() => setEditingRate(null)} className="text-gray-400 hover:text-gray-600 text-xs ml-1">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingRate(stat.id); setRateInput(String(stat.rate || '')); }} className="text-gray-600 hover:text-cyan-600 transition-colors">
                            {stat.rate ? `${currencySymbol}${stat.rate.toFixed(2)}` : <span className="text-gray-400 italic text-xs">Set rate</span>}
                          </button>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-purple-700 font-medium">{stat.rate ? `${currencySymbol}${stat.labourCost.toFixed(2)}` : '—'}</td>
                      <td className="py-2 px-3 text-right text-orange-700">{stat.holidayCount || '—'}</td>
                      <td className="py-2 px-3 text-right text-red-700">{stat.sickCount || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="py-2 px-3 text-gray-900">Total</td>
                    <td className="py-2 px-3 text-right text-gray-900">{labourStats.reduce((s, r) => s + r.shiftCount, 0)}</td>
                    <td className="py-2 px-3 text-right text-cyan-700">{labourStats.reduce((s, r) => s + r.scheduledHours, 0).toFixed(1)}h</td>
                    <td className="py-2 px-3 text-right text-green-700">{labourStats.reduce((s, r) => s + r.actualHours, 0).toFixed(1)}h</td>
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3 text-right text-purple-700">{currencySymbol}{labourStats.reduce((s, r) => s + r.labourCost, 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-orange-700">{labourStats.reduce((s, r) => s + r.holidayCount, 0)}</td>
                    <td className="py-2 px-3 text-right text-red-700">{labourStats.reduce((s, r) => s + r.sickCount, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-4">* Labour cost = actual clocked hours x hourly rate. Click a rate to edit.</p>
          </div>

          <div className="bg-white/90 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Holiday Allowance</h2>
            <p className="text-sm text-gray-500 mb-4">Track annual holiday entitlement per employee.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Employee</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Allowance (days/yr)</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Used This Month</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Sick Days</th>
                  </tr>
                </thead>
                <tbody>
                  {labourStats.map(stat => {
                    const allowance = holidayAllowances[stat.id]?.allowance ?? 28;
                    return (
                      <tr key={stat.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-900">{stat.label}</td>
                        <td className="py-2 px-3 text-right">
                          {editingAllowance === stat.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input type="number" min="0" value={allowanceInput} onChange={e => setAllowanceInput(e.target.value)} className="w-16 p-1 text-xs border border-gray-300 rounded text-right" autoFocus />
                              <button onClick={() => handleSaveAllowance(stat.id)} className="text-green-600 hover:text-green-700 text-xs font-medium ml-1">Save</button>
                              <button onClick={() => setEditingAllowance(null)} className="text-gray-400 text-xs ml-1">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingAllowance(stat.id); setAllowanceInput(String(allowance)); }} className="text-gray-700 hover:text-cyan-600 font-medium transition-colors">{allowance} days</button>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className={`font-medium ${stat.holidayCount > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{stat.holidayCount || 0} day{stat.holidayCount !== 1 ? 's' : ''}</span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className={`font-medium ${stat.sickCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{stat.sickCount || 0} day{stat.sickCount !== 1 ? 's' : ''}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">* Click allowance to edit. Full year tracking coming soon.</p>
          </div>
        </div>
      )}

      {/* ── RECURRING TASKS TAB ───────────────────────────────────────────── */}
      {activeTab === 'recurring' && (
        <div className="bg-white/90 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Recurring Tasks</h2>
              <p className="text-sm text-gray-500 mt-0.5">Tasks that appear on the daily task board for clocked-in staff.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchRecurringTasks} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Refresh</button>
              <button onClick={openCreateRecurringTask} className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors">+ Add Task</button>
            </div>
          </div>

          {recurringTasksLoading ? (
            <div className="text-center py-12 text-gray-400">Loading tasks...</div>
          ) : recurringTasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm italic">No recurring tasks yet.</p>
              <p className="text-gray-400 text-xs mt-1">Add tasks to give your team a daily checklist when they clock in.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recurringTasks.map(task => (
                <div
                  key={task.id}
                  className={`rounded-xl border p-4 flex items-start justify-between gap-4 flex-wrap ${task.active ? 'border-cyan-200 bg-cyan-50' : 'border-gray-200 bg-gray-50 opacity-60'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-gray-900">{task.title}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full font-medium">{task.category}</span>
                      {!task.active && <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full font-medium">Inactive</span>}
                    </div>
                    {task.description && (
                      <p className="text-sm text-gray-600 mb-1">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-gray-500">{formatFrequency(task)}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{resolveLocationName(task.location_id)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggleRecurringTaskActive(task)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${task.active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'}`}
                    >
                      {task.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => openEditRecurringTask(task)}
                      className="px-3 py-1.5 bg-cyan-100 text-cyan-700 rounded-lg text-xs font-semibold hover:bg-cyan-200 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRecurringTask(task)}
                      className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-200 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ───────────────────────────────────────────────────────── */}

      {/* CREATE SHIFT */}
      <Modal isOpen={createShiftModalOpen} onClose={() => setCreateShiftModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-xl font-semibold mb-6 text-gray-900">Create Shift</h3>
          <label className="block text-sm font-medium text-gray-700 mb-2">Shift Type</label>
          <select value={shiftFormData.status} onChange={e => setShiftFormData({ ...shiftFormData, status: e.target.value as Shift['status'] })} className="w-full p-3 border border-gray-300 rounded-lg mb-4">
            <option value="scheduled">Scheduled Shift</option>
            <option value="holiday">Holiday / Day Off</option>
            <option value="sick">Sick Day</option>
          </select>
          <label className="block text-sm font-medium text-gray-700 mb-2">Assign To * (select multiple)</label>
          <div className="border border-gray-300 rounded-lg mb-4 max-h-40 overflow-y-auto">
            {assignableMembers.map(m => (
              <label key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={shiftFormData.assigned_to.includes(m.id)} onChange={e => setShiftFormData(prev => ({ ...prev, assigned_to: e.target.checked ? [...prev.assigned_to, m.id] : prev.assigned_to.filter(id => id !== m.id) }))} className="rounded" />
                <span className="text-sm text-gray-700">{m.label}</span>
              </label>
            ))}
          </div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
          <input type="date" value={shiftFormData.shift_date} onChange={e => setShiftFormData({ ...shiftFormData, shift_date: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg mb-4" />
          {shiftFormData.status === 'scheduled' && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
              <div className="flex gap-2 mb-4">
                <input type="time" value={shiftFormData.start_time} onChange={e => setShiftFormData({ ...shiftFormData, start_time: e.target.value })} className="flex-1 p-3 border border-gray-300 rounded-lg" />
                <span className="self-center text-gray-400">to</span>
                <input type="time" value={shiftFormData.end_time} onChange={e => setShiftFormData({ ...shiftFormData, end_time: e.target.value })} className="flex-1 p-3 border border-gray-300 rounded-lg" />
              </div>
              <input type="text" placeholder="Role (e.g. Baker, Front of House)" value={shiftFormData.role} onChange={e => setShiftFormData({ ...shiftFormData, role: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg mb-4" />
            </>
          )}
          <textarea placeholder="Notes (optional)" value={shiftFormData.notes} onChange={e => setShiftFormData({ ...shiftFormData, notes: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg mb-6 min-h-[60px]" />
          {shiftFormData.assigned_to.length > 1 && <p className="text-xs text-cyan-600 mb-4">Creating {shiftFormData.assigned_to.length} shifts — one per selected employee.</p>}
          <div className="flex gap-2">
            <button onClick={handleCreateShift} className="flex-1 px-4 py-3 bg-cyan-500 text-white rounded-lg font-medium hover:bg-cyan-600 transition-colors">Create Shift</button>
            <button onClick={() => setCreateShiftModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* DUPLICATE SHIFT */}
      <Modal isOpen={duplicateModalOpen && !!duplicatingShift} onClose={() => setDuplicateModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-2 text-gray-900">Copy Shift to Another Day</h3>
          <p className="text-sm text-gray-500 mb-6">Copying <strong>{duplicatingShift?.start_time}–{duplicatingShift?.end_time}</strong> shift.</p>
          <label className="block text-sm font-medium text-gray-700 mb-2">Target Date *</label>
          <input type="date" value={duplicateTargetDate} onChange={e => setDuplicateTargetDate(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg mb-4" />
          <label className="block text-sm font-medium text-gray-700 mb-2">Assign To *</label>
          <div className="border border-gray-300 rounded-lg mb-6 max-h-40 overflow-y-auto">
            {assignableMembers.map(m => (
              <label key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={duplicateTargetEmployees.includes(m.id)} onChange={e => setDuplicateTargetEmployees(prev => e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id))} className="rounded" />
                <span className="text-sm text-gray-700">{m.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleDuplicateShift} className="flex-1 px-4 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors">Copy Shift</button>
            <button onClick={() => setDuplicateModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* RECURRING SHIFTS */}
      <Modal isOpen={recurringModalOpen && !!recurringShift} onClose={() => setRecurringModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-xl font-semibold mb-2 text-gray-900">Repeat Shift</h3>
          <p className="text-sm text-gray-500 mb-6">Create weekly recurring <strong>{recurringShift?.start_time}–{recurringShift?.end_time}</strong> shifts.</p>
          <label className="block text-sm font-medium text-gray-700 mb-3">Repeat on these days *</label>
          <div className="flex gap-2 flex-wrap mb-6">
            {dayOfWeekNames.map((day, idx) => (
              <button key={idx} onClick={() => setRecurringDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx])} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${recurringDays.includes(idx) ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{day}</button>
            ))}
          </div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Apply to Employees *</label>
          <div className="border border-gray-300 rounded-lg mb-4 max-h-40 overflow-y-auto">
            {assignableMembers.map(m => (
              <label key={m.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={recurringEmployees.includes(m.id)} onChange={e => setRecurringEmployees(prev => e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id))} className="rounded" />
                <span className="text-sm text-gray-700">{m.label}</span>
              </label>
            ))}
          </div>
          <label className="block text-sm font-medium text-gray-700 mb-2">How many weeks ahead?</label>
          <select value={recurringWeeksAhead} onChange={e => setRecurringWeeksAhead(Number(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg mb-4">
            {[1, 2, 4, 6, 8, 12].map(w => <option key={w} value={w}>{w} week{w > 1 ? 's' : ''}</option>)}
          </select>
          <p className="text-xs text-gray-400 mb-6">Existing shifts with the same employee, date, and start time will not be duplicated.</p>
          <div className="flex gap-2">
            <button onClick={handleCreateRecurring} className="flex-1 px-4 py-3 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition-colors">Create Recurring</button>
            <button onClick={() => setRecurringModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* SCHEDULE TEMPLATE */}
      <Modal isOpen={templateModalOpen} onClose={() => setTemplateModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="flex gap-2 mb-6">
            <button onClick={() => setTemplateMode('save')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${templateMode === 'save' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600'}`}>Save Week</button>
            <button onClick={() => setTemplateMode('apply')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${templateMode === 'apply' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>Apply Template</button>
          </div>
          {templateMode === 'save' ? (
            <>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">Save Current Week as Template</h3>
              <p className="text-sm text-gray-500 mb-4">Saves all scheduled shifts from the week containing {selectedDate.toLocaleDateString()}.</p>
              <input type="text" placeholder="Template name (e.g. Week A, Summer Rota)" value={templateName} onChange={e => setTemplateName(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg mb-6" autoFocus />
              <div className="flex gap-2">
                <button onClick={handleSaveTemplate} className="flex-1 px-4 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600">Save Template</button>
                <button onClick={() => setTemplateModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">Apply Template to Week</h3>
              <p className="text-sm text-gray-500 mb-4">Creates shifts for every day in the template, starting from the Monday of the chosen week.</p>
              {templates.length === 0 ? (
                <p className="text-gray-400 text-sm italic text-center py-6">No templates saved yet.</p>
              ) : (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Choose Template</label>
                  <div className="space-y-2 mb-4">
                    {templates.map(t => (
                      <div key={t.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${applyTemplateId === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`} onClick={() => setApplyTemplateId(t.id)}>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{t.name}</div>
                          <div className="text-xs text-gray-500">{t.shifts?.length || 0} shifts · saved {new Date(t.created_at).toLocaleDateString()}</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); handleDeleteTemplate(t.id); }} className="text-gray-400 hover:text-red-500 text-xs font-medium transition-colors ml-2 px-2 py-1 rounded hover:bg-red-50">Delete</button>
                      </div>
                    ))}
                  </div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Apply to week starting (Monday)</label>
                  <input type="date" value={applyTemplateWeekStart} onChange={e => setApplyTemplateWeekStart(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg mb-6" />
                  <div className="flex gap-2">
                    <button onClick={handleApplyTemplate} disabled={!applyTemplateId || !applyTemplateWeekStart} className="flex-1 px-4 py-3 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed">Apply Template</button>
                    <button onClick={() => setTemplateModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">Cancel</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* BULK DELETE */}
      <Modal isOpen={bulkDeleteModalOpen} onClose={() => setBulkDeleteModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-2 text-gray-900">Bulk Delete Shifts</h3>
          <p className="text-sm text-gray-500 mb-6">Permanently delete multiple shifts at once. This cannot be undone.</p>
          <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
          <select value={bulkDeleteEmployee} onChange={e => setBulkDeleteEmployee(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg mb-4">
            <option value="all">All Employees</option>
            {assignableMembers.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select value={bulkDeleteStatus} onChange={e => setBulkDeleteStatus(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg mb-4">
            <option value="all">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
            <option value="holiday">Holiday</option>
            <option value="sick">Sick</option>
          </select>
          <label className="block text-sm font-medium text-gray-700 mb-2">Date Range *</label>
          <div className="flex gap-2 mb-6">
            <input type="date" value={bulkDeleteDateFrom} onChange={e => setBulkDeleteDateFrom(e.target.value)} className="flex-1 p-3 border border-gray-300 rounded-lg" />
            <span className="self-center text-gray-400">to</span>
            <input type="date" value={bulkDeleteDateTo} onChange={e => setBulkDeleteDateTo(e.target.value)} className="flex-1 p-3 border border-gray-300 rounded-lg" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleBulkDelete} className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors">Delete Shifts</button>
            <button onClick={() => setBulkDeleteModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* DECLINE REASON */}
      <Modal isOpen={declineModalOpen && !!decliningRequest} onClose={() => !processingRequestId && setDeclineModalOpen(false)}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full">
          <h3 className="text-xl font-semibold mb-2 text-gray-900">Decline Request</h3>
          <p className="text-sm text-gray-500 mb-6">
            Declining {decliningRequest ? resolveUserName(decliningRequest.employee_id) : ''}'s {decliningRequest?.days}-day request ({decliningRequest?.date_from} to {decliningRequest?.date_to}).
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-2">Reason (optional)</label>
          <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="e.g. Not enough cover that week..." className="w-full p-3 border border-gray-300 rounded-lg mb-6 min-h-[80px]" autoFocus />
          <div className="flex gap-2">
            <button onClick={handleDecline} disabled={!!processingRequestId} className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50">{processingRequestId ? 'Declining...' : 'Confirm Decline'}</button>
            <button onClick={() => setDeclineModalOpen(false)} disabled={!!processingRequestId} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* RECURRING TASK CREATE / EDIT */}
      <Modal isOpen={recurringTaskModalOpen} onClose={() => { if (!savingRecurringTask) setRecurringTaskModalOpen(false); }}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-xl font-semibold mb-6 text-gray-900">
            {editingRecurringTask ? 'Edit Recurring Task' : 'New Recurring Task'}
          </h3>

          <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
          <input
            type="text"
            placeholder="e.g. Clean coffee machine"
            value={recurringTaskForm.title}
            onChange={e => setRecurringTaskForm(prev => ({ ...prev, title: e.target.value }))}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            autoFocus
            disabled={savingRecurringTask}
          />

          <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
          <textarea
            placeholder="Any extra detail for the team..."
            value={recurringTaskForm.description}
            onChange={e => setRecurringTaskForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4 min-h-[60px]"
            disabled={savingRecurringTask}
          />

          <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
          <select
            value={recurringTaskForm.category}
            onChange={e => setRecurringTaskForm(prev => ({ ...prev, category: e.target.value }))}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            disabled={savingRecurringTask}
          >
            {RECURRING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label className="block text-sm font-medium text-gray-700 mb-2">Frequency *</label>
          <div className="flex gap-2 mb-4">
            {(['daily', 'weekly', 'specific_days'] as const).map(f => (
              <button
                key={f}
                onClick={() => setRecurringTaskForm(prev => ({ ...prev, frequency: f, days_of_week: [] }))}
                disabled={savingRecurringTask}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${recurringTaskForm.frequency === f ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {f === 'daily' ? 'Daily' : f === 'weekly' ? 'Weekly' : 'Specific Days'}
              </button>
            ))}
          </div>

          {(recurringTaskForm.frequency === 'weekly' || recurringTaskForm.frequency === 'specific_days') && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Days of week *</label>
              <div className="flex gap-2 flex-wrap mb-4">
                {dayOfWeekNames.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleRecurringFormDay(idx)}
                    disabled={savingRecurringTask}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${recurringTaskForm.days_of_week.includes(idx) ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </>
          )}

          {locations.length > 1 && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
              <select
                value={recurringTaskForm.location_id}
                onChange={e => setRecurringTaskForm(prev => ({ ...prev, location_id: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4"
                disabled={savingRecurringTask}
              >
                <option value="">All locations</option>
                {locations.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </>
          )}

          <label className="flex items-center gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={recurringTaskForm.active}
              onChange={e => setRecurringTaskForm(prev => ({ ...prev, active: e.target.checked }))}
              className="rounded"
              disabled={savingRecurringTask}
            />
            <span className="text-sm font-medium text-gray-700">Active (visible on task board)</span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleSaveRecurringTask}
              disabled={savingRecurringTask}
              className="flex-1 px-4 py-3 bg-cyan-600 text-white rounded-lg font-medium hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {savingRecurringTask ? 'Saving...' : editingRecurringTask ? 'Save Changes' : 'Create Task'}
            </button>
            <button
              onClick={() => setRecurringTaskModalOpen(false)}
              disabled={savingRecurringTask}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}