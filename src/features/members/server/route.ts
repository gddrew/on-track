import { z } from 'zod';
import { Hono } from 'hono';
import { count, eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';

import { db } from '@/db';
import { members } from '@/db/schema';
import { isUuid, toApi } from '@/db/api-shape';
import { sessionMiddleware } from '@/lib/session-middleware';

import { listMembers, requireMember } from '../utils';
import { MemberRole } from '../types';

const findMember = async (memberId: string) => {
  if (!isUuid(memberId)) {
    return undefined;
  }

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);

  return member;
};

const countMembers = async (workspaceId: string) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(members)
    .where(eq(members.workspaceId, workspaceId));

  return total;
};

const app = new Hono()
  .get(
    '/',
    sessionMiddleware,
    zValidator('query', z.object({ workspaceId: z.string() })),
    async (c) => {
      const { workspaceId } = c.req.valid('query');

      await requireMember(c, workspaceId);

      const documents = await listMembers(workspaceId);

      return c.json({ data: { documents, total: documents.length } });
    },
  )
  .delete('/:memberId', sessionMiddleware, async (c) => {
    const { memberId } = c.req.param();

    const memberToDelete = await findMember(memberId);

    if (!memberToDelete) {
      return c.json({ error: 'Not found' }, 404);
    }

    const member = await requireMember(c, memberToDelete.workspaceId, {
      orNotFound: true,
    });

    // Members can remove themselves; only admins can remove others
    if (member.$id !== memberToDelete.id && member.role !== MemberRole.ADMIN) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if ((await countMembers(memberToDelete.workspaceId)) === 1) {
      return c.json({ error: 'Cannot delete the only member' }, 400);
    }

    await db.delete(members).where(eq(members.id, memberId));

    return c.json({ data: { $id: memberToDelete.id } });
  })
  .patch(
    '/:memberId',
    sessionMiddleware,
    zValidator('json', z.object({ role: z.enum(MemberRole) })),
    async (c) => {
      const { memberId } = c.req.param();
      const { role } = c.req.valid('json');

      const memberToUpdate = await findMember(memberId);

      if (!memberToUpdate) {
        return c.json({ error: 'Not found' }, 404);
      }

      await requireMember(c, memberToUpdate.workspaceId, {
        role: MemberRole.ADMIN,
        orNotFound: true,
      });

      if ((await countMembers(memberToUpdate.workspaceId)) === 1) {
        return c.json({ error: 'Cannot downgrade the only member' }, 400);
      }

      const [updated] = await db
        .update(members)
        .set({ role })
        .where(eq(members.id, memberId))
        .returning();

      return c.json({ data: { $id: toApi(updated).$id } });
    },
  );

export default app;
