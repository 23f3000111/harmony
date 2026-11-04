import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, joinAs, signUp, workspace, type Harness } from './helpers';

describe('keeping workspaces apart', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('hides one company’s workspace from another, at every address', async () => {
    const a = await signUp(h, 'Company A');
    const b = await signUp(h, 'Company B');
    const space = await workspace(a.agent, 'supply');

    const addresses = ['', '/dashboard', '/tasks', '/items', '/restock', '/money/summary', '/members', '/month-ahead', '/requests', '/orders', '/suppliers', '/checklists', '/activity', '/export/items.csv'];
    for (const address of addresses) {
      const reply = await b.agent.get(`/api/w/${space.id}${address}`);
      expect(reply.status, address).toBe(404);
    }
    expect((await h.agent().get(`/api/w/${space.id}/tasks`)).status).toBe(401);
  });

  it('won’t reach another workspace’s records through your own', async () => {
    const a = await signUp(h, 'Company A');
    const b = await signUp(h, 'Company B');
    const spaceA = await workspace(a.agent, 'supply');
    const spaceB = await workspace(b.agent, 'supply');

    const task = await a.agent.post(`/api/w/${spaceA.id}/tasks`, { title: 'Secret job' });
    const item = await a.agent.post(`/api/w/${spaceA.id}/items`, { name: 'Secret stock', quantity: 5 });
    const supplier = await a.agent.post(`/api/w/${spaceA.id}/suppliers`, { name: 'Secret supplier' });

    const base = `/api/w/${spaceB.id}`;
    expect((await b.agent.get(`${base}/tasks/${task.body.task.id}`)).status).toBe(404);
    expect((await b.agent.post(`${base}/tasks/${task.body.task.id}/complete`)).status).toBe(404);
    expect((await b.agent.patch(`${base}/items/${item.body.id}`, { quantity: 0 })).status).toBe(404);
    expect((await b.agent.post(`${base}/items/${item.body.id}/adjust`, { delta: -1 })).status).toBe(404);
    expect((await b.agent.patch(`${base}/suppliers/${supplier.body.id}`, { name: 'Taken' })).status).toBe(404);

    // Linking your own records to another workspace's supplier is refused too.
    expect((await b.agent.post(`${base}/items`, { name: 'Mine', supplierId: supplier.body.id })).status).toBe(404);
    expect((await b.agent.post(`${base}/orders`, { supplierId: supplier.body.id, lines: [{ description: 'x', qty: 1, unitCostCents: 1 }] })).status).toBe(404);
    expect((await b.agent.post(`${base}/restock`, { name: 'x', itemId: item.body.id })).status).toBe(404);
  });

  it('reads malformed IDs as not found rather than a server error', async () => {
    const a = await signUp(h);
    const space = await workspace(a.agent, 'home');
    expect((await a.agent.get(`/api/w/not-a-uuid/tasks`)).status).toBe(404);
    expect((await a.agent.get(`/api/w/${space.id}/tasks/not-a-uuid`)).status).toBe(404);
  });

  it('keeps edition features inside their edition', async () => {
    const a = await signUp(h);
    const home = await workspace(a.agent, 'home');
    const supply = await workspace(a.agent, 'supply');
    expect((await a.agent.get(`/api/w/${home.id}/orders`)).status).toBe(404);
    expect((await a.agent.get(`/api/w/${home.id}/requests`)).status).toBe(404);
    expect((await a.agent.get(`/api/w/${supply.id}/meals`)).status).toBe(404);
    expect((await a.agent.get(`/api/w/${supply.id}/bills`)).status).toBe(404);
  });
});

describe('roles', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('keeps money away from regular members', async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const member = await joinAs(h, owner.agent, space.id, 'member');

    const base = `/api/w/${space.id}`;
    expect((await member.agent.get(`${base}/money/summary`)).status).toBe(403);
    expect((await member.agent.get(`${base}/money/expenses`)).status).toBe(403);
    expect((await member.agent.get(`${base}/bills`)).status).toBe(403);
    expect((await member.agent.get(`${base}/export/expenses.csv`)).status).toBe(403);

    const dashboard = await member.agent.get(`${base}/dashboard`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.money).toBeNull();

    const detail = await member.agent.get(base);
    expect(detail.body.workspace.boardToken).toBeUndefined();
  });

  it('stops members changing stock levels, people or settings, but lets them record usage', async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const member = await joinAs(h, owner.agent, space.id, 'member');
    const base = `/api/w/${space.id}`;
    const item = await owner.agent.post(`${base}/items`, { name: 'Rice', quantity: 10, minQty: 1 });

    expect((await member.agent.post(`${base}/items`, { name: 'x' })).status).toBe(403);
    expect((await member.agent.patch(`${base}/items/${item.body.id}`, { quantity: 99 })).status).toBe(403);
    expect((await member.agent.post(`${base}/members`, { name: 'x' })).status).toBe(403);
    expect((await member.agent.patch(base, { name: 'x' })).status).toBe(403);
    expect((await member.agent.post(`${base}/board-token`)).status).toBe(403);
    expect((await member.agent.delete(base)).status).toBe(403);
    expect((await member.agent.post(`${base}/items/${item.body.id}/adjust`, { delta: -1 })).status).toBe(200);
  });

  it('won’t let anyone give out a role above their own', async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const manager = await joinAs(h, owner.agent, space.id, 'manager');
    const base = `/api/w/${space.id}`;
    expect((await manager.agent.post(`${base}/invites`, { role: 'owner' })).status).toBe(403);
    expect((await manager.agent.post(`${base}/members`, { name: 'x', role: 'owner' })).status).toBe(403);
    const ownerMember = (await owner.agent.get(base)).body.workspace.myMemberId;
    expect((await manager.agent.patch(`${base}/members/${ownerMember}`, { role: 'member' })).status).toBe(403);
    expect((await manager.agent.delete(`${base}/members/${ownerMember}`)).status).toBe(403);
  });

  it('always keeps one owner', async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const base = `/api/w/${space.id}`;
    const me = (await owner.agent.get(base)).body.workspace.myMemberId;
    expect((await owner.agent.patch(`${base}/members/${me}`, { role: 'member' })).status).toBe(409);
    expect((await owner.agent.delete(`${base}/members/${me}`)).status).toBe(409);
    expect((await owner.agent.get(base)).status).toBe(200);
  });

  it('stops removed people from getting back in', async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const member = await joinAs(h, owner.agent, space.id, 'member');
    const base = `/api/w/${space.id}`;
    expect((await owner.agent.delete(`${base}/members/${member.memberId}`)).status).toBe(200);
    expect((await member.agent.get(base)).status).toBe(404);
  });
});

describe('invites', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('works once and shows who invited you', async () => {
    const owner = await signUp(h, 'Owner');
    const space = await workspace(owner.agent, 'people', 'Bayu');
    const invite = await owner.agent.post(`/api/w/${space.id}/invites`, { role: 'member' });
    const token = invite.body.url.split('/invite/')[1];

    const preview = await h.agent().get(`/api/invites/${token}`);
    expect(preview.body).toMatchObject({ workspaceName: 'Bayu', edition: 'people', invitedBy: 'Owner' });

    const joiner = await signUp(h, 'Joiner');
    expect((await joiner.agent.post(`/api/invites/${token}/accept`)).status).toBe(200);
    expect((await joiner.agent.get(`/api/w/${space.id}`)).body.workspace.myRole).toBe('member');

    const late = await signUp(h, 'Late');
    expect((await late.agent.post(`/api/invites/${token}/accept`)).status).toBe(410);
  });

  it('links a login to a person already on the list, keeping their tasks', async () => {
    const owner = await signUp(h, 'Owner');
    const space = await workspace(owner.agent, 'home');
    const base = `/api/w/${space.id}`;
    const person = await owner.agent.post(`${base}/members`, { name: 'Siti', role: 'member', title: 'Helper' });
    await owner.agent.post(`${base}/tasks`, { title: 'Her job', assigneeId: person.body.id, dueOn: space.today });

    const invite = await owner.agent.post(`${base}/invites`, { memberId: person.body.id, role: 'member' });
    const token = invite.body.url.split('/invite/')[1];
    const siti = await signUp(h, 'Siti from her phone');
    await siti.agent.post(`/api/invites/${token}/accept`);

    const dashboard = await siti.agent.get(`${base}/dashboard`);
    expect(dashboard.body.me.id).toBe(person.body.id);
    expect(dashboard.body.tasks.mine.map((task: { title: string }) => task.title)).toContain('Her job');
  });

  it('expires after two weeks', async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const invite = await owner.agent.post(`/api/w/${space.id}/invites`, { role: 'member' });
    const token = invite.body.url.split('/invite/')[1];
    const start = h.clock.now;
    h.clock.now = new Date(start.getTime() + 15 * 86_400_000);
    expect((await h.agent().get(`/api/invites/${token}`)).status).toBe(410);
    h.clock.now = start;
  });
});

describe('the wall board link', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  const setup = async () => {
    const owner = await signUp(h);
    const space = await workspace(owner.agent, 'home');
    const base = `/api/w/${space.id}`;
    const token = (await owner.agent.post(`${base}/board-token`)).body.boardToken as string;
    return { owner, space, base, token };
  };

  it('needs the secret link', async () => {
    expect((await h.agent().get('/api/board/not-the-real-token-at-all')).status).toBe(404);
  });

  it('shows today without money, and lets anyone with the link tick things off', async () => {
    const { owner, space, base, token } = await setup();
    const person = await owner.agent.post(`${base}/members`, { name: 'Hana' });
    const task = await owner.agent.post(`${base}/tasks`, { title: 'Feed the cat', dueOn: space.today, assigneeId: person.body.id });
    await owner.agent.post(`${base}/items`, { name: 'Milk', quantity: 1, minQty: 2, targetQty: 6, unitCostCents: 500 });

    const board = await h.agent().get(`/api/board/${token}`);
    expect(board.status).toBe(200);
    expect(board.body.tasks[0].title).toBe('Feed the cat');
    expect(board.body.restock[0].name).toBe('Milk');
    expect(board.body.restock[0].estCostCents).toBe(0);
    expect(JSON.stringify(board.body)).not.toContain('email');

    const ticked = await h.agent().post(`/api/board/${token}/tasks/${task.body.task.id}/toggle`, { memberId: person.body.id });
    expect(ticked.status).toBe(200);
    const after = await h.agent().get(`/api/board/${token}`);
    expect(after.body.tasks.find((row: { id: string }) => row.id === task.body.task.id).status).toBe('done');
    expect(after.body.tasks.find((row: { id: string }) => row.id === task.body.task.id).completedById).toBe(person.body.id);

    await h.agent().post(`/api/board/${token}/restock/${board.body.restock[0].id}/toggle`, {});
    const items = await owner.agent.get(`${base}/items`);
    expect(items.body.items[0].quantity).toBe(6);
  });

  it('can’t touch another workspace through a valid link', async () => {
    const first = await setup();
    const second = await setup();
    const task = await second.owner.agent.post(`${second.base}/tasks`, { title: 'Other', dueOn: second.space.today });
    expect((await h.agent().post(`/api/board/${first.token}/tasks/${task.body.task.id}/toggle`, {})).status).toBe(404);
  });

  it('stops working when the link is replaced or turned off', async () => {
    const { owner, base, token } = await setup();
    const fresh = (await owner.agent.post(`${base}/board-token`)).body.boardToken;
    expect((await h.agent().get(`/api/board/${token}`)).status).toBe(404);
    expect((await h.agent().get(`/api/board/${fresh}`)).status).toBe(200);
    await owner.agent.delete(`${base}/board-token`);
    expect((await h.agent().get(`/api/board/${fresh}`)).status).toBe(404);
  });
});

describe('server basics', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('reports health', async () => {
    expect((await h.agent().get('/healthz')).body.ok).toBe(true);
    expect((await h.agent().get('/readyz')).body.ok).toBe(true);
  });

  it('sends security headers', async () => {
    const reply = await h.agent().get('/healthz');
    expect(reply.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers unknown API addresses with JSON', async () => {
    const anonymous = await h.agent().get('/api/nope');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('unauthorized');
    const { agent } = await signUp(h);
    const reply = await agent.get('/api/nope');
    expect(reply.status).toBe(404);
    expect(reply.body.error.code).toBe('not_found');
  });

  it('rejects broken JSON politely', async () => {
    const response = await h.app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    expect(response.status).toBe(400);
  });
});
