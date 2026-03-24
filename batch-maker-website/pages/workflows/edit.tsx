// pages/workflows/edit.tsx
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { getSupabaseClient } from '../../lib/supabase';

const supabase = getSupabaseClient();

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  ingredient: string | null;
  unit: string | null;
  category: string | null;
}

interface StepIngredient {
  name: string;
  amount: string;
  unit: string;
  inventory_item_id: string | null;
  inventory_unit: string | null;
}

interface WorkflowStep {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  duration_minutes?: number;
  notes?: string;
  order?: number;
  temperature?: number;
  temperature_unit?: string;
  timerMinutes?: number;
  completed?: boolean;
  // ingredients can be legacy string[] or new StepIngredient[]
  ingredients?: (string | StepIngredient)[];
}

interface Workflow {
  id: string;
  user_id: string;
  name: string;
  steps: WorkflowStep[];
  claimed_by?: string;
  claimed_by_name?: string;
  yield_amount?: number | null;
  yield_unit?: string | null;
  created_at: string;
  updated_at: string;
}

const YIELD_UNITS = [
  'pieces', 'portions', 'servings', 'loaves', 'rolls', 'buns', 'cookies',
  'muffins', 'croissants', 'bagels', 'cakes', 'tarts', 'pies', 'bars',
  'kg', 'g', 'lb', 'oz', 'litres', 'ml', 'batches',
];

const AMOUNT_UNITS = [
  'g', 'kg', 'ml', 'l', 'oz', 'lb', 'cup', 'cups', 'tbsp', 'tsp',
  'piece', 'pieces', 'ea', 'cs', 'bag', 'box', 'can', 'bt', 'pinch',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normalise legacy string[] ingredients into StepIngredient[] for editing
function normaliseIngredients(raw: (string | StepIngredient)[] | undefined): StepIngredient[] {
  if (!raw?.length) return [];
  return raw.map(item => {
    if (typeof item === 'string') {
      // Try to parse "250g All Purpose Flour" or "2 cups sugar"
      const match = item.trim().match(
        /^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|lb|cups?|tbsp|tsp|pieces?|ea|cs|bag|box|can|bt)?\s+(.+)$/i
      );
      if (match) {
        return {
          name: match[3].trim(),
          amount: match[1],
          unit: match[2] ?? '',
          inventory_item_id: null,
          inventory_unit: null,
        };
      }
      return { name: item, amount: '', unit: '', inventory_item_id: null, inventory_unit: null };
    }
    return item;
  });
}

// ─── Ingredient row component ─────────────────────────────────────────────────

function IngredientRow({
  ingredient,
  inventoryItems,
  onChange,
  onRemove,
}: {
  ingredient: StepIngredient;
  inventoryItems: InventoryItem[];
  onChange: (updated: StepIngredient) => void;
  onRemove: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const linkedItem = inventoryItems.find(i => i.id === ingredient.inventory_item_id);

  const filtered = search.length > 0
    ? inventoryItems.filter(i =>
        (i.ingredient ?? i.name).toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : [];

  function selectItem(item: InventoryItem) {
    onChange({
      ...ingredient,
      inventory_item_id: item.id,
      inventory_unit: item.unit,
      name: ingredient.name || (item.ingredient ?? item.name),
    });
    setSearch('');
    setShowDropdown(false);
  }

  function clearLink() {
    onChange({ ...ingredient, inventory_item_id: null, inventory_unit: null });
  }

  return (
    <div className="flex gap-2 items-start p-3 bg-white border border-gray-200 rounded-lg">
      {/* Amount */}
      <input
        type="text"
        value={ingredient.amount}
        onChange={e => onChange({ ...ingredient, amount: e.target.value })}
        placeholder="Qty"
        className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
      />

      {/* Unit */}
      <input
        type="text"
        list="amount-units"
        value={ingredient.unit}
        onChange={e => onChange({ ...ingredient, unit: e.target.value })}
        placeholder="Unit"
        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
      />
      <datalist id="amount-units">
        {AMOUNT_UNITS.map(u => <option key={u} value={u} />)}
      </datalist>

      {/* Name */}
      <input
        type="text"
        value={ingredient.name}
        onChange={e => onChange({ ...ingredient, name: e.target.value })}
        placeholder="Ingredient name"
        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
      />

      {/* Inventory link */}
      <div className="relative flex-shrink-0" ref={dropdownRef}>
        {linkedItem ? (
          <div className="flex items-center gap-1 px-2 py-1.5 bg-green-50 border border-green-300 rounded text-xs text-green-700 whitespace-nowrap">
            <span>✓ {linkedItem.ingredient ?? linkedItem.name}</span>
            <button
              onClick={clearLink}
              className="ml-1 text-green-500 hover:text-red-500 font-bold"
              title="Unlink"
            >×</button>
          </div>
        ) : (
          <div>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Link inventory..."
              className="w-36 px-2 py-1.5 border border-dashed border-gray-300 rounded text-xs text-gray-500 placeholder-gray-400"
            />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {filtered.map(item => (
                  <button
                    key={item.id}
                    onMouseDown={() => selectItem(item)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-cyan-50 hover:text-cyan-700"
                  >
                    <div className="font-medium">{item.ingredient ?? item.name}</div>
                    <div className="text-gray-400">{item.category} · {item.unit ?? '—'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 text-red-400 hover:text-red-600 text-lg leading-none px-1"
        title="Remove ingredient"
      >×</button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EditWorkflow() {
  const router = useRouter();
  const { id } = router.query;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Per-step normalised ingredients for editing
  const [stepIngredients, setStepIngredients] = useState<StepIngredient[][]>([]);

  useEffect(() => {
    if (id) {
      fetchWorkflow();
      fetchInventoryItems();
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchWorkflow() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', id)
        .eq('user_id', session.user.id)
        .single();

      if (error) throw error;

      setWorkflow(data);
      setStepIngredients((data.steps ?? []).map((s: WorkflowStep) =>
        normaliseIngredients(s.ingredients)
      ));
      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load workflow');
      setLoading(false);
    }
  }

  async function fetchInventoryItems() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from('inventory_items')
      .select('id, name, ingredient, unit, category')
      .eq('owner_id', session.user.id)
      .order('name');
    setInventoryItems(data ?? []);
  }

  async function handleSave() {
    if (!workflow) return;
    setSaving(true);
    setError('');

    try {
      // Merge edited stepIngredients back into steps
      const mergedSteps = workflow.steps.map((step, i) => ({
        ...step,
        ingredients: stepIngredients[i] ?? [],
      }));

      const { error } = await supabase
        .from('workflows')
        .update({
          name: workflow.name,
          steps: mergedSteps,
          yield_amount: workflow.yield_amount ?? null,
          yield_unit: workflow.yield_unit ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflow.id);

      if (error) throw error;

      alert('Workflow saved successfully!');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!workflow) return;
    if (!confirm('Are you sure you want to delete this workflow? This cannot be undone.')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('workflows')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', workflow.id);
      if (error) throw error;
      alert('Workflow deleted');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to delete workflow');
      setSaving(false);
    }
  }

  function updateWorkflowName(name: string) {
    if (workflow) setWorkflow({ ...workflow, name });
  }

  function updateStep(index: number, field: keyof WorkflowStep, value: any) {
    if (!workflow) return;
    const newSteps = [...workflow.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setWorkflow({ ...workflow, steps: newSteps });
  }

  function addStep() {
    if (!workflow) return;
    const newStep: WorkflowStep = { id: `step-${Date.now()}`, title: '', description: '' };
    setWorkflow({ ...workflow, steps: [...workflow.steps, newStep] });
    setStepIngredients([...stepIngredients, []]);
  }

  function removeStep(index: number) {
    if (!workflow) return;
    setWorkflow({ ...workflow, steps: workflow.steps.filter((_, i) => i !== index) });
    setStepIngredients(stepIngredients.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    if (!workflow) return;
    const newSteps = [...workflow.steps];
    const newIngredients = [...stepIngredients];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newSteps.length) return;
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    [newIngredients[index], newIngredients[newIndex]] = [newIngredients[newIndex], newIngredients[index]];
    setWorkflow({ ...workflow, steps: newSteps });
    setStepIngredients(newIngredients);
  }

  function addIngredient(stepIndex: number) {
    const updated = [...stepIngredients];
    updated[stepIndex] = [
      ...(updated[stepIndex] ?? []),
      { name: '', amount: '', unit: '', inventory_item_id: null, inventory_unit: null },
    ];
    setStepIngredients(updated);
  }

  function updateIngredient(stepIndex: number, ingIndex: number, updated: StepIngredient) {
    const newIngredients = [...stepIngredients];
    newIngredients[stepIndex] = [...(newIngredients[stepIndex] ?? [])];
    newIngredients[stepIndex][ingIndex] = updated;
    setStepIngredients(newIngredients);
  }

  function removeIngredient(stepIndex: number, ingIndex: number) {
    const newIngredients = [...stepIngredients];
    newIngredients[stepIndex] = newIngredients[stepIndex].filter((_, i) => i !== ingIndex);
    setStepIngredients(newIngredients);
  }

  const linkedCount = stepIngredients.flat().filter(i => i.inventory_item_id).length;
  const totalCount = stepIngredients.flat().length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-500">Loading workflow...</div>
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-500 mb-4">{error}</div>
          <Link href="/dashboard" className="text-cyan-500 underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-gray-500 mb-4">Workflow not found</div>
          <Link href="/dashboard" className="text-cyan-500 underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Edit Workflow</h1>
          <Link href="/dashboard" className="text-cyan-500 hover:text-cyan-600">
            ← Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
            {error}
          </div>
        )}

        {/* Inventory linkage summary */}
        {totalCount > 0 && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
            linkedCount === totalCount
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700'
          }`}>
            <span>{linkedCount === totalCount ? '✓' : '⚠'}</span>
            <span>
              {linkedCount}/{totalCount} ingredients linked to inventory
              {linkedCount < totalCount && ' — unlinked ingredients won\'t auto-deduct on batch completion'}
            </span>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">

          {/* Workflow Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Workflow Name</label>
            <input
              type="text"
              value={workflow.name}
              onChange={e => updateWorkflowName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="e.g., Sourdough Bread"
            />
          </div>

          {/* Yield */}
          <div className="mb-6 p-4 bg-cyan-50 border border-cyan-100 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch Yield</label>
            <p className="text-xs text-gray-500 mb-3">
              How much does one batch produce? Used for production planning and catering calculations.
            </p>
            <div className="flex gap-3">
              <input
                type="number"
                min="0"
                step="any"
                value={workflow.yield_amount ?? ''}
                onChange={e => setWorkflow({ ...workflow, yield_amount: e.target.value ? parseFloat(e.target.value) : null })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                placeholder="Amount (e.g. 24)"
              />
              <input
                type="text"
                list="yield-units"
                value={workflow.yield_unit ?? ''}
                onChange={e => setWorkflow({ ...workflow, yield_unit: e.target.value || null })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                placeholder="Unit (e.g. croissants)"
              />
              <datalist id="yield-units">
                {YIELD_UNITS.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
            {workflow.yield_amount && workflow.yield_unit && (
              <p className="text-xs text-cyan-600 mt-2">
                One batch produces {workflow.yield_amount} {workflow.yield_unit}
              </p>
            )}
          </div>

          {/* Steps */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Steps</h2>
              <button
                onClick={addStep}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium"
              >
                + Add Step
              </button>
            </div>

            {workflow.steps.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No steps yet. Click "Add Step" to get started.</p>
            ) : (
              <div className="space-y-6">
                {workflow.steps.map((step, index) => (
                  <div key={step.id} className="border border-gray-200 rounded-xl overflow-hidden">

                    {/* Step header */}
                    <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-600">Step {index + 1}</span>
                        <div className="flex gap-1">
                          {index > 0 && (
                            <button onClick={() => moveStep(index, 'up')} className="p-1 text-gray-400 hover:text-gray-600" title="Move up">▲</button>
                          )}
                          {index < workflow.steps.length - 1 && (
                            <button onClick={() => moveStep(index, 'down')} className="p-1 text-gray-400 hover:text-gray-600" title="Move down">▼</button>
                          )}
                        </div>
                      </div>
                      <button onClick={() => removeStep(index)} className="text-red-400 hover:text-red-600 text-sm">
                        Remove step
                      </button>
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Title */}
                      <input
                        type="text"
                        value={step.title}
                        onChange={e => updateStep(index, 'title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Step title"
                      />

                      {/* Description */}
                      <textarea
                        value={step.description || ''}
                        onChange={e => updateStep(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Step instructions (optional)"
                        rows={2}
                      />

                      {/* Duration */}
                      <input
                        type="number"
                        value={step.duration || step.duration_minutes || step.timerMinutes || ''}
                        onChange={e => updateStep(index, 'duration', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Duration in minutes (optional)"
                      />

                      {/* Ingredients section */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <div>
                            <span className="text-sm font-semibold text-gray-700">Ingredients used in this step</span>
                            {(stepIngredients[index] ?? []).length > 0 && (
                              <span className="ml-2 text-xs text-gray-400">
                                {(stepIngredients[index] ?? []).filter(i => i.inventory_item_id).length}/
                                {(stepIngredients[index] ?? []).length} linked
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => addIngredient(index)}
                            className="text-xs px-2 py-1 bg-cyan-50 text-cyan-600 border border-cyan-200 rounded hover:bg-cyan-100"
                          >
                            + Add Ingredient
                          </button>
                        </div>

                        {(stepIngredients[index] ?? []).length === 0 ? (
                          <p className="text-xs text-gray-400 italic py-2">
                            No ingredients yet — click "Add Ingredient" to link this step to inventory items.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {(stepIngredients[index] ?? []).map((ing, ingIndex) => (
                              <IngredientRow
                                key={ingIndex}
                                ingredient={ing}
                                inventoryItems={inventoryItems}
                                onChange={updated => updateIngredient(index, ingIndex, updated)}
                                onRemove={() => removeIngredient(index, ingIndex)}
                              />
                            ))}
                          </div>
                        )}

                        {inventoryItems.length === 0 && (
                          <p className="text-xs text-amber-600 mt-2">
                            ⚠ No inventory items found. Add items in the Inventory tab first to enable linking.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !workflow.name || workflow.steps.length === 0}
              className="flex-1 px-6 py-3 bg-cyan-500 text-white rounded-lg font-medium hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Workflow'}
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-6 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:bg-gray-300"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-500 text-center">
          Created: {new Date(workflow.created_at).toLocaleString()}
          {workflow.updated_at !== workflow.created_at && (
            <> · Updated: {new Date(workflow.updated_at).toLocaleString()}</>
          )}
        </div>
      </div>
    </div>
  );
}