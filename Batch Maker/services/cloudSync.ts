// services/cloudSync.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getSession, getUser } from './supabaseClient';
import { getWorkflows, setWorkflows, getBatches } from './database';

const LAST_SYNC_KEY = '@last_sync';
const SYNC_ENABLED_KEY = '@sync_enabled';

interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  errors: string[];
}

/**
 * Check if cloud sync is enabled
 */
export async function isSyncEnabled(): Promise<boolean> {
  const enabled = await AsyncStorage.getItem(SYNC_ENABLED_KEY);
  return enabled === 'true';
}

/**
 * Enable/disable cloud sync
 */
export async function setSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * Get last sync timestamp
 */
async function getLastSync(): Promise<string | null> {
  return await AsyncStorage.getItem(LAST_SYNC_KEY);
}

/**
 * Set last sync timestamp
 */
async function setLastSync(timestamp: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, timestamp);
}

/**
 * Pull data from cloud
 */
export async function pullFromCloud(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    uploaded: 0,
    downloaded: 0,
    errors: [],
  };

  try {
    // Check if sync is enabled
    const syncEnabled = await isSyncEnabled();
    if (!syncEnabled) {
      throw new Error('Sync not enabled');
    }

    // Get session
    const session = await getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    // Get last sync time
    const lastSync = await getLastSync();

    // Fetch data from API
    const url = lastSync 
      ? `${process.env.EXPO_PUBLIC_API_URL}/api/sync/pull?lastSync=${lastSync}`
      : `${process.env.EXPO_PUBLIC_API_URL}/api/sync/pull`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Pull failed');
    }

    const data = await response.json();

    // Merge workflows
    if (data.workflows && data.workflows.length > 0) {
      const localWorkflows = getWorkflows();
      const workflowMap = new Map(localWorkflows.map(w => [w.id, w]));

      // Add or update workflows
      data.workflows.forEach((cloudWorkflow: any) => {
        workflowMap.set(cloudWorkflow.id, {
          id: cloudWorkflow.id,
          name: cloudWorkflow.name,
          steps: cloudWorkflow.steps,
          claimedBy: cloudWorkflow.claimed_by,
          claimedByName: cloudWorkflow.claimed_by_name,
        });
      });

      await setWorkflows(Array.from(workflowMap.values()));
      result.downloaded += data.workflows.length;
    }

    // TODO: Merge batches, reports, photos similarly

    // Update last sync time
    await setLastSync(data.synced_at);

    result.success = true;
    console.log('✅ Pull complete:', result);
    return result;
  } catch (error: any) {
    console.error('Pull error:', error);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Push local data to cloud
 */
export async function pushToCloud(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    uploaded: 0,
    downloaded: 0,
    errors: [],
  };

  try {
    // Check if sync is enabled
    const syncEnabled = await isSyncEnabled();
    if (!syncEnabled) {
      throw new Error('Sync not enabled');
    }

    // Get session and user
    const session = await getSession();
    const user = await getUser();
    if (!session || !user) {
      throw new Error('Not authenticated');
    }

    // Get device ID
    const { getDeviceId } = require('./database');
    const deviceId = await getDeviceId();

    // Collect local data to upload
    const workflows = getWorkflows();
    const batches = getBatches();
    // TODO: Get reports

    // Upload to API
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId,
        workflows: workflows.map(w => ({
          id: w.id,
          name: w.name,
          steps: w.steps,
          claimed_by: w.claimedBy,
          claimed_by_name: w.claimedByName,
        })),
        batches: batches.map(b => ({
          id: b.id,
          workflow_id: b.workflowId,
          name: b.name,
          mode: b.mode,
          units_per_batch: b.unitsPerBatch,
          batch_size_multiplier: b.batchSizeMultiplier,
          current_step_index: b.currentStepIndex,
          completed_steps: b.completedSteps,
          active_timers: b.activeTimers,
          created_at: new Date(b.createdAt).toISOString(),
        })),
        reports: [], // TODO: Add reports
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Push failed');
    }

    const data = await response.json();
    result.uploaded = 
      (data.results?.workflows?.success || 0) + 
      (data.results?.batches?.success || 0) +
      (data.results?.reports?.success || 0);

    // Update last sync time
    await setLastSync(data.synced_at);

    result.success = true;
    console.log('✅ Push complete:', result);
    return result;
  } catch (error: any) {
    console.error('Push error:', error);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Full sync: Pull then Push
 */
export async function syncWithCloud(): Promise<SyncResult> {
  console.log('🔄 Starting full sync...');

  // First pull to get latest data
  const pullResult = await pullFromCloud();
  
  // Then push local changes
  const pushResult = await pushToCloud();

  const result: SyncResult = {
    success: pullResult.success && pushResult.success,
    uploaded: pushResult.uploaded,
    downloaded: pullResult.downloaded,
    errors: [...pullResult.errors, ...pushResult.errors],
  };

  console.log('✅ Full sync complete:', result);
  return result;
}

/**
 * Check subscription status
 */
export async function checkSubscriptionStatus(): Promise<any> {
  try {
    const session = await getSession();
    if (!session) {
      return null;
    }

    const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/subscriptions/status`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to check subscription');
    }

    return await response.json();
  } catch (error) {
    console.error('Subscription check error:', error);
    return null;
  }
}

/**
 * Auto-sync on app launch
 */
export async function autoSync(): Promise<void> {
  const syncEnabled = await isSyncEnabled();
  if (!syncEnabled) {
    console.log('Auto-sync disabled');
    return;
  }

  const session = await getSession();
  if (!session) {
    console.log('Not authenticated, skipping auto-sync');
    return;
  }

  console.log('🔄 Running auto-sync...');
  await syncWithCloud();
}