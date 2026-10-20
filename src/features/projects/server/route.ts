import { z } from 'zod';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';

import { db } from '@/db';
import { projects } from '@/db/schema';
import { toApi } from '@/db/api-shape';
import { requireMember } from '@/features/members/utils';
import { MemberRole } from '@/features/members/types';

import { fileToDataUrl } from '@/lib/images';
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

    // The database removes its tasks too
    await db.delete(projects).where(eq(projects.id, projectId));

    return c.json({ data: { $id: projectId } });
  });

export default app;
