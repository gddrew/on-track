import { z } from 'zod';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  max,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/db';
import { members, projects, tasks, user } from '@/db/schema';
import { isUuid, toApi } from '@/db/api-shape';
import { listMembers, requireMember } from '@/features/members/utils';
import { MemberRole } from '@/features/members/types';
import { findProject } from '@/features/projects/utils';

import { sessionMiddleware } from '@/lib/session-middleware';

import { createTaskSchema } from '../schemas';
import { PopulatedTask, Task, TaskStatus, UNASSIGNED } from '../types';

type TaskRow = typeof tasks.$inferSelect;

const toApiTask = (row: TaskRow): Task => ({
  ...toApi(row),
  status: row.status as TaskStatus,
  dueDate: row.dueDate.toISOString(),
});

// Tasks with their project and assignee in one query. The joins only match a
// project and member of the task's own workspace.
const selectPopulatedTasks = async (where: SQL | undefined) => {
  const rows = await db
    .select({ task: tasks, project: projects, member: members, user })
    .from(tasks)
    .innerJoin(
      projects,
      and(
        eq(projects.id, tasks.projectId),
        eq(projects.workspaceId, tasks.workspaceId),
      ),
    )
    .leftJoin(
      members,
      and(
        eq(members.id, tasks.assigneeId),
        eq(members.workspaceId, tasks.workspaceId),
      ),
    )
    .leftJoin(user, eq(user.id, members.userId))
    .where(where)
    .orderBy(desc(tasks.createdAt));

  return rows.map(
    ({ task, project, member, user }): PopulatedTask => ({
      ...toApiTask(task),
      project: toApi(project),
      assignee:
        member && user
          ? {
              ...toApi(member),
              role: member.role as MemberRole,
              name: user.name || user.email,
              email: user.email,
            }
          : null,
    }),
  );
};

const findTask = async (taskId: string) => {
  if (!isUuid(taskId)) {
    return undefined;
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  return task;
};

// A task the signed-in user can reach. A missing task and another workspace's
// task get the same 404, so ids can't be probed.
const requireTask = async (
  c: Parameters<typeof requireMember>[0],
  taskId: string,
) => {
  const task = await findTask(taskId);

  if (!task) {
    throw new HTTPException(404, { message: 'Not found' });
  }

  await requireMember(c, task.workspaceId, { orNotFound: true });

  return task;
};

// A task may only point at a project and an assignee from its own workspace
const requireInWorkspace = async (
  workspaceId: string,
  {
    projectId,
    assigneeId,
  }: { projectId?: string; assigneeId?: string | null },
) => {
  const [projectOk, assigneeOk] = await Promise.all([
    projectId
      ? findProject(projectId).then(
          (project) => project?.workspaceId === workspaceId,
        )
      : true,
    assigneeId
      ? listMembers(workspaceId, [assigneeId]).then((found) => found.length > 0)
      : true,
  ]);

  if (!projectOk || !assigneeOk) {
    throw new HTTPException(400, {
      message: 'Project or assignee is not in this workspace',
    });
  }
};

// Match the search text literally: % and _ are wildcards in LIKE
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const app = new Hono()
  .get(
    '/',
    sessionMiddleware,
    zValidator(
      'query',
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullish(),
        // A member id, or UNASSIGNED for tasks with nobody assigned
        assigneeId: z.string().nullish(),
        status: z.enum(TaskStatus).nullish(),
        search: z.string().nullish(),
        dueDate: z.iso.datetime().nullish(),
      }),
    ),
    async (c) => {
      const { workspaceId, projectId, status, search, assigneeId, dueDate } =
        c.req.valid('query');

      await requireMember(c, workspaceId);

      // An id that can't exist matches nothing
      if (
        (projectId && !isUuid(projectId)) ||
        (assigneeId && assigneeId !== UNASSIGNED && !isUuid(assigneeId))
      ) {
        return c.json({ data: { documents: [], total: 0 } });
      }

      const documents = await selectPopulatedTasks(
        and(
          eq(tasks.workspaceId, workspaceId),
          projectId ? eq(tasks.projectId, projectId) : undefined,
          status ? eq(tasks.status, status) : undefined,
          assigneeId === UNASSIGNED
            ? isNull(tasks.assigneeId)
            : assigneeId
              ? eq(tasks.assigneeId, assigneeId)
              : undefined,
          dueDate ? eq(tasks.dueDate, new Date(dueDate)) : undefined,
          search ? ilike(tasks.name, `%${escapeLike(search)}%`) : undefined,
        ),
      );

      return c.json({ data: { documents, total: documents.length } });
    },
  )
  .post(
    '/',
    sessionMiddleware,
    zValidator('json', createTaskSchema),
    async (c) => {
      const {
        name,
        status,
        workspaceId,
        projectId,
        dueDate,
        assigneeId,
        description,
      } = c.req.valid('json');

      await requireMember(c, workspaceId);
      await requireInWorkspace(workspaceId, { projectId, assigneeId });

      // New tasks go to the bottom of their kanban column
      const [{ highest }] = await db
        .select({ highest: max(tasks.position) })
        .from(tasks)
        .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.status, status)));

      const [task] = await db
        .insert(tasks)
        .values({
          name,
          status,
          workspaceId,
          projectId,
          dueDate,
          assigneeId: assigneeId ?? null,
          description: description ?? null,
          position: (highest ?? 0) + 1000,
        })
        .returning();

      return c.json({ data: toApiTask(task) });
    },
  )
  .delete('/:taskId', sessionMiddleware, async (c) => {
    const task = await requireTask(c, c.req.param('taskId'));

    await db.delete(tasks).where(eq(tasks.id, task.id));

    return c.json({ data: { $id: task.id } });
  })
  .patch(
    '/:taskId',
    sessionMiddleware,
    zValidator('json', createTaskSchema.omit({ workspaceId: true }).partial()),
    async (c) => {
      const { name, status, description, projectId, dueDate, assigneeId } =
        c.req.valid('json');

      const existingTask = await requireTask(c, c.req.param('taskId'));

      await requireInWorkspace(existingTask.workspaceId, {
        projectId,
        assigneeId,
      });

      // Fields left out stay as they are; assigneeId null unassigns the task
      const [task] = await db
        .update(tasks)
        .set({ name, status, description, projectId, dueDate, assigneeId })
        .where(eq(tasks.id, existingTask.id))
        .returning();

      return c.json({ data: toApiTask(task) });
    },
  )
  .get('/:taskId', sessionMiddleware, async (c) => {
    const { id } = await requireTask(c, c.req.param('taskId'));

    const [task] = await selectPopulatedTasks(eq(tasks.id, id));

    if (!task) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json({ data: task });
  })
  .post(
    '/bulk-update',
    sessionMiddleware,
    zValidator(
      'json',
      z.object({
        tasks: z
          .array(
            z.object({
              $id: z.string(),
              status: z.enum(TaskStatus),
              position: z.number().int().positive().min(1000).max(1_000_000),
            }),
          )
          .min(1),
      }),
    ),
    async (c) => {
      const { tasks: updates } = c.req.valid('json');

      const taskIds = [...new Set(updates.map((task) => task.$id))];

      // Every task sent must be found and checked before any is updated
      const found = taskIds.every(isUuid)
        ? await db
            .select({ id: tasks.id, workspaceId: tasks.workspaceId })
            .from(tasks)
            .where(inArray(tasks.id, taskIds))
        : [];

      if (found.length !== taskIds.length) {
        return c.json({ error: 'Some tasks were not found' }, 400);
      }

      const workspaceIds = new Set(found.map((task) => task.workspaceId));

      if (workspaceIds.size !== 1) {
        return c.json(
          { error: 'All tasks must belong to the same workspace' },
          400,
        );
      }

      const [workspaceId] = workspaceIds;

      await requireMember(c, workspaceId);

      // All of a drag's moves are saved together or not at all
      const updatedTasks = await db.transaction(async (tx) => {
        const updated: TaskRow[] = [];

        for (const { $id, status, position } of updates) {
          const [task] = await tx
            .update(tasks)
            .set({ status, position })
            .where(eq(tasks.id, $id))
            .returning();

          updated.push(task);
        }

        return updated;
      });

      return c.json({ data: updatedTasks.map(toApiTask) });
    },
  );

export default app;
