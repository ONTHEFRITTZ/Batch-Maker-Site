// @ts-nocheck
/**
 * supabase/functions/sync-pos/index.ts
 *
 * Daily cron (2am UTC) — syncs sales from all active POS connections.
 *
 * Register cron in supabase/config.toml:
 *   [functions.sync-pos]
 *   enabled = true
 *   verify_jwt = false
 *   schedule = "0 2 * * *"
 *
 * Or trigger manually: POST /functions/v1/sync-pos
 * with header: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY = Deno.env.get('POS_ENCRYPTION_KEY')!; // 64-char hex

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── AES-256-GCM decrypt (mirrors lib/posEncryption.ts) ────────────────────
async function decryptToken(encoded: string): Promise<string> {
  const [ivHex, tagHex, cipherHex] = encoded.split(':');
  const keyBytes = hexToBytes(ENCRYPTION_KEY);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = hexToBytes(ivHex);
  const tag = hexToBytes(tagHex);
  const ciphertext = hexToBytes(cipherHex);
  // AES-GCM in WebCrypto appends tag to ciphertext
  const combined = new Uint8Array([...ciphertext, ...tag]);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, combined);
  return new TextDecoder().decode(decrypted);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function encryptToken(plaintext: string): Promise<string> {
  const keyBytes = hexToBytes(ENCRYPTION_KEY);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, new TextEncoder().encode(plaintext));
  // WebCrypto appends 16-byte tag at end
  const encBytes = new Uint8Array(encrypted);
  const ciphertext = encBytes.slice(0, encBytes.length - 16);
  const tag = encBytes.slice(encBytes.length - 16);
  return `${bytesToHex(iv)}:${bytesToHex(tag)}:${bytesToHex(ciphertext)}`;
}

// ── Token refresh ─────────────────────────────────────────────────────────
async function refreshSquareToken(conn: any): Promise<string> {
  const refreshToken = await decryptToken(conn.refresh_token);
  const r = await fetch('https://connect.squareup.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('SQUARE_CLIENT_ID'),
      client_secret: Deno.env.get('SQUARE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Square token refresh failed: ' + JSON.stringify(data));

  const encAccess = await encryptToken(data.access_token);
  const encRefresh = data.refresh_token ? await encryptToken(data.refresh_token) : conn.refresh_token;
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;

  await supabase.from('pos_connections').update({
    access_token: encAccess,
    refresh_token: encRefresh,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', conn.id);

  return data.access_token;
}

async function getValidToken(conn: any): Promise<string> {
  const isExpiringSoon = conn.expires_at
    ? new Date(conn.expires_at).getTime() - Date.now() < 5 * 60 * 1000  // 5 min buffer
    : false;

  if (isExpiringSoon && conn.refresh_token && conn.provider === 'square') {
    console.log(`Refreshing token for ${conn.provider} (owner: ${conn.owner_id})`);
    return refreshSquareToken(conn);
  }

  return decryptToken(conn.access_token);
}

// ── Square sales sync ─────────────────────────────────────────────────────
async function syncSquare(conn: any, syncDate: string) {
  const token = await getValidToken(conn);
  const locationId = conn.location_id;
  if (!locationId) throw new Error('No Square location_id stored');

  const beginTime = `${syncDate}T00:00:00Z`;
  const endTime   = `${syncDate}T23:59:59Z`;

  // Fetch orders for the day
  let cursor: string | null = null;
  const itemSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

  do {
    const body: any = {
      location_ids: [locationId],
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: beginTime, end_at: endTime },
          },
          state_filter: { states: ['COMPLETED'] },
        },
      },
      limit: 500,
    };
    if (cursor) body.cursor = cursor;

    const r = await fetch('https://connect.squareup.com/v2/orders/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(`Square orders error: ${JSON.stringify(data)}`);

    for (const order of data.orders || []) {
      for (const lineItem of order.line_items || []) {
        const itemId = lineItem.catalog_object_id || lineItem.uid;
        const name = lineItem.name || 'Unknown Item';
        const qty = parseFloat(lineItem.quantity || '0');
        const revenue = lineItem.total_money ? lineItem.total_money.amount / 100 : 0;

        if (!itemSales[itemId]) itemSales[itemId] = { name, quantity: 0, revenue: 0 };
        itemSales[itemId].quantity += qty;
        itemSales[itemId].revenue += revenue;
      }
    }

    cursor = data.cursor || null;
  } while (cursor);

  return itemSales;
}

// ── Toast sales sync ──────────────────────────────────────────────────────
async function syncToast(conn: any, syncDate: string) {
  const token = await getValidToken(conn);
  const restaurantGuid = conn.merchant_id;
  if (!restaurantGuid) throw new Error('No Toast restaurant GUID stored');

  const r = await fetch(
    `https://ws-api.toasttab.com/orders/v2/ordersBulk?startDate=${syncDate}&endDate=${syncDate}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Toast-Restaurant-External-ID': restaurantGuid,
      },
    }
  );

  const orders = await r.json();
  const itemSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

  for (const order of orders || []) {
    for (const check of order.checks || []) {
      for (const item of check.selections || []) {
        const itemId = item.itemGroup?.guid || item.guid;
        const name = item.displayName || 'Unknown Item';
        const qty = item.quantity || 1;
        const revenue = (item.price || 0) * qty;
        if (!itemSales[itemId]) itemSales[itemId] = { name, quantity: 0, revenue: 0 };
        itemSales[itemId].quantity += qty;
        itemSales[itemId].revenue += revenue;
      }
    }
  }

  return itemSales;
}

// ── Lightspeed sales sync ─────────────────────────────────────────────────
async function syncLightspeed(conn: any, syncDate: string) {
  const token = await getValidToken(conn);
  const accountId = conn.merchant_id;

  const r = await fetch(
    `https://cloud.lightspeedapp.com/API/Account/${accountId}/Sale.json?timeStamp=%3E%3D,${syncDate}T00:00:00`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await r.json();
  const sales = Array.isArray(data.Sale) ? data.Sale : data.Sale ? [data.Sale] : [];
  const itemSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

  for (const sale of sales) {
    for (const line of Array.isArray(sale.SaleLines?.SaleLine) ? sale.SaleLines.SaleLine : [sale.SaleLines?.SaleLine].filter(Boolean)) {
      const itemId = line.itemID || line.Item?.itemID || 'unknown';
      const name = line.Item?.description || line.description || 'Unknown Item';
      const qty = parseFloat(line.unitQuantity || '1');
      const revenue = parseFloat(line.displayableSubtotal || '0');
      if (!itemSales[itemId]) itemSales[itemId] = { name, quantity: 0, revenue: 0 };
      itemSales[itemId].quantity += qty;
      itemSales[itemId].revenue += revenue;
    }
  }

  return itemSales;
}

// ── Clover sales sync ─────────────────────────────────────────────────────
async function syncClover(conn: any, syncDate: string) {
  const token = await getValidToken(conn);
  const merchantId = conn.merchant_id;

  const startMs = new Date(`${syncDate}T00:00:00Z`).getTime();
  const endMs   = new Date(`${syncDate}T23:59:59Z`).getTime();

  const r = await fetch(
    `https://api.clover.com/v3/merchants/${merchantId}/line_items?filter=createdTime>=${startMs}&filter=createdTime<=${endMs}&expand=item`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await r.json();
  const itemSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

  for (const line of data.elements || []) {
    const itemId = line.item?.id || line.id;
    const name = line.name || line.item?.name || 'Unknown Item';
    const qty = 1;
    const revenue = (line.price || 0) / 100;
    if (!itemSales[itemId]) itemSales[itemId] = { name, quantity: 0, revenue: 0 };
    itemSales[itemId].quantity += qty;
    itemSales[itemId].revenue += revenue;
  }

  return itemSales;
}

// ── Main sync dispatcher ──────────────────────────────────────────────────
async function syncConnection(conn: any, syncDate: string) {
  let itemSales: Record<string, { name: string; quantity: number; revenue: number }>;

  switch (conn.provider) {
    case 'square':     itemSales = await syncSquare(conn, syncDate);     break;
    case 'toast':      itemSales = await syncToast(conn, syncDate);      break;
    case 'lightspeed': itemSales = await syncLightspeed(conn, syncDate); break;
    case 'clover':     itemSales = await syncClover(conn, syncDate);     break;
    default: throw new Error(`Unknown provider: ${conn.provider}`);
  }

  if (Object.keys(itemSales).length === 0) {
    console.log(`No sales for ${conn.provider} on ${syncDate}`);
    return 0;
  }

  const rows = Object.entries(itemSales).map(([itemId, s]) => ({
    owner_id:        conn.owner_id,
    location_id:     null,  // Could map from conn.location_id → BatchMaker location UUID if desired
    item_name:       s.name,
    item_id_external: itemId,
    date:            syncDate,
    quantity_sold:   s.quantity,
    revenue:         s.revenue,
    provider:        conn.provider,
    synced_at:       new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('pos_sales')
    .upsert(rows, { onConflict: 'owner_id,provider,item_id_external,date' });

  if (error) throw error;
  return rows.length;
}

// ── Edge Function entrypoint ──────────────────────────────────────────────
serve(async (req) => {
  try {
    // Default: sync yesterday's sales (cron fires at 2am, syncing prior full day)
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const syncDate = yesterday.toISOString().split('T')[0];

    // Allow override for manual backfills: POST with { "date": "2025-01-15" }
    let targetDate = syncDate;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body?.date) targetDate = body.date;
      } catch {}
    }

    console.log(`Starting POS sync for date: ${targetDate}`);

    // Fetch all active connections
    const { data: connections, error: fetchError } = await supabase
      .from('pos_connections')
      .select('*');

    if (fetchError) throw fetchError;
    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ message: 'No POS connections to sync', date: targetDate }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ owner: string; provider: string; items: number; error?: string }> = [];

    for (const conn of connections) {
      try {
        const count = await syncConnection(conn, targetDate);
        results.push({ owner: conn.owner_id, provider: conn.provider, items: count });
        console.log(`✓ ${conn.provider} (${conn.owner_id}): ${count} items synced`);
      } catch (err: any) {
        const errMsg = err.message || String(err);
        console.error(`✗ ${conn.provider} (${conn.owner_id}): ${errMsg}`);
        results.push({ owner: conn.owner_id, provider: conn.provider, items: 0, error: errMsg });
      }
    }

    return new Response(JSON.stringify({ date: targetDate, synced: results }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('sync-pos fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});