// @ts-nocheck
// supabase/functions/complete-batch/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepIngredient {
  name: string;
  amount: string;         // string e.g. "250"
  unit: string;
  inventory_item_id: string | null;
  inventory_unit: string | null;
}

interface RequestBody {
  batch_id: string;
  batch_completion_report_id: string;
  location_id: string;
  actual_yield_amount: number | null;
  actual_yield_unit: string | null;
  batch_size_multiplier: number;
  // ingredients_used: flat list of all ingredients consumed across all steps
  // Each entry may come from structured (with inventory_item_id) or legacy string format
  ingredients_used: Array<{
    name: string;
    amount: number;
    unit: string;
    inventory_item_id: string | null;
  }>;
  // Waste fields
  is_waste: boolean;
  waste_quantity?: number | null;
  waste_unit?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Fuzzy match ingredient name against inventory items when no inventory_item_id supplied
function findInventoryItemMatch(
  name: string,
  inventoryItems: Array<{ id: string; name: string; ingredient: string | null; unit: string | null }>
): { id: string; name: string; unit: string | null } | null {
  const search = name.toLowerCase().trim();
  if (!search) return null;

  // Pass 1 — exact match on ingredient field
  let match = inventoryItems.find(
    item => item.ingredient && item.ingredient.toLowerCase().trim() === search
  );
  if (match) return { id: match.id, name: match.ingredient ?? match.name, unit: match.unit };

  // Pass 2 — exact match on name field
  match = inventoryItems.find(
    item => item.name && item.name.toLowerCase().trim() === search
  );
  if (match) return { id: match.id, name: match.name, unit: match.unit };

  // Pass 3 — ingredient contains search or search contains ingredient
  match = inventoryItems.find(item => {
    if (!item.ingredient) return false;
    const ing = item.ingredient.toLowerCase().trim();
    return ing.includes(search) || search.includes(ing);
  });
  if (match) return { id: match.id, name: match.ingredient ?? match.name, unit: match.unit };

  // Pass 4 — name contains search or search contains name
  match = inventoryItems.find(item => {
    if (!item.name) return false;
    const nm = item.name.toLowerCase().trim();
    return nm.includes(search) || search.includes(nm);
  });
  if (match) return { id: match.id, name: match.name, unit: match.unit };

  return null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Use anon key + user's JWT for RLS-scoped queries
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    // Use service role for writes that need to bypass RLS on cross-table operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Invalid or missing token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('✅ Authenticated:', userId);

    // ── Parse request body ────────────────────────────────────────────────────
    const body: RequestBody = await req.json();

    const {
      batch_id,
      batch_completion_report_id,
      location_id,
      actual_yield_amount,
      actual_yield_unit,
      batch_size_multiplier = 1,
      ingredients_used = [],
      is_waste = false,
      waste_quantity = null,
      waste_unit = null,
    } = body;

    if (!batch_id) {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'batch_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!location_id) {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'location_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Verify the batch belongs to this user ─────────────────────────────────
    const { data: batch, error: batchError } = await supabase
      .from('batches')
      .select('id, workflow_id, name, user_id, batch_size_multiplier')
      .eq('id', batch_id)
      .eq('user_id', userId)
      .single();

    if (batchError || !batch) {
      return new Response(
        JSON.stringify({ error: 'NOT_FOUND', message: 'Batch not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Batch verified:', batch.name);

    const now = new Date().toISOString();
    const multiplier = batch_size_multiplier || batch.batch_size_multiplier || 1;

    // ── Fetch all inventory items for this owner (for fuzzy matching) ─────────
    const { data: inventoryItems, error: invError } = await supabase
      .from('inventory_items')
      .select('id, name, ingredient, unit')
      .eq('owner_id', userId);

    if (invError) {
      console.error('Failed to fetch inventory items:', invError.message);
    }

    const itemList = inventoryItems ?? [];

    // ── Process ingredient deductions ─────────────────────────────────────────
    const deducted: Array<{ name: string; amount: number; unit: string; inventory_item_id: string }> = [];
    const skipped: string[] = [];

    for (const ing of ingredients_used) {
      if (!ing.name || ing.amount <= 0) continue;

      // Resolve inventory item — use provided ID first, fall back to fuzzy match
      let resolvedItemId: string | null = ing.inventory_item_id;
      let resolvedItem: { id: string; name: string; unit: string | null } | null = null;

      if (resolvedItemId) {
        const found = itemList.find(i => i.id === resolvedItemId);
        if (found) {
          resolvedItem = { id: found.id, name: found.ingredient ?? found.name, unit: found.unit };
        }
      }

      if (!resolvedItem) {
        resolvedItem = findInventoryItemMatch(ing.name, itemList);
        if (resolvedItem) resolvedItemId = resolvedItem.id;
      }

      if (!resolvedItemId || !resolvedItem) {
        console.log(`⚠ No inventory match for: ${ing.name}`);
        skipped.push(ing.name);
        continue;
      }

      // Fetch location_inventory row
      const { data: locRow } = await supabase
        .from('location_inventory')
        .select('id, quantity, cost_per_unit')
        .eq('inventory_item_id', resolvedItemId)
        .eq('location_id', location_id)
        .eq('owner_id', userId)
        .maybeSingle();

      if (!locRow) {
        console.log(`⚠ No stock record for ${ing.name} at location ${location_id}`);
        skipped.push(ing.name);
        continue;
      }

      const scaledAmount = ing.amount * multiplier;
      const currentQty = parseFloat(locRow.quantity) || 0;
      const newQty = Math.max(0, currentQty - scaledAmount);

      // Deduct from location_inventory
      const { error: updateError } = await supabase
        .from('location_inventory')
        .update({
          quantity: newQty,
          last_updated_by: userId,
          updated_at: now,
        })
        .eq('id', locRow.id);

      if (updateError) {
        console.error(`Failed to deduct ${ing.name}:`, updateError.message);
        skipped.push(ing.name);
        continue;
      }

      // Write inventory_transactions row
      await supabase.from('inventory_transactions').insert({
        user_id: userId,
        item_id: resolvedItemId,
        batch_id: batch_id,
        type: is_waste ? 'waste' : 'use',
        reason_code: is_waste ? 'waste' : 'batch_consumption',
        quantity: scaledAmount,
        location_id: location_id,
        batch_completion_report_id: batch_completion_report_id || null,
        notes: is_waste
          ? `Wasted in batch: ${batch.name}`
          : `Used in batch: ${batch.name}`,
        created_by: userId,
        created_at: now,
      });

      deducted.push({
        name: resolvedItem.name,
        amount: scaledAmount,
        unit: ing.unit,
        inventory_item_id: resolvedItemId,
      });
    }

    console.log(`✅ Deducted ${deducted.length} ingredients, skipped ${skipped.length}`);

    // ── Upsert finished_goods_inventory ───────────────────────────────────────
    let finishedGoodId: string | null = null;

    if (!is_waste && actual_yield_amount && actual_yield_amount > 0 && batch.workflow_id) {
      // Look for an existing finished good for this workflow at this location today
      const today = now.substring(0, 10); // YYYY-MM-DD
      const { data: existingFG } = await supabase
        .from('finished_goods_inventory')
        .select('id, quantity')
        .eq('owner_id', userId)
        .eq('workflow_id', batch.workflow_id)
        .eq('location_id', location_id)
        .gte('produced_at', `${today}T00:00:00.000Z`)
        .maybeSingle();

      if (existingFG) {
        // Add to existing quantity
        const { data: updatedFG } = await supabase
          .from('finished_goods_inventory')
          .update({
            quantity: (parseFloat(existingFG.quantity) || 0) + actual_yield_amount,
            updated_at: now,
          })
          .eq('id', existingFG.id)
          .select('id')
          .single();

        finishedGoodId = updatedFG?.id ?? existingFG.id;
        console.log(`✅ Updated existing finished good: +${actual_yield_amount} ${actual_yield_unit}`);
      } else {
        // Create new finished good record
        const { data: newFG, error: fgError } = await supabase
          .from('finished_goods_inventory')
          .insert({
            owner_id: userId,
            location_id: location_id,
            workflow_id: batch.workflow_id,
            name: batch.name,
            quantity: actual_yield_amount,
            unit: actual_yield_unit ?? null,
            yield_unit: actual_yield_unit ?? null,
            produced_at: now,
            created_at: now,
            updated_at: now,
          })
          .select('id')
          .single();

        if (fgError) {
          console.error('Failed to create finished good:', fgError.message);
        } else {
          finishedGoodId = newFG.id;
          console.log(`✅ Created finished good: ${actual_yield_amount} ${actual_yield_unit}`);
        }
      }

      // Write finished_goods_transactions row
      if (finishedGoodId) {
        await supabase.from('finished_goods_transactions').insert({
          owner_id: userId,
          location_id: location_id,
          finished_good_id: finishedGoodId,
          batch_completion_report_id: batch_completion_report_id || null,
          reason_code: 'batch_produced',
          quantity: actual_yield_amount,
          unit: actual_yield_unit ?? null,
          notes: `Produced in batch: ${batch.name}`,
          created_at: now,
          created_by: userId,
        });
      }
    }

    // ── Update batch_completion_report with deduction results ─────────────────
    if (batch_completion_report_id) {
      const reportUpdates: Record<string, any> = {
        ingredients_used: deducted,
        ingredients_skipped: skipped.length > 0 ? skipped : null,
        updated_at: now,
      };

      if (is_waste && waste_quantity != null) {
        reportUpdates.waste_quantity = waste_quantity;
        reportUpdates.waste_unit = waste_unit ?? null;
      }

      await supabase
        .from('batch_completion_reports')
        .update(reportUpdates)
        .eq('id', batch_completion_report_id);
    }

    // ── Mark batch as completed ───────────────────────────────────────────────
    await supabase
      .from('batches')
      .update({
        completed_at: now,
        updated_at: now,
        ...(is_waste ? {
          wasted_at: now,
          waste_notes: `Waste quantity: ${waste_quantity ?? 'unknown'} ${waste_unit ?? ''}`.trim(),
        } : {}),
      })
      .eq('id', batch_id);

    console.log('✅ Batch marked complete');

    // ── Return results ────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        batch_id,
        deducted_count: deducted.length,
        skipped_count: skipped.length,
        deducted,
        skipped,
        finished_good_id: finishedGoodId,
        actual_yield_amount,
        actual_yield_unit,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('💥 complete-batch error:', error);
    return new Response(
      JSON.stringify({ error: 'UNKNOWN', message: error?.message || 'Something went wrong' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});