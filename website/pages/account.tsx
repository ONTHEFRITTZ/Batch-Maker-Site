'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

export default function Account() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Use Next.js router instead of window.location for better navigation
        window.location.href = '/login';
        return;
      }

      setUser(session.user);

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setProfile(profileData);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      return;
    }

    try {
      // Delete user data
      await supabase.from('workflows').delete().eq('user_id', user.id);
      await supabase.from('batches').delete().eq('user_id', user.id);
      await supabase.from('reports').delete().eq('user_id', user.id);
      await supabase.from('photos').delete().eq('user_id', user.id);
      
      // Sign out
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account. Please contact support.');
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>Account Settings</h1>
          <Link href="/dashboard" style={styles.backButton}>
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <div style={styles.content}>
        {/* Account Details */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Account Details</h2>
          
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <div style={styles.value}>{user?.email}</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>User ID</label>
            <div style={styles.valueSmall}>{user?.id}</div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Account Created</label>
            <div style={styles.value}>
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
            </div>
          </div>
        </div>

        {/* Subscription Info */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Subscription</h2>
          
          <div style={styles.field}>
            <label style={styles.label}>Status</label>
            <div style={styles.value}>
              <span style={styles.badge}>
                {profile?.subscription_status || 'Free'}
              </span>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Role</label>
            <div style={styles.value}>
              {profile?.role || 'user'}
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={styles.dangerCard}>
          <h2 style={styles.dangerTitle}>Danger Zone</h2>
          <p style={styles.dangerText}>
            Deleting your account will permanently remove all your workflows, batches, 
            reports, and photos. This action cannot be undone.
          </p>
          <button onClick={handleDeleteAccount} style={styles.deleteButton}>
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    padding: '1rem 0',
  },
  headerContent: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '0 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '600',
    margin: 0,
    color: '#111827',
  },
  backButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    textDecoration: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '1.125rem',
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1.5rem',
    color: '#111827',
  },
  field: {
    marginBottom: '1.25rem',
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  value: {
    fontSize: '1rem',
    color: '#111827',
  },
  valueSmall: {
    fontSize: '0.75rem',
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    backgroundColor: '#10b981',
    color: '#ffffff',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    textTransform: 'capitalize' as const,
  },
  dangerCard: {
    backgroundColor: '#ffffff',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '2px solid #ef4444',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  dangerTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '0.75rem',
    color: '#dc2626',
  },
  dangerText: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginBottom: '1rem',
    lineHeight: '1.5',
  },
  deleteButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
};