/**
 * pages/api/pos/connect.ts
 *
 * Initiates OAuth flow for a given POS provider.
 * Usage: GET /api/pos/connect?provider=square
 *
 * Auth: reads Bearer token from Authorization header.
 * Fallback: reads from _t query param (used when triggered via browser redirect).
 *
 * Supported providers: square | toast | lightspeed | clover
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../../../lib/supabase';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const PROVIDER_CONFIG: Record<string, {
  authUrl: string;
  clientId: string;
  scopes: string;
  extras?: Record<string, string>;
}> = {
  square: {
    authUrl: 'https://connect.squareup.com/oauth2/authorize',
    clientId: process.env.SQUARE_CLIENT_ID || '',
    scopes: 'MERCHANT_PROFILE_READ ORDERS_READ ITEMS_READ',
  },
  toast: {
    authUrl: 'https://api.toasttab.com/authentication/v1/authentication/login',
    clientId: process.env.TOAST_CLIENT_ID || '',
    scopes: 'orders.read menu.read',
  },
  lightspeed: {
    authUrl: 'https://cloud.lightspeedapp.com/oauth/authorize.php',
    clientId: process.env.LIGHTSPEED_CLIENT_ID || '',
    scopes: 'employee:sales',
  },
  clover: {
    authUrl: 'https://www.clover.com/oauth/authorize',
    clientId: process.env.CLOVER_CLIENT_ID || '',
    scopes: '',
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Read token from Authorization header, or _t query param (browser redirect fallback)
    const headerToken = req.headers.authorization?.replace('Bearer ', '').trim();
    const queryToken = typeof req.query._t === 'string' ? req.query._t : undefined;
    const token = headerToken || queryToken;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: no token provided' });
    }

    // Verify token and get user
    const admin = getSupabaseAdmin();
    const { data, error: authError } = await admin.auth.getUser(token);
    if (authError || !data?.user) {
      return res.status(401).json({ error: 'Unauthorized: invalid or expired token' });
    }
    const user = data.user;

    const { provider } = req.query;
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'provider query param required' });
    }

    const config = PROVIDER_CONFIG[provider];
    if (!config) {
      return res.status(400).json({ error: `Unknown provider: ${provider}. Supported: square, toast, lightspeed, clover` });
    }

    if (!config.clientId) {
      return res.status(500).json({ error: `${provider.toUpperCase()}_CLIENT_ID env var not set` });
    }

    const redirectUri = `${BASE_URL}/api/pos/callback`;

    // Encode userId + provider in state — callback uses this to identify the user
    const state = Buffer.from(JSON.stringify({ userId: user.id, provider })).toString('base64url');

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scopes,
      state,
      ...(config.extras || {}),
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('POS connect error:', error);
    res.status(401).json({ error: error.message });
  }
}