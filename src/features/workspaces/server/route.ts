import { z } from 'zod';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';

import { db } from '@/db';
import { members, workspaces } from '@/db/schema';
import { isUuid, toApi } from '@/db/api-shape';
import { MemberRole } from '@/features/members/types';
import { getMember, requireMember } from '@/features/members/utils';

import { fileToDataUrl } from '@/lib/images';
import { generateInviteCode } from '@/lib/utils';
import { sessionMiddleware } from '@/lib/session-middleware';

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

    // The database removes its members, projects and tasks too
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
