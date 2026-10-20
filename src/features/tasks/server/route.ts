import { z } from 'zod';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ID, Query, type Databases } from 'node-appwrite';
import { zValidator } from '@hono/zod-validator';

import { listMembers, requireMember } from '@/features/members/utils';
import { Project } from '@/features/projects/types';

import { sessionMiddleware } from '@/lib/session-middleware';
import { DATABASE_ID, PROJECTS_ID, TASKS_ID } from '@/config';

import { createTaskSchema } from '../schemas';
import { Task, TaskStatus } from '../types';

const isInWorkspace = async (
  databases: Databases,
  collectionId: string,
  documentId: string,
  workspaceId: string,
) => {
  const { total } = await databases.listDocuments(DATABASE_ID, collectionId, [
    Query.equal('$id', documentId),
    Query.equal('workspaceId', workspaceId),
    Query.limit(1),
  ]);

  return total > 0;
};

// A task may only point at a project and an assignee from its own workspace
const requireInWorkspace = async (
  databases: Databases,
  workspaceId: string,
  { projectId, assigneeId }: { projectId?: string; assigneeId?: string },
) => {
  const [projectOk, assigneeOk] = await Promise.all([
    projectId
      ? isInWorkspace(databases, PROJECTS_ID, projectId, workspaceId)
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

const app = new Hono()
  .get(
    '/',
    sessionMiddleware,
    zValidator(
      'query',
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullish(),
        assigneeId: z.string().nullish(),
        status: z.enum(TaskStatus).nullish(),
        search: z.string().nullish(),
        dueDate: z.string().nullish(),
      }),
    ),
    async (c) => {
      const databases = c.get('databases');

      const { workspaceId, projectId, status, search, assigneeId, dueDate } =
        c.req.valid('query');

      await requireMember(c, workspaceId);

      const query = [
        Query.equal('workspaceId', workspaceId),
        Query.orderDesc('$createdAt'),
      ];

      if (projectId) {
        query.push(Query.equal('projectId', projectId));
      }

      if (status) {
        query.push(Query.equal('status', status));
      }

      if (assigneeId) {
        query.push(Query.equal('assigneeId', assigneeId));
      }

      if (dueDate) {
        query.push(Query.equal('dueDate', dueDate));
      }

      if (search) {
        query.push(Query.search('name', search));
      }

      const tasks = await databases.listDocuments<Task>(
        DATABASE_ID,
        TASKS_ID,
        query,
      );

      const projectIds = tasks.documents.map((tasks) => tasks.projectId);
      const assigneeIds = tasks.documents.map((tasks) => tasks.assigneeId);

      // Only this workspace's projects and members, even if a task points elsewhere
      const listProjects = async () => {
        const uniqueIds = [...new Set(projectIds)];

        if (uniqueIds.length === 0) {
          return [];
        }

        const { documents } = await databases.listDocuments<Project>(
          DATABASE_ID,
          PROJECTS_ID,
          [
            Query.equal('$id', uniqueIds),
            Query.equal('workspaceId', workspaceId),
            Query.limit(uniqueIds.length),
          ],
        );

        return documents;
      };

      const [projects, assignees] = await Promise.all([
        listProjects(),
        listMembers(workspaceId, assigneeIds),
      ]);

      const populatedTasks = tasks.documents.map((task) => {
        const project = projects.find(
          (project) => project.$id === task.projectId,
        );
        const assignee = assignees.find(
          (assignee) => assignee.$id === task.assigneeId,
        );

        return {
          ...task,
          project,
          assignee,
        };
      });

      return c.json({
        data: {
          ...tasks,
          documents: populatedTasks,
        },
      });
    },
  )
  .post(
    '/',
    sessionMiddleware,
    zValidator('json', createTaskSchema),
    async (c) => {
      const databases = c.get('databases');
      const { name, status, workspaceId, projectId, dueDate, assigneeId } =
        c.req.valid('json');

      await requireMember(c, workspaceId);
      await requireInWorkspace(databases, workspaceId, {
        projectId,
        assigneeId,
      });

      const highestPositionTask = await databases.listDocuments(
        DATABASE_ID,
        TASKS_ID,
        [
          Query.equal('status', status),
          Query.equal('workspaceId', workspaceId),
          Query.orderAsc('position'),
          Query.limit(1),
        ],
      );

      const newPosition =
        highestPositionTask.documents.length > 0
          ? highestPositionTask.documents[0].position + 1000
          : 1000;

      const task = await databases.createDocument(
        DATABASE_ID,
        TASKS_ID,
        ID.unique(),
        {
          name,
          status,
          workspaceId,
          projectId,
          dueDate,
          assigneeId,
          position: newPosition,
        },
      );

      return c.json({ data: task });
    },
  )
  .delete('/:taskId', sessionMiddleware, async (c) => {
    const databases = c.get('databases');
    const { taskId } = c.req.param();

    const task = await databases.getDocument<Task>(
      DATABASE_ID,
      TASKS_ID,
      taskId,
    );

    await requireMember(c, task.workspaceId);

    await databases.deleteDocument(DATABASE_ID, TASKS_ID, taskId);

    return c.json({ data: { $id: task.$id } });
  })
  .patch(
    '/:taskId',
    sessionMiddleware,
    zValidator('json', createTaskSchema.partial()),
    async (c) => {
      const databases = c.get('databases');
      const { name, status, description, projectId, dueDate, assigneeId } =
        c.req.valid('json');

      const { taskId } = c.req.param();

      const existingTask = await databases.getDocument<Task>(
        DATABASE_ID,
        TASKS_ID,
        taskId,
      );

      await requireMember(c, existingTask.workspaceId);
      await requireInWorkspace(databases, existingTask.workspaceId, {
        projectId,
        assigneeId,
      });

      const task = await databases.updateDocument<Task>(
        DATABASE_ID,
        TASKS_ID,
        taskId,
        {
          name,
          status,
          projectId,
          dueDate,
          assigneeId,
          description,
        },
      );

      return c.json({ data: task });
    },
  )
  .get('/:taskId', sessionMiddleware, async (c) => {
    const databases = c.get('databases');
    const { taskId } = c.req.param();

    const task = await databases.getDocument<Task>(
      DATABASE_ID,
      TASKS_ID,
      taskId,
    );

    await requireMember(c, task.workspaceId);

    // Only this workspace's project and member, even if the task points elsewhere
    const [projects, [assignee]] = await Promise.all([
      databases.listDocuments<Project>(DATABASE_ID, PROJECTS_ID, [
        Query.equal('$id', task.projectId),
        Query.equal('workspaceId', task.workspaceId),
        Query.limit(1),
      ]),
      listMembers(task.workspaceId, [task.assigneeId]),
    ]);

    const project = projects.documents[0];

    return c.json({
      data: {
        ...task,
        project,
        assignee,
      },
    });
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
      const databases = c.get('databases');
      const { tasks } = await c.req.valid('json');

      const taskIds = [...new Set(tasks.map((task) => task.$id))];

      // Exact ids, all of them: every task sent must be checked before any is updated
      const tasksToUpdate = await databases.listDocuments<Task>(
        DATABASE_ID,
        TASKS_ID,
        [Query.equal('$id', taskIds), Query.limit(taskIds.length)],
      );

      if (tasksToUpdate.documents.length !== taskIds.length) {
        return c.json({ error: 'Some tasks were not found' }, 400);
      }

      const workspaceIds = new Set(
        tasksToUpdate.documents.map((task) => task.workspaceId),
      );

      if (workspaceIds.size !== 1) {
        return c.json(
          { error: 'All tasks must belong to the same workspace' },
          400,
        );
      }

      const [workspaceId] = workspaceIds;

      await requireMember(c, workspaceId);

      const updatedTasks = await Promise.all(
        tasks.map(async (task) => {
          const { $id, status, position } = task;
          return databases.updateDocument<Task>(DATABASE_ID, TASKS_ID, $id, {
            status,
            position,
          });
        }),
      );

      return c.json({ data: updatedTasks });
    },
  );

export default app;
