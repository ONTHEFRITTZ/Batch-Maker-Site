import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient, getUserFromRequest } from '../../../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Google Vision OCR ─────────────────────────────────────────────────────
async function extractTextWithVision(base64Image: string): Promise<string> {
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        }],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Vision API error: ${err}`);
  }

  const data = await response.json() as any;
  const text = data.responses?.[0]?.fullTextAnnotation?.text;

  if (!text) throw new Error('No text detected in image');

  return text;
}

// ── Claude structured parser ──────────────────────────────────────────────
async function parseOrderWithClaude(rawText: string): Promise<any> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Parse this packing slip / invoice / delivery note text and return strict JSON only.

RULES:
0. Parse ALL line items visible in the text regardless of page number or document structure.
   Never refuse to parse because of "Page 2 of 2" or similar — always extract whatever product lines are present.

1. Only parse lines containing actual products or ingredients.
   Ignore legal disclaimers and store notes.

2. For each line item return:
   name, size (packaging size e.g. "25lb", "750ml", null if unknown),
   quantity (number shipped/received — use the SHIP or DELIVERED column if present, not the ordered column),
   unit (CS/EA/LB/KG/BT/BAG/etc.),
   unitPrice (null if not explicitly visible on THIS item's own row),
   extendedPrice (null if not explicitly visible on THIS item's own row),
   category (pick closest from locked list),
   inventoryId (always null)

3. CRITICAL PRICING RULE — NO INFERENCE ALLOWED:
   - Every price value must come ONLY from that item's own row in the document.
   - If a price cell is blank, missing, or ambiguous, set it to null.
   - NEVER borrow, copy, or infer a price from an adjacent row above or below.
   - NEVER guess a price based on context, math, or surrounding rows.
   - If you are not 100% certain a price belongs to a specific item's row, set it to null.
   - It is always better to return null than to return a number from the wrong row.

4. CRITICAL QUANTITY RULE — NO INFERENCE ALLOWED:
   - If the invoice has both a Qty Ordered column and a Qty Shipped/Delivered column, always use the Qty Shipped/Delivered value as the quantity.
   - If Qty Shipped is 0 or blank, set quantity to 0. Do not use Qty Ordered as a fallback.
   - If a unit price or extended price is visible on a row where Qty Shipped is 0, still include those prices — they represent what was ordered even if not shipped.
   - NEVER infer quantity from pricing or context.

5. CRITICAL COLUMN ALIGNMENT RULE:
   - Invoices often have tightly packed columns. Each value must be read from its own column on its own row.
   - Do not shift values left or right between columns.
   - Do not carry values from one row to fill blanks in another row.
   - If a column value is genuinely absent for a row, use null for that field.

6. Financial totals: subtotal, tax, fees, discounts, total.
   Only include values explicitly visible in the document totals section. Use null for any that are missing or unclear.

7. Categories (locked — pick closest match only):
   Produce, Meat, Seafood, Dairy, Dry Goods, Liquor, Beer, Wine,
   Non-Alcoholic, Cleaning, Paper/Supplies, Other

8. Supplier info: extract name, address, phone, and email from the document header if visible. Use null for any that are missing.

9. Invoice/order number: look for labels like "Invoice #", "Order #", "Invoice No", "PO Number" etc. Use null if not found.

10. Rep name: look for labels like "Sales Rep", "Rep", "Driver", "Delivered by", "Account Rep". Use null if not found.

11. If order/invoice date is visible, include as YYYY-MM-DD. Otherwise null.

12. Output STRICT JSON ONLY — no commentary, no markdown, no backticks.

RAW TEXT:
${rawText}

REQUIRED JSON SHAPE:
{
  "supplier": string | null,
  "supplierAddress": string | null,
  "supplierPhone": string | null,
  "supplierEmail": string | null,
  "repName": string | null,
  "invoiceNumber": string | null,
  "orderDate": string | null,
  "items": [
    {
      "name": string,
      "size": string | null,
      "quantity": number,
      "unit": string,
      "unitPrice": number | null,
      "extendedPrice": number | null,
      "category": string,
      "inventoryId": null
    }
  ],
  "financials": {
    "subtotal": number | null,
    "tax": number | null,
    "fees": number | null,
    "discounts": number | null,
    "total": number | null
  }
}`,
    }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected Claude response type');

  const clean = content.text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${clean.slice(0, 200)}`);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user: any;
  try {
    user = await getUserFromRequest(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { base64Image, locationId } = req.body;

    if (!base64Image) {
      return res.status(400).json({ error: 'base64Image is required' });
    }
    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';
    const supabase = createAuthenticatedClient(authToken);

    const { data: clockIn } = await supabase
      .from('time_entries')
      .select('id')
      .eq('user_id', user.id)
      .eq('location_id', locationId)
      .is('clock_out', null)
      .maybeSingle();

    if (!clockIn) {
      return res.status(403).json({ error: 'You must be clocked in at this location to scan orders' });
    }

    console.log(`Running OCR for user ${user.id} at location ${locationId}`);
    const rawText = await extractTextWithVision(base64Image);
    console.log(`OCR complete — ${rawText.length} chars extracted`);

    console.log(`Parsing with Claude...`);
    const parsed = await parseOrderWithClaude(rawText);
    console.log(`Parsed ${parsed.items?.length ?? 0} line items`);

    return res.status(200).json({
      success: true,
      rawText,
      parsed,
    });

  } catch (error: any) {
    console.error('Order scan error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to process order scan',
    });
  }
}