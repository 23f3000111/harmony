import { and, asc, between, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { addDays, eventInput, eventUpdate, mealInput, mealUpdate, recipeInput, recipeUpdate, startOfWeek, type EventDTO, type MealDTO, type RecipeDTO } from '@harmony/shared';
import { announceFrom, idParam, needFeature, needManager, readBody, type AppDeps, type AppEnv, type Ctx } from '../context';
import type { DB } from '../db/types';
import { events, items, meals, recipes, restockEntries, type EventRow, type MealRow, type RecipeRow } from '../db/schema';
import { notFound } from '../errors';

const validDate = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

export const eventDTO = (row: EventRow): EventDTO => ({ id: row.id, title: row.title, date: row.date, time: row.time, kind: row.kind, notes: row.notes });

export const recipeDTO = (row: RecipeRow): RecipeDTO => ({
  id: row.id,
  name: row.name,
  notes: row.notes,
  prepMinutes: row.prepMinutes,
  cookMinutes: row.cookMinutes,
  serves: row.serves,
  favorite: row.favorite,
  ingredients: row.ingredients,
});

export const mealDTO = (row: MealRow, recipe: Pick<RecipeRow, 'prepMinutes' | 'cookMinutes' | 'serves'> | null): MealDTO => ({
  id: row.id,
  date: row.date,
  slot: row.slot,
  title: row.title,
  recipeId: row.recipeId,
  notes: row.notes,
  prepMinutes: recipe?.prepMinutes ?? null,
  cookMinutes: recipe?.cookMinutes ?? null,
  serves: recipe?.serves ?? null,
});

export async function loadMeals(db: DB, workspaceId: string, from: string, to: string): Promise<MealDTO[]> {
  const rows = await db
    .select({ meal: meals, prepMinutes: recipes.prepMinutes, cookMinutes: recipes.cookMinutes, serves: recipes.serves })
    .from(meals)
    .leftJoin(recipes, eq(meals.recipeId, recipes.id))
    .where(and(eq(meals.workspaceId, workspaceId), between(meals.date, from, to)))
    .orderBy(asc(meals.date));
  return rows.map(({ meal, prepMinutes, cookMinutes, serves }) => mealDTO(meal, { prepMinutes, cookMinutes, serves }));
}

export function mealRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.use('*', async (c, next) => {
    needFeature(c as Ctx, 'meals');
    await next();
  });

  const loadMeal = async (c: Ctx) => {
    const [meal] = await db
      .select()
      .from(meals)
      .where(and(eq(meals.id, idParam(c)), eq(meals.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!meal) throw notFound('That meal');
    return meal;
  };

  const loadRecipe = async (c: Ctx) => {
    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, idParam(c)), eq(recipes.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!recipe) throw notFound('That recipe');
    return recipe;
  };

  const assertRecipe = async (c: Ctx, recipeId: string | null | undefined) => {
    if (!recipeId) return;
    const [recipe] = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!recipe) throw notFound('That recipe');
  };

  r.get('/', async (c) => {
    const from = validDate(c.req.query('from')) ?? startOfWeek(c.get('today'));
    const to = validDate(c.req.query('to')) ?? addDays(from, 6);
    return c.json({ meals: await loadMeals(db, c.get('workspace').id, from, to) });
  });

  /** One meal per slot per day: planning over a slot replaces what was there. */
  r.post('/', async (c) => {
    const input = await readBody(c, mealInput);
    await assertRecipe(c as Ctx, input.recipeId);
    const workspaceId = c.get('workspace').id;
    const [meal] = await db
      .insert(meals)
      .values({ ...input, workspaceId })
      .onConflictDoUpdate({
        target: [meals.workspaceId, meals.date, meals.slot],
        set: { title: input.title, recipeId: input.recipeId ?? null, notes: input.notes ?? null },
      })
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['meals'], summary: `planned ${meal!.title} for ${meal!.slot}`, objectType: 'meal', objectId: meal!.id });
    return c.json({ id: meal!.id }, 201);
  });

  r.patch('/:id', async (c) => {
    const meal = await loadMeal(c as Ctx);
    const input = await readBody(c, mealUpdate);
    await assertRecipe(c as Ctx, input.recipeId);
    await db.update(meals).set(input).where(eq(meals.id, meal.id));
    await announceFrom(deps, c as Ctx, { scopes: ['meals'] });
    return c.json({ ok: true });
  });

  r.delete('/:id', async (c) => {
    const meal = await loadMeal(c as Ctx);
    await db.delete(meals).where(eq(meals.id, meal.id));
    await announceFrom(deps, c as Ctx, { scopes: ['meals'], summary: `removed ${meal.title} from the plan`, objectType: 'meal' });
    return c.json({ ok: true });
  });

  /** Adds what the recipe needs and the pantry can't cover. Items already on the list aren't added twice. */
  r.post('/:id/shop', async (c) => {
    const meal = await loadMeal(c as Ctx);
    const workspaceId = c.get('workspace').id;
    if (!meal.recipeId) return c.json({ added: 0, covered: 0 });
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, meal.recipeId)).limit(1);
    if (!recipe) return c.json({ added: 0, covered: 0 });

    const stock = await db.select().from(items).where(and(eq(items.workspaceId, workspaceId), sql`${items.archivedAt} is null`));
    const open = await db.select().from(restockEntries).where(and(eq(restockEntries.workspaceId, workspaceId), eq(restockEntries.status, 'needed')));
    const memberId = c.get('member').id;
    let added = 0;
    let covered = 0;

    for (const ingredient of recipe.ingredients) {
      const lower = ingredient.name.toLowerCase();
      const item = stock.find((row) => row.id === ingredient.itemId || row.name.toLowerCase() === lower);
      const needed = ingredient.qty ?? 1;
      if (item && item.quantity >= needed && item.quantity > item.minQty) {
        covered += 1;
        continue;
      }
      const already = open.some((entry) => (item && entry.itemId === item.id) || entry.name.toLowerCase() === (item?.name ?? ingredient.name).toLowerCase());
      if (already) {
        covered += 1;
        continue;
      }
      await db.insert(restockEntries).values({
        workspaceId,
        itemId: item?.id ?? null,
        name: item?.name ?? ingredient.name,
        quantity: needed,
        unit: ingredient.unit ?? item?.unit ?? null,
        estCostCents: item ? Math.round(needed * item.unitCostCents) : 0,
        source: 'meal',
        addedById: memberId,
      }).onConflictDoNothing();
      added += 1;
    }
    if (added > 0) {
      await announceFrom(deps, c as Ctx, { scopes: ['restock', 'items'], summary: `added ${added} ingredient${added === 1 ? '' : 's'} for ${meal.title} to the list`, objectType: 'meal', objectId: meal.id });
    }
    return c.json({ added, covered });
  });

  // Recipes

  r.get('/recipes/all', async (c) => {
    const rows = await db.select().from(recipes).where(eq(recipes.workspaceId, c.get('workspace').id)).orderBy(asc(recipes.name));
    return c.json({ recipes: rows.map(recipeDTO) });
  });

  r.post('/recipes', async (c) => {
    const input = await readBody(c, recipeInput);
    const [recipe] = await db.insert(recipes).values({ ...input, workspaceId: c.get('workspace').id }).returning();
    await announceFrom(deps, c as Ctx, { scopes: ['recipes'], summary: `added the ${recipe!.name} recipe`, objectType: 'recipe', objectId: recipe!.id });
    return c.json({ recipe: recipeDTO(recipe!) }, 201);
  });

  r.patch('/recipes/:id', async (c) => {
    const recipe = await loadRecipe(c as Ctx);
    const input = await readBody(c, recipeUpdate);
    await db.update(recipes).set(input).where(eq(recipes.id, recipe.id));
    await announceFrom(deps, c as Ctx, { scopes: ['recipes', 'meals'] });
    return c.json({ ok: true });
  });

  r.delete('/recipes/:id', async (c) => {
    const recipe = await loadRecipe(c as Ctx);
    await db.delete(recipes).where(eq(recipes.id, recipe.id));
    await announceFrom(deps, c as Ctx, { scopes: ['recipes', 'meals'], summary: `removed the ${recipe.name} recipe`, objectType: 'recipe' });
    return c.json({ ok: true });
  });

  return r;
}

export function eventRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  const load = async (c: Ctx) => {
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, idParam(c)), eq(events.workspaceId, c.get('workspace').id)))
      .limit(1);
    if (!event) throw notFound('That event');
    return event;
  };

  r.get('/', async (c) => {
    const from = validDate(c.req.query('from')) ?? c.get('today');
    const to = validDate(c.req.query('to')) ?? addDays(from, 60);
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.workspaceId, c.get('workspace').id), between(events.date, from, to)))
      .orderBy(asc(events.date), asc(events.time));
    return c.json({ events: rows.map(eventDTO) });
  });

  r.post('/', async (c) => {
    const input = await readBody(c, eventInput);
    const [event] = await db.insert(events).values({ ...input, workspaceId: c.get('workspace').id }).returning();
    await announceFrom(deps, c as Ctx, { scopes: ['events'], summary: `added ${event!.title} to the calendar`, objectType: 'event', objectId: event!.id });
    return c.json({ event: eventDTO(event!) }, 201);
  });

  r.patch('/:id', async (c) => {
    needManager(c as Ctx);
    const event = await load(c as Ctx);
    const input = await readBody(c, eventUpdate);
    await db.update(events).set(input).where(eq(events.id, event.id));
    await announceFrom(deps, c as Ctx, { scopes: ['events'] });
    return c.json({ ok: true });
  });

  r.delete('/:id', async (c) => {
    needManager(c as Ctx);
    const event = await load(c as Ctx);
    await db.delete(events).where(eq(events.id, event.id));
    await announceFrom(deps, c as Ctx, { scopes: ['events'], summary: `removed ${event.title} from the calendar`, objectType: 'event' });
    return c.json({ ok: true });
  });

  return r;
}
