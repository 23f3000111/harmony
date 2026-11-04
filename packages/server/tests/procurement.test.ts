import { addDays, addMonthKey, monthKey } from '@harmony/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, joinAs, signUp, workspace, type Agent, type Harness } from './helpers';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

async function supplySpace() {
  const owner = await signUp(h, 'Daniel');
  const space = await workspace(owner.agent, 'supply');
  const base = `/api/w/${space.id}`;
  const supplier = await owner.agent.post(`${base}/suppliers`, { name: 'Mesra', leadTimeDays: 7 });
  const item = await owner.agent.post(`${base}/items`, { name: 'Boxes', quantity: 10, minQty: 2, targetQty: 50, unit: 'bundle', unitCostCents: 3800, category: 'Packaging', supplierId: supplier.body.id });
  return { owner, space, base, supplierId: supplier.body.id as string, itemId: item.body.id as string };
}

const draftOrder = (agent: Agent, base: string, supplierId: string, itemId: string, extra: object = {}) =>
  agent.post(`${base}/orders`, { supplierId, lines: [{ itemId, description: 'Boxes', qty: 10, unit: 'bundle', unitCostCents: 3800 }, { description: 'Delivery', qty: 1, unitCostCents: 5000 }], ...extra });

describe('purchase requests', () => {
  it('staff see only their own; managers see them all', async () => {
    const { owner, space, base } = await supplySpace();
    const chloe = await joinAs(h, owner.agent, space.id, 'member', 'Chloe');
    const ravi = await joinAs(h, owner.agent, space.id, 'member', 'Ravi');
    const made = await chloe.agent.post(`${base}/requests`, { kind: 'purchase', title: 'Gloves', lines: [{ name: 'Gloves', qty: 10, unitCostCents: 2400 }] });
    expect(made.status).toBe(201);

    expect((await chloe.agent.get(`${base}/requests`)).body.requests).toHaveLength(1);
    expect((await ravi.agent.get(`${base}/requests`)).body.requests).toHaveLength(0);
    expect((await ravi.agent.get(`${base}/requests/${made.body.id}`)).status).toBe(404);
    const seen = (await owner.agent.get(`${base}/requests`)).body.requests[0];
    expect(seen.estimatedCents).toBe(24000);
    expect(seen.requestedByName).toBe('Chloe');
  });

  it('staff can’t approve, and nobody but an owner approves their own', async () => {
    const { owner, space, base } = await supplySpace();
    const staff = await joinAs(h, owner.agent, space.id, 'member', 'Staff');
    const manager = await joinAs(h, owner.agent, space.id, 'manager', 'Manager');
    const fromStaff = await staff.agent.post(`${base}/requests`, { kind: 'purchase', title: 'A' });
    expect((await staff.agent.post(`${base}/requests/${fromStaff.body.id}/approve`)).status).toBe(403);

    const fromManager = await manager.agent.post(`${base}/requests`, { kind: 'purchase', title: 'B' });
    expect((await manager.agent.post(`${base}/requests/${fromManager.body.id}/approve`)).status).toBe(403);
    expect((await owner.agent.post(`${base}/requests/${fromManager.body.id}/approve`)).status).toBe(200);

    const decided = await owner.agent.post(`${base}/requests/${fromManager.body.id}/approve`);
    expect(decided.status).toBe(409);
  });

  it('a requester can withdraw until it is decided', async () => {
    const { owner, space, base } = await supplySpace();
    const staff = await joinAs(h, owner.agent, space.id, 'member');
    const a = await staff.agent.post(`${base}/requests`, { kind: 'purchase', title: 'A' });
    expect((await staff.agent.delete(`${base}/requests/${a.body.id}`)).status).toBe(200);
    const b = await staff.agent.post(`${base}/requests`, { kind: 'purchase', title: 'B' });
    await owner.agent.post(`${base}/requests/${b.body.id}/reject`, { note: 'Not now' });
    expect((await staff.agent.delete(`${base}/requests/${b.body.id}`)).status).toBe(409);
    const seen = (await staff.agent.get(`${base}/requests`)).body.requests[0];
    expect(seen.status).toBe('rejected');
    expect(seen.decisionNote).toBe('Not now');
  });
});

describe('HR requests', () => {
  it('turns approved supply requests into restock entries and repairs into jobs', async () => {
    const owner = await signUp(h, 'Priya');
    const space = await workspace(owner.agent, 'people');
    const base = `/api/w/${space.id}`;
    const staff = await joinAs(h, owner.agent, space.id, 'member', 'Hafiz');
    const kumar = await owner.agent.post(`${base}/members`, { name: 'Kumar' });
    const milk = await owner.agent.post(`${base}/items`, { name: 'Oat milk', quantity: 5, unit: 'carton', unitCostCents: 1190 });

    const supply = await staff.agent.post(`${base}/requests`, { kind: 'supply', title: 'More oat milk', lines: [{ itemId: milk.body.id, name: 'Oat milk', qty: 6, unitCostCents: 1190 }] });
    await owner.agent.post(`${base}/requests/${supply.body.id}/approve`);
    const entries = (await owner.agent.get(`${base}/restock`)).body.entries;
    expect(entries[0]).toMatchObject({ name: 'Oat milk', quantity: 6, source: 'request', estCostCents: 7140 });

    const repair = await staff.agent.post(`${base}/requests`, { kind: 'repair', title: 'Aircon leaking', priority: 'high', neededBy: space.today });
    await owner.agent.post(`${base}/requests/${repair.body.id}/approve`, { assigneeId: kumar.body.id });
    const tasks = (await owner.agent.get(`${base}/tasks`)).body.tasks;
    expect(tasks[0]).toMatchObject({ title: 'Aircon leaking', assigneeId: kumar.body.id, priority: 'high', dueOn: space.today });
    const decided = (await staff.agent.get(`${base}/requests/${repair.body.id}`)).body.request;
    expect(decided.status).toBe('approved');
    expect(decided.taskId).toBe(tasks[0].id);
  });
});

describe('purchase orders', () => {
  it('numbers orders in sequence for each company', async () => {
    const a = await supplySpace();
    const b = await supplySpace();
    const first = await draftOrder(a.owner.agent, a.base, a.supplierId, a.itemId);
    const second = await draftOrder(a.owner.agent, a.base, a.supplierId, a.itemId);
    const other = await draftOrder(b.owner.agent, b.base, b.supplierId, b.itemId);
    expect(first.body.order.number).toBe('PO-0001');
    expect(second.body.order.number).toBe('PO-0002');
    expect(other.body.order.number).toBe('PO-0001');
    expect(first.body.order.totalCents).toBe(43000);
    expect(first.body.order.status).toBe('draft');
  });

  it('staff can’t see or raise orders', async () => {
    const { owner, space, base, supplierId, itemId } = await supplySpace();
    const staff = await joinAs(h, owner.agent, space.id, 'member');
    expect((await staff.agent.get(`${base}/orders`)).status).toBe(403);
    expect((await draftOrder(staff.agent, base, supplierId, itemId)).status).toBe(403);
    expect((await staff.agent.get(`${base}/dashboard`)).body.orders).toBeNull();
  });

  it('sending uses the supplier’s lead time for the expected date', async () => {
    const { owner, space, base, supplierId, itemId } = await supplySpace();
    const order = await draftOrder(owner.agent, base, supplierId, itemId);
    await owner.agent.post(`${base}/orders/${order.body.order.id}/send`);
    const sent = (await owner.agent.get(`${base}/orders/${order.body.order.id}`)).body.order;
    expect(sent.status).toBe('sent');
    expect(sent.orderedOn).toBe(space.today);
    expect(sent.expectedOn).toBe(addDays(space.today, 7));
  });

  it('can’t receive an order that was never sent', async () => {
    const { owner, base, supplierId, itemId } = await supplySpace();
    const order = await draftOrder(owner.agent, base, supplierId, itemId);
    const line = order.body.order.lines[0];
    expect((await owner.agent.post(`${base}/orders/${order.body.order.id}/receive`, { lines: [{ lineId: line.id, qty: 1 }] })).status).toBe(409);
  });

  it('receiving in parts updates stock and spend as goods arrive', async () => {
    const { owner, base, supplierId, itemId } = await supplySpace();
    const order = await draftOrder(owner.agent, base, supplierId, itemId);
    const orderId = order.body.order.id;
    await owner.agent.post(`${base}/orders/${orderId}/send`);
    const boxes = order.body.order.lines.find((line: any) => line.itemId);
    const delivery = order.body.order.lines.find((line: any) => !line.itemId);

    await owner.agent.post(`${base}/orders/${orderId}/receive`, { lines: [{ lineId: boxes.id, qty: 4 }] });
    let state = (await owner.agent.get(`${base}/orders/${orderId}`)).body.order;
    expect(state.status).toBe('partial');
    expect(state.receivedCents).toBe(15200);
    let stock = (await owner.agent.get(`${base}/items`)).body.items[0];
    expect(stock.quantity).toBe(14);
    let spend = (await owner.agent.get(`${base}/money/summary`)).body;
    expect(spend.spentCents).toBe(15200);
    expect(spend.byCategory.find((line: any) => line.category === 'Packaging').spentCents).toBe(15200);

    const tooMany = await owner.agent.post(`${base}/orders/${orderId}/receive`, { lines: [{ lineId: boxes.id, qty: 7 }] });
    expect(tooMany.status).toBe(409);

    await owner.agent.post(`${base}/orders/${orderId}/receive`, { lines: [{ lineId: boxes.id, qty: 6 }, { lineId: delivery.id, qty: 1 }] });
    state = (await owner.agent.get(`${base}/orders/${orderId}`)).body.order;
    expect(state.status).toBe('received');
    expect(state.receivedOn).toBeTruthy();
    stock = (await owner.agent.get(`${base}/items`)).body.items[0];
    expect(stock.quantity).toBe(20);
    spend = (await owner.agent.get(`${base}/money/summary`)).body;
    expect(spend.spentCents).toBe(43000);
  });

  it('works out supplier on-time rate and spend from real deliveries', async () => {
    const { owner, base, supplierId, itemId } = await supplySpace();
    let supplier = (await owner.agent.get(`${base}/suppliers`)).body.suppliers[0];
    expect(supplier.onTimePercent).toBeNull();
    expect(supplier.ordersReceived).toBe(0);

    const receiveAll = async (expectedOffset: number, space: string) => {
      const order = await draftOrder(owner.agent, base, supplierId, itemId, { expectedOn: addDays(space, expectedOffset) });
      await owner.agent.post(`${base}/orders/${order.body.order.id}/send`);
      await owner.agent.post(`${base}/orders/${order.body.order.id}/receive`, {
        lines: order.body.order.lines.map((line: any) => ({ lineId: line.id, qty: line.qty })),
      });
    };
    const today = (await owner.agent.get(base)).body.workspace.today;
    await receiveAll(2, today);
    await receiveAll(-3, today);

    supplier = (await owner.agent.get(`${base}/suppliers`)).body.suppliers[0];
    expect(supplier.ordersReceived).toBe(2);
    expect(supplier.onTimePercent).toBe(50);
    expect(supplier.spentCents).toBe(86000);
  });

  it('follows a request all the way through to goods received', async () => {
    const { owner, space, base, supplierId, itemId } = await supplySpace();
    const staff = await joinAs(h, owner.agent, space.id, 'member', 'Chloe');
    const request = await staff.agent.post(`${base}/requests`, { kind: 'purchase', title: 'Boxes for the run', lines: [{ itemId, name: 'Boxes', qty: 10, unitCostCents: 3800 }] });

    const early = await draftOrder(owner.agent, base, supplierId, itemId, { requestId: request.body.id });
    expect(early.status).toBe(409);

    await owner.agent.post(`${base}/requests/${request.body.id}/approve`);
    const order = await draftOrder(owner.agent, base, supplierId, itemId, { requestId: request.body.id });
    expect(order.status).toBe(201);
    expect((await staff.agent.get(`${base}/requests/${request.body.id}`)).body.request.status).toBe('ordered');

    const orderId = order.body.order.id;
    await owner.agent.post(`${base}/orders/${orderId}/send`);
    await owner.agent.post(`${base}/orders/${orderId}/receive`, { lines: order.body.order.lines.map((line: any) => ({ lineId: line.id, qty: line.qty })) });
    expect((await staff.agent.get(`${base}/requests/${request.body.id}`)).body.request.status).toBe('done');
  });

  it('cancelling frees the request again, but not once goods have arrived', async () => {
    const { owner, base, supplierId, itemId } = await supplySpace();
    const request = await owner.agent.post(`${base}/requests`, { kind: 'purchase', title: 'Boxes' });
    await owner.agent.post(`${base}/requests/${request.body.id}/approve`);
    const order = await draftOrder(owner.agent, base, supplierId, itemId, { requestId: request.body.id });
    await owner.agent.post(`${base}/orders/${order.body.order.id}/cancel`);
    const after = (await owner.agent.get(`${base}/requests/${request.body.id}`)).body.request;
    expect(after.status).toBe('approved');
    expect(after.orderId).toBeNull();

    const another = await draftOrder(owner.agent, base, supplierId, itemId);
    await owner.agent.post(`${base}/orders/${another.body.order.id}/send`);
    await owner.agent.post(`${base}/orders/${another.body.order.id}/receive`, { lines: [{ lineId: another.body.order.lines[0].id, qty: 1 }] });
    expect((await owner.agent.post(`${base}/orders/${another.body.order.id}/cancel`)).status).toBe(409);
  });

  it('refuses stock items from another company on an order, so receiving can’t change their stock', async () => {
    const mine = await supplySpace();
    const theirs = await supplySpace();
    const foreignLine = [{ itemId: theirs.itemId, description: 'Their boxes', qty: 5, unitCostCents: 100 }];

    const created = await mine.owner.agent.post(`${mine.base}/orders`, { supplierId: mine.supplierId, lines: foreignLine });
    expect(created.status).toBe(404);

    const draft = await draftOrder(mine.owner.agent, mine.base, mine.supplierId, mine.itemId);
    const patched = await mine.owner.agent.patch(`${mine.base}/orders/${draft.body.order.id}`, { lines: foreignLine });
    expect(patched.status).toBe(404);

    const theirStock = (await theirs.owner.agent.get(`${theirs.base}/items`)).body.items[0];
    expect(theirStock.quantity).toBe(10);
  });

  it('won’t change lines after sending', async () => {
    const { owner, base, supplierId, itemId } = await supplySpace();
    const order = await draftOrder(owner.agent, base, supplierId, itemId);
    const lines = [{ description: 'Changed', qty: 2, unitCostCents: 100 }];
    expect((await owner.agent.patch(`${base}/orders/${order.body.order.id}`, { lines })).status).toBe(200);
    await owner.agent.post(`${base}/orders/${order.body.order.id}/send`);
    expect((await owner.agent.patch(`${base}/orders/${order.body.order.id}`, { lines })).status).toBe(409);
  });
});

describe('month ahead', () => {
  it('adds up what the coming month will need, from real records', async () => {
    const { owner, space, base, itemId, supplierId } = await supplySpace();
    const month = addMonthKey(monthKey(space.today), 1);

    for (let index = 0; index < 14; index += 1) await owner.agent.post(`${base}/items/${itemId}/adjust`, { delta: -0.5 });
    await owner.agent.post(`${base}/tasks`, { title: 'Weekly count', dueOn: `${month}-02`, recurrence: 'weekly', estimatedMinutes: 30 });
    await owner.agent.post(`${base}/tasks`, { title: 'One-off', dueOn: `${month}-10`, estimatedMinutes: 15 });
    await owner.agent.post(`${base}/tasks`, { title: 'Too far away', dueOn: addDays(`${month}-28`, 60) });
    await owner.agent.post(`${base}/events`, { title: 'Audit', date: `${month}-15` });
    const order = await draftOrder(owner.agent, base, supplierId, itemId, { expectedOn: `${month}-12` });
    await owner.agent.post(`${base}/orders/${order.body.order.id}/send`);
    await owner.agent.put(`${base}/money/budgets`, { budgets: [{ category: 'Packaging', amountCents: 500000 }] });

    const plan = (await owner.agent.get(`${base}/month-ahead?month=${month}`)).body;
    expect(plan.month).toBe(month);
    expect(plan.restock[0].name).toBe('Boxes');
    expect(plan.restock[0].forecast.suggestedQty).toBeGreaterThan(0);
    expect(plan.restockCents).toBe(plan.restock[0].forecast.suggestedCostCents);
    expect(plan.tasks.list.filter((task: any) => task.title === 'Weekly count').length).toBeGreaterThanOrEqual(4);
    expect(plan.tasks.list.map((task: any) => task.title)).toContain('One-off');
    expect(plan.tasks.list.map((task: any) => task.title)).not.toContain('Too far away');
    expect(plan.events.map((event: any) => event.title)).toEqual(['Audit']);
    expect(plan.deliveries).toHaveLength(1);
    expect(plan.budget.budgetCents).toBe(500000);
    expect(plan.budget.committedCents).toBe(plan.restockCents + plan.deliveries[0].totalCents);
  });

  it('projects repeating bills into the month without paying them', async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const base = `/api/w/${space.id}`;
    const month = addMonthKey(monthKey(space.today), 2);
    await owner.agent.post(`${base}/bills`, { name: 'TNB', amountCents: 18500, dueOn: addDays(space.today, 1), recurrence: 'monthly' });
    const plan = (await owner.agent.get(`${base}/month-ahead?month=${month}`)).body;
    expect(plan.bills).toHaveLength(1);
    expect(plan.bills[0].recurring).toBe(true);
    expect(plan.billsCents).toBe(18500);
    expect((await owner.agent.get(`${base}/bills`)).body.bills).toHaveLength(1);
  });

  it('hides money from regular members', async () => {
    const { owner, space, base } = await supplySpace();
    const staff = await joinAs(h, owner.agent, space.id, 'member');
    await owner.agent.post(`${base}/items`, { name: 'Low', quantity: 0, minQty: 5, targetQty: 10, unitCostCents: 100000 });
    const plan = (await staff.agent.get(`${base}/month-ahead`)).body;
    expect(plan.restockCents).toBe(0);
    expect(plan.restock.every((row: any) => row.forecast.suggestedCostCents === 0)).toBe(true);
    expect(plan.budget).toEqual({ budgetCents: 0, committedCents: 0, lastMonthCents: 0 });
  });
});

describe('search', () => {
  it('finds records across areas and respects roles', async () => {
    const { owner, space, base, supplierId, itemId } = await supplySpace();
    const staff = await joinAs(h, owner.agent, space.id, 'member');
    const order = await draftOrder(owner.agent, base, supplierId, itemId);
    const byNumber = await owner.agent.get(`${base}/search?q=${order.body.order.number}`);
    expect(byNumber.body.hits.some((hit: any) => hit.kind === 'order')).toBe(true);
    const asStaff = await staff.agent.get(`${base}/search?q=Mesra`);
    expect(asStaff.body.hits.some((hit: any) => hit.kind === 'order')).toBe(false);
    expect(asStaff.body.hits.some((hit: any) => hit.kind === 'supplier')).toBe(true);
  });
});
