import { z } from 'zod';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { Query } from 'node-appwrite';
import { zValidator } from '@hono/zod-validator';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';

import { db } from '@/db';
import { projects } from '@/db/schema';
import { toApi } from '@/db/api-shape';
import { requireMember } from '@/features/members/utils';
import { MemberRole } from '@/features/members/types';
import { TaskStatus } from '@/features/tasks/types';

import { fileToDataUrl } from '@/lib/images';
import { DATABASE_ID, TASKS_ID } from '@/config';
import { sessionMiddleware } from '@/lib/session-middleware';

import { createProjectSchema, updateProjectSchema } from '../schema';
import { listProjects, requireProject } from '../utils';

const app = new Hono()
  .post(
    '/',
    sessionMiddleware,
    zValidator('form', createProjectSchema),
    async (c) => {
      const { name, image, workspaceId } = c.req.valid('form');

      await requireMember(c, workspaceId);

      const [project] = await db
        .insert(projects)
        .values({
          name,
          workspaceId,
          imageUrl: image instanceof File ? await fileToDataUrl(image) : null,
        })
        .returning();

      return c.json({ data: toApi(project) });
    },
  )
  .get(
    '/',
    sessionMiddleware,
    zValidator('query', z.object({ workspaceId: z.string() })),
    async (c) => {
      const { workspaceId } = c.req.valid('query');

      await requireMember(c, workspaceId);

      const documents = await listProjects(workspaceId);

      return c.json({ data: { documents, total: documents.length } });
    },
  )
  .get('/:projectId', sessionMiddleware, async (c) => {
    const { project } = await requireProject(c, c.req.param('projectId'));

    return c.json({ data: project });
  })
  .get('/:projectId/analytics', sessionMiddleware, async (c) => {
    const databases = c.get('databases');
    const { projectId } = c.req.param();

    // Tasks are still in Appwrite until 4c; 4d replaces these queries
    const { member } = await requireProject(c, projectId);

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const thisMonthTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('projectId', projectId),
        // Query.notEqual('status', TaskStatus.CANCELLED),
        Query.greaterThanEqual('$createdAt', thisMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', thisMonthEnd.toISOString()),
      ],
    );

    const lastMonthTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('projectId', projectId),
        // Query.notEqual('status', TaskStatus.CANCELLED),
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
        Query.equal('projectId', projectId),
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
        Query.equal('projectId', projectId),
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
        Query.equal('projectId', projectId),
        Query.equal('status', TaskStatus.DONE),
        Query.greaterThanEqual('$createdAt', thisMonthStart.toISOString()),
        Query.lessThanEqual('$createdAt', thisMonthEnd.toISOString()),
      ],
    );

    const lastMonthCompletedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal('projectId', projectId),
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
        Query.equal('projectId', projectId),
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
        Query.equal('projectId', projectId),
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
        Query.equal('projectId', projectId),
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
        Query.equal('projectId', projectId),
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
  .patch(
    '/:projectId',
    sessionMiddleware,
    zValidator('form', updateProjectSchema),
    async (c) => {
      const { projectId } = c.req.param();
      const { name, image } = c.req.valid('form');

      // Any member can create and edit projects; only admins can delete them
      await requireProject(c, projectId);

      // Without a new file the current image is kept
      const [project] = await db
        .update(projects)
        .set({
          name,
          ...(image instanceof File && {
            imageUrl: await fileToDataUrl(image),
          }),
        })
        .where(eq(projects.id, projectId))
        .returning();

      return c.json({ data: toApi(project) });
    },
  )
  .delete('/:projectId', sessionMiddleware, async (c) => {
    const { projectId } = c.req.param();

    await requireProject(c, projectId, { role: MemberRole.ADMIN });

    // The database removes its tasks too. Until 4c moves them, its Appwrite tasks
    // are left behind and the task routes hide them.
    await db.delete(projects).where(eq(projects.id, projectId));

    return c.json({ data: { $id: projectId } });
  });

export default app;
