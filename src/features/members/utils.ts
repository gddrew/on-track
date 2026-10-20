import type { Context } from 'hono';
import { inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { Query, type Databases } from 'node-appwrite';

import { db } from '@/db';
import { user } from '@/db/schema';
import { DATABASE_ID, MEMBERS_ID } from '@/config';
import type { AdditionalContext } from '@/lib/session-middleware';

import { Member, MemberRole } from './types';

interface GetMemberProps {
  databases: Databases;
  workspaceId: string;
  userId: string;
}

export const getMember = async ({
  databases,
  workspaceId,
  userId,
}: GetMemberProps) => {
  const members = await databases.listDocuments<Member>(
    DATABASE_ID,
    MEMBERS_ID,
    [Query.equal('workspaceId', workspaceId), Query.equal('userId', userId)],
  );

  return members.documents[0];
};

interface RequireMemberOptions {
  role?: MemberRole;
}

// The one access check for workspace data: returns the signed-in user's membership
// of this workspace, or stops the request with 403 if they aren't a member (or lack the role)
export const requireMember = async (
  c: Context<AdditionalContext>,
  workspaceId: string,
  { role }: RequireMemberOptions = {},
) => {
  const member = await getMember({
    databases: c.get('databases'),
    workspaceId,
    userId: c.get('user').$id,
  });

  if (!member || (role && member.role !== role)) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  return member;
};

// Adds each member's name and email from the user table, in one query
export const populateMembers = async <T extends { userId: string }>(
  members: T[],
) => {
  if (members.length === 0) {
    return [];
  }

  const users = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      inArray(
        user.id,
        members.map((member) => member.userId),
      ),
    );

  return members.map((member) => {
    const memberUser = users.find((u) => u.id === member.userId);

    return {
      ...member,
      name: memberUser?.name || memberUser?.email || 'Unknown user',
      email: memberUser?.email ?? '',
    };
  });
};
