// components/NotificationPreferences.tsx
// Drop this into your account/settings page for the owner.
// Shows toggles for each notification type. Owner-only — employees cannot change these.

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

interface NotifPrefs {
  notif_shift_assigned: boolean;
  notif_batch_due: boolean;
  notif_batch_completed: boolean;
  notif_clock_in_out: boolean;
}

const NOTIF_SETTINGS = [
  {
    key: 'notif_shift_assigned' as keyof NotifPrefs,
    label: 'Shift assigned',
    description: 'Notify employees when they are assigned a new shift, holiday, or sick day.',
    icon: '📅',
  },
  {
    key: 'notif_batch_due' as keyof NotifPrefs,
    label: 'Batch due reminder',
    description: 'Alert assigned employee (or all on-shift staff if unassigned) 1 hour before a scheduled batch.',
    icon: '⏰',
  },
  {
    key: 'notif_batch_completed' as keyof NotifPrefs,
    label: 'Batch completed',
    description: 'Notify you when an employee marks a batch as complete.',
    icon: '✅',
  },
  {
    key: 'notif_clock_in_out' as keyof NotifPrefs,
    label: 'Clock in / out',
    description: 'Notify you when an employee clocks in or out.',
    icon: '🕐',
  },
];

export default function NotificationPreferences({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<NotifPrefs>({
    notif_shift_assigned: true,
    notif_batch_due: true,
    notif_batch_completed: true,
    notif_clock_in_out: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchPrefs();
  }, [userId]);

  async function fetchPrefs() {
    const { data } = await supabase
      .from('network_member_roles')
      .select('notif_shift_assigned, notif_batch_due, notif_batch_completed, notif_clock_in_out')
      .eq('owner_id', userId)
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      setPrefs({
        notif_shift_assigned: data.notif_shift_assigned ?? true,
        notif_batch_due: data.notif_batch_due ?? true,
        notif_batch_completed: data.notif_batch_completed ?? true,
        notif_clock_in_out: data.notif_clock_in_out ?? true,
      });
    }
    setLoading(false);
  }

  async function handleToggle(key: keyof NotifPrefs) {
    const newValue = !prefs[key];
    setSaving(key);

    // Optimistic update
    setPrefs(prev => ({ ...prev, [key]: newValue }));

    const { error } = await supabase
      .from('network_member_roles')
      .upsert(
        {
          owner_id: userId,
          user_id: userId,
          [key]: newValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id,user_id' }
      );

    if (error) {
      // Revert on failure
      setPrefs(prev => ({ ...prev, [key]: !newValue }));
      alert('Failed to save preference');
    }

    setSaving(null);
  }

  if (loading) {
    return (
      <div className="bg-white/90 rounded-xl p-6 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/90 rounded-xl p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Push Notifications</h2>
        <p className="text-sm text-gray-500 mt-1">
          Control which push notifications are sent for your business. These settings apply to all employees — individual employees cannot override them.
        </p>
      </div>

      <div className="space-y-3">
        {NOTIF_SETTINGS.map(setting => {
          const isOn = prefs[setting.key];
          const isSaving = saving === setting.key;
          return (
            <div
              key={setting.key}
              className={`flex items-start justify-between gap-4 p-4 rounded-lg border transition-colors ${
                isOn ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start gap-3 flex-1">
                <span className="text-xl mt-0.5">{setting.icon}</span>
                <div>
                  <div className="font-medium text-gray-900 text-sm">{setting.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{setting.description}</div>
                </div>
              </div>
              <button
                onClick={() => handleToggle(setting.key)}
                disabled={isSaving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                  isOn ? 'bg-green-500' : 'bg-gray-300'
                }`}
                role="switch"
                aria-checked={isOn}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isOn ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Notifications are delivered via push to the Batch Maker mobile app. Employees must have the app installed and notifications enabled on their device.
      </p>
    </div>
  );
}