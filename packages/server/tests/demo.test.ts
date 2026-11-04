import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ensureDemo, reseedDemo, seedDemo } from '../src/seed/demo';
import { createHarness, type Agent, type Harness } from './helpers';

describe('dummy accounts and data', () => {
  let h: Harness;

  const login = async (email: string) => {
    const agent = h.agent();
    const reply = await agent.post('/api/auth/login', { email, password: DEMO_PASSWORD });
    expect(reply.status, email).toBe(200);
    return agent;
  };
  const firstSpace = async (agent: Agent) => (await agent.get('/api/workspaces')).body.workspaces[0];

  beforeAll(async () => {
    h = await createHarness({ env: { demoMode: true } });
    await seedDemo(h.deps.db, h.clock.now);
  }, 120_000);
  afterAll(() => h.close());

  it('lets every listed dummy account sign in', async () => {
    for (const account of DEMO_ACCOUNTS) await login(account.email);
    const config = (await h.agent().get('/api/auth/config')).body;
    expect(config.demoAccounts).toHaveLength(DEMO_ACCOUNTS.length);
    expect(config.demoPassword).toBe(DEMO_PASSWORD);
  });

  it('gives Alex all three editions', async () => {
    const list = (await (await login('alex@example.com')).get('/api/workspaces')).body.workspaces;
    expect(list.map((space: any) => space.edition).sort()).toEqual(['home', 'people', 'supply']);
  });

  it('builds a dashboard for every account', async () => {
    for (const account of DEMO_ACCOUNTS) {
      const agent = await login(account.email);
      const space = await firstSpace(agent);
      const reply = await agent.get(`/api/w/${space.id}/dashboard`);
      expect(reply.status, account.email).toBe(200);
      expect(reply.body.me.name).toBe(account.name);
    }
  });

  it('home: has meals tonight, bills due, low stock and history', async () => {
    const agent = await login('aisyah@example.com');
    const space = await firstSpace(agent);
    expect(space.edition).toBe('home');
    const { body } = await agent.get(`/api/w/${space.id}/dashboard`);
    expect(body.meals.tonight.title).toBe('Lemon herb salmon and roasted greens');
    expect(body.money.billsDueCount).toBeGreaterThan(0);
    expect(body.money.monthBudgetCents).toBeGreaterThan(0);
    expect(body.stock.lowCount).toBeGreaterThan(0);
    expect(body.stock.useFirst.length).toBeGreaterThan(0);
    expect(body.restock.openCount).toBeGreaterThan(0);
    expect(body.tasks.perWeek.filter((week: any) => week.done > 0).length).toBeGreaterThan(4);
    expect(body.tasks.dueTodayCount).toBeGreaterThan(0);
    expect(body.tasks.overdueCount).toBeGreaterThan(0);
    expect(body.checklist.doneCount).toBe(4);
    expect(body.stock.shelf).toHaveLength(8);
  });

  it('home: the helper sees her own jobs and no money', async () => {
    const agent = await login('siti@example.com');
    const space = await firstSpace(agent);
    const { body } = await agent.get(`/api/w/${space.id}/dashboard`);
    expect(body.money).toBeNull();
    expect(body.tasks.mine.length).toBeGreaterThan(0);
    expect(body.tasks.mine.every((task: any) => task.assigneeId === body.me.id)).toBe(true);
  });

  it('HR: has requests waiting, team workload and a spending picture', async () => {
    const agent = await login('priya@example.com');
    const space = await firstSpace(agent);
    expect(space.edition).toBe('people');
    const { body } = await agent.get(`/api/w/${space.id}/dashboard`);
    expect(body.requests.openCount).toBe(3);
    expect(body.requests.waiting).toHaveLength(3);
    expect(body.members.length).toBe(7);
    expect(body.tasks.overdueCount).toBeGreaterThan(0);
    expect(body.money.byMonth.at(-2).spentCents).toBeGreaterThan(0);
  });

  it('procurement: has orders in every state and late deliveries flagged', async () => {
    const agent = await login('daniel@example.com');
    const space = await firstSpace(agent);
    const base = `/api/w/${space.id}`;
    expect(space.edition).toBe('supply');
    const { body } = await agent.get(`${base}/dashboard`);
    expect(body.requests.openCount).toBe(4);
    expect(body.orders.openCount).toBe(4);
    expect(body.orders.lateCount).toBe(2);
    expect(body.orders.draftCount).toBe(2);
    expect(body.stock.runningOut.length).toBeGreaterThan(0);

    const suppliers = (await agent.get(`${base}/suppliers`)).body.suppliers;
    expect(suppliers).toHaveLength(6);
    expect(suppliers.some((supplier: any) => supplier.onTimePercent !== null)).toBe(true);

    const orders = (await agent.get(`${base}/orders`)).body.orders;
    const statuses = new Set(orders.map((order: any) => order.status));
    expect([...statuses].sort()).toEqual(['draft', 'partial', 'received', 'sent']);
    const numbers = orders.map((order: any) => order.number);
    expect(new Set(numbers).size).toBe(numbers.length);

    const next = await agent.post(`${base}/orders`, { supplierId: suppliers[0].id, lines: [{ description: 'x', qty: 1, unitCostCents: 100 }] });
    expect(next.body.order.number).toBe(`PO-${String(numbers.length + 1).padStart(4, '0')}`);
  });

  it('the month ahead has something to plan in every edition', async () => {
    for (const email of ['aisyah@example.com', 'priya@example.com', 'daniel@example.com']) {
      const agent = await login(email);
      const space = await firstSpace(agent);
      const plan = (await agent.get(`/api/w/${space.id}/month-ahead`)).body;
      expect(plan.restock.length, email).toBeGreaterThan(0);
      expect(plan.tasks.total, email).toBeGreaterThan(0);
      expect(plan.budget.budgetCents, email).toBeGreaterThan(0);
    }
  });

  it('won’t let anyone change a shared dummy login', async () => {
    const agent = await login('aisyah@example.com');
    expect((await agent.post('/api/auth/me/password', { current: DEMO_PASSWORD, next: 'hijacked password' })).status).toBe(403);
    expect((await agent.patch('/api/auth/me', { name: 'Hijacked' })).status).toBe(403);
    expect((await agent.delete('/api/auth/me')).status).toBe(403);
    const before = h.mails.length;
    await h.agent().post('/api/auth/forgot', { email: 'aisyah@example.com' });
    expect(h.mails.length).toBe(before);
  });

  it('starts over when reset, and leaves real accounts alone', async () => {
    const real = h.agent();
    await real.post('/api/auth/signup', { name: 'Real', email: 'real@example.com', password: 'a real password' });
    const realSpace = (await real.post('/api/workspaces', { name: 'Real home', edition: 'home', starter: false })).body.workspace;

    const agent = await login('aisyah@example.com');
    const space = await firstSpace(agent);
    await agent.post(`/api/w/${space.id}/tasks`, { title: 'Scribble on the demo' });
    expect((await agent.post('/api/demo/reset')).status).toBe(200);

    const after = await firstSpace(agent);
    expect(after.id).not.toBe(space.id);
    const tasks = (await agent.get(`/api/w/${after.id}/tasks`)).body.tasks;
    expect(tasks.map((task: any) => task.title)).not.toContain('Scribble on the demo');
    expect((await real.get(`/api/w/${realSpace.id}`)).status).toBe(200);
    expect((await real.post('/api/demo/reset')).status).toBe(404);
  }, 60_000);

  it('refreshes itself after a few days so nothing looks abandoned', async () => {
    const agent = await login('aisyah@example.com');
    const before = (await firstSpace(agent)).id;
    await ensureDemo(h.deps.db, new Date(h.clock.now.getTime() + 86_400_000));
    expect((await firstSpace(agent)).id).toBe(before);
    await ensureDemo(h.deps.db, new Date(h.clock.now.getTime() + 4 * 86_400_000));
    expect((await firstSpace(agent)).id).not.toBe(before);
    await reseedDemo(h.deps.db, h.clock.now);
  }, 90_000);
});
