import { and, asc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  canManage,
  inviteInput,
  memberInput,
  memberUpdate,
  roleRank,
  startOfWeek,
  todayIn,
  workspaceInput,
  workspaceUpdate,
  type MemberDTO,
  type MemberStats,
  type Role,
  type WorkspaceDTO,
} from '@harmony/shared';
import { announceFrom, clientIp, idParam, needManager, needOwner, readBody, requireUser, type AppDeps, type AppEnv, type Ctx } from '../context';
import { invites, members, tasks, users, workspaces, type MemberRow, type WorkspaceRow } from '../db/schema';
import type { DB } from '../db/types';
import { conflict, forbidden, HttpError, notFound } from '../errors';
import { hashToken, newToken } from '../security';
import { applyStarter } from '../seed/starter';
import { reseedDemo } from '../seed/demo';

export function workspaceDTO(workspace: WorkspaceRow, member: MemberRow, now: Date): WorkspaceDTO {
  return {
    id: workspace.id,
    name: workspace.name,
    edition: workspace.edition,
    currency: workspace.currency,
    timezone: workspace.timezone,
    isDemo: workspace.isDemo,
    boardToken: canManage(member.role) ? workspace.boardToken : undefined,
    myRole: member.role,
    myMemberId: member.id,
    today: todayIn(workspace.timezone, now),
  };
}

export async function loadMembers(db: DB, workspaceId: string, now: Date): Promise<MemberDTO[]> {
  const rows = await db
    .select({ member: members, avatarUrl: users.avatarUrl })
    .from(members)
    .leftJoin(users, eq(members.userId, users.id))
    .where(and(eq(members.workspaceId, workspaceId), isNull(members.archivedAt)))
    .orderBy(sql`case ${members.role} when 'owner' then 0 when 'manager' then 1 else 2 end`, asc(members.name));
  const pending = await db
    .select({ memberId: invites.memberId })
    .from(invites)
    .where(and(eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt), gt(invites.expiresAt, now)));
  const pendingIds = new Set(pending.map((row) => row.memberId));
  return rows.map(({ member, avatarUrl }) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    title: member.title,
    department: member.department,
    phone: member.phone,
    hasLogin: Boolean(member.userId),
    avatarUrl,
    invitePending: pendingIds.has(member.id),
  }));
}

export async function loadMemberStats(db: DB, workspaceId: string, today: string, timezone: string, now: Date): Promise<MemberStats[]> {
  const list = await loadMembers(db, workspaceId, now);
  const weekStart = startOfWeek(today);
  const rows = await db
    .select({
      assigneeId: tasks.assigneeId,
      open: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing'))`,
      overdue: sql<string>`count(*) filter (where ${tasks.status} in ('todo','doing') and ${tasks.dueOn} < ${today})`,
    })
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId))
    .groupBy(tasks.assigneeId);
  const doneRows = await db
    .select({ memberId: tasks.completedById, done: sql<string>`count(*)` })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.status, 'done'), sql`(${tasks.completedAt} at time zone ${timezone})::date >= ${weekStart}`))
    .groupBy(tasks.completedById);

  const open = new Map(rows.map((row) => [row.assigneeId, row]));
  const done = new Map(doneRows.map((row) => [row.memberId, Number(row.done)]));
  return list.map((member) => ({
    ...member,
    openTasks: Number(open.get(member.id)?.open ?? 0),
    overdueTasks: Number(open.get(member.id)?.overdue ?? 0),
    doneThisWeek: done.get(member.id) ?? 0,
  }));
}

/** A workspace always keeps at least one owner who can sign in. */
async function assertKeepsOwner(db: DB, workspaceId: string, member: MemberRow) {
  if (member.role !== 'owner') return;
  const others = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.workspaceId, workspaceId), eq(members.role, 'owner'), ne(members.id, member.id), isNull(members.archivedAt), sql`${members.userId} is not null`))
    .limit(1);
  if (others.length === 0) throw conflict('Make someone else the owner first.');
}

export function accountWorkspaceRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.get('/workspaces', async (c) => {
    const user = c.get('user');
    const rows = await db
      .select({ workspace: workspaces, member: members })
      .from(members)
      .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
      .where(and(eq(members.userId, user.id), isNull(members.archivedAt)))
      .orderBy(asc(workspaces.createdAt));
    return c.json({ workspaces: rows.map(({ workspace, member }) => workspaceDTO(workspace, member, deps.now())) });
  });

  r.post('/workspaces', async (c) => {
    const user = c.get('user');
    deps.limiter.hit(`workspace:${user.id}`, 30, 3_600_000);
    const input = await readBody(c, workspaceInput);
    const result = await db.transaction(async (raw) => {
      const tx = raw as unknown as DB;
      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: input.name, edition: input.edition, currency: input.currency, timezone: input.timezone, createdBy: user.id, isDemo: user.isDemo })
        .returning();
      const [member] = await tx.insert(members).values({ workspaceId: workspace!.id, userId: user.id, name: user.name, role: 'owner' }).returning();
      await tx.update(users).set({ lastWorkspaceId: workspace!.id }).where(eq(users.id, user.id));
      if (input.starter) await applyStarter(tx, workspace!, member!, todayIn(workspace!.timezone, deps.now()));
      return { workspace: workspace!, member: member! };
    });
    return c.json({ workspace: workspaceDTO(result.workspace, result.member, deps.now()) }, 201);
  });

  r.post('/demo/reset', async (c) => {
    const user = c.get('user');
    if (!deps.env.demoMode || !user.isDemo) throw notFound();
    deps.limiter.hit(`demo-reset:${clientIp(c, deps)}`, 10, 3_600_000);
    await reseedDemo(db, deps.now());
    return c.json({ ok: true });
  });

  return r;
}

export function workspaceRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  r.get('/', async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    if (user.lastWorkspaceId !== workspace.id) await db.update(users).set({ lastWorkspaceId: workspace.id }).where(eq(users.id, user.id));
    return c.json({ workspace: workspaceDTO(workspace, c.get('member'), deps.now()) });
  });

  r.patch('/', async (c) => {
    needManager(c as Ctx);
    const input = await readBody(c, workspaceUpdate);
    const [updated] = await db
      .update(workspaces)
      .set({ ...input, updatedAt: deps.now() })
      .where(eq(workspaces.id, c.get('workspace').id))
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['workspace'] });
    return c.json({ workspace: workspaceDTO(updated!, c.get('member'), deps.now()) });
  });

  r.delete('/', async (c) => {
    needOwner(c as Ctx);
    await db.delete(workspaces).where(eq(workspaces.id, c.get('workspace').id));
    return c.json({ ok: true });
  });

  // The shared wall board link

  r.post('/board-token', async (c) => {
    needManager(c as Ctx);
    const token = newToken(24);
    await db.update(workspaces).set({ boardToken: token }).where(eq(workspaces.id, c.get('workspace').id));
    return c.json({ boardToken: token });
  });

  r.delete('/board-token', async (c) => {
    needManager(c as Ctx);
    await db.update(workspaces).set({ boardToken: null }).where(eq(workspaces.id, c.get('workspace').id));
    return c.json({ ok: true });
  });

  // People

  r.get('/members', async (c) => {
    const workspace = c.get('workspace');
    return c.json({ members: await loadMemberStats(db, workspace.id, c.get('today'), workspace.timezone, deps.now()) });
  });

  r.post('/members', async (c) => {
    needManager(c as Ctx);
    const input = await readBody(c, memberInput);
    assertCanGrant(c as Ctx, input.role);
    const [member] = await db
      .insert(members)
      .values({ workspaceId: c.get('workspace').id, name: input.name, role: input.role, title: input.title, department: input.department, phone: input.phone })
      .returning();
    await announceFrom(deps, c as Ctx, { scopes: ['members'], summary: `added ${member!.name}`, objectType: 'member', objectId: member!.id });
    return c.json({ id: member!.id }, 201);
  });

  r.patch('/members/:id', async (c) => {
    needManager(c as Ctx);
    const target = await loadMember(c as Ctx);
    const input = await readBody(c, memberUpdate);
    const me = c.get('member');
    if (target.role === 'owner' && me.role !== 'owner') throw forbidden('Only an owner can change another owner.');
    if (input.role && input.role !== target.role) {
      assertCanGrant(c as Ctx, input.role);
      if (input.role !== 'owner') await assertKeepsOwner(db, target.workspaceId, target);
    }
    await db.update(members).set(input).where(eq(members.id, target.id));
    await announceFrom(deps, c as Ctx, { scopes: ['members', 'workspace'] });
    return c.json({ ok: true });
  });

  /** Removing someone keeps their name on past work. Anyone may remove themselves. */
  r.delete('/members/:id', async (c) => {
    const target = await loadMember(c as Ctx);
    const me = c.get('member');
    if (target.id !== me.id) needManager(c as Ctx);
    if (target.role === 'owner' && me.role !== 'owner') throw forbidden('Only an owner can remove another owner.');
    await assertKeepsOwner(db, target.workspaceId, target);
    await db.transaction(async (tx) => {
      await tx.update(members).set({ archivedAt: deps.now(), userId: null }).where(eq(members.id, target.id));
      await tx
        .update(tasks)
        .set({ assigneeId: null })
        .where(and(eq(tasks.assigneeId, target.id), sql`${tasks.status} in ('todo','doing')`));
      await tx.delete(invites).where(eq(invites.memberId, target.id));
    });
    await announceFrom(deps, c as Ctx, { scopes: ['members', 'tasks'], summary: `removed ${target.name}`, objectType: 'member', objectId: target.id });
    return c.json({ ok: true });
  });

  r.post('/invites', async (c) => {
    needManager(c as Ctx);
    const input = await readBody(c, inviteInput);
    assertCanGrant(c as Ctx, input.role);
    const workspace = c.get('workspace');
    if (input.memberId) {
      const [target] = await db.select().from(members).where(and(eq(members.id, input.memberId), eq(members.workspaceId, workspace.id))).limit(1);
      if (!target) throw notFound('That person');
      if (target.userId) throw conflict(`${target.name} already has a login.`);
      await db.delete(invites).where(and(eq(invites.memberId, target.id), isNull(invites.acceptedAt)));
    }
    const token = newToken();
    await db.insert(invites).values({
      workspaceId: workspace.id,
      memberId: input.memberId ?? null,
      tokenHash: hashToken(token),
      role: input.role,
      email: input.email ?? null,
      createdById: c.get('member').id,
      expiresAt: new Date(deps.now().getTime() + 14 * 86_400_000),
    });
    const url = `${deps.env.appUrl}/invite/${token}`;
    if (input.email) {
      await deps.mail.send({
        to: input.email,
        subject: `${c.get('member').name} invited you to ${workspace.name} on Harmony`,
        text: `Join ${workspace.name} on Harmony:\n\n${url}\n\nThis link works for 14 days.`,
      });
    }
    await announceFrom(deps, c as Ctx, { scopes: ['members'] });
    return c.json({ url, emailed: Boolean(input.email) && deps.mail.enabled }, 201);
  });

  /** Live updates for this workspace. */
  r.get('/stream', (c) => {
    const workspaceId = c.get('workspace').id;
    return streamSSE(c, async (stream) => {
      let closed = false;
      const unsubscribe = deps.bus.subscribe(workspaceId, (event) => {
        void stream.writeSSE({ event: 'change', data: JSON.stringify(event) }).catch(() => undefined);
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });
      await stream.writeSSE({ event: 'ready', data: '{}' });
      while (!closed) {
        await stream.sleep(25_000);
        if (!closed) await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => undefined);
      }
      unsubscribe();
    });
  });

  async function loadMember(c: Ctx): Promise<MemberRow> {
    const [target] = await db
      .select()
      .from(members)
      .where(and(eq(members.id, idParam(c)), eq(members.workspaceId, c.get('workspace').id), isNull(members.archivedAt)))
      .limit(1);
    if (!target) throw notFound('That person');
    return target;
  }

  return r;
}

function assertCanGrant(c: Ctx, role: Role) {
  if (roleRank[role] > roleRank[c.get('member').role]) throw forbidden('You can only give people a role up to your own.');
}

/** Invite links are opened before the person has joined, so these live outside the workspace routes. */
export function inviteRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const { db } = deps;

  const findInvite = async (token: string) => {
    const [row] = await db
      .select({ invite: invites, workspace: workspaces })
      .from(invites)
      .innerJoin(workspaces, eq(invites.workspaceId, workspaces.id))
      .where(eq(invites.tokenHash, hashToken(token)))
      .limit(1);
    if (!row) throw notFound('That invite');
    if (row.invite.acceptedAt) throw new HttpError(410, 'invite_used', 'This invite was already used. Ask for a new link.');
    if (row.invite.expiresAt <= deps.now()) throw new HttpError(410, 'invite_expired', 'This invite has expired. Ask for a new link.');
    return row;
  };

  r.get('/:token', async (c) => {
    deps.limiter.hit(`invite:${clientIp(c, deps)}`, 60, 900_000);
    const { invite, workspace } = await findInvite(c.req.param('token'));
    const [inviter] = invite.createdById ? await db.select({ name: members.name }).from(members).where(eq(members.id, invite.createdById)).limit(1) : [];
    let forName: string | null = null;
    if (invite.memberId) {
      const [target] = await db.select({ name: members.name }).from(members).where(eq(members.id, invite.memberId)).limit(1);
      forName = target?.name ?? null;
    }
    return c.json({ workspaceName: workspace.name, edition: workspace.edition, role: invite.role, invitedBy: inviter?.name ?? null, forName });
  });

  r.post('/:token/accept', requireUser(deps), async (c) => {
    const user = c.get('user');
    const { invite, workspace } = await findInvite(c.req.param('token'));
    await db.transaction(async (tx) => {
      const [already] = await tx
        .select()
        .from(members)
        .where(and(eq(members.workspaceId, workspace.id), eq(members.userId, user.id)))
        .limit(1);
      if (already) {
        if (already.archivedAt) await tx.update(members).set({ archivedAt: null, role: invite.role }).where(eq(members.id, already.id));
      } else if (invite.memberId) {
        await tx.update(members).set({ userId: user.id, role: invite.role }).where(eq(members.id, invite.memberId));
      } else {
        await tx.insert(members).values({ workspaceId: workspace.id, userId: user.id, name: user.name, role: invite.role });
      }
      await tx.update(invites).set({ acceptedAt: deps.now() }).where(eq(invites.id, invite.id));
      await tx.update(users).set({ lastWorkspaceId: workspace.id }).where(eq(users.id, user.id));
    });
    deps.bus.publish(workspace.id, { scopes: ['members', 'dashboard'], actorId: null, actorName: user.name, summary: null, at: deps.now().toISOString() });
    return c.json({ workspaceId: workspace.id });
  });

  return r;
}
