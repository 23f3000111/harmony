import { addDays } from '@harmony/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, joinAs, signUp, workspace, type Agent, type Harness } from './helpers';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

const allTasks = async (agent: Agent, base: string, view = 'open') => (await agent.get(`${base}/tasks?view=${view}`)).body.tasks as any[];

describe('tasks', () => {
  it('finishing a repeating task keeps the record and schedules the next one', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    const created = await agent.post(`${base}/tasks`, { title: 'Water plants', dueOn: space.today, recurrence: 'weekly' });
    expect(created.status).toBe(201);
    const done = await agent.post(`${base}/tasks/${created.body.task.id}/complete`);
    expect(done.body.task.status).toBe('done');
    expect(done.body.task.completedById).toBe(space.myMemberId);

    const open = await allTasks(agent, base);
    expect(open).toHaveLength(1);
    expect(open[0].dueOn).toBe(addDays(space.today, 7));
    expect(open[0].seriesId).toBe(created.body.task.id);
    expect(await allTasks(agent, base, 'done')).toHaveLength(1);
  });

  it('finishing twice only schedules one repeat', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    const { body } = await agent.post(`${base}/tasks`, { title: 'Sweep', dueOn: space.today, recurrence: 'daily' });
    await agent.post(`${base}/tasks/${body.task.id}/complete`);
    await agent.post(`${base}/tasks/${body.task.id}/complete`);
    expect(await allTasks(agent, base)).toHaveLength(1);
  });

  it('undo removes the repeat it created', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    const { body } = await agent.post(`${base}/tasks`, { title: 'Sweep', dueOn: space.today, recurrence: 'daily' });
    await agent.post(`${base}/tasks/${body.task.id}/complete`);
    const reopened = await agent.post(`${base}/tasks/${body.task.id}/reopen`);
    expect(reopened.body.task.status).toBe('todo');
    expect(reopened.body.task.completedAt).toBeNull();
    const open = await allTasks(agent, base);
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe(body.task.id);
  });

  it('a late repeating task moves to the future instead of queueing every missed one', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    const { body } = await agent.post(`${base}/tasks`, { title: 'Weekly', dueOn: addDays(space.today, -30), recurrence: 'weekly' });
    await agent.post(`${base}/tasks/${body.task.id}/complete`);
    const open = await allTasks(agent, base);
    expect(open).toHaveLength(1);
    expect(open[0].dueOn > space.today).toBe(true);
  });

  it('skipping moves a repeat on but never counts as done', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    const { body } = await agent.post(`${base}/tasks`, { title: 'Daily', dueOn: space.today, recurrence: 'daily' });
    const skipped = await agent.post(`${base}/tasks/${body.task.id}/skip`);
    expect(skipped.body.task.status).toBe('skipped');
    expect(skipped.body.task.completedAt).toBeNull();
    const dashboard = await agent.get(`${base}/dashboard`);
    expect(dashboard.body.tasks.doneTodayCount).toBe(0);
    expect(dashboard.body.tasks.doneThisWeek).toBe(0);
    expect(await allTasks(agent, base)).toHaveLength(1);
  });

  it('members act on their own or unclaimed tasks, not other people’s', async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const base = `/api/w/${space.id}`;
    const member = await joinAs(h, owner.agent, space.id, 'member');
    const other = await owner.agent.post(`${base}/members`, { name: 'Someone else' });

    const theirs = await owner.agent.post(`${base}/tasks`, { title: 'Theirs', assigneeId: other.body.id });
    const mine = await owner.agent.post(`${base}/tasks`, { title: 'Mine', assigneeId: member.memberId });
    const unclaimed = await owner.agent.post(`${base}/tasks`, { title: 'Anyone' });

    expect((await member.agent.post(`${base}/tasks/${theirs.body.task.id}/complete`)).status).toBe(403);
    expect((await member.agent.post(`${base}/tasks/${mine.body.task.id}/complete`)).status).toBe(200);
    expect((await member.agent.post(`${base}/tasks/${unclaimed.body.task.id}/complete`)).status).toBe(200);
    expect((await member.agent.post(`${base}/tasks`, { title: 'Delegate', assigneeId: other.body.id })).status).toBe(403);
    expect((await member.agent.post(`${base}/tasks`, { title: 'For me', assigneeId: member.memberId })).status).toBe(201);
    expect((await allTasks(member.agent, base)).map((task) => task.title)).toContain('Theirs');
  });

  it('removing someone frees their open tasks and keeps their finished work', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    const person = await agent.post(`${base}/members`, { name: 'Leaver' });
    const open = await agent.post(`${base}/tasks`, { title: 'Open', assigneeId: person.body.id });
    const finished = await agent.post(`${base}/tasks`, { title: 'Finished', assigneeId: person.body.id });
    await agent.post(`${base}/tasks/${finished.body.task.id}/complete`);
    await agent.delete(`${base}/members/${person.body.id}`);
    const stillOpen = (await allTasks(agent, base)).find((task) => task.id === open.body.task.id);
    expect(stillOpen.assigneeId).toBeNull();
    const history = (await allTasks(agent, base, 'done')).find((task) => task.id === finished.body.task.id);
    expect(history.assigneeId).toBe(person.body.id);
  });

  it('searching treats wildcards as plain text', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    await agent.post(`${base}/tasks`, { title: 'Pay 100% of it' });
    await agent.post(`${base}/tasks`, { title: 'Another' });
    const found = await agent.get(`${base}/tasks?q=${encodeURIComponent('%')}`);
    expect(found.body.tasks).toHaveLength(1);
    expect(found.body.tasks[0].title).toBe('Pay 100% of it');
  });

  it('tells every open screen when something changes', async () => {
    const { agent } = await signUp(h, 'Live Person');
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    const seen: any[] = [];
    const stop = h.deps.bus.subscribe(space.id, (event) => seen.push(event));
    const task = await agent.post(`${base}/tasks`, { title: 'Announce me' });
    await agent.post(`${base}/tasks/${task.body.task.id}/complete`);
    stop();
    expect(seen).toHaveLength(2);
    expect(seen[1].summary).toBe('finished “Announce me”');
    expect(seen[1].actorName).toBe('Live Person');
    expect(seen[1].scopes).toContain('tasks');
    const feed = await agent.get(`${base}/activity`);
    expect(feed.body.activity[0].summary).toBe('finished “Announce me”');
  });
});

describe('stock and the restock list', () => {
  const setup = async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    return { agent, space, base: `/api/w/${space.id}` };
  };
  const list = async (agent: Agent, base: string) => (await agent.get(`${base}/restock`)).body.entries as any[];

  it('adds an item to the list by itself when it runs low', async () => {
    const { agent, base } = await setup();
    const item = await agent.post(`${base}/items`, { name: 'Rice', quantity: 5, minQty: 2, targetQty: 10, unit: 'kg', unitCostCents: 450 });
    expect(await list(agent, base)).toHaveLength(0);

    await agent.post(`${base}/items/${item.body.id}/adjust`, { delta: -3 });
    const entries = await list(agent, base);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'Rice', quantity: 8, unit: 'kg', estCostCents: 3600, source: 'auto' });

    // Going lower doesn't add it twice.
    await agent.post(`${base}/items/${item.body.id}/adjust`, { delta: -1 });
    expect(await list(agent, base)).toHaveLength(1);
  });

  it('takes it off again if stock recovers on its own, unless someone added it by hand', async () => {
    const { agent, base } = await setup();
    const item = await agent.post(`${base}/items`, { name: 'Rice', quantity: 1, minQty: 2, targetQty: 10 });
    expect(await list(agent, base)).toHaveLength(1);
    await agent.post(`${base}/items/${item.body.id}/adjust`, { delta: 5, reason: 'restocked' });
    expect(await list(agent, base)).toHaveLength(0);

    await agent.post(`${base}/restock`, { name: 'Rice', itemId: item.body.id, quantity: 2 });
    await agent.post(`${base}/items/${item.body.id}/adjust`, { delta: 5, reason: 'restocked' });
    expect(await list(agent, base)).toHaveLength(1);
  });

  it('never lets stock go below zero, and logs only what really changed', async () => {
    const { agent, base } = await setup();
    const item = await agent.post(`${base}/items`, { name: 'Rice', quantity: 2 });
    const reply = await agent.post(`${base}/items/${item.body.id}/adjust`, { delta: -5 });
    expect(reply.body.quantity).toBe(0);
    const moves = await agent.get(`${base}/items/${item.body.id}/movements`);
    expect(moves.body.movements[0].delta).toBe(-2);
  });

  it('buying tops up stock and records the spend, and undo reverses both', async () => {
    const { agent, base } = await setup();
    const item = await agent.post(`${base}/items`, { name: 'Milk', category: 'Dairy & eggs', quantity: 1, minQty: 2, targetQty: 6, unit: 'carton', unitCostCents: 700 });
    const [entry] = await list(agent, base);
    expect(entry.quantity).toBe(5);

    const bought = await agent.post(`${base}/restock/${entry.id}/bought`, { actualCostCents: 3200 });
    expect(bought.status).toBe(200);
    const stocked = (await agent.get(`${base}/items`)).body.items.find((row: any) => row.id === item.body.id);
    expect(stocked.quantity).toBe(6);
    expect(stocked.onList).toBe(false);
    let summary = (await agent.get(`${base}/money/summary`)).body;
    expect(summary.spentCents).toBe(3200);
    expect(summary.byCategory[0].category).toBe('Groceries');

    await agent.post(`${base}/restock/${entry.id}/bought`, { actualCostCents: 3200 });
    expect((await agent.get(`${base}/money/summary`)).body.spentCents).toBe(3200);

    await agent.post(`${base}/restock/${entry.id}/undo`);
    const after = (await agent.get(`${base}/items`)).body.items.find((row: any) => row.id === item.body.id);
    expect(after.quantity).toBe(1);
    summary = (await agent.get(`${base}/money/summary`)).body;
    expect(summary.spentCents).toBe(0);
    const open = (await list(agent, base)).filter((row) => row.status === 'needed');
    expect(open).toHaveLength(1);
  });

  it('buying less than planned leaves the item on the list if it is still low', async () => {
    const { agent, base } = await setup();
    await agent.post(`${base}/items`, { name: 'Milk', quantity: 0, minQty: 2, targetQty: 6, unitCostCents: 100 });
    const [entry] = await list(agent, base);
    expect(entry.quantity).toBe(6);
    await agent.post(`${base}/restock/${entry.id}/bought`, { quantity: 1 });
    const open = (await list(agent, base)).filter((row) => row.status === 'needed');
    expect(open).toHaveLength(1);
    expect(open[0].quantity).toBe(5);
    expect((await agent.get(`${base}/money/summary`)).body.spentCents).toBe(100);
  });

  it('refuses a second list entry for the same item', async () => {
    const { agent, base } = await setup();
    const item = await agent.post(`${base}/items`, { name: 'Milk', quantity: 5 });
    expect((await agent.post(`${base}/restock`, { name: 'Milk', itemId: item.body.id })).status).toBe(201);
    expect((await agent.post(`${base}/restock`, { name: 'Milk', itemId: item.body.id })).status).toBe(409);
  });

  it('a one-off with no stock item still works and records spend', async () => {
    const { agent, base } = await setup();
    const entry = await agent.post(`${base}/restock`, { name: 'Birthday candles', estCostCents: 450 });
    await agent.post(`${base}/restock/${entry.body.id}/bought`);
    expect((await agent.get(`${base}/money/summary`)).body.spentCents).toBe(450);
  });

  it('a typed-in correction is not treated as usage in the forecast', async () => {
    const { agent, base } = await setup();
    const item = await agent.post(`${base}/items`, { name: 'Rice', quantity: 50 });
    await agent.patch(`${base}/items/${item.body.id}`, { quantity: 10 });
    const row = (await agent.get(`${base}/items`)).body.items[0];
    expect(row.quantity).toBe(10);
    expect(row.forecast.dailyUsage).toBe(0);
  });

  it('forecasts from real usage', async () => {
    const { agent, base, space } = await setup();
    const item = await agent.post(`${base}/items`, { name: 'Coffee', quantity: 30, minQty: 2, targetQty: 40, unitCostCents: 1000 });
    for (let day = 0; day < 14; day += 1) await agent.post(`${base}/items/${item.body.id}/adjust`, { delta: -1 });
    const row = (await agent.get(`${base}/items`)).body.items[0];
    expect(row.quantity).toBe(16);
    expect(row.forecast.dailyUsage).toBeCloseTo(1, 5);
    expect(row.forecast.daysLeft).toBe(16);
    expect(row.forecast.runsOutOn).toBe(addDays(space.today, 16));
  });

  it('removing an item takes its automatic list entry with it', async () => {
    const { agent, base } = await setup();
    const item = await agent.post(`${base}/items`, { name: 'Rice', quantity: 0, minQty: 2 });
    expect(await list(agent, base)).toHaveLength(1);
    await agent.delete(`${base}/items/${item.body.id}`);
    expect(await list(agent, base)).toHaveLength(0);
    expect((await agent.get(`${base}/items`)).body.items).toHaveLength(0);
  });
});

describe('bills and budgets', () => {
  const setup = async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    return { agent, space, base: `/api/w/${space.id}` };
  };

  it('paying a bill records one expense and schedules the next bill', async () => {
    const { agent, base, space } = await setup();
    const due = addDays(space.today, 3);
    const bill = await agent.post(`${base}/bills`, { name: 'TNB', category: 'Utilities', amountCents: 18500, dueOn: due, recurrence: 'monthly' });
    const paid = await agent.post(`${base}/bills/${bill.body.id}/pay`);
    expect(paid.body.bill.status).toBe('paid');

    await agent.post(`${base}/bills/${bill.body.id}/pay`);
    const summary = (await agent.get(`${base}/money/summary`)).body;
    expect(summary.spentCents).toBe(18500);

    const bills = (await agent.get(`${base}/bills`)).body.bills;
    expect(bills).toHaveLength(2);
    const next = bills.find((row: any) => row.status === 'due');
    expect(next.dueOn > due).toBe(true);
  });

  it('undoing a payment removes the expense and the next bill', async () => {
    const { agent, base, space } = await setup();
    const bill = await agent.post(`${base}/bills`, { name: 'Water', amountCents: 3200, dueOn: space.today, recurrence: 'monthly' });
    await agent.post(`${base}/bills/${bill.body.id}/pay`);
    await agent.post(`${base}/bills/${bill.body.id}/undo`);
    expect((await agent.get(`${base}/money/summary`)).body.spentCents).toBe(0);
    const bills = (await agent.get(`${base}/bills`)).body.bills;
    expect(bills).toHaveLength(1);
    expect(bills[0].status).toBe('due');
  });

  it('expenses made by a bill can’t be edited behind its back', async () => {
    const { agent, base, space } = await setup();
    const bill = await agent.post(`${base}/bills`, { name: 'Water', amountCents: 3200, dueOn: space.today, recurrence: 'none' });
    await agent.post(`${base}/bills/${bill.body.id}/pay`);
    const [expense] = (await agent.get(`${base}/money/expenses`)).body.expenses;
    expect((await agent.delete(`${base}/money/expenses/${expense.id}`)).status).toBe(409);
  });

  it('compares spending with budgets, and shows spending that has no budget', async () => {
    const { agent, base, space } = await setup();
    await agent.put(`${base}/money/budgets`, { budgets: [{ category: 'Groceries', amountCents: 100000 }] });
    await agent.post(`${base}/money/expenses`, { title: 'Shop', category: 'Groceries', amountCents: 25000, spentOn: space.today });
    await agent.post(`${base}/money/expenses`, { title: 'Clinic', category: 'Healthcare', amountCents: 8000, spentOn: space.today });
    const summary = (await agent.get(`${base}/money/summary`)).body;
    expect(summary.budgetCents).toBe(100000);
    expect(summary.spentCents).toBe(33000);
    expect(summary.unbudgetedCents).toBe(8000);
    expect(summary.byMonth).toHaveLength(6);
    expect(summary.byMonth.at(-1).spentCents).toBe(33000);
  });

  it('exports spreadsheets safely', async () => {
    const { agent, base, space } = await setup();
    await agent.post(`${base}/money/expenses`, { title: '=HYPERLINK("http://evil")', category: 'Other', amountCents: 100, spentOn: space.today });
    const csv = await agent.get(`${base}/export/expenses.csv`);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.body).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('meals', () => {
  it('planning a slot twice replaces the meal', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    await agent.post(`${base}/meals`, { date: space.today, slot: 'dinner', title: 'Pasta' });
    await agent.post(`${base}/meals`, { date: space.today, slot: 'dinner', title: 'Nasi lemak' });
    const meals = (await agent.get(`${base}/meals?from=${space.today}&to=${space.today}`)).body.meals;
    expect(meals).toHaveLength(1);
    expect(meals[0].title).toBe('Nasi lemak');
  });

  it('adds only what the pantry can’t cover to the shopping list', async () => {
    const { agent } = await signUp(h);
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    await agent.post(`${base}/items`, { name: 'Rice', quantity: 10, minQty: 2, unit: 'kg' });
    await agent.post(`${base}/items`, { name: 'Eggs', quantity: 1, minQty: 0, unit: 'pcs', unitCostCents: 50 });
    const recipe = await agent.post(`${base}/meals/recipes`, {
      name: 'Fried rice',
      ingredients: [
        { name: 'Rice', qty: 1, unit: 'kg' },
        { name: 'eggs', qty: 4, unit: 'pcs' },
        { name: 'Spring onions', qty: 1, unit: 'bunch' },
      ],
    });
    const meal = await agent.post(`${base}/meals`, { date: space.today, slot: 'dinner', title: 'Fried rice', recipeId: recipe.body.recipe.id });

    const shop = await agent.post(`${base}/meals/${meal.body.id}/shop`);
    expect(shop.body).toEqual({ added: 2, covered: 1 });
    const entries = (await agent.get(`${base}/restock`)).body.entries;
    expect(entries.map((entry: any) => entry.name).sort()).toEqual(['Eggs', 'Spring onions']);
    expect(entries.find((entry: any) => entry.name === 'Eggs').estCostCents).toBe(200);

    const again = await agent.post(`${base}/meals/${meal.body.id}/shop`);
    expect(again.body.added).toBe(0);
  });
});

describe('checklists', () => {
  it('starts fresh each period and keeps who ticked what', async () => {
    const { agent } = await signUp(h, 'Ticker');
    const space = await workspace(agent, 'home');
    const base = `/api/w/${space.id}`;
    const made = await agent.post(`${base}/checklists`, { name: 'Reset', cadence: 'weekly', steps: [{ title: 'One' }, { title: 'Two' }] });
    let [list] = (await agent.get(`${base}/checklists`)).body.checklists;
    const stepId = list.steps[0].id;

    await agent.post(`${base}/checklists/${made.body.id}/steps/${stepId}/toggle`);
    [list] = (await agent.get(`${base}/checklists`)).body.checklists;
    expect(list.doneCount).toBe(1);
    expect(list.done[stepId].memberName).toBe('Ticker');

    await agent.post(`${base}/checklists/${made.body.id}/steps/${stepId}/toggle`);
    [list] = (await agent.get(`${base}/checklists`)).body.checklists;
    expect(list.doneCount).toBe(0);

    await agent.post(`${base}/checklists/${made.body.id}/steps/${stepId}/toggle`);
    const start = h.clock.now;
    h.clock.now = new Date(start.getTime() + 8 * 86_400_000);
    [list] = (await agent.get(`${base}/checklists`)).body.checklists;
    expect(list.doneCount).toBe(0);
    h.clock.now = start;
  });
});

describe('starter packs', () => {
  it('fills each edition with useful defaults, and nothing invented for money', async () => {
    const { agent } = await signUp(h);
    for (const edition of ['home', 'people', 'supply'] as const) {
      const space = await workspace(agent, edition, `${edition} starter`, true);
      const base = `/api/w/${space.id}`;
      expect((await agent.get(`${base}/items`)).body.items.length).toBeGreaterThan(5);
      expect((await agent.get(`${base}/tasks`)).body.tasks.length).toBeGreaterThan(2);
      expect((await agent.get(`${base}/checklists`)).body.checklists.length).toBeGreaterThan(0);
      expect((await agent.get(`${base}/restock`)).body.entries).toHaveLength(0);
      expect((await agent.get(`${base}/money/summary`)).body.spentCents).toBe(0);
      if (edition !== 'supply') {
        const bills = (await agent.get(`${base}/bills`)).body.bills;
        expect(bills.length).toBeGreaterThan(0);
        expect(bills.every((bill: any) => bill.amountCents === 0)).toBe(true);
      }
    }
  });
});
