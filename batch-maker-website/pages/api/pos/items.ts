/**
 * pages/api/pos/items.ts
 *
 * GET /api/pos/items?provider=square|lightspeed
 * Fetches menu items from the connected POS for item mapping.
 * Handles Square token refresh if token is expired or about to expire.
 * Returns { items: [{ id, name }] }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromRequest, getSupabaseAdmin } from '../../../lib/supabase';
import { encryptToken, decryptToken } from '../../../lib/posEncryption';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getUserFromRequest(req);
    const { provider } = req.query;

    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'provider required' });
    }

    if (!['square', 'lightspeed'].includes(provider)) {
      return res.status(400).json({ error: 'Item fetching only supported for Square and Lightspeed' });
    }

    const admin = getSupabaseAdmin();
    const { data: conn, error: connError } = await admin
      .from('pos_connections')
      .select('id, access_token, refresh_token, expires_at, merchant_id, location_id')
      .eq('owner_id', user.id)
      .eq('provider', provider)
      .single();

    if (connError || !conn) {
      return res.status(404).json({ error: `No ${provider} connection found` });
    }

    // Refresh token if expired or expiring within 5 minutes
    let accessToken = decryptToken(conn.access_token);

    if (provider === 'square' && conn.refresh_token) {
      const isExpiringSoon = conn.expires_at
        ? new Date(conn.expires_at).getTime() - Date.now() < 5 * 60 * 1000
        : false;

      if (isExpiringSoon) {
        try {
          accessToken = await refreshSquareToken(conn, admin);
        } catch (refreshErr: any) {
          console.warn('Token refresh failed, using existing token:', refreshErr.message);
          // Continue with existing token — it might still work
        }
      }
    }

    // Lightspeed tokens are long-lived (no expiry) — no refresh needed

    let items: { id: string; name: string }[] = [];

    if (provider === 'square') {
      items = await fetchSquareItems(accessToken, conn.location_id);
    } else if (provider === 'lightspeed') {
      items = await fetchLightspeedItems(accessToken, conn.merchant_id);
    }

    res.json({ items });
  } catch (error: any) {
    console.error('POS items error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function refreshSquareToken(conn: any, admin: any): Promise<string> {
  const refreshToken = decryptToken(conn.refresh_token);

  const r = await fetch('https://connect.squareup.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_CLIENT_ID,
      client_secret: process.env.SQUARE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await r.json();
  if (!data.access_token) {
    throw new Error(`Square token refresh failed: ${JSON.stringify(data)}`);
  }

  const encAccess = encryptToken(data.access_token);
  const encRefresh = data.refresh_token ? encryptToken(data.refresh_token) : conn.refresh_token;
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  await admin.from('pos_connections').update({
    access_token: encAccess,
    refresh_token: encRefresh,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', conn.id);

  return data.access_token;
}

async function fetchSquareItems(
  accessToken: string,
  locationId: string
): Promise<{ id: string; name: string }[]> {
  const items: { id: string; name: string }[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL('https://connect.squareup.com/v2/catalog/list');
    url.searchParams.set('types', 'ITEM');
    if (cursor) url.searchParams.set('cursor', cursor);

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Square catalog error: ${r.status} ${err}`);
    }

    const data = await r.json();
    for (const obj of data.objects || []) {
      if (obj.type === 'ITEM' && obj.item_data?.name) {
        items.push({ id: obj.id, name: obj.item_data.name });
      }
    }
    cursor = data.cursor;
  } while (cursor);

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchLightspeedItems(
  accessToken: string,
  accountId: string
): Promise<{ id: string; name: string }[]> {
  const items: { id: string; name: string }[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const r = await fetch(
      `https://cloud.lightspeedapp.com/API/Account/${accountId}/Item.json?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Lightspeed items error: ${r.status} ${err}`);
    }

    const data = await r.json();
    const batch = Array.isArray(data.Item)
      ? data.Item
      : data.Item
      ? [data.Item]
      : [];

    for (const item of batch) {
      if (item.itemID && item.description) {
        items.push({ id: String(item.itemID), name: item.description });
      }
    }

    if (batch.length < limit) break;
    offset += limit;
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}