// pages/workflows/create.tsx
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  notes?: string;
  ingredients?: StepIngredient[];
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
      <input
        type="text"
        value={ingredient.amount}
        onChange={e => onChange({ ...ingredient, amount: e.target.value })}
        placeholder="Qty"
        className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
      />
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
      <input
        type="text"
        value={ingredient.name}
        onChange={e => onChange({ ...ingredient, name: e.target.value })}
        placeholder="Ingredient name"
        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
      />
      <div className="relative flex-shrink-0">
        {linkedItem ? (
          <div className="flex items-center gap-1 px-2 py-1.5 bg-green-50 border border-green-300 rounded text-xs text-green-700 whitespace-nowrap">
            <span>✓ {linkedItem.ingredient ?? linkedItem.name}</span>
            <button onClick={clearLink} className="ml-1 text-green-500 hover:text-red-500 font-bold" title="Unlink">×</button>
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
      <button onClick={onRemove} className="flex-shrink-0 text-red-400 hover:text-red-600 text-lg leading-none px-1" title="Remove">×</button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreateWorkflow() {
  const router = useRouter();

  const [workflowName, setWorkflowName] = useState('');
  const [yieldAmount, setYieldAmount] = useState<number | null>(null);
  const [yieldUnit, setYieldUnit] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [stepIngredients, setStepIngredients] = useState<StepIngredient[][]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchInventoryItems();
  }, []);

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

  function addStep() {
    const newStep: WorkflowStep = { id: `step-${Date.now()}`, title: '', description: '' };
    setSteps([...steps, newStep]);
    setStepIngredients([...stepIngredients, []]);
  }

  function updateStep(index: number, field: keyof WorkflowStep, value: any) {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
    setStepIngredients(stepIngredients.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    const newSteps = [...steps];
    const newIngredients = [...stepIngredients];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newSteps.length) return;
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    [newIngredients[index], newIngredients[newIndex]] = [newIngredients[newIndex], newIngredients[index]];
    setSteps(newSteps);
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

  async function handleSave() {
    setError('');
    if (!workflowName.trim()) { setError('Please enter a workflow name'); return; }
    if (steps.length === 0) { setError('Please add at least one step'); return; }
    if (steps.some(s => !s.title.trim())) { setError('All steps must have a title'); return; }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      // Merge ingredients into steps
      const mergedSteps = steps.map((step, i) => ({
        ...step,
        ingredients: stepIngredients[i] ?? [],
      }));

      const { error: insertError } = await supabase
        .from('workflows')
        .insert({
          user_id: session.user.id,
          name: workflowName,
          steps: mergedSteps,
          yield_amount: yieldAmount ?? null,
          yield_unit: yieldUnit || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      alert('Workflow created successfully!');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to create workflow');
      setSaving(false);
    }
  }

  const linkedCount = stepIngredients.flat().filter(i => i.inventory_item_id).length;
  const totalCount = stepIngredients.flat().length;

  return (
    <main className="min-h-screen flex items-center justify-center" style={styles.background}>
      <div className="min-h-screen bg-gray-50 py-8 px-4 rounded-lg shadow w-full">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex justify-between items-center">
            <h1 className="text-3xl pr-10 font-bold text-gray-900">Create New Workflow</h1>
            <Link href="/dashboard" className="text-cyan-500 hover:text-cyan-600">
              ← Back to Dashboard
            </Link>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">{error}</div>
          )}

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
                value={workflowName}
                onChange={e => setWorkflowName(e.target.value)}
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
                  value={yieldAmount ?? ''}
                  onChange={e => setYieldAmount(e.target.value ? parseFloat(e.target.value) : null)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="Amount (e.g. 24)"
                />
                <input
                  type="text"
                  list="yield-units"
                  value={yieldUnit}
                  onChange={e => setYieldUnit(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="Unit (e.g. croissants)"
                />
                <datalist id="yield-units">
                  {YIELD_UNITS.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
              {yieldAmount && yieldUnit && (
                <p className="text-xs text-cyan-600 mt-2">One batch produces {yieldAmount} {yieldUnit}</p>
              )}
            </div>

            {/* Steps */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Steps</h2>
                <button onClick={addStep} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium">
                  + Add Step
                </button>
              </div>

              {steps.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No steps yet. Click "Add Step" to get started.</p>
              ) : (
                <div className="space-y-6">
                  {steps.map((step, index) => (
                    <div key={step.id} className="border border-gray-200 rounded-xl overflow-hidden">

                      {/* Step header */}
                      <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-600">Step {index + 1}</span>
                          <div className="flex gap-1">
                            {index > 0 && (
                              <button onClick={() => moveStep(index, 'up')} className="p-1 text-gray-400 hover:text-gray-600">▲</button>
                            )}
                            {index < steps.length - 1 && (
                              <button onClick={() => moveStep(index, 'down')} className="p-1 text-gray-400 hover:text-gray-600">▼</button>
                            )}
                          </div>
                        </div>
                        <button onClick={() => removeStep(index)} className="text-red-400 hover:text-red-600 text-sm">
                          Remove step
                        </button>
                      </div>

                      <div className="p-4 space-y-3">
                        <input
                          type="text"
                          value={step.title}
                          onChange={e => updateStep(index, 'title', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Step title"
                        />
                        <textarea
                          value={step.description || ''}
                          onChange={e => updateStep(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Step instructions (optional)"
                          rows={2}
                        />
                        <input
                          type="number"
                          value={step.duration || ''}
                          onChange={e => updateStep(index, 'duration', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Duration in minutes (optional)"
                        />

                        {/* Ingredients */}
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

            <button
              onClick={handleSave}
              disabled={saving || !workflowName || steps.length === 0}
              className="w-full px-6 py-3 bg-cyan-500 text-white rounded-lg font-medium hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating...' : 'Create Workflow'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

const styles = {
  background: {
    backgroundImage: 'url("/assets/images/1920x1080-horizontal-bg.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  },
};