// @ts-nocheck

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are a professional recipe parser. Extract recipe information and return ONLY valid JSON with no markdown, no code blocks, no extra text.

If not a recipe, return: {"error":"NOT_A_RECIPE"}

Otherwise return this exact structure:
{
  "name": "Recipe Name",
  "prepare_ingredients_description": "Gather and measure all ingredients.",
  "yield_amount": 24,
  "yield_unit": "pieces",
  "ingredients": ["flour: 500g", "water: 350ml"],
  "steps": [
    {
      "order": 1,
      "title": "Mix dry ingredients",
      "description": "Whisk together the flour, salt, and baking powder in a large bowl.",
      "duration_minutes": null,
      "ingredients_for_step": ["flour: 500g"]
    },
    {
      "order": 2,
      "title": "Rest the dough",
      "description": "Cover and let the dough rest at room temperature.",
      "duration_minutes": 30,
      "ingredients_for_step": []
    },
    {
      "order": 3,
      "title": "Shape and fold",
      "description": "Turn the dough onto a floured surface and fold four times.",
      "duration_minutes": null,
      "ingredients_for_step": []
    }
  ]
}

STRICT RULES — follow these exactly:

duration_minutes:
- Set to a number ONLY when the recipe explicitly states a time for that step (e.g. "bake for 25 minutes", "rest for 1 hour", "simmer for 10 minutes").
- If no time is mentioned for the step, set duration_minutes to null.
- Do NOT invent or estimate times. If unsure, use null.

ingredients_for_step:
- Only include raw ingredients that are physically added for the first time in that step.
- Intermediate products from previous steps (dough, batter, mixture, sauce, dough ball, paste, etc.) are NOT ingredients — do not list them.
- If a step is purely technique or method (kneading, shaping, folding, baking, resting) with no new raw ingredients being added, set ingredients_for_step to [].
- Do NOT repeat ingredients across multiple steps unless they are genuinely added again at that point.

Step content:
- A step can be just instructions or method with no timer and no ingredients. That is valid and correct.
- Do NOT force a timer or checklist onto every step. Only add them when the recipe genuinely calls for it.
- Keep step titles short (2-5 words).
- Keep descriptions accurate to the recipe source.

YIELD EXTRACTION:
Set yield_amount and yield_unit if the recipe mentions how much it makes.
Examples: "makes 24 cookies" → yield_amount: 24, yield_unit: "cookies"
          "yields 2 loaves" → yield_amount: 2, yield_unit: "loaves"
          "serves 8" → yield_amount: 8, yield_unit: "portions"
          "makes 1kg dough" → yield_amount: 1, yield_unit: "kg"
If yield is not mentioned, set both to null.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log('parse-recipe-url called');

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'CONFIG_ERROR', message: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { url } = await req.json();
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'URL required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching:', url);

    const fetchResponse = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)' }
    });

    if (!fetchResponse.ok) {
      throw new Error(`HTTP ${fetchResponse.status}`);
    }

    const html = await fetchResponse.text();
    console.log('Fetched HTML:', html.length, 'chars');

    const cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .substring(0, 12000);

    console.log('Calling Claude...');

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: cleaned }]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude error:', errorText);
      return new Response(
        JSON.stringify({ error: 'API_FAILURE', message: 'AI error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content[0].text;

    console.log('Claude response length:', responseText.length);

    let parsed;
    try {
      let text = responseText.trim();
      if (text.startsWith('```json')) text = text.slice(7);
      else if (text.startsWith('```')) text = text.slice(3);
      if (text.endsWith('```')) text = text.slice(0, -3);
      text = text.trim();

      parsed = JSON.parse(text);

      if (parsed.error === 'NOT_A_RECIPE') {
        return new Response(
          JSON.stringify({ error: 'NOT_A_RECIPE', message: 'Not a recipe' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (parseError: any) {
      console.error('JSON parse error:', parseError);
      return new Response(
        JSON.stringify({ error: 'PARSE_FAILURE', message: 'Failed to parse' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];

    const prepStep = {
      order: 0,
      title: 'Prepare Ingredients',
      description: parsed.prepare_ingredients_description ?? 'Gather and measure all ingredients.',
      duration_minutes: null,
      ingredients_for_step: ingredients,
    };

    const steps = parsed.steps.map((s: any, i: number) => ({
      order: i + 1,
      title: s.title,
      description: s.description,
      duration_minutes: s.duration_minutes ?? null,
      ingredients_for_step: Array.isArray(s.ingredients_for_step) ? s.ingredients_for_step : [],
    }));

    return new Response(
      JSON.stringify({
        success: true,
        workflow: {
          name: parsed.name,
          ingredients,
          steps: [prepStep, ...steps],
          yield_amount: parsed.yield_amount ?? null,
          yield_unit: parsed.yield_unit ?? null,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error.message);
    return new Response(
      JSON.stringify({ error: 'UNKNOWN', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});