/**
 * lib/predictiveSchedule.ts
 *
 * Uses pos_sales data to compute:
 *  1. Rolling 4-week average sales per item per day-of-week
 *  2. Suggested batch quantity (avg × par level buffer)
 *  3. Suggested date (next occurrence of that day-of-week)
 *
 * Usage:
 *   const suggestions = await getPredictiveSuggestions(supabase, userId, workflows);
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface PredictiveSuggestion {
  itemName: string;
  avgQtySold: number;       // rolling 4-week avg per day
  suggestedBatchQty: number; // rounded up, × PAR_BUFFER
  suggestedDate: string;    // ISO date string (next relevant day)
  dayOfWeek: number;        // 0=Sun … 6=Sat
  confidence: 'high' | 'medium' | 'low'; // based on # data points
  matchedWorkflowId?: string;
  matchedWorkflowName?: string;
}

const PAR_BUFFER = 1.15; // produce 15% above avg to avoid stockouts

/**
 * Returns next date (from today) that falls on the given day of week.
 */
function nextDateForDOW(dow: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (dow - today.getDay() + 7) % 7 || 7; // at least tomorrow
  today.setDate(today.getDate() + diff);
  return today.toISOString().split('T')[0];
}

/**
 * Fuzzy-match item name to a workflow name.
 * Returns the best matching workflow or undefined.
 */
function matchWorkflow(
  itemName: string,
  workflows: Array<{ id: string; name: string }>
): { id: string; name: string } | undefined {
  const lower = itemName.toLowerCase();
  // Exact match first
  let match = workflows.find(w => w.name.toLowerCase() === lower);
  if (match) return match;
  // Contains match
  match = workflows.find(w =>
    lower.includes(w.name.toLowerCase()) || w.name.toLowerCase().includes(lower)
  );
  return match;
}

export async function getPredictiveSuggestions(
  supabase: SupabaseClient,
  userId: string,
  workflows: Array<{ id: string; name: string }>
): Promise<PredictiveSuggestion[]> {
  // Fetch last 28 days of sales
  const since = new Date();
  since.setDate(since.getDate() - 28);
  const sinceStr = since.toISOString().split('T')[0];

  const { data: sales, error } = await supabase
    .from('pos_sales')
    .select('item_name, item_id_external, date, quantity_sold')
    .eq('owner_id', userId)
    .gte('date', sinceStr)
    .order('date');

  if (error || !sales || sales.length === 0) return [];

  // Group by item + day of week
  // Structure: { itemName → { dow → { dates: string[], quantities: number[] } } }
  const grouped: Record<string, Record<number, { quantities: number[]; itemId: string }>> = {};

  for (const sale of sales) {
    const dow = new Date(sale.date + 'T00:00:00').getDay();
    if (!grouped[sale.item_name]) grouped[sale.item_name] = {};
    if (!grouped[sale.item_name][dow]) grouped[sale.item_name][dow] = { quantities: [], itemId: sale.item_id_external };
    grouped[sale.item_name][dow].quantities.push(sale.quantity_sold);
  }

  const suggestions: PredictiveSuggestion[] = [];

  for (const [itemName, dowMap] of Object.entries(grouped)) {
    // Find the day with highest average sales for this item
    let bestDow = 0;
    let bestAvg = 0;
    let bestPoints = 0;

    for (const [dowStr, data] of Object.entries(dowMap)) {
      const dow = Number(dowStr);
      const avg = data.quantities.reduce((a, b) => a + b, 0) / data.quantities.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestDow = dow;
        bestPoints = data.quantities.length;
      }
    }

    if (bestAvg < 0.5) continue; // Skip items that barely sell

    const suggestedQty = Math.ceil(bestAvg * PAR_BUFFER);
    const confidence: 'high' | 'medium' | 'low' =
      bestPoints >= 4 ? 'high' : bestPoints >= 2 ? 'medium' : 'low';

    const matchedWf = matchWorkflow(itemName, workflows);

    suggestions.push({
      itemName,
      avgQtySold: Math.round(bestAvg * 10) / 10,
      suggestedBatchQty: suggestedQty,
      suggestedDate: nextDateForDOW(bestDow),
      dayOfWeek: bestDow,
      confidence,
      matchedWorkflowId: matchedWf?.id,
      matchedWorkflowName: matchedWf?.name,
    });
  }

  // Sort by confidence then avg qty
  return suggestions.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence];
    }
    return b.avgQtySold - a.avgQtySold;
  });
}