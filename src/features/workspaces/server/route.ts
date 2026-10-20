import { z } from 'zod';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { Query } from 'node-appwrite';
import { zValidator } from '@hono/zod-validator';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';

import { db } from '@/db';
import { members, workspaces } from '@/db/schema';
import { isUuid, toApi } from '@/db/api-shape';
import { MemberRole } from '@/features/members/types';
import { TaskStatus } from '@/features/tasks/types';
import { getMember, requireMember } from '@/features/members/utils';

import { fileToDataUrl } from '@/lib/images';
import { generateInviteCode } from '@/lib/utils';
import { sessionMiddleware } from '@/lib/session-middleware';
import { DATABASE_ID, TASKS_ID } from '@/config';

import { getWorkspaces } from '../queries';
import { createWorkspaceShema, updateWorkspaceShema } from '../schema';

const findWorkspace = async (workspaceId: string) => {
  if (!isUuid(workspaceId)) {
    return undefined;
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return workspace;
};

const app = new Hono()
  .get('/', sessionMiddleware, async (c) => {
    const user = c.get('user');

    return c.json({ data: await getWorkspaces(user.id) });
  })
  .get('/:workspaceId', sessionMiddleware, async (c) => {
    const { workspaceId } = c.req.param();

    await requireMember(c, workspaceId);

    const workspace = await findWorkspace(workspaceId);

    if (!workspace) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json({ data: toApi(workspace) });
  })
  .get(
    '/:workspaceId/info',
    sessionMiddleware,
    zValidator('query', z.object({ inviteCode: z.string() })),
    async (c) => {
      const { workspaceId } = c.req.param();
      const { inviteCode } = c.req.valid('query');

      // For the join page, so only with a valid invite link. A wrong code gets the
      // same answer as a missing workspace, so neither reveals that it exists.
      const workspace = await findWorkspace(workspaceId);

      if (!workspace || workspace.inviteCode !== inviteCode) {
        return c.json({ error: 'Not found' }, 404);
      }

      return c.json({
        data: {
          $id: workspace.id,
          name: workspace.name,
          imageUrl: workspace.imageUrl,
        },
      });
    },
  )
  .get('/:workspaceId/analytics', sessionMiddleware, async (c) => {
    const databases = c.get('databases');
    const { workspaceId } = c.req.param();

    const member = await requireMember(c, workspaceId);

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const thisMonthTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.greaterThanEqual('$createdAt', thisMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', thisMonthEnd.toISOString()),
      ],
    );

    const lastMonthTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.greaterThanEqual('$createdAt', lastMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', lastMonthEnd.toISOString()),
      ],
    );

    const taskCount = thisMonthTasks.total;
    const taskDifference = taskCount - lastMonthTasks.total;

    const thisMonthAssignedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.equal('assigneeId', member.$id),
        Query.notEqual('status', TaskStatus.CANCELLED),
        Query.greaterThanEqual('$createdAt', thisMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', thisMonthEnd.toISOString()),
      ],
    );

    const lastMonthAssignedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.equal('assigneeId', member.$id),
        Query.notEqual('status', TaskStatus.CANCELLED),
        Query.greaterThanEqual('$createdAt', lastMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', lastMonthEnd.toISOString()),
      ],
    );

    const assignedTaskCount = thisMonthAssignedTasks.total;
    const assignedTaskDifference =
      assignedTaskCount - lastMonthAssignedTasks.total;

    const thisMonthCompletedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.equal('status', TaskStatus.DONE),
        Query.greaterThanEqual('$createdAt', thisMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', thisMonthEnd.toISOString()),
      ],
    );

    const lastMonthCompletedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.equal('status', TaskStatus.DONE),
        Query.greaterThanEqual('$createdAt', lastMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', lastMonthEnd.toISOString()),
      ],
    );

    const completedTaskCount = thisMonthCompletedTasks.total;
    const completedTaskDifference =
      completedTaskCount - lastMonthCompletedTasks.total;

    const thisMonthIncompleteTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.notEqual('status', TaskStatus.DONE),
        Query.notEqual('status', TaskStatus.CANCELLED),
        Query.greaterThanEqual('$createdAt', thisMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', thisMonthEnd.toISOString()),
      ],
    );

    const lastMonthIncompleteTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.notEqual('status', TaskStatus.DONE),
        Query.notEqual('status', TaskStatus.CANCELLED),
        Query.greaterThanEqual('$createdAt', lastMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', lastMonthEnd.toISOString()),
      ],
    );

    const incompleteTaskCount = thisMonthIncompleteTasks.total;
    const incompleteTaskDifference =
      incompleteTaskCount - lastMonthIncompleteTasks.total;

    const thisMonthOverdueTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.notEqual('status', TaskStatus.DONE),
        Query.notEqual('status', TaskStatus.CANCELLED),
        Query.lessThan('dueDate', now.toISOString()),
        Query.greaterThanEqual('$createdAt', thisMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', thisMonthEnd.toISOString()),
      ],
    );

    const lastMonthOverdueTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('workspaceId', workspaceId),
        Query.equal('status', TaskStatus.DONE),
        Query.notEqual('status', TaskStatus.CANCELLED),
        Query.lessThan('dueDate', now.toISOString()),
        Query.greaterThanEqual('$createdAt', lastMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', lastMonthEnd.toISOString()),
      ],
    );

    const overdueTaskCount = thisMonthOverdueTasks.total;
    const overdueTaskDifference =
      overdueTaskCount - lastMonthOverdueTasks.total;

    return c.json({
      data: {
        taskCount,
        taskDifference,
        assignedTaskCount,
        assignedTaskDifference,
        completedTaskCount,
        completedTaskDifference,
        incompleteTaskCount,
        incompleteTaskDifference,
        overdueTaskCount,
        overdueTaskDifference,
      },
    });
  })
  .post(
    '/',
    zValidator('form', createWorkspaceShema),
    sessionMiddleware,
    async (c) => {
      const user = c.get('user');
      const { name, image } = c.req.valid('form');

      const imageUrl = image instanceof File ? await fileToDataUrl(image) : null;

      // The workspace and its first admin are created together or not at all
      const workspace = await db.transaction(async (tx) => {
        const [workspace] = await tx
          .insert(workspaces)
          .values({
            name,
            imageUrl,
            inviteCode: generateInviteCode(6),
            createdBy: user.id,
          })
          .returning();

        await tx.insert(members).values({
          workspaceId: workspace.id,
          userId: user.id,
          role: MemberRole.ADMIN,
        });

        return workspace;
      });

      return c.json({ data: toApi(workspace) });
    },
  )
  .patch(
    '/:workspaceId',
    sessionMiddleware,
    zValidator('form', updateWorkspaceShema),
    async (c) => {
      const { workspaceId } = c.req.param();
      const { name, image } = c.req.valid('form');

      await requireMember(c, workspaceId, { role: MemberRole.ADMIN });

      // Without a new file the current image is kept
      const [workspace] = await db
        .update(workspaces)
        .set({
          name,
          ...(image instanceof File && {
            imageUrl: await fileToDataUrl(image),
          }),
        })
        .where(eq(workspaces.id, workspaceId))
        .returning();

      return c.json({ data: toApi(workspace) });
    },
  )
  .delete('/:workspaceId', sessionMiddleware, async (c) => {
    const { workspaceId } = c.req.param();

    await requireMember(c, workspaceId, { role: MemberRole.ADMIN });

    // Removes its members and projects too. Until 4c moves them, its tasks are
    // left behind in Appwrite, unreachable.
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    return c.json({ data: { $id: workspaceId } });
  })
  .post('/:workspaceId/reset-invite-code', sessionMiddleware, async (c) => {
    const { workspaceId } = c.req.param();

    await requireMember(c, workspaceId, { role: MemberRole.ADMIN });

    const [workspace] = await db
      .update(workspaces)
      .set({ inviteCode: generateInviteCode(6) })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    return c.json({ data: toApi(workspace) });
  })
  .post(
    '/:workspaceId/join',
    sessionMiddleware,
    zValidator('json', z.object({ code: z.string() })),
    async (c) => {
      const { workspaceId } = c.req.param();
      const { code } = c.req.valid('json');
      const user = c.get('user');

      const workspace = await findWorkspace(workspaceId);

      if (!workspace || workspace.inviteCode !== code) {
        return c.json({ error: 'Invalid invite code' }, 400);
      }

      if (await getMember(workspaceId, user.id)) {
        return c.json({ error: 'Already a member' }, 400);
      }

      // A double-click can't create a second membership (unique workspace + user)
      await db
        .insert(members)
        .values({ workspaceId, userId: user.id, role: MemberRole.MEMBER })
        .onConflictDoNothing();

      return c.json({ data: toApi(workspace) });
    },
  );

export default app;
