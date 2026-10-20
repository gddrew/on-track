import { z } from 'zod';
import { Hono } from 'hono';
import { Query } from 'node-appwrite';
import { zValidator } from '@hono/zod-validator';

import { DATABASE_ID, MEMBERS_ID } from '@/config';
import { sessionMiddleware } from '@/lib/session-middleware';

import { populateMembers, requireMember } from '../utils';
import { Member, MemberRole } from '../types';

const app = new Hono()
  .get(
    '/',
    sessionMiddleware,
    zValidator('query', z.object({ workspaceId: z.string() })),
    async (c) => {
      const databases = c.get('databases');
      const { workspaceId } = c.req.valid('query');

      await requireMember(c, workspaceId);

      const members = await databases.listDocuments<Member>(
        DATABASE_ID,
        MEMBERS_ID,
        [Query.equal('workspaceId', workspaceId)],
      );

      const populatedMembers = await populateMembers(members.documents);

      return c.json({
        data: {
          ...members,
          documents: populatedMembers,
        },
      });
    },
  )
  .delete('/:memberId', sessionMiddleware, async (c) => {
    const { memberId } = c.req.param();
    const databases = c.get('databases');

    const memberToDelete = await databases.getDocument(
      DATABASE_ID,
      MEMBERS_ID,
      memberId,
    );

    const member = await requireMember(c, memberToDelete.workspaceId);

    // Members can remove themselves; only admins can remove others
    if (member.$id !== memberToDelete.$id && member.role !== MemberRole.ADMIN) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const allMembersInWorkspace = await databases.listDocuments(
      DATABASE_ID,
      MEMBERS_ID,
      [Query.equal('workspaceId', memberToDelete.workspaceId)],
    );

    if (allMembersInWorkspace.total === 1) {
      return c.json({ error: 'Cannot delete the only member' }, 400);
    }

    await databases.deleteDocument(DATABASE_ID, MEMBERS_ID, memberId);

    return c.json({ data: { $id: memberToDelete.$id } });
  })
  .patch(
    '/:memberId',
    sessionMiddleware,
    zValidator('json', z.object({ role: z.enum(MemberRole) })),
    async (c) => {
      const { memberId } = c.req.param();
      const { role } = c.req.valid('json');
      const databases = c.get('databases');

      const memberToUpdate = await databases.getDocument(
        DATABASE_ID,
        MEMBERS_ID,
        memberId,
      );

      await requireMember(c, memberToUpdate.workspaceId, {
        role: MemberRole.ADMIN,
      });

      const allMembersInWorkspace = await databases.listDocuments(
        DATABASE_ID,
        MEMBERS_ID,
        [Query.equal('workspaceId', memberToUpdate.workspaceId)],
      );

      if (allMembersInWorkspace.total === 1) {
        return c.json({ error: 'Cannot downgrade the only member' }, 400);
      }

      await databases.updateDocument(DATABASE_ID, MEMBERS_ID, memberId, {
        role,
      });

      return c.json({ data: { $id: memberToUpdate.$id } });
    },
  );

export default app;
