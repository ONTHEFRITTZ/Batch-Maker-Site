import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserSupabase: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    // Server-side: always create a new instance
    return createClient(supabaseUrl, supabaseAnonKey);
  }
  // Browser-side: reuse the same instance
  if (!browserSupabase) {
    browserSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return browserSupabase;
}

/**
 * Server-side admin client using service role key.
 * Only use in API routes — never expose to the browser.
 * Used for: auth.admin.getUserById, bypassing RLS, etc.
 */
export function getSupabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn('[supabase] SUPABASE_SERVICE_ROLE_KEY not set — admin operations will fail');
  }
  return createClient(supabaseUrl, serviceKey || supabaseAnonKey);
}

/**
 * Creates a Supabase client authenticated with a user's Bearer token.
 * Used in API routes to respect RLS policies as the calling user.
 */
export function createAuthenticatedClient(authToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Extracts and verifies the authenticated user from an API request.
 * Reads the Bearer token from the Authorization header, then calls
 * Supabase auth to resolve the user. Throws if unauthenticated.
 */
export async function getUserFromRequest(req: import('next').NextApiRequest) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) {
    throw new Error('Unauthorized: no token provided');
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data?.user) {
    throw new Error('Unauthorized: invalid or expired token');
  }

  return data.user;
}

/**
 * Profile type used across the website.
 * Keep in sync with the profiles table schema.
 * Tier logic (isPremium, hasDashboardAccess, etc.) lives in lib/userTier.ts — not here.
 */
export interface Profile {
  id: string;
  email?: string;
  device_name?: string;
  role?: 'free' | 'premium' | 'admin';
  subscription_status?: 'trial' | 'active' | 'cancelled' | 'expired';
  subscription_platform?: 'ios' | 'android' | null;
  trial_started_at?: string | null;
  trial_expires_at?: string | null;
  subscription_expires_at?: string | null;
  business_email?: string;
  business_settings?: Record<string, any>;
  job_title?: string;
  phone?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Central premium check — works with both role and subscription_status.
 * Handles trial period too.
 */
export function isPremiumProfile(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === 'premium' || profile.role === 'admin') return true;
  if (profile.subscription_status === 'active') return true;
  if (profile.subscription_status === 'trial' && profile.trial_expires_at) {
    return new Date(profile.trial_expires_at) > new Date();
  }
  return false;
}