// ============================================
// FILE: services/recipeParser.ts
// Parse recipes from URLs and text
// ============================================

export interface ParsedIngredient {
  name: string;
  amount?: string;
  unit?: string;
  fullText: string;
}

export interface ParsedStep {
  number: number;
  title: string;
  instructions: string;
  ingredients: ParsedIngredient[];
  timerMinutes?: number;
  temperature?: string;
}

export interface ParsedRecipe {
  title: string;
  source?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
}

// Common ingredient units for detection
const UNITS = [
  'g', 'kg', 'mg', 'gram', 'grams', 'kilogram', 'kilograms',
  'ml', 'l', 'milliliter', 'milliliters', 'liter', 'liters',
  'oz', 'lb', 'ounce', 'ounces', 'pound', 'pounds',
  'cup', 'cups', 'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'tb',
  'teaspoon', 'teaspoons', 'tsp', 'ts',
  'pinch', 'dash', 'handful', 'piece', 'pieces',
  'can', 'cans', 'package', 'packages', 'pkg',
  'clove', 'cloves', 'stick', 'sticks',
  'slice', 'slices', 'sheet', 'sheets'
];

// Common time indicators
const TIME_WORDS = ['minute', 'minutes', 'min', 'mins', 'hour', 'hours', 'hr', 'hrs', 'second', 'seconds', 'sec', 'secs'];

// Common cooking verbs
const COOKING_VERBS = [
  'mix', 'stir', 'whisk', 'beat', 'fold', 'knead', 'blend',
  'heat', 'boil', 'simmer', 'cook', 'bake', 'roast', 'grill', 'fry',
  'add', 'combine', 'pour', 'place', 'spread', 'cover',
  'let', 'allow', 'wait', 'rest', 'rise', 'proof',
  'cut', 'chop', 'dice', 'slice', 'mince', 'grate',
  'preheat', 'prepare', 'season', 'garnish'
];

/**
 * Parse ingredient text to extract amount, unit, and name
 */
export function parseIngredient(text: string): ParsedIngredient {
  const cleaned = text.trim();
  
  // Try to extract amount (number or fraction)
  const amountMatch = cleaned.match(/^(\d+(?:\/\d+)?(?:\.\d+)?|\d+\s+\d+\/\d+)/);
  let amount: string | undefined;
  let remaining = cleaned;
  
  if (amountMatch) {
    amount = amountMatch[1].trim();
    remaining = cleaned.substring(amountMatch[0].length).trim();
  }
  
  // Try to extract unit
  let unit: string | undefined;
  const firstWord = remaining.split(/\s+/)[0]?.toLowerCase() || '';
  
  for (const u of UNITS) {
    if (firstWord === u || firstWord === u + 's') {
      unit = u;
      remaining = remaining.substring(firstWord.length).trim();
      break;
    }
  }
  
  // What's left is the ingredient name
  const name = remaining || cleaned;
  
  return {
    name,
    amount,
    unit,
    fullText: cleaned
  };
}

/**
 * Extract time duration from text (returns minutes)
 */
export function extractTime(text: string): number | undefined {
  const lowerText = text.toLowerCase();
  
  // Look for patterns like "30 minutes", "1 hour", "2-3 mins", etc.
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)/i,
    /(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)/i
  ];
  
  for (const pattern of patterns) {
    const match = lowerText.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[match.length - 1].toLowerCase();
      
      // Convert to minutes
      if (unit.startsWith('h')) {
        return Math.round(value * 60);
      } else {
        return Math.round(value);
      }
    }
  }
  
  return undefined;
}

/**
 * Extract temperature from text
 */
export function extractTemperature(text: string): string | undefined {
  const tempMatch = text.match(/(\d+)\s*°?\s*([CF])/i);
  if (tempMatch) {
    return `${tempMatch[1]}°${tempMatch[2].toUpperCase()}`;
  }
  return undefined;
}

/**
 * Detect if a line is likely a step header
 */
function isStepHeader(line: string): boolean {
  const cleaned = line.trim().toLowerCase();
  
  // Numbered steps: "1.", "Step 1", "1)", etc.
  if (/^\d+[\.\)]/.test(cleaned) || /^step\s+\d+/i.test(cleaned)) {
    return true;
  }
  
  // Short lines ending with colon (section headers)
  if (cleaned.length < 60 && cleaned.endsWith(':')) {
    return true;
  }
  
  // Lines that start with common cooking verbs
  const firstWord = cleaned.split(/\s+/)[0];
  if (COOKING_VERBS.includes(firstWord)) {
    return true;
  }
  
  return false;
}

/**
 * Detect if a line contains an ingredient
 */
function isIngredientLine(line: string): boolean {
  const cleaned = line.trim().toLowerCase();
  
  // Has a number at the start
  if (/^\d+/.test(cleaned)) {
    return true;
  }
  
  // Contains a unit word
  for (const unit of UNITS) {
    if (cleaned.includes(' ' + unit + ' ') || cleaned.includes(' ' + unit + 's ')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Parse recipe from plain text
 */
export function parseRecipeText(text: string): ParsedRecipe {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  if (lines.length === 0) {
    throw new Error('Empty recipe text');
  }
  
  // First line is likely the title
  const title = lines[0];
  
  const ingredients: ParsedIngredient[] = [];
  const steps: ParsedStep[] = [];
  let currentStep: ParsedStep | null = null;
  let currentStepNumber = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip very short lines (likely formatting)
    if (line.length < 3) continue;
    
    // Check if this is a step header
    if (isStepHeader(line)) {
      // Save previous step
      if (currentStep) {
        steps.push(currentStep);
      }
      
      currentStepNumber++;
      
      // Extract step title (remove numbering)
      let stepTitle = line
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^step\s+\d+:?\s*/i, '')
        .replace(/:$/, '')
        .trim();
      
      if (!stepTitle) {
        stepTitle = `Step ${currentStepNumber}`;
      }
      
      currentStep = {
        number: currentStepNumber,
        title: stepTitle,
        instructions: '',
        ingredients: []
      };
      
      continue;
    }
    
    // Check if this is an ingredient line
    if (isIngredientLine(line)) {
      const ingredient = parseIngredient(line);
      
      // Add to global ingredients list
      if (!ingredients.find(ing => ing.fullText === ingredient.fullText)) {
        ingredients.push(ingredient);
      }
      
      // Add to current step if we have one
      if (currentStep) {
        currentStep.ingredients.push(ingredient);
      }
      
      continue;
    }
    
    // Otherwise, it's instruction text
    if (currentStep) {
      if (currentStep.instructions) {
        currentStep.instructions += '\n' + line;
      } else {
        currentStep.instructions = line;
      }
      
      // Extract time if present
      const time = extractTime(line);
      if (time && !currentStep.timerMinutes) {
        currentStep.timerMinutes = time;
      }
      
      // Extract temperature if present
      const temp = extractTemperature(line);
      if (temp && !currentStep.temperature) {
        currentStep.temperature = temp;
      }
    } else {
      // No current step, but we have instruction text - create a step
      currentStepNumber++;
      currentStep = {
        number: currentStepNumber,
        title: line.length < 60 ? line : 'Preparation',
        instructions: line.length >= 60 ? line : '',
        ingredients: []
      };
      
      // Extract time/temp
      const time = extractTime(line);
      if (time) currentStep.timerMinutes = time;
      
      const temp = extractTemperature(line);
      if (temp) currentStep.temperature = temp;
    }
  }
  
  // Save last step
  if (currentStep) {
    steps.push(currentStep);
  }
  
  return {
    title,
    ingredients,
    steps
  };
}

/**
 * Fetch and parse recipe from URL
 */
export async function parseRecipeFromURL(url: string): Promise<ParsedRecipe> {
  try {
    console.log('🌐 Fetching recipe from:', url);
    
    // Fetch the HTML
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Try to extract recipe using common formats
    const recipe = extractRecipeFromHTML(html, url);
    
    if (!recipe || recipe.steps.length === 0) {
      throw new Error('Could not find recipe in page');
    }
    
    console.log('✅ Parsed recipe:', recipe.title);
    console.log('   Steps:', recipe.steps.length);
    console.log('   Ingredients:', recipe.ingredients.length);
    
    return recipe;
  } catch (error) {
    console.error('❌ URL parsing error:', error);
    throw error;
  }
}

/**
 * Extract recipe from HTML content
 */
function extractRecipeFromHTML(html: string, sourceUrl: string): ParsedRecipe | null {
  // Remove script and style tags
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Try to find JSON-LD structured data (schema.org Recipe)
  const jsonLdMatch = cleaned.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      const recipeData = Array.isArray(jsonData) ? jsonData.find((item: any) => item['@type'] === 'Recipe') : jsonData;
      
      if (recipeData && recipeData['@type'] === 'Recipe') {
        return parseRecipeFromJSONLD(recipeData, sourceUrl);
      }
    } catch (e) {
      console.log('Failed to parse JSON-LD:', e);
    }
  }
  
  // Fallback: extract text and parse
  // Remove HTML tags
  const text = cleaned
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, '\n')
    .trim();
  
  try {
    const parsed = parseRecipeText(text);
    parsed.source = sourceUrl;
    return parsed;
  } catch (e) {
    console.log('Failed to parse as text:', e);
    return null;
  }
}

/**
 * Parse recipe from JSON-LD structured data
 */
function parseRecipeFromJSONLD(data: any, sourceUrl: string): ParsedRecipe {
  const steps: ParsedStep[] = [];
  
  // Parse instructions
  const instructions = data.recipeInstructions || [];
  let stepNumber = 0;
  
  for (const instruction of instructions) {
    stepNumber++;
    
    let stepText = '';
    let stepName = '';
    
    if (typeof instruction === 'string') {
      stepText = instruction;
      stepName = instruction.length < 60 ? instruction : `Step ${stepNumber}`;
    } else if (instruction['@type'] === 'HowToStep') {
      stepText = instruction.text || '';
      stepName = instruction.name || `Step ${stepNumber}`;
    }
    
    const step: ParsedStep = {
      number: stepNumber,
      title: stepName,
      instructions: stepText,
      ingredients: []
    };
    
    // Extract time and temperature
    step.timerMinutes = extractTime(stepText);
    step.temperature = extractTemperature(stepText);
    
    steps.push(step);
  }
  
  // Parse ingredients
  const ingredients: ParsedIngredient[] = [];
  const recipeIngredients = data.recipeIngredient || [];
  
  for (const ing of recipeIngredients) {
    const parsed = parseIngredient(ing);
    ingredients.push(parsed);
  }
  
  return {
    title: data.name || 'Imported Recipe',
    source: sourceUrl,
    prepTime: data.prepTime,
    cookTime: data.cookTime,
    totalTime: data.totalTime,
    servings: data.recipeYield?.toString(),
    ingredients,
    steps
  };
}

/**
 * Convert ParsedRecipe to Workflow format
 */
export function convertToWorkflow(parsed: ParsedRecipe): {
  id: string;
  name: string;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    timerMinutes?: number;
    completed: boolean;
  }>;
} {
  const workflowId = parsed.title.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
  
  const workflowSteps = parsed.steps.map((step, index) => {
    let description = step.instructions;
    
    // Add temperature if present
    if (step.temperature) {
      description += `\n\nTarget Temperature: ${step.temperature}`;
    }
    
    // Add ingredients checklist if present
    if (step.ingredients.length > 0) {
      description += '\n\n📋 Checklist:\n';
      description += step.ingredients
        .map(ing => `☐ ${ing.fullText}`)
        .join('\n');
    }
    
    return {
      id: `${workflowId}_step_${index + 1}`,
      title: step.title,
      description: description.trim(),
      timerMinutes: step.timerMinutes,
      completed: false
    };
  });
  
  return {
    id: workflowId,
    name: parsed.title,
    steps: workflowSteps
  };
}