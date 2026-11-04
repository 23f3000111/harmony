import clsx from 'clsx';
import { ChefHat, ChevronLeft, ChevronRight, Heart, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addDays, dateRange, startOfWeek, type MealDTO, type MealSlot, type RecipeDTO } from '@harmony/shared';
import { del, fieldError, generalError, patch, post } from '@/lib/api';
import { dayMonth, dayNumber, minutesLabel, weekday } from '@/lib/format';
import { useWMutation, useWorkspace, useWQuery } from '@/lib/workspace';
import { useRecipes } from '@/features/data';
import { Button, IconButton } from '@/ui/Button';
import { FormError, SelectField, TextArea, TextField } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { CardHeader, PageHeader } from '@/ui/Primitives';
import { Loaded, Skeleton } from '@/ui/States';

const SLOTS: MealSlot[] = ['lunch', 'dinner'];

export default function Meals() {
  const { today } = useWorkspace();
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const days = dateRange(weekStart, 7);
  const query = useWQuery<{ meals: MealDTO[] }>('meals', `/meals?from=${weekStart}&to=${addDays(weekStart, 6)}`, { placeholderData: (previous) => previous });
  const recipes = useRecipes();
  const [slot, setSlot] = useState<{ date: string; slot: MealSlot; meal?: MealDTO } | null>(null);
  const [recipe, setRecipe] = useState<RecipeDTO | null | 'new'>(null);

  return (
    <>
      <PageHeader
        title="Meal plan"
        sub="Plan the week, then send what the pantry can’t cover straight to the shopping list."
        actions={
          <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1 shadow-soft">
            <IconButton icon={ChevronLeft} label="Previous week" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} />
            <button type="button" onClick={() => setWeekStart(startOfWeek(today))} className="px-2 text-[13.5px] font-semibold">
              {dayMonth(weekStart)} to {dayMonth(addDays(weekStart, 6))}
            </button>
            <IconButton icon={ChevronRight} label="Next week" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} />
          </div>
        }
      />

      <Loaded query={query} skeleton={<Skeleton className="h-[420px] !rounded-card" />}>
        {({ meals }) => (
          <div className="scroll-thin -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="grid min-w-[840px] grid-cols-7 gap-3">
              {days.map((date) => {
                const isToday = date === today;
                return (
                  <section key={date} className={clsx('rounded-[22px] border p-3', isToday ? 'border-brand-200 bg-brand-50/70' : 'border-line/70 bg-white shadow-soft')} aria-label={dayMonth(date)}>
                    <header className="mb-3 flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-ink-soft">{weekday(date)}</span>
                      <span className={clsx('grid size-8 place-items-center rounded-full text-[14px] font-semibold', isToday ? 'bg-brand-600 text-white shadow-glow' : '')}>{dayNumber(date)}</span>
                    </header>
                    <div className="space-y-2">
                      {SLOTS.map((name) => {
                        const meal = meals.find((row) => row.date === date && row.slot === name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setSlot({ date, slot: name, meal })}
                            className={clsx(
                              'group block min-h-[86px] w-full rounded-2xl p-2.5 text-left transition-all hover:-translate-y-0.5',
                              meal ? (name === 'dinner' ? 'bg-brand-gradient grain text-white shadow-glow' : 'bg-white shadow-soft ring-1 ring-line/70') : 'border border-dashed border-line text-ink-soft hover:border-brand-300 hover:text-brand-700',
                            )}
                          >
                            <span className={clsx('block text-[11px] font-semibold', meal && name === 'dinner' ? 'text-white/75' : 'text-ink-soft')}>{name === 'dinner' ? 'Dinner' : 'Lunch'}</span>
                            {meal ? (
                              <>
                                <span className="mt-1 line-clamp-3 block text-[13px] font-semibold leading-snug">{meal.title}</span>
                                {meal.cookMinutes ? <span className={clsx('mt-1 block text-[11px]', name === 'dinner' ? 'text-white/75' : 'text-ink-soft')}>{minutesLabel((meal.prepMinutes ?? 0) + meal.cookMinutes)}</span> : null}
                              </>
                            ) : (
                              <span className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold">
                                <Plus aria-hidden className="size-3.5" />
                                Plan
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </Loaded>

      <section className="card mt-6 p-5 sm:p-6">
        <CardHeader title="Family recipes" hint="Reuse them across weeks. Hearts mark favourites." action={<Button size="sm" variant="soft" icon={Plus} onClick={() => setRecipe('new')}>New recipe</Button>} />
        <Loaded query={recipes}>
          {({ recipes: list }) => (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {list.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => setRecipe(row)} className="flex w-full items-start gap-3 rounded-2xl border border-line/70 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-soft">
                    <span className="tile size-10 bg-brand-50 text-brand-600">
                      <ChefHat aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-soft">
                        {row.ingredients.length} ingredients{row.cookMinutes ? ` · ${minutesLabel((row.prepMinutes ?? 0) + row.cookMinutes)}` : ''}
                      </span>
                    </span>
                    {row.favorite && <Heart aria-label="Favourite" className="size-4 shrink-0 fill-coral-400 text-coral-400" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Loaded>
      </section>

      <MealSlotForm target={slot} onClose={() => setSlot(null)} recipes={recipes.data?.recipes ?? []} />
      <RecipeForm open={recipe !== null} recipe={recipe === 'new' ? null : recipe} onClose={() => setRecipe(null)} />
    </>
  );
}

function MealSlotForm({ target, onClose, recipes }: { target: { date: string; slot: MealSlot; meal?: MealDTO } | null; onClose: () => void; recipes: RecipeDTO[] }) {
  const { url } = useWorkspace();
  const [title, setTitle] = useState('');
  const [recipeId, setRecipeId] = useState('');
  useEffect(() => {
    if (!target) return;
    setTitle(target.meal?.title ?? '');
    setRecipeId(target.meal?.recipeId ?? '');
  }, [target]);

  const save = useWMutation({
    run: () => post(url('meals'), { date: target!.date, slot: target!.slot, title: title || recipes.find((row) => row.id === recipeId)?.name || '', recipeId: recipeId || null }),
    scopes: ['meals'],
    done: 'Planned',
    onDone: onClose,
    silentErrors: true,
  });
  const remove = useWMutation({ run: () => del(url(`meals/${target!.meal!.id}`)), scopes: ['meals'], done: 'Removed from the plan', onDone: onClose });
  const shop = useWMutation({
    run: () => post<{ added: number; covered: number }>(url(`meals/${target!.meal!.id}/shop`)),
    scopes: ['restock', 'items'],
    done: (result) => (result.added ? `Added ${result.added} ingredient${result.added === 1 ? '' : 's'} to the list` : 'The pantry already covers it'),
  });

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target ? `${target.slot === 'dinner' ? 'Dinner' : 'Lunch'}, ${weekday(target.date)} ${dayMonth(target.date)}` : ''}
      size="sm"
      footer={
        <>
          {target?.meal && (
            <Button variant="ghost" icon={Trash2} className="mr-auto !text-coral-600" onClick={() => remove.mutate()}>
              Clear
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="meal-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="meal-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['title'])} />
        <SelectField
          label="From your recipes"
          value={recipeId}
          onChange={(event) => {
            setRecipeId(event.target.value);
            const match = recipes.find((row) => row.id === event.target.value);
            if (match) setTitle(match.name);
          }}
          optional
        >
          <option value="">None</option>
          {recipes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Meal" value={title} onChange={(event) => setTitle(event.target.value)} error={fieldError(save.error, 'title')} placeholder="Leftovers, eating out…" data-autofocus />
        {target?.meal?.recipeId && (
          <Button variant="soft" icon={ShoppingBasket} onClick={() => shop.mutate()} loading={shop.isPending} className="w-full">
            Add missing ingredients to the list
          </Button>
        )}
      </form>
    </Modal>
  );
}

function RecipeForm({ open, recipe, onClose }: { open: boolean; recipe: RecipeDTO | null; onClose: () => void }) {
  const { url } = useWorkspace();
  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [prep, setPrep] = useState('');
  const [cook, setCook] = useState('');
  const [serves, setServes] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(recipe?.name ?? '');
    setIngredients((recipe?.ingredients ?? []).map((row) => [row.qty, row.unit, row.name].filter(Boolean).join(' ')).join('\n'));
    setPrep(recipe?.prepMinutes ? String(recipe.prepMinutes) : '');
    setCook(recipe?.cookMinutes ? String(recipe.cookMinutes) : '');
    setServes(recipe?.serves ? String(recipe.serves) : '');
    setFavorite(recipe?.favorite ?? false);
    setNotes(recipe?.notes ?? '');
  }, [open, recipe]);

  /** "2 pack Coconut milk" or just "Garlic", one per line. */
  const parse = () =>
    ingredients
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+(?:\.\d+)?)\s+(\S+)\s+(.+)$/);
        return match ? { qty: Number(match[1]), unit: match[2], name: match[3]! } : { name: line };
      });

  const save = useWMutation({
    run: () => {
      const body = { name, ingredients: parse(), prepMinutes: prep ? Number(prep) : null, cookMinutes: cook ? Number(cook) : null, serves: serves ? Number(serves) : null, favorite, notes: notes || null };
      return recipe ? patch(url(`meals/recipes/${recipe.id}`), body) : post(url('meals/recipes'), body);
    },
    scopes: ['recipes', 'meals'],
    done: 'Recipe saved',
    onDone: onClose,
    silentErrors: true,
  });
  const remove = useWMutation({ run: () => del(url(`meals/recipes/${recipe!.id}`)), scopes: ['recipes', 'meals'], done: 'Recipe removed', onDone: onClose });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={recipe ? recipe.name : 'New recipe'}
      footer={
        <>
          {recipe && (
            <Button variant="ghost" icon={Trash2} className="mr-auto !text-coral-600" onClick={() => remove.mutate()}>
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="recipe-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="recipe-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormError message={generalError(save.error, ['name'])} />
        <div className="flex items-end gap-3">
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} error={fieldError(save.error, 'name')} wrapClassName="flex-1" required data-autofocus />
          <button type="button" onClick={() => setFavorite((value) => !value)} aria-pressed={favorite} aria-label="Favourite" className={clsx('grid size-11 place-items-center rounded-2xl border transition-colors', favorite ? 'border-coral-200 bg-coral-50 text-coral-500' : 'border-line text-ink-soft')}>
            <Heart aria-hidden className={clsx('size-5', favorite && 'fill-current')} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Prep (min)" type="number" min={0} value={prep} onChange={(event) => setPrep(event.target.value)} />
          <TextField label="Cook (min)" type="number" min={0} value={cook} onChange={(event) => setCook(event.target.value)} />
          <TextField label="Serves" type="number" min={0} value={serves} onChange={(event) => setServes(event.target.value)} />
        </div>
        <TextArea label="Ingredients" value={ingredients} onChange={(event) => setIngredients(event.target.value)} rows={5} hint="One per line, like “2 pack Coconut milk” or just “Garlic”. Names that match your pantry are checked against stock." />
        <TextArea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} optional />
      </form>
    </Modal>
  );
}
