/**
 * pages/api/pos/callback.ts
 *
 * Handles OAuth redirect from POS providers.
 * Exchanges authorization code → access + refresh tokens.
 * Saves encrypted tokens to pos_connections.
 * Redirects user back to /settings?pos=connected or ?pos=error
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { encryptToken } from '../../../lib/posEncryption';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// ── Token exchange configs ──────────────────────────────────────────────────
interface TokenConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  extraBody?: Record<string, string>;
}

function getTokenConfig(provider: string): TokenConfig {
  switch (provider) {
    case 'square':
      return {
        tokenUrl: 'https://connect.squareup.com/oauth2/token',
        clientId: process.env.SQUARE_CLIENT_ID || '',
        clientSecret: process.env.SQUARE_CLIENT_SECRET || '',
      };
    case 'toast':
      return {
        tokenUrl: 'https://api.toasttab.com/authentication/v1/authentication/login',
        clientId: process.env.TOAST_CLIENT_ID || '',
        clientSecret: process.env.TOAST_CLIENT_SECRET || '',
      };
    case 'lightspeed':
      return {
        tokenUrl: 'https://cloud.lightspeedapp.com/oauth/access_token.php',
        clientId: process.env.LIGHTSPEED_CLIENT_ID || '',
        clientSecret: process.env.LIGHTSPEED_CLIENT_SECRET || '',
      };
    case 'clover':
      return {
        tokenUrl: 'https://api.clover.com/oauth/token',
        clientId: process.env.CLOVER_CLIENT_ID || '',
        clientSecret: process.env.CLOVER_CLIENT_SECRET || '',
      };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function exchangeCodeForTokens(provider: string, code: string, redirectUri: string) {
  const config = getTokenConfig(provider);

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    ...(config.extraBody || {}),
  };

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed for ${provider}: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function getMerchantInfo(
  provider: string,
  accessToken: string
): Promise<{ merchantId: string; locationId: string; displayName: string }> {
  switch (provider) {
    case 'square': {
      const r = await fetch('https://connect.squareup.com/v2/merchants/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await r.json();
      const merchant = data.merchant;
      const locR = await fetch('https://connect.squareup.com/v2/locations', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const locData = await locR.json();
      const firstLoc = locData.locations?.[0];
      return {
        merchantId: merchant?.id || '',
        locationId: firstLoc?.id || '',
        displayName: merchant?.business_name || firstLoc?.name || 'Square Account',
      };
    }
    case 'lightspeed': {
      const r = await fetch('https://cloud.lightspeedapp.com/API/Account.json', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await r.json();
      return {
        merchantId: data.Account?.accountID || '',
        locationId: data.Account?.accountID || '',
        displayName: data.Account?.name || 'Lightspeed Account',
      };
    }
    case 'clover': {
      return { merchantId: '', locationId: '', displayName: 'Clover Account' };
    }
    default:
      return { merchantId: '', locationId: '', displayName: `${provider} Account` };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error('OAuth error from provider:', oauthError);
    return res.redirect(`${BASE_URL}/settings?pos=error&reason=${encodeURIComponent(oauthError as string)}`);
  }

  if (!code || !state) {
    return res.redirect(`${BASE_URL}/settings?pos=error&reason=missing_params`);
  }

  try {
    const stateJson = JSON.parse(Buffer.from(state as string, 'base64url').toString('utf8'));
    const { userId, provider } = stateJson;

    if (!userId || !provider) throw new Error('Invalid state parameter');

    const redirectUri = `${BASE_URL}/api/pos/callback`;

    const tokenData = await exchangeCodeForTokens(provider, code as string, redirectUri);

    const accessToken: string = tokenData.access_token || tokenData.token;
    const refreshToken: string | null = tokenData.refresh_token || null;
    const expiresIn: number | null = tokenData.expires_in || null;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    const merchantInfo = await getMerchantInfo(provider, accessToken);

    const encryptedAccess = encryptToken(accessToken);
    const encryptedRefresh = refreshToken ? encryptToken(refreshToken) : null;

    const supabaseAdmin = getSupabaseAdmin();

    const { error: dbError } = await supabaseAdmin
      .from('pos_connections')
      .upsert(
        {
          owner_id: userId,
          provider,
          access_token: encryptedAccess,
          refresh_token: encryptedRefresh,
          expires_at: expiresAt,
          location_id: merchantInfo.locationId,
          merchant_id: merchantInfo.merchantId,
          display_name: merchantInfo.displayName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id,provider' }
      );

    if (dbError) throw dbError;

    res.redirect(`${BASE_URL}/settings?pos=connected&provider=${provider}`);
  } catch (error: any) {
    console.error('POS callback error:', error);
    res.redirect(`${BASE_URL}/settings?pos=error&reason=${encodeURIComponent(error.message)}`);
  }
}